/**
 * fix-selvi-loans.js
 *
 * Fixes the SELVI CHIKKARASAMPALAYAM loans issue using PrismaClient:
 * 1. Deletes the mistakenly created 2nd cycle loans:
 *    - SCA001-L2, SCA002-L2, SCA003-L2, SCA004-L2, SCA005-L2
 * 2. Restores the true 1st cycle active loans:
 *    - SAT-L0252, SAT-L0253, SAT-L0254, SAT-L0255, SAT-L0256
 *    - Resets future schedules (Weeks 20 to 28, due 2026-10-19 to 2026-12-14) to PENDING
 *    - Sets outstandingAmount = 5850 (9 remaining dues * 650)
 *    - Sets status = ACTIVE
 *    - Replaces erroneous 'Pre-Close' ledger entries with 'Collection'
 *
 * Usage:
 *   Dry Run (preview) : node scripts/fix-selvi-loans.js
 *   Live Execute      : node scripts/fix-selvi-loans.js --execute
 */

const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.production' });
require('dotenv').config();

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const isExecute = args.includes('--execute');

const FIRST_CYCLE_LOAN_NUMBERS = ['SAT-L0252', 'SAT-L0253', 'SAT-L0254', 'SAT-L0255', 'SAT-L0256'];
const SECOND_CYCLE_LOAN_NUMBERS = ['SCA001-L2', 'SCA002-L2', 'SCA003-L2', 'SCA004-L2', 'SCA005-L2'];
const CUSTOMER_NOS = ['SCA001', 'SCA002', 'SCA003', 'SCA004', 'SCA005'];

async function run() {
  console.log('\n========================================================================');
  console.log('  PONNILAM FIN CORP — FIX SELVI CHIKKARASAMPALAYAM LOANS');
  console.log(`  MODE: ${isExecute ? '⚡ LIVE EXECUTE' : '🔍 DRY RUN (Preview only)'}`);
  console.log('========================================================================\n');

  try {
    // 1. Check L2 loans to delete
    const l2Loans = await prisma.loan.findMany({
      where: { loanNumber: { in: SECOND_CYCLE_LOAN_NUMBERS } },
      select: { id: true, loanNumber: true, amount: true, status: true, outstandingAmount: true }
    });

    console.log(`[1] Found ${l2Loans.length} 2nd cycle loan(s) to remove:`);
    console.table(l2Loans);

    // 2. Check 1st cycle loans to restore
    const firstCycleLoans = await prisma.loan.findMany({
      where: { loanNumber: { in: FIRST_CYCLE_LOAN_NUMBERS } },
      select: { id: true, loanNumber: true, amount: true, status: true, outstandingAmount: true }
    });

    console.log(`\n[2] Found ${firstCycleLoans.length} 1st cycle loan(s) to restore:`);
    console.table(firstCycleLoans);

    const firstCycleIds = firstCycleLoans.map(r => r.id);

    // 3. Check future schedules to reset
    const futureSchedules = await prisma.loanSchedule.findMany({
      where: {
        loanId: { in: firstCycleIds },
        dueDate: { gte: new Date('2026-10-19T00:00:00.000Z') }
      },
      select: { id: true, dueDate: true, status: true, amountPaid: true, loanId: true }
    });

    console.log(`\n[3] Found ${futureSchedules.length} future schedule(s) (Weeks 20-28) to reset to PENDING.`);

    if (isExecute) {
      console.log('\n--- Executing Fixes in Transaction ---');

      await prisma.$transaction(async (tx) => {
        // Delete L2 schedules
        const delSched = await tx.loanSchedule.deleteMany({
          where: { loan: { loanNumber: { in: SECOND_CYCLE_LOAN_NUMBERS } } }
        });
        console.log(`  ✓ Deleted ${delSched.count} schedules from 2nd cycle loans.`);

        // Delete L2 guarantors if any
        const delGuar = await tx.loanGuarantor.deleteMany({
          where: { loan: { loanNumber: { in: SECOND_CYCLE_LOAN_NUMBERS } } }
        });
        if (delGuar.count > 0) console.log(`  ✓ Deleted ${delGuar.count} loan guarantors.`);

        // Delete L2 ledgers if any
        const delLedger = await tx.loanLedger.deleteMany({
          where: { loan: { loanNumber: { in: SECOND_CYCLE_LOAN_NUMBERS } } }
        });
        if (delLedger.count > 0) console.log(`  ✓ Deleted ${delLedger.count} loan ledger entries.`);

        // Delete L2 loans
        const delLoans = await tx.loan.deleteMany({
          where: { loanNumber: { in: SECOND_CYCLE_LOAN_NUMBERS } }
        });
        console.log(`  ✓ Deleted ${delLoans.count} 2nd cycle loans (${SECOND_CYCLE_LOAN_NUMBERS.join(', ')}).`);

        // Reset schedules Weeks 20 to 28 to PENDING
        const resetSched = await tx.loanSchedule.updateMany({
          where: {
            loanId: { in: firstCycleIds },
            dueDate: { gte: new Date('2026-10-19T00:00:00.000Z') }
          },
          data: {
            status: 'PENDING',
            amountPaid: 0,
            paidDate: null,
            collectionId: null
          }
        });
        console.log(`  ✓ Reset ${resetSched.count} future schedules to PENDING.`);

        // Restore Loan outstandingAmount = 5850 and status = ACTIVE
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

        // Fix LoanLedger
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

        // Fix CustomerLedger
        const fixCustLedger = await tx.customerLedger.updateMany({
          where: {
            customer: { customerNo: { in: CUSTOMER_NOS } },
            transactionType: 'Pre-Close'
          },
          data: {
            transactionType: 'Collection'
          }
        });
        console.log(`  ✓ Corrected ${fixCustLedger.count} CustomerLedger entries from 'Pre-Close' to 'Collection'.`);
      });

      console.log('\n🎉 ALL FIXES APPLIED SUCCESSFULLY! SELVI CHIKKARASAMPALAYAM loans are restored to 1st cycle active status.\n');
    } else {
      console.log('\nℹ️  Dry run completed. No changes committed to the database.');
      console.log('To apply these changes live, re-run with:');
      console.log('  node scripts/fix-selvi-loans.js --execute\n');
    }
  } catch (err) {
    console.error('\n❌ Error occurred:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
