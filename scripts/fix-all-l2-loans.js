/**
 * fix-all-l2-loans.js
 *
 * Comprehensive fix for ALL 25 wrongly created L2 loans across 5 centers:
 * 1. TAMILSELVI KARATTUPALAYAM (TKA) - 4 loans
 * 2. KANNIYAMMAL KASIPALAYAM (KKA)   - 6 loans
 * 3. SELVI CHIKKARASAMPALAYAM (SCA) - 5 loans
 * 4. MANJULA IKKARAINEGAMAM (MIK)    - 5 loans
 * 5. BHUVANESWAR KASIPALAYAM (BKA)   - 5 loans
 *
 * What this script does:
 * - DELETES all 25 fake L2 loans and their 28-week schedules (no collections were made on them).
 * - RESTORES all 25 corresponding 1st cycle loans (SAT-L0241..0281):
 *   - Keeps Weeks 1-19 (paid) intact.
 *   - Resets Weeks 20-28 (from 2026-10-18 to Dec 2026) back to PENDING (amountPaid = 0, paidDate = null).
 *   - Sets each loan's outstandingAmount = 5850 (9 remaining dues * 650) and status = ACTIVE.
 *   - Corrects erroneous 'Pre-Close' ledger entries back to 'Collection'.
 *
 * Usage:
 *   Dry Run (preview) : node scripts/fix-all-l2-loans.js
 *   Live Execute      : node scripts/fix-all-l2-loans.js --execute
 */

const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.production' });
require('dotenv').config();

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const isExecute = args.includes('--execute');

const ALL_L2_LOAN_NUMBERS = [
  // TAMILSELVI KARATTUPALAYAM (4)
  'TKA001-L2', 'TKA002-L2', 'TKA003-L2', 'TKA004-L2',
  // KANNIYAMMAL KASIPALAYAM (6)
  'KKA001-L2', 'KKA002-L2', 'KKA003-L2', 'KKA004-L2', 'KKA005-L2', 'KKA006-L2',
  // SELVI CHIKKARASAMPALAYAM (5)
  'SCA001-L2', 'SCA002-L2', 'SCA003-L2', 'SCA004-L2', 'SCA005-L2',
  // MANJULA IKKARAINEGAMAM (5)
  'MIK001-L2', 'MIK002-L2', 'MIK003-L2', 'MIK004-L2', 'MIK005-L2',
  // BHUVANESWAR KASIPALAYAM (5)
  'BKA001-L2', 'BKA002-L2', 'BKA003-L2', 'BKA004-L2', 'BKA005-L2'
];

const ALL_FIRST_CYCLE_LOAN_NUMBERS = [
  // TAMILSELVI KARATTUPALAYAM (4)
  'SAT-L0241', 'SAT-L0242', 'SAT-L0243', 'SAT-L0244',
  // KANNIYAMMAL KASIPALAYAM (6)
  'SAT-L0246', 'SAT-L0247', 'SAT-L0248', 'SAT-L0249', 'SAT-L0250', 'SAT-L0251',
  // SELVI CHIKKARASAMPALAYAM (5)
  'SAT-L0252', 'SAT-L0253', 'SAT-L0254', 'SAT-L0255', 'SAT-L0256',
  // MANJULA IKKARAINEGAMAM (5)
  'SAT-L0257', 'SAT-L0258', 'SAT-L0259', 'SAT-L0260', 'SAT-L0261',
  // BHUVANESWAR KASIPALAYAM (5)
  'SAT-L0277', 'SAT-L0278', 'SAT-L0279', 'SAT-L0280', 'SAT-L0281'
];

const ALL_CUSTOMER_NOS = [
  'TKA001', 'TKA002', 'TKA003', 'TKA004',
  'KKA001', 'KKA002', 'KKA003', 'KKA004', 'KKA005', 'KKA006',
  'SCA001', 'SCA002', 'SCA003', 'SCA004', 'SCA005',
  'MIK001', 'MIK002', 'MIK003', 'MIK004', 'MIK005',
  'BKA001', 'BKA002', 'BKA003', 'BKA004', 'BKA005'
];

async function run() {
  console.log('\n========================================================================');
  console.log('  PONNILAM FIN CORP — FIX ALL 25 L2 LOANS ACROSS 5 CENTERS');
  console.log(`  MODE: ${isExecute ? '⚡ LIVE EXECUTE' : '🔍 DRY RUN (Preview only)'}`);
  console.log('========================================================================\n');

  try {
    // 1. Find all L2 loans
    const l2Loans = await prisma.loan.findMany({
      where: { loanNumber: { in: ALL_L2_LOAN_NUMBERS } },
      select: { id: true, loanNumber: true, amount: true, status: true, outstandingAmount: true, customer: { select: { customerNo: true, name: true } } }
    });

    console.log(`[1] Found ${l2Loans.length} of ${ALL_L2_LOAN_NUMBERS.length} 2nd cycle loan(s) to DELETE:`);
    console.table(l2Loans.map(l => ({
      loanNo: l.loanNumber,
      customer: `${l.customer?.customerNo} - ${l.customer?.name}`,
      status: l.status,
      amt: l.amount
    })));

    // 2. Find all 1st cycle loans
    const firstCycleLoans = await prisma.loan.findMany({
      where: { loanNumber: { in: ALL_FIRST_CYCLE_LOAN_NUMBERS } },
      select: { id: true, loanNumber: true, amount: true, status: true, outstandingAmount: true, customer: { select: { customerNo: true, name: true } } }
    });

    console.log(`\n[2] Found ${firstCycleLoans.length} of ${ALL_FIRST_CYCLE_LOAN_NUMBERS.length} 1st cycle loan(s) to RESTORE:`);
    console.table(firstCycleLoans.map(l => ({
      loanNo: l.loanNumber,
      customer: `${l.customer?.customerNo} - ${l.customer?.name}`,
      currentStatus: l.status,
      currentOutstanding: l.outstandingAmount
    })));

    const firstCycleIds = firstCycleLoans.map(r => r.id);

    // 3. Find schedules to reset (dueDate >= 2026-10-18)
    const futureSchedules = await prisma.loanSchedule.findMany({
      where: {
        loanId: { in: firstCycleIds },
        dueDate: { gte: new Date('2026-10-18T00:00:00.000Z') }
      },
      select: { id: true, dueDate: true, status: true, amountPaid: true, loanId: true }
    });

    const futurePaidCount = futureSchedules.filter(s => s.status === 'PAID').length;
    console.log(`\n[3] Found ${futureSchedules.length} future schedule(s) total (${futurePaidCount} currently falsely marked PAID) to reset to PENDING.`);

    if (isExecute) {
      console.log('\n--- Executing Fixes in Transaction ---');

      await prisma.$transaction(async (tx) => {
        // A. Delete schedules of L2 loans
        const delSched = await tx.loanSchedule.deleteMany({
          where: { loan: { loanNumber: { in: ALL_L2_LOAN_NUMBERS } } }
        });
        console.log(`  ✓ Deleted ${delSched.count} schedules from 2nd cycle loans.`);

        // B. Delete guarantors of L2 loans if any
        const delGuar = await tx.loanGuarantor.deleteMany({
          where: { loan: { loanNumber: { in: ALL_L2_LOAN_NUMBERS } } }
        });
        if (delGuar.count > 0) console.log(`  ✓ Deleted ${delGuar.count} loan guarantors.`);

        // C. Delete ledgers of L2 loans if any
        const delLedger = await tx.loanLedger.deleteMany({
          where: { loan: { loanNumber: { in: ALL_L2_LOAN_NUMBERS } } }
        });
        if (delLedger.count > 0) console.log(`  ✓ Deleted ${delLedger.count} loan ledger entries.`);

        // D. Delete L2 loans
        const delLoans = await tx.loan.deleteMany({
          where: { loanNumber: { in: ALL_L2_LOAN_NUMBERS } }
        });
        console.log(`  ✓ Deleted ${delLoans.count} 2nd cycle loans.`);

        // E. Reset schedules Weeks 20 to 28 to PENDING
        const resetSched = await tx.loanSchedule.updateMany({
          where: {
            loanId: { in: firstCycleIds },
            dueDate: { gte: new Date('2026-10-18T00:00:00.000Z') }
          },
          data: {
            status: 'PENDING',
            amountPaid: 0,
            paidDate: null,
            collectionId: null
          }
        });
        console.log(`  ✓ Reset ${resetSched.count} future schedules back to PENDING.`);

        // F. Restore 1st cycle loans: outstandingAmount = 5850 and status = ACTIVE
        const restoreLoans = await tx.loan.updateMany({
          where: { id: { in: firstCycleIds } },
          data: {
            outstandingAmount: 5850,
            advanceBalance: 0,
            status: 'ACTIVE',
            updatedAt: new Date()
          }
        });
        console.log(`  ✓ Restored ${restoreLoans.count} 1st cycle loans to ACTIVE with outstanding Rs. 5,850.`);

        // G. Fix LoanLedger
        const fixLoanLedger = await tx.loanLedger.updateMany({
          where: {
            loanId: { in: firstCycleIds },
            transactionType: 'Pre-Close'
          },
          data: {
            transactionType: 'Collection',
            closingBalance: 5850
          }
        });
        console.log(`  ✓ Corrected ${fixLoanLedger.count} LoanLedger entries from 'Pre-Close' to 'Collection'.`);

        // H. Fix CustomerLedger
        const fixCustLedger = await tx.customerLedger.updateMany({
          where: {
            customer: { customerNo: { in: ALL_CUSTOMER_NOS } },
            transactionType: 'Pre-Close'
          },
          data: {
            transactionType: 'Collection'
          }
        });
        console.log(`  ✓ Corrected ${fixCustLedger.count} CustomerLedger entries from 'Pre-Close' to 'Collection'.`);
      });

      console.log('\n🎉 ALL 25 L2 LOANS REMOVED & 1ST CYCLE LOANS RESTORED SUCCESSFULLY across all 5 centers!\n');
    } else {
      console.log('\nℹ️  Dry run completed. No changes committed to the database.');
      console.log('To apply these changes live, re-run with:');
      console.log('  node scripts/fix-all-l2-loans.js --execute\n');
    }
  } catch (err) {
    console.error('\n❌ Error occurred:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
