/**
 * Compact existing customer numbers per prefix (NAG001, NAG002, …) by registration date.
 * Fills gaps from deleted customers. Uses a two-phase rename to avoid unique collisions.
 *
 * Usage:
 *   npx ts-node prisma/renumber-customer-nos.ts --dry-run
 *   npx ts-node prisma/renumber-customer-nos.ts
 */
import './load-env';
import prisma from '../src/utils/prisma';

const dryRun = process.argv.includes('--dry-run');

type CustomerRow = {
  id: string;
  customerNo: string;
  name: string;
  createdAt: Date;
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

async function main() {
  const customers = await prisma.customer.findMany({
    select: { id: true, customerNo: true, name: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const byPrefix = new Map<string, CustomerRow[]>();
  const skipped: string[] = [];

  for (const c of customers) {
    const parsed = parseCustomerNo(c.customerNo);
    if (!parsed) {
      skipped.push(c.customerNo);
      continue;
    }
    const list = byPrefix.get(parsed.prefix) ?? [];
    list.push(c);
    byPrefix.set(parsed.prefix, list);
  }

  if (skipped.length) {
    console.log(`Skipping ${skipped.length} customer(s) with non-standard numbers: ${skipped.join(', ')}`);
  }

  const changes: { id: string; from: string; to: string; name: string }[] = [];

  for (const [prefix, rows] of byPrefix) {
    rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    rows.forEach((row, index) => {
      const target = formatNo(prefix, index + 1);
      if (row.customerNo !== target) {
        changes.push({ id: row.id, from: row.customerNo, to: target, name: row.name });
      }
    });
  }

  if (!changes.length) {
    console.log('All customer numbers are already compact — nothing to do.');
    return;
  }

  console.log(`${dryRun ? '[dry-run] ' : ''}Will renumber ${changes.length} customer(s):\n`);
  for (const ch of changes) {
    console.log(`  ${ch.from} → ${ch.to}  (${ch.name})`);
  }

  if (dryRun) {
    console.log('\n[dry-run] No changes written. Run without --dry-run to apply.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const ch of changes) {
      await tx.customer.update({
        where: { id: ch.id },
        data: { customerNo: `REN-${ch.id}` },
      });
    }
    for (const ch of changes) {
      await tx.customer.update({
        where: { id: ch.id },
        data: { customerNo: ch.to },
      });
    }

    const prefixMax = new Map<string, number>();
    for (const [prefix, rows] of byPrefix) {
      prefixMax.set(prefix, rows.length);
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

  console.log(`\nDone — renumbered ${changes.length} customer(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
