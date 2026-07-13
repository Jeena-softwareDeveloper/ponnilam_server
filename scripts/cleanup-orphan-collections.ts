import 'dotenv/config';
import prisma from '../src/utils/prisma';
import { toCollectionDay } from '../src/utils/date.utils';

/**
 * cleanup-orphan-collections.ts
 *
 * Scans for Collection records (isVoided = false) and ONLY voids:
 * 1. Future collections where transaction date (trnDate) > today.
 * 2. Orphaned collections where the matching schedule was reverted to PENDING (amountPaid=0) by fix-future-paid-schedules script and the collection ID is no longer linked to any schedule.
 *
 * It will NEVER touch valid past or current collections linked to paid/partial EMIs.
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

    let shouldVoid = false;
    let reason = '';

    // Condition 1: Collection date is strictly after today (e.g., > 2026-07-13)
    if (colDay > todayStr) {
      shouldVoid = true;
      reason = `Future collection date (${colDay} > today ${todayStr})`;
    } else {
      // Condition 2: Collection date is today or past, BUT:
      // (a) No schedule row references this collectionId AND
      // (b) The matching schedule row for this date is PENDING with amountPaid=0 (reverted by fix-future-paid-schedules)
      const isLinkedToAnySchedule = col.loan.schedules.some(
        (s) => s.collectionId === col.id || (s.amountPaid && s.amountPaid > 0 && toCollectionDay(s.paidDate || s.dueDate) === colDay)
      );
      const matchingSchedule = col.loan.schedules.find((s) => toCollectionDay(s.dueDate) === colDay);

      if (!isLinkedToAnySchedule && matchingSchedule && matchingSchedule.status === 'PENDING' && (matchingSchedule.amountPaid || 0) === 0) {
        shouldVoid = true;
        reason = `Orphan collection not linked to any paid EMI schedule (Matching schedule for ${colDay} is currently PENDING/Unpaid)`;
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
