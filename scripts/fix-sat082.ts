import 'dotenv/config';
import prisma from '../src/utils/prisma';

async function fixSat082() {
  console.log('--- Fixing EMI Mismatch for SAT082 ---');

  const loans = await prisma.loan.findMany({
    where: {
      customer: {
        center: {
          code: 'SAT082'
        }
      }
    },
    include: {
      schedules: true,
      collections: { where: { isVoided: false } },
      customer: true
    }
  });

  if (loans.length === 0) {
    console.log('No loans found for SAT082.');
    return;
  }

  let fixedCount = 0;

  for (const loan of loans) {
    if (loan.schedules.length === 0) continue;

    let schedulesFixed = false;
    let newSchedules = loan.schedules.map(s => ({...s}));

    for (let i = 0; i < newSchedules.length; i++) {
      if (newSchedules[i].emiAmount !== loan.perDueAmount) {
        newSchedules[i].emiAmount = loan.perDueAmount;
        schedulesFixed = true;
      }
    }

    if (schedulesFixed) {
      console.log(`\n⚠️ Fixing Loan: ${loan.loanNumber} (${loan.customer?.name})`);
      console.log(`  - Schedules updated to match correct EMI: ${loan.perDueAmount}`);
      
      const realTotalDue = newSchedules.reduce((sum, s) => sum + s.emiAmount, 0);
      const totalCollected = loan.collections.reduce((sum, c) => sum + c.amount, 0);
      
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

      const totalAppliedToSchedules = newSchedules.reduce((sum, s) => sum + (s.amountPaid || 0), 0);
      const realAdvance = Math.max(0, totalCollected - totalAppliedToSchedules);
      let realOutstanding = newSchedules.reduce((sum, s) => sum + Math.max(0, s.emiAmount - (s.amountPaid || 0)), 0);

      await prisma.$transaction(async (tx) => {
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
    } else {
      console.log(`Loan ${loan.loanNumber} is already correct (EMI: ${loan.perDueAmount}).`);
    }
  }

  console.log(`\n--- Finished! Successfully fixed ${fixedCount} loan(s) ---`);
  await prisma.$disconnect();
}

fixSat082().catch((err) => {
  console.error('Error:', err);
  prisma.$disconnect();
  process.exit(1);
});
