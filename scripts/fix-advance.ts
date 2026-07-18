import 'dotenv/config';
import prisma from '../src/utils/prisma';
import { sumUnpaidScheduleAmount } from '../src/utils/loan.utils';

/**
 * fix-advance.ts
 *
 * Clears the advanceBalance of a specific loan and recalculates its outstandingAmount
 * based on the actual unpaid schedules in the database.
 *
 * Usage:
 *   npx ts-node scripts/fix-advance.ts ANT-L0019
 */
async function fixAdvanceBalance() {
  const loanNumber = process.argv[2];

  if (!loanNumber) {
    console.error('❌ Please provide a Loan Number. Example: npx ts-node scripts/fix-advance.ts ANT-L0019');
    process.exit(1);
  }

  console.log(`--- Fixing Advance Balance for Loan: ${loanNumber} ---`);

  const loan = await prisma.loan.findFirst({
    where: { loanNumber },
  });

  if (!loan) {
    console.error(`❌ Loan not found: ${loanNumber}`);
    process.exit(1);
  }

  console.log(`Current State:
  - Outstanding Amount: ${loan.outstandingAmount}
  - Advance Balance: ${loan.advanceBalance}`);

  if (loan.advanceBalance === 0) {
    console.log(`✅ Advance balance is already 0. No changes needed.`);
    process.exit(0);
  }

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
        transactionType: 'Penalty', // Using a generic type for adjustment, or you can add 'Adjustment' to your enum
        amount: loan.advanceBalance, 
        openingBalance: lastLedger?.closingBalance || realOutstanding,
        closingBalance: realOutstanding,
        date: new Date(),
        remarks: `System Fix: Cleared incorrect advance balance of ${loan.advanceBalance}`
      }
    });

    console.log(`\n✅ Successfully Fixed!
  - New Outstanding Amount: ${realOutstanding}
  - New Advance Balance: 0
  - Ledger updated to reflect correction.`);
  });

  await prisma.$disconnect();
}

fixAdvanceBalance().catch((err) => {
  console.error('Error:', err);
  prisma.$disconnect();
  process.exit(1);
});
