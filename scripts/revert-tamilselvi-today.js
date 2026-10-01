/**
 * Revert TODAY's (17/09/2026) Collection for:
 *   TAMILSELVI MARIYAPPAN — Loan: SAT-LO241 (TRN013325)
 *
 * What this script does (in a single DB transaction):
 *   1. PRE-CHECK  — show current state
 *   2. DELETE     — CustomerLedger entries linked to this collection
 *   3. DELETE     — LoanLedger entries linked to this collection
 *   4. REVERT     — LoanSchedule today EMI → PENDING (amountPaid=0, paidDate=NULL, collectionId=NULL)
 *   5. DELETE     — Collection record (TRN013325)
 *   6. RECALC     — Loan.outstandingAmount = sum of unpaid EMI amounts
 *   7. AUDIT LOG  — record the manual revert
 *   8. POST-CHECK — verify final state and ledger is empty
 *
 * Usage:
 *   node scripts/revert-tamilselvi-today.js "postgresql://USER:PASSWORD@HOST:5432/DB"
 * OR set DATABASE_URL in .env.production and run:
 *   node scripts/revert-tamilselvi-today.js
 */

const { Client } = require('pg');
require('dotenv').config({ path: '.env.production' });
require('dotenv').config();

const connectionString = process.argv[2] || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('\n[ERROR] Database connection string not provided!');
  console.log('Usage: node scripts/revert-tamilselvi-today.js "postgresql://USER:PASSWORD@HOST:5432/DB"\n');
  process.exit(1);
}

// ── Target ───────────────────────────────────────────────────────────────────
const TARGET_TRN_NUMBER     = 'TRN013325';
const TARGET_LOAN_NUMBER    = 'SAT-LO241';
const TARGET_CUSTOMER_NO    = 'TKA001';
const TARGET_COLLECTION_DAY = '2026-09-17';  // YYYY-MM-DD

async function run() {
  const client = new Client({
    connectionString,
    ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false }
  });

  console.log('\n================================================================');
  console.log('  PONNILAM FIN CORP — REVERT TAMILSELVI TODAY COLLECTION');
  console.log('================================================================');
  console.log(`  Customer  : TAMILSELVI MARIYAPPAN (${TARGET_CUSTOMER_NO})`);
  console.log(`  Loan      : ${TARGET_LOAN_NUMBER}`);
  console.log(`  TRN       : ${TARGET_TRN_NUMBER}`);
  console.log(`  Date      : ${TARGET_COLLECTION_DAY}`);
  console.log('================================================================\n');

  await client.connect();
  console.log('Connected.\n');

  try {
    await client.query('BEGIN');

    // ── 1. PRE-CHECK ──────────────────────────────────────────────────────────
    console.log('--- 1. PRE-CHECK: Current State ---');
    const pre = await client.query(`
      SELECT
        col.id             AS "collectionId",
        col."trnNumber",
        col."collectionDay",
        col.amount         AS "collectedAmount",
        col."isVoided",
        l."loanNumber",
        l."outstandingAmount",
        c."customerNo",
        c.name             AS "customerName",
        COUNT(sch.id) FILTER (WHERE sch.status = 'PAID')    AS "paidSchedules",
        COUNT(sch.id) FILTER (WHERE sch.status = 'PENDING') AS "pendingSchedules"
      FROM "Collection" col
      JOIN "Loan" l           ON l.id = col."loanId"
      JOIN "Customer" c       ON c.id = l."customerId"
      JOIN "LoanSchedule" sch ON sch."loanId" = l.id
      WHERE col."trnNumber" = $1
      GROUP BY col.id, col."trnNumber", col."collectionDay", col.amount, col."isVoided",
               l."loanNumber", l."outstandingAmount", c."customerNo", c.name
    `, [TARGET_TRN_NUMBER]);

    if (pre.rows.length === 0) {
      console.log(`[WARN] Collection ${TARGET_TRN_NUMBER} not found. Nothing to revert.`);
      await client.query('ROLLBACK');
      return;
    }
    console.table(pre.rows);

    const collectionId = pre.rows[0].collectionId;
    console.log(`Collection ID to delete: ${collectionId}`);

    // ── 2. CustomerLedger ─────────────────────────────────────────────────────
    console.log('\n--- 2. CustomerLedger entries ---');
    const cl = await client.query(
      `SELECT id, date, "transactionType", amount, remarks FROM "CustomerLedger" WHERE "collectionId" = $1`,
      [collectionId]
    );
    console.log(`  Found ${cl.rowCount} row(s):`);
    if (cl.rowCount > 0) console.table(cl.rows);

    const delCL = await client.query(
      `DELETE FROM "CustomerLedger" WHERE "collectionId" = $1 RETURNING id`,
      [collectionId]
    );
    console.log(`  Deleted ${delCL.rowCount} CustomerLedger row(s). ✔`);

    // ── 3. LoanLedger ─────────────────────────────────────────────────────────
    console.log('\n--- 3. LoanLedger entries ---');
    const ll = await client.query(
      `SELECT id, date, "transactionType", amount, remarks FROM "LoanLedger" WHERE "collectionId" = $1`,
      [collectionId]
    );
    console.log(`  Found ${ll.rowCount} row(s):`);
    if (ll.rowCount > 0) console.table(ll.rows);

    const delLL = await client.query(
      `DELETE FROM "LoanLedger" WHERE "collectionId" = $1 RETURNING id`,
      [collectionId]
    );
    console.log(`  Deleted ${delLL.rowCount} LoanLedger row(s). ✔`);

    // ── 4. Revert LoanSchedule → PENDING ─────────────────────────────────────
    console.log('\n--- 4. Reverting LoanSchedule to PENDING ---');
    const rev = await client.query(`
      UPDATE "LoanSchedule"
      SET
        status         = 'PENDING',
        "amountPaid"   = 0,
        "paidDate"     = NULL,
        "collectionId" = NULL,
        "updatedAt"    = NOW()
      WHERE "collectionId" = $1
      RETURNING id, "dueDate", "emiAmount"
    `, [collectionId]);
    console.log(`  Reverted ${rev.rowCount} schedule(s). ✔`);
    if (rev.rowCount > 0) console.table(rev.rows);

    // ── 5. Delete Collection ──────────────────────────────────────────────────
    console.log('\n--- 5. Deleting Collection record ---');
    const delCol = await client.query(
      `DELETE FROM "Collection" WHERE id = $1 RETURNING "trnNumber", amount`,
      [collectionId]
    );
    console.log(`  Deleted: ${JSON.stringify(delCol.rows[0])} ✔`);

    // ── 6. Recalculate Outstanding Balance ────────────────────────────────────
    console.log('\n--- 6. Recalculating Loan Outstanding Balance ---');
    await client.query(`
      WITH totals AS (
        SELECT
          s."loanId",
          SUM(
            CASE WHEN s.status != 'PAID'
              THEN (s."emiAmount" - COALESCE(s."amountPaid", 0))
              ELSE 0
            END
          ) AS "newOutstanding"
        FROM "LoanSchedule" s
        WHERE s."loanId" IN (SELECT id FROM "Loan" WHERE "loanNumber" = $1)
        GROUP BY s."loanId"
      )
      UPDATE "Loan" l
      SET
        "outstandingAmount" = t."newOutstanding",
        status              = 'ACTIVE',
        "updatedAt"         = NOW()
      FROM totals t
      WHERE l.id = t."loanId"
    `, [TARGET_LOAN_NUMBER]);
    console.log(`  Outstanding recalculated for ${TARGET_LOAN_NUMBER}. ✔`);

    // ── 7. Audit Log ──────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO "AuditLog" (id, action, entity, "entityId", details, "createdAt")
      VALUES (
        gen_random_uuid(),
        'DELETE',
        'Collection',
        $1,
        $2,
        NOW()
      )
    `, [
      collectionId,
      `Admin revert: Deleted collection ${TARGET_TRN_NUMBER} (${TARGET_COLLECTION_DAY}) for ${TARGET_CUSTOMER_NO} TAMILSELVI MARIYAPPAN, Loan ${TARGET_LOAN_NUMBER}. CustomerLedger & LoanLedger entries deleted. LoanSchedule reverted to PENDING.`
    ]);

    // ── 8. POST-CHECK ─────────────────────────────────────────────────────────
    console.log('\n--- 7. POST-CHECK: Updated State ---');
    const post = await client.query(`
      SELECT
        l."loanNumber",
        c."customerNo",
        c.name                AS "customerName",
        l."outstandingAmount" AS "newOutstanding",
        COUNT(sch.id) FILTER (WHERE sch.status = 'PAID')    AS "paidSchedules",
        COUNT(sch.id) FILTER (WHERE sch.status = 'PENDING') AS "pendingSchedules",
        TO_CHAR(MIN(sch."dueDate") FILTER (WHERE sch.status = 'PENDING'), 'YYYY-MM-DD') AS "nextDueDate"
      FROM "Loan" l
      JOIN "Customer" c        ON c.id = l."customerId"
      JOIN "LoanSchedule" sch  ON sch."loanId" = l.id
      WHERE l."loanNumber" = $1
      GROUP BY l."loanNumber", c."customerNo", c.name, l."outstandingAmount"
    `, [TARGET_LOAN_NUMBER]);
    console.table(post.rows);

    // Verify ledger is clean
    const verifyLedger = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM "CustomerLedger" WHERE "collectionId" = $1) AS "custLedgerRemaining",
        (SELECT COUNT(*) FROM "LoanLedger"     WHERE "collectionId" = $1) AS "loanLedgerRemaining"
    `, [collectionId]);
    console.log('  Ledger verification (both should be 0):');
    console.table(verifyLedger.rows);

    await client.query('COMMIT');

    console.log('\n================================================================');
    console.log('  [SUCCESS] Transaction COMMITTED!');
    console.log('  ✔ Collection TRN013325 deleted');
    console.log('  ✔ CustomerLedger entries deleted');
    console.log('  ✔ LoanLedger entries deleted');
    console.log('  ✔ LoanSchedule reverted to PENDING');
    console.log('  ✔ Loan outstanding balance recalculated');
    console.log('================================================================\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n[ERROR] Transaction ROLLED BACK:', err);
  } finally {
    await client.end();
  }
}

run().catch(console.error);
