/**
 * backfill-center-shortcodes.ts
 *
 * One-time migration: assign a unique shortCode to every Center that currently
 * has shortCode = null.
 *
 * Usage:
 *   npm run db:backfill-shortcodes             # live run
 *   npm run db:backfill-shortcodes -- --dry-run  # preview only, no writes
 *
 * The script:
 *  1. Loads every center without a shortCode (ordered by creation date).
 *  2. Generates a candidate 3-char code from the center name.
 *  3. Disambiguates collisions by appending a numeric suffix (e.g. JKA2, JKA3).
 *  4. Prints a summary table and (in live mode) writes to the DB.
 *  5. For each center that receives a shortCode it also backfills the
 *     Sequence table key "CUS:<shortCode>" based on existing customerNo rows,
 *     so future customers pick up the correct next number.
 */

import './load-env';
import prisma from '../src/utils/prisma';
import { generateShortCodeFromName } from '../src/utils/center-short-code.service';

const DRY_RUN = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// ✏️  MANUAL OVERRIDES
// Add any center name here (exact match, case-insensitive) to force a
// specific short code instead of the auto-generated one.
// Example: 'A JEEVITHA PALLIPALAYAM' → 'JPA'
// ---------------------------------------------------------------------------
const MANUAL_OVERRIDES: Record<string, string> = {
  'A JEEVITHA PALLIPALAYAM': 'JPA',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CenterRow {
  id: string;
  name: string;
  shortCode: string | null;
  customers: { customerNo: string }[];
}

/** Return the highest numeric suffix used by customers with the given prefix. */
function highestCustomerSuffix(customers: { customerNo: string }[], prefix: string): number {
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`);
  let max = 0;
  for (const c of customers) {
    const m = c.customerNo.match(pattern);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return max;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n🔄  Center ShortCode Backfill — ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE RUN'}\n`);

  // Load all centres without a shortCode, ordered by creation (oldest first)
  const centers = await prisma.center.findMany({
    where: { shortCode: null },
    orderBy: { createdAt: 'asc' },
    include: {
      customers: { select: { customerNo: true } },
    },
  }) as CenterRow[];

  if (centers.length === 0) {
    console.log('✅  All centers already have a shortCode. Nothing to do.\n');
    return;
  }

  console.log(`Found ${centers.length} center(s) without a shortCode.\n`);

  // Track which codes have been assigned during this run (to avoid collisions
  // between centers processed in the same batch).
  const assignedThisRun = new Set<string>();

  // Also load all codes already in the DB so we don't collide with them.
  const existing = await prisma.center.findMany({
    where: { shortCode: { not: null } },
    select: { shortCode: true },
  });
  for (const e of existing) {
    if (e.shortCode) assignedThisRun.add(e.shortCode);
  }

  const results: Array<{
    name: string;
    shortCode: string;
    existingCustomers: number;
    seqBackfill: number;
  }> = [];

  for (const center of centers) {
    // Check manual override first (case-insensitive key match)
    const overrideKey = Object.keys(MANUAL_OVERRIDES).find(
      (k) => k.toUpperCase() === center.name.toUpperCase()
    );
    const base = overrideKey
      ? MANUAL_OVERRIDES[overrideKey].toUpperCase()
      : generateShortCodeFromName(center.name);

    // Find a unique code
    let code = base;
    let suffix = 2;
    while (assignedThisRun.has(code)) {
      code = `${base}${suffix++}`;
    }
    assignedThisRun.add(code);

    // Determine the highest sequence already in use for this prefix (could be
    // customers with the old-style prefix or none at all)
    const seqMax = highestCustomerSuffix(center.customers, code);

    results.push({
      name: center.name,
      shortCode: code,
      existingCustomers: center.customers.length,
      seqBackfill: seqMax,
    });

    if (!DRY_RUN) {
      // Write shortCode and upsert Sequence in a single transaction
      await prisma.$transaction(async (tx) => {
        await tx.center.update({
          where: { id: center.id },
          data: { shortCode: code },
        });

        if (seqMax > 0) {
          const seqKey = `CUS:${code}`;
          await tx.sequence.upsert({
            where: { id: seqKey },
            create: { id: seqKey, value: seqMax },
            update: { value: seqMax },
          });
        }
      });
    }
  }

  // Print summary table
  console.log(
    `${'CENTER NAME'.padEnd(40)} ${'SHORT CODE'.padEnd(12)} ${'CUSTOMERS'.padEnd(10)} ${'SEQ BACKFILL'}`
  );
  console.log('─'.repeat(78));
  for (const r of results) {
    const nameCol = r.name.substring(0, 39).padEnd(40);
    const codeCol = r.shortCode.padEnd(12);
    const custCol = String(r.existingCustomers).padEnd(10);
    const seqCol = r.seqBackfill > 0 ? `CUS:${r.shortCode} → ${r.seqBackfill}` : '(none)';
    console.log(`${nameCol} ${codeCol} ${custCol} ${seqCol}`);
  }

  console.log('─'.repeat(78));

  if (DRY_RUN) {
    console.log(`\n⚠️  DRY RUN complete — no changes were written to the database.`);
    console.log(`    Run without --dry-run to apply.\n`);
  } else {
    console.log(`\n✅  Backfill complete — ${results.length} center(s) updated.\n`);
  }
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
