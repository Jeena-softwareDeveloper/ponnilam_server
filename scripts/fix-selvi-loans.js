/**
 * fix-selvi-loans.js
 *
 * Fixes the SELVI CHIKKARASAMPALAYAM loans issue:
 * 1. Deletes the mistakenly created 2nd cycle loans:
 *    - SCA001-L2, SCA002-L2, SCA003-L2, SCA004-L2, SCA005-L2
 * 2. Restores the true 1st cycle active loans:
 *    - SAT-L0252, SAT-L0253, SAT-L0254, SAT-L0255, SAT-L0256
 *    - Resets future schedules (Weeks 20 to 28, due 2026-10-19 to 2026-12-14) to PENDING
 *    - Sets outstandingAmount = 5850 (9 dues * 650)
 *    - Sets status = ACTIVE
 *    - Replaces erroneous 'Pre-Close' ledger entries with 'Collection'
 *
 * Usage:
 *   node scripts/fix-selvi-loans.js [POSTGRES_URL] [--execute]
 *
 * If run without --execute, it performs a DRY-RUN and displays what will change.
 */

const { Client } = require('pg');
require('dotenv').config({ path: '.env.production' });
require('dotenv').config();

const args = process.argv.slice(2);
const isExecute = args.includes('--execute');
const connectionString = args.find(a => a.startsWith('postgres')) || process.env.DATABASE_URL;

if (!connectionString || connectionString.includes('sqlite') || connectionString.includes('file:') || connectionString.includes('USER:PASSWORD@HOST')) {
  console.log('\n========================================================================');
  console.log('  PONNILAM FIN CORP — FIX SELVI CHIKKARASAMPALAYAM LOANS');
  console.log('========================================================================');
  console.log('\n❌ PostgreSQL connection string required!');
  console.log('Usage:');
  console.log('  Dry Run : node scripts/fix-selvi-loans.js "postgresql://user:password@host:5432/dbname"');
  console.log('  Execute : node scripts/fix-selvi-loans.js "postgresql://user:password@host:5432/dbname" --execute');
  console.log('\nOr run the SQL script directly in pgAdmin / DBeaver / psql:');
  console.log('  scripts/fix-selvi-loans.sql\n');
  process.exit(1);
}

const FIRST_CYCLE_LOAN_NUMBERS = ['SAT-L0252', 'SAT-L0253', 'SAT-L0254', 'SAT-L0255', 'SAT-L0256'];
const SECOND_CYCLE_LOAN_NUMBERS = ['SCA001-L2', 'SCA002-L2', 'SCA003-L2', 'SCA004-L2', 'SCA005-L2'];

async function run() {
  const client = new Client({
    connectionString,
    ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false }
  });

  console.log('\n========================================================================');
  console.log('  PONNILAM FIN CORP — FIX SELVI CHIKKARASAMPALAYAM LOANS');
  console.log(`  MODE: ${isExecute ? '⚡ LIVE EXECUTE' : '🔍 DRY RUN (Preview only)'}`);
  console.log('========================================================================\n');

  await client.connect();
  console.log('Connected to PostgreSQL database.\n');

  try {
    await client.query('BEGIN');

    // 1. Check L2 loans to delete
    const l2Check = await client.query(`
      SELECT id, "loanNumber", amount, status, "outstandingAmount"
      FROM public."Loan"
      WHERE "loanNumber" = ANY($1)
    `, [SECOND_CYCLE_LOAN_NUMBERS]);

    console.log(`[1] Found ${l2Check.rows.length} 2nd cycle loan(s) to remove:`);
    console.table(l2Check.rows);

    // 2. Check 1st cycle loans to restore
    const firstCycleCheck = await client.query(`
      SELECT id, "loanNumber", amount, status, "outstandingAmount"
      FROM public."Loan"
      WHERE "loanNumber" = ANY($1)
    `, [FIRST_CYCLE_LOAN_NUMBERS]);

    console.log(`\n[2] Found ${firstCycleCheck.rows.length} 1st cycle loan(s) to restore:`);
    console.table(firstCycleCheck.rows);

    const firstCycleIds = firstCycleCheck.rows.map(r => r.id);

    // 3. Count future schedules that will be reset to PENDING
    const schedCheck = await client.query(`
      SELECT "loanId", COUNT(*) as count
      FROM public."LoanSchedule"
      WHERE "loanId" = ANY($1)
        AND "dueDate" >= '2026-10-19 00:00:00'
      GROUP BY "loanId"
    `, [firstCycleIds]);

    console.log('\n[3] Future schedules (Weeks 20-28) to reset to PENDING:');
    console.table(schedCheck.rows);

    if (isExecute) {
      console.log('\n--- Executing Fixes ---');

      // Delete L2 schedules
      const delSched = await client.query(`
        DELETE FROM public."LoanSchedule"
        WHERE "loanId" IN (
          SELECT id FROM public."Loan" WHERE "loanNumber" = ANY($1)
        )
      `, [SECOND_CYCLE_LOAN_NUMBERS]);
      console.log(`Deleted ${delSched.rowCount} schedules from 2nd cycle loans.`);

      // Delete L2 loans
      const delLoans = await client.query(`
        DELETE FROM public."Loan"
        WHERE "loanNumber" = ANY($1)
      `, [SECOND_CYCLE_LOAN_NUMBERS]);
      console.log(`Deleted ${delLoans.rowCount} 2nd cycle loans.`);

      // Restore schedules Weeks 20 to 28 to PENDING
      const resetSched = await client.query(`
        UPDATE public."LoanSchedule"
        SET 
          status = 'PENDING',
          "amountPaid" = 0,
          "paidDate" = NULL,
          "collectionId" = NULL
        WHERE "loanId" = ANY($1)
          AND "dueDate" >= '2026-10-19 00:00:00'
      `, [firstCycleIds]);
      console.log(`Reset ${resetSched.rowCount} future schedules to PENDING.`);

      // Restore Loan outstandingAmount = 5850 and status = ACTIVE
      const restoreLoans = await client.query(`
        UPDATE public."Loan"
        SET 
          "outstandingAmount" = 5850,
          "advanceBalance" = 0,
          status = 'ACTIVE',
          "updatedAt" = NOW()
        WHERE id = ANY($1)
      `, [firstCycleIds]);
      console.log(`Restored ${restoreLoans.rowCount} 1st cycle loans to ACTIVE with outstanding Rs. 5,850.`);

      // Fix LoanLedger
      const fixLoanLedger = await client.query(`
        UPDATE public."LoanLedger"
        SET 
          "transactionType" = 'Collection',
          "closingBalance" = 5850
        WHERE "loanId" = ANY($1)
          AND "transactionType" = 'Pre-Close'
      `, [firstCycleIds]);
      console.log(`Corrected ${fixLoanLedger.rowCount} LoanLedger entries.`);

      // Fix CustomerLedger
      const fixCustLedger = await client.query(`
        UPDATE public."CustomerLedger"
        SET "transactionType" = 'Collection'
        WHERE "collectionId" IN (
          SELECT id FROM public."Collection" WHERE "loanId" = ANY($1) AND "trnDate" >= '2026-10-11'
        )
        AND "transactionType" = 'Pre-Close'
      `, [firstCycleIds]);
      console.log(`Corrected ${fixCustLedger.rowCount} CustomerLedger entries.`);

      await client.query('COMMIT');
      console.log('\n🎉 ALL FIXES APPLIED SUCCESSFULLY! SELVI CHIKKARASAMPALAYAM loans are restored to 1st cycle active status.\n');
    } else {
      await client.query('ROLLBACK');
      console.log('\nℹ️  Dry run completed. No changes committed to the database.');
      console.log('To apply these changes, re-run with --execute\n');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error occurred. Transaction rolled back:', err);
  } finally {
    await client.end();
  }
}

run();
