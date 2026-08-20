import { PrismaClient } from '@prisma/client';
import { buildScheduleRows, resolveLastEmiAmount } from '../src/utils/loan.utils';

const prisma = new PrismaClient();

async function main() {
  console.log("Starting to fix missing sanction dates and schedules...");

  const loansToFix = await prisma.loan.findMany({
    where: {
      status: { in: ['ACTIVE', 'CLOSED'] },
      sanctionDate: null,
      disbursementDate: { not: null }
    },
    include: {
      package: true,
      schedules: true
    }
  });

  console.log(`Found ${loansToFix.length} loans with missing sanctionDate but existing disbursementDate.`);

  let updatedCount = 0;

  for (const loan of loansToFix) {
    try {
      await prisma.$transaction(async (tx) => {
        const disbursementDate = loan.disbursementDate!;
        
        let firstDueDate = loan.firstDueDate;
        if (!firstDueDate) {
          firstDueDate = new Date(disbursementDate.getTime());
          if (loan.package.frequency === 'WEEKLY') {
            firstDueDate.setDate(firstDueDate.getDate() + 7);
          } else if (loan.package.frequency === 'MONTHLY') {
            firstDueDate.setMonth(firstDueDate.getMonth() + 1);
          } else {
            // Default 7 days
            firstDueDate.setDate(firstDueDate.getDate() + 7);
          }
        }

        console.log(`Updating Loan ${loan.loanNumber}... Setting SanctionDate: ${disbursementDate.toISOString().split('T')[0]}`);
        
        // 1. Update dates
        await tx.loan.update({
          where: { id: loan.id },
          data: {
            sanctionDate: disbursementDate,
            firstDueDate: firstDueDate
          }
        });

        // 2. Fix schedules if they are missing
        if (loan.schedules.length === 0) {
          console.log(` -> Rebuilding missing schedules for ${loan.loanNumber}`);
          const lastEmiAmount = resolveLastEmiAmount(loan.totalDueAmount, loan.perDueAmount, loan.noOfDues);
          const scheduleRows = buildScheduleRows(
            loan.id,
            loan.noOfDues,
            loan.perDueAmount,
            firstDueDate,
            loan.package.frequency,
            lastEmiAmount
          );

          // We insert them all as PENDING because we don't have collection data here.
          // The user can add collections via UI or another sync script.
          const finalSchedules = scheduleRows.map(sch => ({
            ...sch,
            status: 'PENDING' as any,
            amountPaid: 0
          }));

          await tx.loanSchedule.createMany({
            data: finalSchedules
          });
        }

        updatedCount++;
      });
    } catch (e: any) {
      console.error(`Failed to update ${loan.loanNumber}:`, e.message);
    }
  }

  console.log(`\nFix completed! Successfully updated ${updatedCount} loans.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
