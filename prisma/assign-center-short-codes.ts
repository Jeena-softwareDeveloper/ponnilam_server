/**
 * Backfill a unique shortCode for existing centers that don't have one yet.
 * New centers get a shortCode automatically on create; this covers rows created
 * before the feature existed. Customer numbers are NOT touched.
 *
 * Assigns oldest centers first so short codes stay stable across re-runs.
 *
 * Usage:
 *   npm run db:assign-center-short-codes:dry-run
 *   npm run db:assign-center-short-codes
 *
 * NOTE: This script is superseded by backfill-center-shortcodes.ts which
 * provides a richer summary table. Both work correctly.
 */
import './load-env';
import prisma from '../src/utils/prisma';
import { allocateCenterShortCode } from '../src/utils/center-short-code.service';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const pending = await prisma.center.findMany({
    where: { shortCode: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, code: true },
  });

  if (!pending.length) {
    console.log('All centers already have a shortCode.');
    return;
  }

  console.log(`${dryRun ? '[dry-run] ' : ''}Assigning shortCode to ${pending.length} center(s)...`);

  for (const center of pending) {
    const shortCode = await prisma.$transaction((tx) =>
      allocateCenterShortCode(tx, center.id, center.name)
    );
    console.log(`  ${center.name} (${center.code || 'no code'}) -> ${shortCode}`);
    if (!dryRun) {
      await prisma.center.update({ where: { id: center.id }, data: { shortCode } });
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
