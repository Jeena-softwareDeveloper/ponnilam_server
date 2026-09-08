import 'dotenv/config';
import prisma from '../src/utils/prisma';
import { sumUnpaidScheduleAmount } from '../src/utils/loan.utils';

async function fixAllAdvances() {
  console.log('--- Starting Bulk Advance Balance Fix ---');

  const loans = await prisma.loan.findMany({
    where: {
      status: { in: ['ACTIVE', 'APPROVED'] },
      advanceBalance: { gt: 0 }
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
    const totalCollected = loan.collections.reduce((sum, c) => sum + c.amount, 0);

    const totalAppliedToSchedules = loan.schedules.reduce((sum, s) => sum + (s.amountPaid || 0), 0);
    if (totalCollected === totalAppliedToSchedules) {
      console.log(`\n⚠️ Anomaly detected in Loan: ${loan.loanNumber} (${loan.customer?.name} - ${loan.customer?.center?.name})`);
      console.log(`  - Total Collected: ${totalCollected}`);
      console.log(`  - Total Applied to EMIs: ${totalAppliedToSchedules}`);
      console.log(`  - BUG: advanceBalance is ${loan.advanceBalance} but should be 0! Fixing...`);

      await prisma.$transaction(async (tx) => {
        const realOutstanding = await sumUnpaidScheduleAmount(tx, loan.id);
        
        await tx.loan.update({
          where: { id: loan.id },
          data: {
            advanceBalance: 0,
            outstandingAmount: realOutstanding
          }
        });

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
