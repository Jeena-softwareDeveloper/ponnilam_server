/**
 * fix-preclose-stuck-loans.ts
 *
 * Repairs loans that got stuck in ACTIVE state after a full pre-close payment
 * was recorded via Record Collection. The bug caused future-dated schedules to
 * remain PENDING even though the full outstanding was collected. This script:
 *   1. Finds ACTIVE/APPROVED loans where all unpaid schedule amounts are
 *      covered by the advance balance (i.e. effectively fully paid).
 *   2. Marks all remaining PENDING/PARTIAL schedules as PAID.
 *   3. Sets outstandingAmount = 0, advanceBalance = 0, status = CLOSED.
 *   4. Writes corrective LoanLedger and CustomerLedger entries so balances
 *      reconcile to zero.
 */
import 'dotenv/config';
import prisma from '../src/utils/prisma';

async function fixPreCloseStuckLoans() {
  console.log('=== fix-preclose-stuck-loans ===');

  const loans = await prisma.loan.findMany({
    where: { status: { in: ['ACTIVE', 'APPROVED'] } },
    include: {
      schedules: true,
      collections: { where: { isVoided: false }, orderBy: { trnDate: 'asc' } },
    },
  });

  console.log(`Inspecting ${loans.length} active/approved loan(s)...`);

  let fixedCount = 0;

  for (const loan of loans) {
    const unpaidSchedules = loan.schedules.filter(
      (s) => s.status === 'PENDING' || s.status === 'PARTIAL'
    );
    const unpaidSum = unpaidSchedules.reduce(
      (sum, s) => sum + (s.emiAmount - (s.amountPaid || 0)),
      0
    );

    const advanceBalance = loan.advanceBalance || 0;

    // A loan is stuck-pre-close if:
    //   - There are still "unpaid" schedules, BUT
    //   - The advance balance already covers all of them (pool was paid but
    //     future schedules were never marked PAID due to the date-gate bug).
    const isStuck =
      unpaidSum > 0 && advanceBalance >= unpaidSum - 0.01;

    // OR all schedules are PAID but loan is still ACTIVE (outstanding wasn't zeroed)
    const allSchedulesPaid =
      loan.schedules.length > 0 &&
      loan.schedules.every((s) => s.status === 'PAID') &&
      loan.outstandingAmount > 0;

    if (!isStuck && !allSchedulesPaid) continue;

    console.log(`\n🔧 Fixing loan: ${loan.loanNumber}`);
    console.log(
      `   Status: ${loan.status} | Outstanding: ${loan.outstandingAmount} | Advance: ${advanceBalance} | Unpaid sum: ${unpaidSum}`
    );

    await prisma.$transaction(async (tx) => {
      // Mark all remaining PENDING/PARTIAL schedules as PAID
      if (unpaidSchedules.length > 0) {
        for (const sch of unpaidSchedules) {
          await tx.loanSchedule.update({
            where: { id: sch.id },
            data: {
              status: 'PAID',
              amountPaid: sch.emiAmount,
              paidDate: loan.collections[loan.collections.length - 1]?.trnDate ?? new Date(),
            },
          });
        }
        console.log(`   Marked ${unpaidSchedules.length} schedule(s) as PAID.`);
      }

      // Zero out outstanding, advance balance, and close loan
      await tx.loan.update({
        where: { id: loan.id },
        data: {
          outstandingAmount: 0,
          advanceBalance: 0,
          status: 'CLOSED',
        },
      });

      // Write corrective loan ledger entry if outstanding was non-zero
      if (loan.outstandingAmount > 0) {
        const lastLoanLedger = await tx.loanLedger.findFirst({
          where: { loanId: loan.id },
          orderBy: { createdAt: 'desc' },
        });
        await tx.loanLedger.create({
          data: {
            transactionType: 'Pre-Close Correction',
            amount: 0,
            openingBalance: lastLoanLedger?.closingBalance ?? loan.outstandingAmount,
            closingBalance: 0,
            remarks: `Corrective entry: loan was stuck ACTIVE after pre-close payment. Outstanding corrected from ${loan.outstandingAmount} to 0.`,
            loanId: loan.id,
            date: new Date(),
          },
        });
      }

      // Write corrective customer ledger entry if needed
      const lastCustLedger = await tx.customerLedger.findFirst({
        where: { customerId: loan.customerId },
        orderBy: { createdAt: 'desc' },
      });
      if (lastCustLedger && lastCustLedger.closingBalance > 0) {
        await tx.customerLedger.create({
          data: {
            transactionType: 'Pre-Close Correction',
            amount: 0,
            openingBalance: lastCustLedger.closingBalance,
            closingBalance: 0,
            remarks: `Corrective entry: loan ${loan.loanNumber} closed via pre-close. Balance corrected to 0.`,
            customerId: loan.customerId,
            date: new Date(),
          },
        });
      }
    });

    console.log(`   ✅ ${loan.loanNumber} → CLOSED.`);
    fixedCount++;
  }

  console.log(`\n=== Done! Fixed ${fixedCount} stuck loan(s). ===`);
  await prisma.$disconnect();
}

fixPreCloseStuckLoans().catch((err) => {
  console.error('Error:', err);
  prisma.$disconnect();
  process.exit(1);
});
