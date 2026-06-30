/**
 * Resolve duplicate (loanId, collectionDay, isVoided) rows before applying
 * @@unique([loanId, collectionDay, isVoided]) on Collection.
 *
 * Uses raw SQL for collectionDay so it runs even when Prisma Client was not
 * regenerated yet (db push failed before generate).
 *
 *   npx ts-node prisma/dedupe-collections-migration.ts
 *   npx ts-node prisma/dedupe-collections-migration.ts --dry-run
 */
import './load-env';
import { PrismaClient } from '@prisma/client';
import { allocateCollection } from '../src/utils/collection.utils';
import { sumUnpaidScheduleAmount } from '../src/utils/loan.utils';
import { toCollectionDay } from '../src/utils/date.utils';
import { LoanStatus, ScheduleStatus, UNPAID_SCHEDULE_STATUSES } from '../src/utils/prisma-enums';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

type CollectionRow = {
  id: string;
  trnNumber: string;
  trnDate: Date;
  collectionDay: string;
  amount: number;
  isVoided: boolean;
  createdAt: Date;
  loanId: string;
  scheduleLinks: number;
};

async function collectionDayColumnExists(): Promise<boolean> {
  const cols = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Collection'
      AND column_name = 'collectionDay'
  `;
  return cols.length > 0;
}

async function ensureCollectionDayColumn(): Promise<void> {
  if (await collectionDayColumnExists()) return;
  if (dryRun) {
    console.log('  [dry-run] Would add Collection.collectionDay column');
    return;
  }
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Collection" ADD COLUMN IF NOT EXISTS "collectionDay" TEXT NOT NULL DEFAULT ''`
  );
  console.log('  Added Collection.collectionDay column');
}

async function backfillCollectionDays(): Promise<number> {
  const hasColumn = await collectionDayColumnExists();

  const allRows = hasColumn
    ? await prisma.$queryRaw<{ id: string; trnDate: Date; collectionDay: string }[]>`
        SELECT id, "trnDate", "collectionDay" FROM "Collection"
      `
    : await prisma.$queryRaw<{ id: string; trnDate: Date }[]>`
        SELECT id, "trnDate" FROM "Collection"
      `;

  let updated = 0;
  for (const row of allRows) {
    const day = toCollectionDay(row.trnDate);
    const current = 'collectionDay' in row ? row.collectionDay : '';
    if (current !== day) {
      updated += 1;
      if (!dryRun && hasColumn) {
        await prisma.$executeRaw`
          UPDATE "Collection" SET "collectionDay" = ${day} WHERE id = ${row.id}
        `;
      }
    }
  }
  return updated;
}

async function loadCollectionsWithScheduleCounts(): Promise<CollectionRow[]> {
  const hasColumn = await collectionDayColumnExists();

  if (hasColumn) {
    return prisma.$queryRaw<CollectionRow[]>`
      SELECT
        c.id,
        c."trnNumber",
        c."trnDate",
        c."collectionDay",
        c.amount,
        c."isVoided",
        c."createdAt",
        c."loanId",
        (
          SELECT COUNT(*)::int
          FROM "LoanSchedule" ls
          WHERE ls."collectionId" = c.id
        ) AS "scheduleLinks"
      FROM "Collection" c
      ORDER BY c."loanId", c."collectionDay", c."createdAt"
    `;
  }

  const rows = await prisma.$queryRaw<
    Omit<CollectionRow, 'collectionDay'>[]
  >`
    SELECT
      c.id,
      c."trnNumber",
      c."trnDate",
      c.amount,
      c."isVoided",
      c."createdAt",
      c."loanId",
      (
        SELECT COUNT(*)::int
        FROM "LoanSchedule" ls
        WHERE ls."collectionId" = c.id
      ) AS "scheduleLinks"
    FROM "Collection" c
    ORDER BY c."loanId", c."trnDate", c."createdAt"
  `;

  return rows.map((r) => ({
    ...r,
    collectionDay: toCollectionDay(r.trnDate),
  }));
}

function pickKeeper(group: CollectionRow[]): CollectionRow {
  return [...group].sort((a, b) => {
    if (b.scheduleLinks !== a.scheduleLinks) return b.scheduleLinks - a.scheduleLinks;
    if (b.amount !== a.amount) return b.amount - a.amount;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];
}

function groupDuplicates(rows: CollectionRow[]): Map<string, CollectionRow[]> {
  const groups = new Map<string, CollectionRow[]>();
  for (const row of rows) {
    const key = `${row.loanId}|${row.collectionDay}|${row.isVoided}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return groups;
}

async function replayLoanCollections(loanId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.loanSchedule.updateMany({
      where: { loanId },
      data: {
        status: ScheduleStatus.PENDING,
        amountPaid: 0,
        paidDate: null,
        collectionId: null,
      },
    });

    const loan = await tx.loan.findUnique({ where: { id: loanId } });
    if (!loan) return;

    const activeCollections = await tx.collection.findMany({
      where: { loanId, isVoided: false },
      orderBy: [{ trnDate: 'asc' }, { createdAt: 'asc' }],
    });

    let advanceBalance = 0;
    for (const c of activeCollections) {
      const schedules = await tx.loanSchedule.findMany({
        where: { loanId, status: { in: UNPAID_SCHEDULE_STATUSES } },
        orderBy: { dueDate: 'asc' },
      });
      const pool = c.amount + advanceBalance;
      advanceBalance = await allocateCollection(tx, loanId, schedules, pool, c.trnDate, c.id);
    }

    const newOutstanding = await sumUnpaidScheduleAmount(tx, loanId);
    let newStatus: LoanStatus;
    if (newOutstanding <= 0 && activeCollections.length > 0) {
      newStatus = LoanStatus.CLOSED;
    } else if (activeCollections.length === 0) {
      newStatus = LoanStatus.APPROVED;
    } else {
      newStatus = LoanStatus.ACTIVE;
    }

    await tx.loan.update({
      where: { id: loanId },
      data: {
        outstandingAmount: Math.max(0, newOutstanding),
        advanceBalance,
        status: newStatus,
      },
    });
  });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(
      'DATABASE_URL is not set. Ensure .env exists in the server root with DATABASE_URL=postgresql://...'
    );
    process.exit(1);
  }

  console.log(dryRun ? '[dry-run] Analyzing collection duplicates...' : 'Fixing collection duplicates...');

  await ensureCollectionDayColumn();

  const backfilled = await backfillCollectionDays();
  console.log(`  collectionDay backfill: ${backfilled} row(s) ${dryRun ? 'would be ' : ''}updated`);

  const rows = await loadCollectionsWithScheduleCounts();
  const duplicateGroups = [...groupDuplicates(rows).entries()].filter(([, g]) => g.length > 1);

  if (duplicateGroups.length === 0) {
    console.log('No duplicate (loanId, collectionDay, isVoided) groups found.');
    console.log('\nDone. You can now run: npx prisma db push && npx prisma generate');
    return;
  }

  const toDelete = new Set<string>();
  const affectedLoans = new Set<string>();

  for (const [key, group] of duplicateGroups) {
    const keeper = pickKeeper(group);
    const extras = group.filter((r) => r.id !== keeper.id);
    for (const extra of extras) {
      toDelete.add(extra.id);
      affectedLoans.add(extra.loanId);
    }
    console.log(
      `  Group ${key}: keep ${keeper.trnNumber} (${keeper.id}), remove ${extras.map((e) => e.trnNumber).join(', ')}`
    );
  }

  console.log(`\n  Duplicate groups: ${duplicateGroups.length}`);
  console.log(`  Collections to remove: ${toDelete.size}`);
  console.log(`  Loans to replay: ${affectedLoans.size}`);

  if (dryRun) {
    console.log('\n[dry-run] No changes written. Re-run without --dry-run to apply.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const id of toDelete) {
      await tx.collection.delete({ where: { id } });
    }
  });

  for (const loanId of affectedLoans) {
    await replayLoanCollections(loanId);
    console.log(`  Replayed allocations for loan ${loanId}`);
  }

  const remaining = [...groupDuplicates(await loadCollectionsWithScheduleCounts()).values()].filter(
    (g) => g.length > 1
  ).length;
  if (remaining > 0) {
    throw new Error(`${remaining} duplicate group(s) still remain after cleanup`);
  }

  console.log('\nDone. You can now run: npx prisma db push && npx prisma generate');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
