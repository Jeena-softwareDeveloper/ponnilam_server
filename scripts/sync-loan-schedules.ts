import 'dotenv/config';
import prisma from '../src/utils/prisma';
import { ScheduleStatus, LoanStatus } from '../src/utils/prisma-enums';
import { incrementDueDate } from '../src/utils/loan.utils';

/**
 * sync-loan-schedules.ts
 *
 * Synchronizes LoanSchedule due dates and firstDueDate with sanctionDate (Loan Start Date)
 * for all approved or active loans.
 *
 * Safe for loans with existing collections (Paid EMIs):
 * Instead of deleting and recreating rows (which would destroy paid statuses),
 * this updates the `dueDate` of existing LoanSchedule rows in-place.
 *
 * Usage:
 *   npx ts-node scripts/sync-loan-schedules.ts
 */
async function syncLoanSchedules() {
  console.log('--- Starting Schedule & First Due Date Synchronization ---');

  const loans = await prisma.loan.findMany({
    where: {
      status: { in: [LoanStatus.APPROVED, LoanStatus.ACTIVE] },
    },
    include: {
      package: true,
      customer: { include: { center: true } },
      schedules: {
        orderBy: { dueDate: 'asc' },
      },
    },
  });

  let syncedCount = 0;

  for (const loan of loans) {
    const sanctionDate = loan.sanctionDate || loan.createdAt;
    if (!sanctionDate) continue;

    const currentFirstDueStr = loan.firstDueDate ? loan.firstDueDate.toISOString().slice(0, 10) : '';
    const sanctionStr = sanctionDate.toISOString().slice(0, 10);

    const firstScheduleDueStr = loan.schedules.length > 0 && loan.schedules[0].dueDate
      ? loan.schedules[0].dueDate.toISOString().slice(0, 10)
      : '';

    if (currentFirstDueStr !== sanctionStr || firstScheduleDueStr !== sanctionStr) {
      console.log(`Syncing Loan [${loan.loanNumber}] (${loan.customer?.name})`);
      console.log(`  Old First Due Date: ${currentFirstDueStr || 'None'} | Old 1st Schedule Due: ${firstScheduleDueStr || 'None'}`);
      console.log(`  New First Due Date (Sanction Date): ${sanctionStr}`);

      const packageFrequency =
        loan.package?.frequency?.toUpperCase() ||
        loan.customer?.center?.repaymentType?.toUpperCase() ||
        'WEEKLY';

      await prisma.$transaction(async (tx) => {
        // 1. Update loan firstDueDate to match sanctionDate
        await tx.loan.update({
          where: { id: loan.id },
          data: { firstDueDate: new Date(sanctionDate) },
        });

        // 2. Update each schedule row's dueDate in place without modifying status, amountPaid, or collections
        let currentDate = new Date(sanctionDate);
        for (let i = 0; i < loan.schedules.length; i++) {
          await tx.loanSchedule.update({
            where: { id: loan.schedules[i].id },
            data: { dueDate: new Date(currentDate) },
          });
          currentDate = incrementDueDate(currentDate, packageFrequency);
        }
      });

      syncedCount++;
      console.log(`  ✔ Successfully resynced ${loan.schedules.length} EMI schedule dates starting on ${sanctionStr}.\n`);
    }
  }

  console.log(`--- Finished! Successfully synchronized ${syncedCount} loan(s) ---`);
  await prisma.$disconnect();
}

syncLoanSchedules().catch((err) => {
  console.error('Error in syncLoanSchedules:', err);
  prisma.$disconnect();
  process.exit(1);
});
