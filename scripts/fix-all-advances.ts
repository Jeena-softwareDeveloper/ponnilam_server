import 'dotenv/config';
import prisma from '../src/utils/prisma';
import { sumUnpaidScheduleAmount } from '../src/utils/loan.utils';

/**
 * fix-all-advances.ts
 *
 * Scans all active/approved loans and detects "stranded" advance balances.
 * A stranded advance balance occurs when a customer's total paid amount
 * equals the total amount applied to schedules, meaning there should be NO
 * advance balance, but the database incorrectly shows an advanceBalance > 0.
 *
 * Usage:
 *   npx ts-node scripts/fix-all-advances.ts
 */
async function fixAllAdvances() {
  console.log('--- Starting Bulk Advance Balance Fix ---');

  const loans = await prisma.loan.findMany({
    where: {
      status: { in: ['ACTIVE', 'APPROVED'] },
      advanceBalance: { gt: 0 } // Only check loans that actually have an advance balance
    },
    include: {
      collections: { where: { isVoided: false } },
      schedules: true,
      customer: { include: { center: true } }
    }
  });

  console.log(`Found ${loans.length} loans with an advance balance > 0. Checking for anomalies...`);

  let fixedCount = 0;

  for (const loan of loans) {
    // Calculate total money collected
    const totalCollected = loan.collections.reduce((sum, c) => sum + c.amount, 0);

    // Calculate total money applied to schedules
    const totalAppliedToSchedules = loan.schedules.reduce((sum, s) => sum + (s.amountPaid || 0), 0);

    // If totalCollected is perfectly matching totalAppliedToSchedules, 
    // it means there is NO extra money left to be an "advance".
    // But this loan has advanceBalance > 0, so it is bugged!
    if (totalCollected === totalAppliedToSchedules) {
      console.log(`\n⚠️ Anomaly detected in Loan: ${loan.loanNumber} (${loan.customer?.name} - ${loan.customer?.center?.name})`);
      console.log(`  - Total Collected: ${totalCollected}`);
      console.log(`  - Total Applied to EMIs: ${totalAppliedToSchedules}`);
      console.log(`  - BUG: advanceBalance is ${loan.advanceBalance} but should be 0! Fixing...`);

      await prisma.$transaction(async (tx) => {
        // 1. Calculate the real outstanding based on schedules alone
        const realOutstanding = await sumUnpaidScheduleAmount(tx, loan.id);
        
        // 2. Update the loan to clear advance and set real outstanding
        await tx.loan.update({
          where: { id: loan.id },
          data: {
            advanceBalance: 0,
            outstandingAmount: realOutstanding
          }
        });

        // 3. Add an adjustment ledger entry to fix the ledger history
        const lastLedger = await tx.loanLedger.findFirst({
          where: { loanId: loan.id },
          orderBy: { createdAt: 'desc' }
        });

        await tx.loanLedger.create({
          data: {
            loanId: loan.id,
            transactionType: 'Penalty', // Using as an Adjustment indicator
            amount: loan.advanceBalance, 
            openingBalance: lastLedger?.closingBalance || realOutstanding,
            closingBalance: realOutstanding,
            date: new Date(),
            remarks: `System Fix: Cleared stranded advance balance of ${loan.advanceBalance}`
          }
        });
      });

      console.log(`  ✅ Fixed ${loan.loanNumber}. New Outstanding: ${await sumUnpaidScheduleAmount(prisma, loan.id)}`);
      fixedCount++;
    } else {
      // It's a genuine advance
      const expectedAdvance = totalCollected - totalAppliedToSchedules;
      if (loan.advanceBalance !== expectedAdvance) {
         console.log(`\n⚠️ Partial Anomaly in Loan: ${loan.loanNumber}`);
         console.log(`  - Total Collected: ${totalCollected}, Applied: ${totalAppliedToSchedules}`);
         console.log(`  - Expected Advance: ${expectedAdvance}, Actual Advance in DB: ${loan.advanceBalance}`);
         // We can auto-fix this too if needed, but keeping it safe for now.
      }
    }
  }

  console.log(`\n--- Finished! Successfully fixed ${fixedCount} buggy loan(s) ---`);
  await prisma.$disconnect();
}

fixAllAdvances().catch((err) => {
  console.error('Error:', err);
  prisma.$disconnect();
  process.exit(1);
});
