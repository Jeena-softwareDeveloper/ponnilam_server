import 'dotenv/config';
import prisma from '../src/utils/prisma';

async function fixLoanTotals() {
  console.log('--- Starting Comprehensive Loan Data Fix ---');

  const loans = await prisma.loan.findMany({
    include: {
      schedules: true,
      collections: { where: { isVoided: false } }
    }
  });

  console.log(`Found ${loans.length} loans. Validating data consistency...`);

  let fixedCount = 0;

  for (const loan of loans) {
    if (loan.schedules.length === 0) continue;

    // 1. Calculate correct total due based on schedules
    const realTotalDue = loan.schedules.reduce((sum, s) => sum + s.emiAmount, 0);

    // 2. Calculate correct total paid based on collections (and schedules to cross-verify)
    const totalCollected = loan.collections.reduce((sum, c) => sum + c.amount, 0);
    const totalAppliedToSchedules = loan.schedules.reduce((sum, s) => sum + (s.amountPaid || 0), 0);
    
    // 3. Calculate advance balance correctly
    const realAdvance = Math.max(0, totalCollected - totalAppliedToSchedules);

    // 4. Calculate correct outstanding based on schedules
    let realOutstanding = loan.schedules.reduce((sum, s) => sum + Math.max(0, s.emiAmount - (s.amountPaid || 0)), 0);

    const isTotalDueWrong = loan.totalDueAmount !== realTotalDue;
    const isOutstandingWrong = loan.outstandingAmount !== realOutstanding;
    const isAdvanceWrong = loan.advanceBalance !== realAdvance;

    if (isTotalDueWrong || isOutstandingWrong || isAdvanceWrong) {
      console.log(`\n⚠️ Inconsistency in Loan: ${loan.loanNumber}`);
      if (isTotalDueWrong) console.log(`  - Total Due: DB=${loan.totalDueAmount} | Real=${realTotalDue}`);
      if (isOutstandingWrong) console.log(`  - Outstanding: DB=${loan.outstandingAmount} | Real=${realOutstanding}`);
      if (isAdvanceWrong) console.log(`  - Advance: DB=${loan.advanceBalance} | Real=${realAdvance}`);
      
      await prisma.loan.update({
        where: { id: loan.id },
        data: { 
          totalDueAmount: realTotalDue,
          outstandingAmount: realOutstanding,
          advanceBalance: realAdvance
        }
      });

      console.log(`  ✅ Fixed ${loan.loanNumber}.`);
      fixedCount++;
    }
  }

  console.log(`\n--- Finished! Successfully fixed ${fixedCount} loan(s) ---`);
  await prisma.$disconnect();
}

fixLoanTotals().catch((err) => {
  console.error('Error:', err);
  prisma.$disconnect();
  process.exit(1);
});
