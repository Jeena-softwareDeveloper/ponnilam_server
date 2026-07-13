import 'dotenv/config';
import prisma from '../src/utils/prisma';
import { toCollectionDay } from '../src/utils/date.utils';

/**
 * cleanup-orphan-collections.ts
 *
 * Scans for Collection records (isVoided = false) whose transaction date (trnDate) is strictly in the future relative to today,
 * OR whose corresponding LoanSchedule for that date is marked PENDING (indicating a previously reverted or mock schedule).
 * Voids those orphan/future collections cleanly so Bulk Collection screens show correct real-time status.
 *
 * Usage:
 *   npx ts-node scripts/cleanup-orphan-collections.ts
 */
async function cleanupOrphanCollections() {
  console.log('--- Starting Cleanup of Orphan & Future Collections ---');
  const todayStr = toCollectionDay(new Date());
  console.log(`Current Reference Date (Today): ${todayStr}`);

  const activeCollections = await prisma.collection.findMany({
    where: {
      isVoided: false,
    },
    include: {
      loan: {
        include: {
          customer: true,
          schedules: {
            orderBy: { dueDate: 'asc' },
          },
        },
      },
    },
  });

  let voidedCount = 0;

  for (const col of activeCollections) {
    if (!col.trnDate || !col.loan) continue;
    const colDay = toCollectionDay(col.trnDate);

    // Check if collection date is strictly after today, OR if the schedule on/around colDay is currently PENDING
    let shouldVoid = false;
    let reason = '';

    if (colDay > todayStr) {
      shouldVoid = true;
      reason = `Future collection date (${colDay} > ${todayStr})`;
    } else {
      // Check if there is a schedule matching colDay that is still PENDING
      const matchingSchedule = col.loan.schedules.find((s) => toCollectionDay(s.dueDate) === colDay);
      if (matchingSchedule && matchingSchedule.status === 'PENDING' && (matchingSchedule.amountPaid || 0) === 0) {
        shouldVoid = true;
        reason = `Matching schedule for due date ${colDay} is currently PENDING/Unpaid`;
      }
    }

    if (shouldVoid) {
      console.log(
        `Voiding Orphan Collection [Loan: ${col.loan.loanNumber} | Customer: ${col.loan.customer?.name} | Amount: ₹${col.amount}]`
      );
      console.log(`  -> Collection ID: ${col.id} | Trn Date: ${colDay} | Reason: ${reason}`);

      await prisma.collection.update({
        where: { id: col.id },
        data: {
          isVoided: true,
          voidReason: reason,
        },
      });

      voidedCount++;
      console.log(`  ✔ Successfully voided orphan/future collection.\n`);
    }
  }

  console.log(`--- Finished! Cleaned up ${voidedCount} orphan/future collection(s) ---`);
  await prisma.$disconnect();
}

cleanupOrphanCollections().catch((err) => {
  console.error('Error in cleanupOrphanCollections:', err);
  prisma.$disconnect();
  process.exit(1);
});
