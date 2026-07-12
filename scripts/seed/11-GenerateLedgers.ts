import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * 11-GenerateLedgers.ts
 *
 * Correctly generates LoanSchedules, LoanLedgers, and CustomerLedgers
 * by using outstandingAmount to determine how many EMIs were already paid.
 *
 * Logic:
 *   totalDueAmount  = 18200   (28 dues × 650)
 *   outstandingAmount = 13000 (current balance)
 *   amountPaid = 18200 - 13000 = 5200 → 8 dues paid
 *
 * Schedule:
 *   EMI 1..paidCount  → status: PAID (dueDate = disbursementDate + (i×7) days)
 *   EMI remaining     → status: PENDING (future dates = no overdue!)
 *
 * Run: npx ts-node scripts/seed/11-GenerateLedgers.ts
 */

const TODAY = new Date('2026-07-11T00:00:00.000Z');

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  console.log('[LedgerGenerator] Starting deep analysis...');

  // ─── 1. Fetch all loans ───────────────────────────────────────────────────
  const loans = await prisma.loan.findMany({
    include: { customer: true, package: true },
    orderBy: { loanNumber: 'asc' },
  });
  console.log(`  Loans to process: ${loans.length}`);

  // ─── 2. Fetch ALL collections grouped by loan ────────────────────────────
  const allCollections = await prisma.collection.findMany({
    where: { isVoided: false },
    orderBy: { trnDate: 'asc' },
  });

  // Group collections by loanId
  const colsByLoan = new Map<string, typeof allCollections>();
  for (const col of allCollections) {
    if (!colsByLoan.has(col.loanId)) colsByLoan.set(col.loanId, []);
    colsByLoan.get(col.loanId)!.push(col);
  }

  let scheduleCount = 0;
  let custLedgerCount = 0;
  let loanLedgerCount = 0;
  let overdueLoanCount = 0;

  for (const loan of loans) {
    const startDate = loan.disbursementDate || loan.applicationDate || loan.createdAt;
    const noOfDues = loan.noOfDues > 0 ? loan.noOfDues : 28;
    const perDue   = loan.perDueAmount > 0 ? loan.perDueAmount : 650;
    const totalDue = loan.totalDueAmount || noOfDues * perDue;
    const outstanding = loan.outstandingAmount;

    // How many EMIs have been paid based on outstanding balance
    const amountCollected = Math.max(0, totalDue - outstanding);
    const paidDues = Math.round(amountCollected / perDue);
    const remaining = noOfDues - paidDues;

    // ── A. Generate Schedules ───────────────────────────────────────────────
    const scheduleRows: any[] = [];
    for (let i = 1; i <= noOfDues; i++) {
      let daysToAdd = i * 7;
      if (loan.package?.frequency === 'DAILY') daysToAdd = i * 1;
      else if (loan.package?.frequency === 'MONTHLY') daysToAdd = i * 30;
      
      const isPaid  = i <= paidDues;
      const isLast  = i === noOfDues;

      let dueDate;
      if (isPaid) {
        dueDate = addDays(startDate, daysToAdd);
      } else {
        // Shift remaining dues to start from TODAY to prevent false overdue status on migration
        const pendingIndex = i - paidDues; 
        let pendingDays = pendingIndex * 7;
        if (loan.package?.frequency === 'DAILY') pendingDays = pendingIndex * 1;
        else if (loan.package?.frequency === 'MONTHLY') pendingDays = pendingIndex * 30;
        
        dueDate = addDays(TODAY, pendingDays);
      }

      let emi = perDue;
      if (isLast) {
        // last EMI = totalDue - (perDue × (noOfDues-1)) to absorb rounding
        emi = Math.max(0, totalDue - perDue * (noOfDues - 1));
      }

      scheduleRows.push({
        loanId:     loan.id,
        dueDate,
        emiAmount:  emi,
        amountPaid: isPaid ? emi : 0,
        status:     isPaid ? 'PAID' : 'PENDING',
        paidDate:   isPaid ? dueDate : null, // approximate
      });
    }

    await prisma.loanSchedule.createMany({ data: scheduleRows });
    scheduleCount += scheduleRows.length;

    // Check if this loan has PENDING schedules in the past → Overdue
    const hasOverdue = scheduleRows.some(s => s.status === 'PENDING' && s.dueDate < TODAY);
    if (hasOverdue) overdueLoanCount++;

    // ── B. Customer Ledger — Disbursement ───────────────────────────────────
    const netDisbursed = loan.netDisbursement || loan.amount || 0;
    const custOpen0    = 0;
    await prisma.customerLedger.create({
      data: {
        transactionType: 'Disbursement',
        amount:          netDisbursed,
        openingBalance:  custOpen0,
        closingBalance:  custOpen0 + netDisbursed,
        remarks:         `Loan ${loan.loanNumber} disbursed (Migration)`,
        customerId:      loan.customerId,
        date:            startDate,
      },
    });
    custLedgerCount++;

    // ── C. Loan Ledger — Disbursement (liability created) ───────────────────
    await prisma.loanLedger.create({
      data: {
        transactionType: 'Disbursement',
        amount:          totalDue,
        openingBalance:  0,
        closingBalance:  totalDue,
        remarks:         `Loan ${loan.loanNumber} approved (Migration)`,
        loanId:          loan.id,
        date:            startDate,
      },
    });
    loanLedgerCount++;

    // ── D. Apply Collections → Ledger Entries ───────────────────────────────
    const cols = colsByLoan.get(loan.id) || [];
    let custRunning = custOpen0 + netDisbursed;
    let loanRunning = totalDue;

    for (const col of cols) {
      // Loan Ledger repayment
      const loanPrev = loanRunning;
      loanRunning = Math.max(0, loanRunning - col.amount);
      await prisma.loanLedger.create({
        data: {
          transactionType: 'Repayment',
          amount:          col.amount,
          openingBalance:  loanPrev,
          closingBalance:  loanRunning,
          remarks:         `Collection ${col.trnNumber}`,
          loanId:          loan.id,
          collectionId:    col.id,
          date:            col.trnDate,
        },
      });
      loanLedgerCount++;

      // Customer Ledger repayment
      const custPrev = custRunning;
      custRunning = Math.max(0, custRunning - col.amount);
      await prisma.customerLedger.create({
        data: {
          transactionType: 'Repayment',
          amount:          col.amount,
          openingBalance:  custPrev,
          closingBalance:  custRunning,
          remarks:         `Collection ${col.trnNumber}`,
          customerId:      loan.customerId,
          collectionId:    col.id,
          date:            col.trnDate,
        },
      });
      custLedgerCount++;

      // Link collection to first matching PAID schedule without collectionId
      const matchSchedule = await prisma.loanSchedule.findFirst({
        where: { loanId: loan.id, status: 'PAID', collectionId: null },
        orderBy: { dueDate: 'asc' },
      });
      if (matchSchedule) {
        await prisma.loanSchedule.update({
          where: { id: matchSchedule.id },
          data: {
            paidDate: col.trnDate, collectionId: col.id,
          },
        });
      }
    }
  }

  console.log('\n[LedgerGenerator] ✅ Summary:');
  console.log(`  Loans processed    : ${loans.length}`);
  console.log(`  Schedules generated: ${scheduleCount}`);
  console.log(`  CustomerLedgers    : ${custLedgerCount}`);
  console.log(`  LoanLedgers        : ${loanLedgerCount}`);
  console.log(`  Loans with overdue : ${overdueLoanCount} (has un-collected past dues)`);
  console.log(`  Loans current      : ${loans.length - overdueLoanCount}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
