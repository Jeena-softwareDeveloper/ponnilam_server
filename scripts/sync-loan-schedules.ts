import 'dotenv/config';
import prisma from '../src/utils/prisma';
import { ScheduleStatus, LoanStatus } from '../src/utils/prisma-enums';
import { buildScheduleRows, resolveLastEmiAmount } from '../src/utils/loan.utils';

/**
 * sync-loan-schedules.ts
 *
 * Synchronizes LoanSchedule due dates and firstDueDate with sanctionDate (Loan Start Date)
 * for all loans that have NOT had any collections (0 paid schedules).
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
      schedules: true,
    },
  });

  let syncedCount = 0;

  for (const loan of loans) {
    // Check if any schedule has been paid or partially paid
    const hasPaidSchedules = loan.schedules.some(
      (s) => s.status !== ScheduleStatus.PENDING || (s.amountPaid && s.amountPaid > 0)
    );
    if (hasPaidSchedules) {
      continue; // Skip loans that already have collection activity
    }

    const sanctionDate = loan.sanctionDate || loan.createdAt;
    if (!sanctionDate) continue;

    const currentFirstDueStr = loan.firstDueDate ? loan.firstDueDate.toISOString().slice(0, 10) : '';
    const sanctionStr = sanctionDate.toISOString().slice(0, 10);

    // If firstDueDate does not exactly match sanctionDate (Loan Start Date), or if schedules start on a different date
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
      const noOfDues = loan.noOfDues || 28;
      const perDueAmount = loan.perDueAmount || 0;
      const lastEmi = resolveLastEmiAmount(loan.totalDueAmount || 0, perDueAmount, noOfDues);

      await prisma.$transaction(async (tx) => {
        // 1. Update loan firstDueDate to match sanctionDate
        await tx.loan.update({
          where: { id: loan.id },
          data: { firstDueDate: new Date(sanctionDate) },
        });

        // 2. Rebuild schedule rows from sanctionDate
        await tx.loanSchedule.deleteMany({ where: { loanId: loan.id } });
        if (noOfDues > 0 && perDueAmount > 0) {
          await tx.loanSchedule.createMany({
            data: buildScheduleRows(
              loan.id,
              noOfDues,
              perDueAmount,
              new Date(sanctionDate),
              packageFrequency,
              lastEmi
            ),
          });
        }
      });

      syncedCount++;
      console.log(`  ✔ Successfully resynced ${noOfDues} EMI schedules starting on ${sanctionStr}.\n`);
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
