/**
 * Resolve duplicate (loanId, collectionDay, isVoided) rows before applying
 * @@unique([loanId, collectionDay, isVoided]) on Collection.
 *
 * Run BEFORE `prisma db push` if push fails with P2002 on that constraint.
 *
 *   npx ts-node prisma/dedupe-collections-migration.ts
 *   npx ts-node prisma/dedupe-collections-migration.ts --dry-run
 */
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
  _scheduleLinks: number;
};

async function backfillCollectionDays(): Promise<number> {
  const rows = await prisma.collection.findMany({
    select: { id: true, trnDate: true, collectionDay: true },
  });
  let updated = 0;
  for (const row of rows) {
    const day = toCollectionDay(row.trnDate);
    if (row.collectionDay !== day) {
      if (!dryRun) {
        await prisma.collection.update({
          where: { id: row.id },
          data: { collectionDay: day },
        });
      }
      updated += 1;
    }
  }
  return updated;
}

async function loadCollectionsWithScheduleCounts(): Promise<CollectionRow[]> {
  const rows = await prisma.collection.findMany({
    select: {
      id: true,
      trnNumber: true,
      trnDate: true,
      collectionDay: true,
      amount: true,
      isVoided: true,
      createdAt: true,
      loanId: true,
      _count: { select: { schedules: true } },
    },
    orderBy: [{ loanId: 'asc' }, { collectionDay: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map((r) => ({
    id: r.id,
    trnNumber: r.trnNumber,
    trnDate: r.trnDate,
    collectionDay: r.collectionDay,
    amount: r.amount,
    isVoided: r.isVoided,
    createdAt: r.createdAt,
    loanId: r.loanId,
    _scheduleLinks: r._count.schedules,
  }));
}

function pickKeeper(group: CollectionRow[]): CollectionRow {
  return [...group].sort((a, b) => {
    if (b._scheduleLinks !== a._scheduleLinks) return b._scheduleLinks - a._scheduleLinks;
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
  console.log(dryRun ? '[dry-run] Analyzing collection duplicates...' : 'Fixing collection duplicates...');

  const backfilled = await backfillCollectionDays();
  console.log(`  collectionDay backfill: ${backfilled} row(s) updated`);

  const rows = await loadCollectionsWithScheduleCounts();
  const duplicateGroups = [...groupDuplicates(rows).entries()].filter(([, g]) => g.length > 1);

  if (duplicateGroups.length === 0) {
    console.log('No duplicate (loanId, collectionDay, isVoided) groups found.');
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

  console.log('\nDone. You can now run: npm run db:push');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
