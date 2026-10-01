import 'dotenv/config';
import prisma from '../src/utils/prisma';

async function revert4thEmiSAT078() {
  console.log('--- Starting Revert 4th EMI for Center SAT078 ---');

  // Find Center
  const center = await prisma.center.findFirst({
    where: {
      OR: [
        { code: 'SAT078' },
        { name: { contains: 'SAT078' } },
        { name: { contains: 'GOWRI RAMAPURAM' } }
      ]
    }
  });

  if (!center) {
    console.log('Center SAT078 not found!');
    return;
  }

  console.log(`Found Center: ${center.name} (ID: ${center.id})`);

  // Find all loans in this center EXCEPT GRA005
  const loans = await prisma.loan.findMany({
    where: {
      customer: {
        centerId: center.id,
        customerNo: { not: 'GRA005' } // Exclude VADIVUKKARASI VELLIANGRI
      }
    },
    include: {
      customer: true,
      schedules: {
        where: { status: 'PAID' },
        orderBy: { dueDate: 'asc' } // Ascending to identify the 4th EMI
      }
    }
  });

  if (loans.length === 0) {
    console.log('No loans found matching criteria.');
    return;
  }

  console.log(`Found ${loans.length} loans to process...`);

  let revertedCount = 0;

  for (const loan of loans) {
    // We check if they have at least 4 paid EMIs to safely revert the 4th one
    if (loan.schedules.length >= 4) {
      // 0-indexed, so index 3 is the 4th EMI
      const scheduleToRevert = loan.schedules[3]; 

      console.log(`\nReverting 4th EMI for Loan: ${loan.loanNumber} (Customer: ${loan.customer.customerNo} - ${loan.customer.name})`);
      console.log(`Schedule Due Date: ${scheduleToRevert.dueDate}, Amount: ${scheduleToRevert.emiAmount}`);

      try {
        await prisma.$transaction(async (tx) => {
          // 1. Revert the 4th Schedule
          await tx.loanSchedule.update({
            where: { id: scheduleToRevert.id },
            data: {
              status: 'PENDING',
              amountPaid: 0,
              paidDate: null,
            }
          });

          // 2. Void Collection if it exists and linked
          if (scheduleToRevert.collectionId) {
            await tx.collection.update({
              where: { id: scheduleToRevert.collectionId },
              data: {
                isVoided: true,
                voidedAt: new Date(),
                voidReason: 'Reverted 4th EMI for SAT078',
              }
            });
            // unlink from schedule
            await tx.loanSchedule.update({
                where: { id: scheduleToRevert.id },
                data: { collectionId: null }
            });
          }

          // 3. Recalculate Loan Outstanding & Advance
          // Fetch the updated schedules to calculate correct totals
          const updatedLoan = await tx.loan.findUnique({
            where: { id: loan.id },
            include: { schedules: true, collections: { where: { isVoided: false } } }
          });

          if (updatedLoan) {
            const newOutstanding = updatedLoan.schedules.reduce((sum, s) => {
                return sum + Math.max(0, s.emiAmount - s.amountPaid);
            }, 0);

            const totalCollected = updatedLoan.collections.reduce((sum, c) => sum + c.amount, 0);
            const totalApplied = updatedLoan.schedules.reduce((sum, s) => sum + s.amountPaid, 0);
            const newAdvance = Math.max(0, totalCollected - totalApplied);

            await tx.loan.update({
                where: { id: loan.id },
                data: {
                outstandingAmount: newOutstanding,
                advanceBalance: newAdvance,
                }
            });
          }

          // 4. Create Audit Log
          await tx.auditLog.create({
            data: {
              action: 'REVERT_EMI',
              entity: 'LoanSchedule',
              entityId: scheduleToRevert.id,
              details: `Reverted 4th EMI for SAT078, Loan: ${loan.loanNumber}, Customer: ${loan.customer.name}`,
            }
          });
        });

        console.log(`  ✅ Successfully reverted 4th EMI for ${loan.loanNumber}.`);
        revertedCount++;
      } catch (err) {
        console.error(`  ❌ Failed to revert loan ${loan.loanNumber}:`, err);
      }
    } else {
      console.log(`\n⚠️ Skipping Loan: ${loan.loanNumber} (${loan.customer.name}) - Paid EMIs count is ${loan.schedules.length}, expected at least 4.`);
    }
  }

  console.log(`\n--- Finished! Successfully reverted EMIs for ${revertedCount} loan(s) ---`);
  await prisma.$disconnect();
}

revert4thEmiSAT078().catch((err) => {
  console.error('Error:', err);
  prisma.$disconnect();
  process.exit(1);
});
