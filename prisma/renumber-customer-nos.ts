/**
 * Compact existing customer numbers per center (NAG001, NAG002, …) by registration date.
 * Updates Customer.customerNo only — loans, collections, prints, reports all read via join.
 *
 * Usage:
 *   npm run db:renumber-customers:dry-run
 *   npm run db:renumber-customers
 */
import './load-env';
import prisma from '../src/utils/prisma';
import { nameCodePrefix } from '../src/utils/sequence.utils';

const dryRun = process.argv.includes('--dry-run');

type CustomerRow = {
  id: string;
  customerNo: string;
  name: string;
  createdAt: Date;
  centerId: string | null;
  centerName: string | null;
  branchId: string;
};

function parseCustomerNo(customerNo: string): { prefix: string; suffix: number } | null {
  const match = customerNo.match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  const suffix = parseInt(match[2], 10);
  if (isNaN(suffix)) return null;
  return { prefix: match[1], suffix };
}

function formatNo(prefix: string, n: number): string {
  return `${prefix}${n.toString().padStart(3, '0')}`;
}

function groupKey(row: CustomerRow): string {
  if (row.centerId) return `center:${row.centerId}`;
  const parsed = parseCustomerNo(row.customerNo);
  if (parsed) return `prefix:${parsed.prefix}`;
  return `branch:${row.branchId}`;
}

function resolvePrefix(row: CustomerRow): string {
  if (row.centerName) return nameCodePrefix(row.centerName);
  const parsed = parseCustomerNo(row.customerNo);
  return parsed?.prefix ?? 'CUS';
}

async function main() {
  const rows = await prisma.customer.findMany({
    select: {
      id: true,
      customerNo: true,
      name: true,
      createdAt: true,
      centerId: true,
      center: { select: { name: true } },
      area: { select: { branchId: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const customers: CustomerRow[] = rows.map((r) => ({
    id: r.id,
    customerNo: r.customerNo,
    name: r.name,
    createdAt: r.createdAt,
    centerId: r.centerId,
    centerName: r.center?.name ?? null,
    branchId: r.area.branchId,
  }));

  const byGroup = new Map<string, CustomerRow[]>();
  const skipped: string[] = [];

  for (const c of customers) {
    if (!c.centerId && !parseCustomerNo(c.customerNo)) {
      skipped.push(c.customerNo);
      continue;
    }
    const key = groupKey(c);
    const list = byGroup.get(key) ?? [];
    list.push(c);
    byGroup.set(key, list);
  }

  if (skipped.length) {
    console.log(`Skipping ${skipped.length} customer(s) with non-standard numbers: ${skipped.join(', ')}`);
  }

  const changes: { id: string; from: string; to: string; name: string; center: string }[] = [];
  const prefixMax = new Map<string, number>();

  for (const [, groupRows] of byGroup) {
    groupRows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const prefix = resolvePrefix(groupRows[0]);
    groupRows.forEach((row) => {
      const current = (prefixMax.get(prefix) ?? 0) + 1;
      prefixMax.set(prefix, current);
      const target = formatNo(prefix, current);
      if (row.customerNo !== target) {
        changes.push({
          id: row.id,
          from: row.customerNo,
          to: target,
          name: row.name,
          center: row.centerName || prefix,
        });
      }
    });
  }

  if (!changes.length) {
    console.log('All customer numbers are already compact — nothing to do.');
    return;
  }

  console.log(`${dryRun ? '[dry-run] ' : ''}Will renumber ${changes.length} customer(s):\n`);
  for (const ch of changes) {
    console.log(`  ${ch.from} → ${ch.to}  (${ch.name} — ${ch.center})`);
  }

  if (dryRun) {
    console.log('\n[dry-run] No changes written. Run without --dry-run to apply.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Pass 1: apply temp numbers to avoid unique constraint conflicts
    for (const ch of changes) {
      await tx.customer.update({
        where: { id: ch.id },
        data: { customerNo: ch.id },
      });
    }

    // Pass 2: apply final target numbers
    for (const ch of changes) {
      await tx.customer.update({
        where: { id: ch.id },
        data: { customerNo: ch.to },
      });
    }

    for (const [prefix, max] of prefixMax) {
      const key = `CUS:${prefix}`;
      await tx.sequence.upsert({
        where: { id: key },
        create: { id: key, value: max },
        update: { value: max },
      });
      console.log(`  ${key} sequence set to ${max}`);
    }
  });

  console.log(`\nDone — renumbered ${changes.length} customer(s). Refresh the app to see updates everywhere.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
