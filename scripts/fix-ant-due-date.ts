import { PrismaClient } from '@prisma/client';
import { buildScheduleRows, resolveLastEmiAmount } from '../src/utils/loan.utils';

const prisma = new PrismaClient();

async function main() {
  console.log("Starting First Due Date Update Script for ANT-019...");

  // Generate loan numbers from ANT-L0110 to ANT-L0118
  const loanNumbers = Array.from({ length: 9 }, (_, i) => `ANT-L${String(110 + i).padStart(4, '0')}`);
  console.log(`Target loans: ${loanNumbers.join(', ')}`);

  const newDueDate = new Date('2026-08-26T00:00:00.000Z');
  console.log(`New First Collection Date: 26/08/2026`);

  const loans = await prisma.loan.findMany({
    where: { loanNumber: { in: loanNumbers } },
    include: { package: true, customer: { include: { center: true } } }
  });

  if (loans.length === 0) {
    console.log('No matching loans found.');
    return;
  }

  console.log(`Found ${loans.length} loans in the database.`);

  await prisma.$transaction(async (tx) => {
    for (const loan of loans) {
      console.log(`Processing loan ${loan.loanNumber}...`);

      const paidSchedules = await tx.loanSchedule.count({
        where: { loanId: loan.id, status: { not: 'PENDING' } }
      });
      
      if (paidSchedules > 0) {
        console.log(`  Skipping ${loan.loanNumber} because it already has paid/partial collections.`);
        continue;
      }

      // Update the first due date on the Loan record
      await tx.loan.update({
        where: { id: loan.id },
        data: { firstDueDate: newDueDate }
      });

      // Delete old schedules
      await tx.loanSchedule.deleteMany({
        where: { loanId: loan.id }
      });

      // Recreate schedules
      const packageFrequency = loan.package?.frequency?.toUpperCase() || loan.customer?.center?.repaymentType?.toUpperCase() || 'WEEKLY';
      
      const lastEmi = resolveLastEmiAmount(loan.totalDueAmount, loan.perDueAmount, loan.noOfDues);
      
      const scheduleRows = buildScheduleRows(
        loan.id,
        loan.noOfDues,
        loan.perDueAmount,
        newDueDate,
        packageFrequency,
        lastEmi
      );

      await tx.loanSchedule.createMany({
        data: scheduleRows
      });

      console.log(`  Updated ${loan.loanNumber} and recreated ${scheduleRows.length} schedules.`);
    }
  });

  console.log('All targeted loans updated successfully! 🎉');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
