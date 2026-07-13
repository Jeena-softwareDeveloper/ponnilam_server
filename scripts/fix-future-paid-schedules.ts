import prisma from '../src/utils/prisma';
import { ScheduleStatus, UNPAID_SCHEDULE_STATUSES } from '../src/utils/prisma-enums';
import { toCollectionDay } from '../src/utils/date.utils';
import { sumUnpaidScheduleAmount } from '../src/utils/loan.utils';

/**
 * fix-future-paid-schedules.ts
 *
 * Scans for LoanSchedules marked as PAID whose due date is strictly in the future relative to:
 * 1. Today's date (or specific check date), OR
 * 2. Their recorded paidDate.
 *
 * Reverts those future schedules back to PENDING, resets their amountPaid/paidDate/collectionId,
 * and credits the reverted amount to the Loan's advanceBalance while adjusting outstandingAmount.
 *
 * Usage:
 *   npx ts-node scripts/fix-future-paid-schedules.ts
 */
async function fixFuturePaidSchedules() {
  console.log('--- Starting Fix for Future Paid Schedules ---');
  const todayStr = toCollectionDay(new Date());
  console.log(`Current Reference Date (Today): ${todayStr}`);

  const paidSchedules = await prisma.loanSchedule.findMany({
    where: {
      status: { in: [ScheduleStatus.PAID, ScheduleStatus.PARTIAL] },
    },
    include: {
      loan: {
        include: {
          customer: true,
        },
      },
    },
    orderBy: { dueDate: 'asc' },
  });

  let fixedCount = 0;

  for (const schedule of paidSchedules) {
    if (!schedule.dueDate) continue;
    const dueDay = toCollectionDay(schedule.dueDate);
    const paidDay = schedule.paidDate ? toCollectionDay(schedule.paidDate) : todayStr;

    // Check if the schedule was paid before its due date OR if its due date is after today
    if (dueDay > paidDay || dueDay > todayStr) {
      const loan = schedule.loan;
      if (!loan) continue;

      console.log(
        `Found Future Paid Schedule [Loan: ${loan.loanNumber} | Customer: ${loan.customer?.name} (${loan.customer?.customerNo})]`
      );
      console.log(
        `  -> Schedule ID: ${schedule.id} | Due Date: ${dueDay} | Paid Date: ${paidDay} | Amount Paid: ₹${schedule.amountPaid}`
      );

      const amountToRevert = schedule.amountPaid || 0;

      await prisma.$transaction(async (tx) => {
        // 1. Revert schedule back to PENDING
        await tx.loanSchedule.update({
          where: { id: schedule.id },
          data: {
            status: ScheduleStatus.PENDING,
            amountPaid: 0,
            paidDate: null,
            collectionId: null,
          },
        });

        // 2. Add reverted amount to loan advanceBalance
        const newAdvanceBalance = (loan.advanceBalance || 0) + amountToRevert;

        // 3. Recalculate outstandingAmount
        const newScheduleOutstanding = await sumUnpaidScheduleAmount(tx, loan.id);
        const newOutstanding = Math.max(0, newScheduleOutstanding - newAdvanceBalance);

        await tx.loan.update({
          where: { id: loan.id },
          data: {
            advanceBalance: newAdvanceBalance,
            outstandingAmount: newOutstanding,
            status: 'ACTIVE',
          },
        });
      });

      fixedCount++;
      console.log(
        `  ✔ Successfully reverted to PENDING and credited ₹${amountToRevert} to Advance Balance.\n`
      );
    }
  }

  console.log(`--- Finished! Fixed ${fixedCount} future paid schedule(s) ---`);
  await prisma.$disconnect();
}

fixFuturePaidSchedules().catch((err) => {
  console.error('Error in fixFuturePaidSchedules:', err);
  prisma.$disconnect();
  process.exit(1);
});
