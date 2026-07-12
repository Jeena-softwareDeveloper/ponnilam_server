/**
 * Compact existing loan numbers per branch (ANT-L0001, ANT-L0002, …) by creation date.
 * Fills gaps from deleted loans. Collections/schedules use loan id — safe to renumber loanNumber.
 *
 * Usage:
 *   npm run db:renumber-loans:dry-run
 *   npm run db:renumber-loans
 */
import './load-env';
import prisma from '../src/utils/prisma';
import { nameCodePrefix } from '../src/utils/sequence.utils';

const dryRun = process.argv.includes('--dry-run');

type LoanRow = {
  id: string;
  loanNumber: string;
  createdAt: Date;
  branchId: string | null;
  branchName: string | null;
};

function loanPrefixFromBranchName(name: string | null | undefined): string {
  if (!name) return 'L';
  return nameCodePrefix(name) + '-';
}

function parseLoanNumber(loanNumber: string): { prefix: string; suffix: number } | null {
  const match = loanNumber.match(/^(.+L)(\d+)$/);
  if (!match) return null;
  const suffix = parseInt(match[2], 10);
  if (isNaN(suffix)) return null;
  return { prefix: match[1], suffix };
}

function formatLoanNo(branchPrefix: string, n: number): string {
  return `${branchPrefix}L${n.toString().padStart(4, '0')}`;
}

async function main() {
  const rows = await prisma.loan.findMany({
    select: {
      id: true,
      loanNumber: true,
      createdAt: true,
      customer: {
        select: {
          area: {
            select: {
              branchId: true,
              branch: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const loans: LoanRow[] = rows.map((r) => ({
    id: r.id,
    loanNumber: r.loanNumber,
    createdAt: r.createdAt,
    branchId: r.customer.area.branchId,
    branchName: r.customer.area.branch?.name ?? null,
  }));

  const byBranch = new Map<string, LoanRow[]>();
  const skipped: string[] = [];

  for (const loan of loans) {
    const parsed = parseLoanNumber(loan.loanNumber);
    if (!parsed && !loan.branchName) {
      skipped.push(loan.loanNumber);
      continue;
    }
    const key = loan.branchId ? `branch:${loan.branchId}` : `prefix:${parsed?.prefix ?? 'L'}`;
    const list = byBranch.get(key) ?? [];
    list.push(loan);
    byBranch.set(key, list);
  }

  if (skipped.length) {
    console.log(`Skipping ${skipped.length} loan(s) with non-standard numbers: ${skipped.join(', ')}`);
  }

  const changes: { id: string; from: string; to: string; branch: string }[] = [];
  const prefixMax = new Map<string, number>();

  for (const [, groupRows] of byBranch) {
    groupRows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const branchPrefix = loanPrefixFromBranchName(groupRows[0].branchName);
    const label = groupRows[0].branchName || branchPrefix;
    groupRows.forEach((row) => {
      const current = (prefixMax.get(branchPrefix) ?? 0) + 1;
      prefixMax.set(branchPrefix, current);
      const target = formatLoanNo(branchPrefix, current);
      if (row.loanNumber !== target) {
        changes.push({
          id: row.id,
          from: row.loanNumber,
          to: target,
          branch: label,
        });
      }
    });
  }

  if (!changes.length) {
    console.log('All loan numbers are already compact — nothing to do.');
    return;
  }

  console.log(`${dryRun ? '[dry-run] ' : ''}Will renumber ${changes.length} loan(s):\n`);
  for (const ch of changes) {
    console.log(`  ${ch.from} → ${ch.to}  (${ch.branch})`);
  }

  if (dryRun) {
    console.log('\n[dry-run] No changes written. Run without --dry-run to apply.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const ch of changes) {
      await tx.loan.update({
        where: { id: ch.id },
        data: { loanNumber: `REN-${ch.id}` },
      });
    }
    for (const ch of changes) {
      await tx.loan.update({
        where: { id: ch.id },
        data: { loanNumber: ch.to },
      });
    }

    for (const [prefix, max] of prefixMax) {
      const key = `LOAN:${prefix}`;
      await tx.sequence.upsert({
        where: { id: key },
        create: { id: key, value: max },
        update: { value: max },
      });
      console.log(`  ${key} sequence set to ${max}`);
    }
  });

  console.log(`\nDone — renumbered ${changes.length} loan(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
