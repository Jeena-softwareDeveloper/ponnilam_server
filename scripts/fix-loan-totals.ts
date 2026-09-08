import 'dotenv/config';
import prisma from '../src/utils/prisma';

async function fixLoanTotals() {
  console.log('--- Starting Comprehensive Loan Data Fix ---');

  const loans = await prisma.loan.findMany({
    include: {
      schedules: true,
      collections: { where: { isVoided: false } },
      customer: true
    }
  });

  console.log(`Found ${loans.length} loans. Validating data consistency...`);

  let fixedCount = 0;

  for (const loan of loans) {
    if (loan.schedules.length === 0) continue;

    const expectedTotalDue = loan.noOfDues * loan.perDueAmount;

    // Check if the schedules are messed up (e.g., last EMI is too big)
    let schedulesFixed = false;
    let newSchedules = loan.schedules.map(s => ({...s}));

    for (let i = 0; i < newSchedules.length; i++) {
      if (newSchedules[i].emiAmount !== loan.perDueAmount) {
        newSchedules[i].emiAmount = loan.perDueAmount;
        schedulesFixed = true;
      }
    }

    // 1. Calculate correct total due based on fixed schedules
    const realTotalDue = newSchedules.reduce((sum, s) => sum + s.emiAmount, 0);

    // 2. Calculate correct total paid based on collections
    const totalCollected = loan.collections.reduce((sum, c) => sum + c.amount, 0);
    
    // We need to re-apply amounts to schedules sequentially if we changed their emiAmounts
    if (schedulesFixed) {
      let pool = totalCollected;
      for (const sch of newSchedules) {
        if (pool >= sch.emiAmount) {
          sch.amountPaid = sch.emiAmount;
          sch.status = 'PAID';
          pool -= sch.emiAmount;
        } else if (pool > 0) {
          sch.amountPaid = pool;
          sch.status = 'PARTIAL';
          pool = 0;
        } else {
          sch.amountPaid = 0;
          sch.status = 'PENDING';
        }
      }
    }

    const totalAppliedToSchedules = newSchedules.reduce((sum, s) => sum + (s.amountPaid || 0), 0);
    
    // 3. Calculate advance balance correctly
    const realAdvance = Math.max(0, totalCollected - totalAppliedToSchedules);

    // 4. Calculate correct outstanding based on schedules
    let realOutstanding = newSchedules.reduce((sum, s) => sum + Math.max(0, s.emiAmount - (s.amountPaid || 0)), 0);

    const isTotalDueWrong = loan.totalDueAmount !== realTotalDue;
    const isOutstandingWrong = loan.outstandingAmount !== realOutstanding;
    const isAdvanceWrong = loan.advanceBalance !== realAdvance;

    if (isTotalDueWrong || isOutstandingWrong || isAdvanceWrong || schedulesFixed) {
      console.log(`\n⚠️ Fixing Loan: ${loan.loanNumber} (${loan.customer?.name})`);
      if (isTotalDueWrong) console.log(`  - Total Due: DB=${loan.totalDueAmount} | Real=${realTotalDue}`);
      if (isOutstandingWrong) console.log(`  - Outstanding: DB=${loan.outstandingAmount} | Real=${realOutstanding}`);
      if (isAdvanceWrong) console.log(`  - Advance: DB=${loan.advanceBalance} | Real=${realAdvance}`);
      if (schedulesFixed) console.log(`  - Schedules updated to strictly match EMI: ${loan.perDueAmount}`);
      
      await prisma.$transaction(async (tx) => {
        if (schedulesFixed) {
          for (const sch of newSchedules) {
            await tx.loanSchedule.update({
              where: { id: sch.id },
              data: {
                emiAmount: sch.emiAmount,
                amountPaid: sch.amountPaid,
                status: sch.status
              }
            });
          }
        }

        await tx.loan.update({
          where: { id: loan.id },
          data: { 
            totalDueAmount: realTotalDue,
            outstandingAmount: realOutstanding,
            advanceBalance: realAdvance
          }
        });
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
