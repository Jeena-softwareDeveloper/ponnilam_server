import 'dotenv/config';
import prisma from '../src/utils/prisma';
import { LoanStatus, ScheduleStatus } from '../src/utils/prisma-enums';
import { nextTrnNumber } from '../src/utils/sequence.utils';
import { sumUnpaidScheduleAmount } from '../src/utils/loan.utils';
import { toCollectionDay } from '../src/utils/date.utils';

async function clearSathiOverdue() {
  console.log("--- Starting Sathyamangalam Overdue Clearing Script ---");

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  // 1. Fetch all active/approved loans for Sathyamangalam
  const sathiLoans = await prisma.loan.findMany({
    where: {
      OR: [
        { loanNumber: { startsWith: 'SAT' } },
        { customer: { area: { branch: { code: 'SAT' } } } },
        { customer: { area: { branch: { code: 'SATHI' } } } },
        { customer: { area: { branch: { name: { contains: 'Sathyamangalam' } } } } },
        { customer: { area: { branch: { name: { contains: 'Sathiyamangalam' } } } } }
      ],
      status: { in: ['ACTIVE', 'APPROVED'] }
    },
    include: {
      customer: {
        include: {
          area: {
            include: {
              branch: true
            }
          }
        }
      },
      schedules: {
        where: {
          status: { in: ['PENDING', 'PARTIAL'] },
          dueDate: { lte: today }
        },
        orderBy: { dueDate: 'asc' }
      }
    }
  });

  console.log(`Found ${sathiLoans.length} Sathyamangalam loan(s) with overdue schedules up to ${today.toISOString().slice(0, 10)}.`);

  let totalSchedulesCleared = 0;
  let totalAmountCleared = 0;
  let loansUpdatedCount = 0;

  for (const loan of sathiLoans) {
    if (loan.schedules.length === 0) continue;

    console.log(`\nProcessing Loan: ${loan.loanNumber} (${loan.customer?.name} - ${loan.customer?.area?.name})`);
    console.log(`  - Pending Overdue Schedules: ${loan.schedules.length}`);

    try {
      await prisma.$transaction(async (tx) => {
        let loanCollected = 0;

        for (const sch of loan.schedules) {
          const due = Number(sch.emiAmount) - (Number(sch.amountPaid) || 0);
          if (due <= 0) continue;

          const collectionDay = toCollectionDay(new Date(sch.dueDate));

          // Check for existing collection on that date
          const existingCollection = await tx.collection.findFirst({
            where: { loanId: loan.id, collectionDay, isVoided: false }
          });

          let collectionId = existingCollection?.id;

          if (!existingCollection) {
            const trnNumber = await nextTrnNumber(tx as any);
            const collection = await tx.collection.create({
              data: {
                trnNumber,
                trnDate: sch.dueDate,
                collectionDay,
                amount: due,
                remarks: 'Auto-Collection for Sathyamangalam Due Date',
                loanId: loan.id,
                staffId: loan.staffId,
              }
            });
            collectionId = collection.id;
          }

          // Mark schedule as PAID on its exact due date
          await tx.loanSchedule.update({
            where: { id: sch.id },
            data: {
              status: ScheduleStatus.PAID,
              amountPaid: sch.emiAmount,
              paidDate: sch.dueDate,
              collectionId: collectionId
            }
          });

          loanCollected += due;
          totalSchedulesCleared++;
          totalAmountCleared += due;
          console.log(`    ✅ Marked PAID: ₹${due} for Due Date: ${sch.dueDate.toISOString().slice(0, 10)}`);
        }

        // Recalculate loan outstanding amount
        const newOutstanding = await sumUnpaidScheduleAmount(tx as any, loan.id);

        let newStatus = loan.status;
        if (newOutstanding <= 0) {
          newStatus = LoanStatus.CLOSED;
        } else if (loan.status === 'APPROVED' && loanCollected > 0) {
          newStatus = LoanStatus.ACTIVE;
        }

        await tx.loan.update({
          where: { id: loan.id },
          data: {
            outstandingAmount: Math.max(0, newOutstanding),
            status: newStatus
          }
        });

        loansUpdatedCount++;
      });
    } catch (err: any) {
      console.error(`  ❌ Failed to process loan ${loan.loanNumber}:`, err.message);
    }
  }

  console.log("\n=======================================================");
  console.log(`Done! Successfully cleared overdues for ${loansUpdatedCount} loan(s).`);
  console.log(`Total Schedules Marked PAID: ${totalSchedulesCleared}`);
  console.log(`Total Overdue Amount Cleared: ₹${totalAmountCleared}`);
  console.log("=======================================================");

  await prisma.$disconnect();
}

clearSathiOverdue().catch((err) => {
  console.error("Error clearing Sathyamangalam overdue:", err);
  prisma.$disconnect();
  process.exit(1);
});
