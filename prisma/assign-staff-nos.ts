/**
 * Assign staffNo to existing staff who do not have one yet.
 * New staff get staffNo automatically on create (e.g. ANTS001 per branch).
 *
 * Usage:
 *   npm run db:assign-staff-nos:dry-run
 *   npm run db:assign-staff-nos
 */
import './load-env';
import prisma from '../src/utils/prisma';
import { nextStaffNo } from '../src/utils/sequence.utils';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const pending = await prisma.staff.findMany({
    where: { staffNo: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, branchId: true, branch: { select: { name: true } } },
  });

  if (!pending.length) {
    console.log('All staff already have staffNo.');
    return;
  }

  console.log(`${dryRun ? '[dry-run] ' : ''}Assigning staffNo to ${pending.length} staff...`);

  for (const row of pending) {
    const staffNo = await prisma.$transaction((tx) => nextStaffNo(tx, row.branchId || undefined));
    console.log(
      `${row.name} (${row.branch?.name || 'no branch'}) -> ${staffNo}`
    );
    if (!dryRun) {
      await prisma.staff.update({ where: { id: row.id }, data: { staffNo } });
    }
  }

  console.log(dryRun ? 'Dry run complete.' : 'Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
