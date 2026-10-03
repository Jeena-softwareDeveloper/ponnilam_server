import 'dotenv/config';
import prisma from '../src/utils/prisma';

async function fixClosedLoanSchedules() {
  console.log("Checking CLOSED loans with remaining unpaid schedules...");

  const closedLoans = await prisma.loan.findMany({
    where: {
      OR: [
        { status: 'CLOSED' },
        { outstandingAmount: { lte: 0 } }
      ]
    },
    include: {
      schedules: {
        where: {
          status: { in: ['PENDING', 'PARTIAL'] }
        }
      }
    }
  });

  console.log(`Found ${closedLoans.length} CLOSED or zero-outstanding loans.`);

  let updatedCount = 0;
  for (const loan of closedLoans) {
    if (loan.schedules.length > 0) {
      console.log(`Loan ${loan.loanNumber} (Status: ${loan.status}, Outstanding: ${loan.outstandingAmount}) has ${loan.schedules.length} pending schedules. Fixing...`);
      for (const sch of loan.schedules) {
        await prisma.loanSchedule.update({
          where: { id: sch.id },
          data: {
            status: 'PAID',
            amountPaid: sch.emiAmount
          }
        });
      }
      updatedCount++;
    }
  }

  console.log(`Successfully fixed schedules for ${updatedCount} closed loans.`);
  await prisma.$disconnect();
}

fixClosedLoanSchedules().catch(console.error);