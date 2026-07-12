import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * 00-ClearLedgers.ts
 * Deletes all wrongly generated schedules and ledgers so we can regenerate correctly.
 * Run: npx ts-node scripts/seed/00-ClearLedgers.ts
 */

async function main() {
  console.log('[ClearLedgers] Clearing bad schedules and ledgers...');

  const deletedSchedules = await prisma.loanSchedule.deleteMany({});
  console.log(`  Deleted ${deletedSchedules.count} LoanSchedule records`);

  const deletedLoanLedgers = await prisma.loanLedger.deleteMany({});
  console.log(`  Deleted ${deletedLoanLedgers.count} LoanLedger records`);

  const deletedCustLedgers = await prisma.customerLedger.deleteMany({});
  console.log(`  Deleted ${deletedCustLedgers.count} CustomerLedger records`);

  console.log('[ClearLedgers] ✅ Done — all schedules and ledgers cleared');
}

main().catch(console.error).finally(() => prisma.$disconnect());
