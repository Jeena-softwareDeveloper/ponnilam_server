/**
 * Revert EMI 5 (16/09/2026) and EMI 6 (23/09/2026) for Center:
 * KAYALVIZHI THIMMAYANPUDHUR (SAT055 / KTH)
 *
 * Usage:
 *   node scripts/revert-kayalvizhi.js "postgresql://user:password@host:5432/dbname"
 * OR:
 *   $env:DATABASE_URL="postgresql://user:password@host:5432/dbname"
 *   node scripts/revert-kayalvizhi.js
 */

const { Client } = require('pg');
require('dotenv').config({ path: '.env.production' });
require('dotenv').config();

const connectionString = process.argv[2] || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('\n[ERROR] Database connection string not provided!');
  console.log('Please run with connection string:');
  console.log('  node scripts/revert-kayalvizhi.js "postgresql://USER:PASSWORD@HOST:5432/DB_NAME"\n');
  process.exit(1);
}

async function run() {
  const client = new Client({
    connectionString,
    ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false }
  });

  console.log('\n=============================================================');
  console.log('  PONNILAM FIN CORP — REVERTING KAYALVIZHI CENTER TODAY EMI');
  console.log('=============================================================');
  console.log('Connecting to database...');

  await client.connect();
  console.log('Connected successfully.\n');

  try {
    await client.query('BEGIN');

    // 1. PRE-CHECK
    console.log('--- 1. CURRENT STATE BEFORE REVERT ---');
    const preCheck = await client.query(`
      SELECT 
          l."loanNumber",
          c."customerNo",
          c.name AS "customerName",
          ctr.name AS "centerName",
          l."outstandingAmount" AS "currentOutstanding",
          COUNT(s.id) FILTER (WHERE s.status = 'PAID') AS "paidCount",
          COUNT(s.id) FILTER (WHERE s.status = 'PENDING') AS "pendingCount"
      FROM "Loan" l
      JOIN "Customer" c ON l."customerId" = c.id
      JOIN "Center" ctr ON c."centerId" = ctr.id
      JOIN "LoanSchedule" s ON s."loanId" = l.id
      WHERE ctr.name ILIKE '%KAYALVIZHI THIMMAYANPUDHUR%'
         OR ctr.code = 'SAT055'
         OR ctr."shortCode" = 'KTH'
      GROUP BY l."loanNumber", c."customerNo", c.name, ctr.name, l."outstandingAmount"
      ORDER BY l."loanNumber";
    `);

    if (preCheck.rows.length === 0) {
      console.log('No loans found for Center KAYALVIZHI THIMMAYANPUDHUR!');
      await client.query('ROLLBACK');
      return;
    }

    console.table(preCheck.rows);

    // 2. VOID ANY COLLECTIONS ON OR AFTER 2026-09-16
    console.log('\n--- 2. VOIDING ANY COLLECTIONS RECORDED ON OR AFTER 2026-09-16 ---');
    const voidRes = await client.query(`
      UPDATE "Collection" col
      SET "isVoided" = true,
          "voidedAt" = NOW(),
          "voidReason" = 'Reverted by Admin: Today EMI marked prematurely for Kayalvizhi center'
      WHERE col."isVoided" = false
        AND col."loanId" IN (
            SELECT l.id
            FROM "Loan" l
            JOIN "Customer" c ON l."customerId" = c.id
            JOIN "Center" ctr ON c."centerId" = ctr.id
            WHERE ctr.name ILIKE '%KAYALVIZHI THIMMAYANPUDHUR%'
               OR ctr.code = 'SAT055'
               OR ctr."shortCode" = 'KTH'
        )
        AND (col."trnDate" >= '2026-09-16 00:00:00' OR col."collectionDay" >= '2026-09-16')
      RETURNING id, "trnNumber", "amount";
    `);
    console.log(`Voided collections: ${voidRes.rowCount}`);
    if (voidRes.rowCount > 0) console.table(voidRes.rows);

    // 3. REVERT SCHEDULES WITH DUE DATE >= 2026-09-16 BACK TO PENDING
    console.log('\n--- 3. REVERTING SCHEDULES DUE >= 2026-09-16 TO PENDING ---');
    const schRes = await client.query(`
      UPDATE "LoanSchedule" sch
      SET status = 'PENDING',
          "amountPaid" = 0,
          "paidDate" = NULL,
          "collectionId" = NULL,
          "updatedAt" = NOW()
      WHERE sch."loanId" IN (
            SELECT l.id
            FROM "Loan" l
            JOIN "Customer" c ON l."customerId" = c.id
            JOIN "Center" ctr ON c."centerId" = ctr.id
            WHERE ctr.name ILIKE '%KAYALVIZHI THIMMAYANPUDHUR%'
               OR ctr.code = 'SAT055'
               OR ctr."shortCode" = 'KTH'
        )
        AND sch."dueDate" >= '2026-09-16 00:00:00'
        AND sch.status = 'PAID'
      RETURNING id, "dueDate", "emiAmount";
    `);
    console.log(`Reverted schedules: ${schRes.rowCount}`);

    // 4. RECALCULATE & UPDATE OUTSTANDING BALANCE
    console.log('\n--- 4. RECALCULATING OUTSTANDING BALANCES ---');
    await client.query(`
      WITH LoanTotals AS (
          SELECT 
              s."loanId",
              SUM(CASE WHEN s.status != 'PAID' THEN (s."emiAmount" - COALESCE(s."amountPaid", 0)) ELSE 0 END) AS "newOutstanding"
          FROM "LoanSchedule" s
          WHERE s."loanId" IN (
              SELECT l.id
              FROM "Loan" l
              JOIN "Customer" c ON l."customerId" = c.id
              JOIN "Center" ctr ON c."centerId" = ctr.id
              WHERE ctr.name ILIKE '%KAYALVIZHI THIMMAYANPUDHUR%'
                 OR ctr.code = 'SAT055'
                 OR ctr."shortCode" = 'KTH'
          )
          GROUP BY s."loanId"
      )
      UPDATE "Loan" l
      SET "outstandingAmount" = lt."newOutstanding",
          "advanceBalance" = 0,
          status = 'ACTIVE',
          "updatedAt" = NOW()
      FROM LoanTotals lt
      WHERE l.id = lt."loanId";
    `);

    // 5. AUDIT LOG
    await client.query(`
      INSERT INTO "AuditLog" (id, action, entity, "entityId", details, "createdAt")
      SELECT 
          gen_random_uuid(),
          'UPDATE',
          'LoanSchedule',
          l.id,
          'Reverted EMI 5 (16/09/2026) and EMI 6 (23/09/2026) back to PENDING for Center KAYALVIZHI THIMMAYANPUDHUR',
          NOW()
      FROM "Loan" l
      JOIN "Customer" c ON l."customerId" = c.id
      JOIN "Center" ctr ON c."centerId" = ctr.id
      WHERE ctr.name ILIKE '%KAYALVIZHI THIMMAYANPUDHUR%'
         OR ctr.code = 'SAT055'
         OR ctr."shortCode" = 'KTH';
    `);

    // 6. POST-CHECK
    console.log('\n--- 5. UPDATED STATE AFTER REVERT ---');
    const postCheck = await client.query(`
      SELECT 
          l."loanNumber",
          c."customerNo",
          c.name AS "customerName",
          l."outstandingAmount" AS "newOutstanding",
          COUNT(s.id) FILTER (WHERE s.status = 'PAID') AS "paidCount",
          COUNT(s.id) FILTER (WHERE s.status = 'PENDING') AS "pendingCount",
          TO_CHAR(MIN(s."dueDate") FILTER (WHERE s.status = 'PENDING'), 'YYYY-MM-DD') AS "nextDueDate"
      FROM "Loan" l
      JOIN "Customer" c ON l."customerId" = c.id
      JOIN "Center" ctr ON c."centerId" = ctr.id
      JOIN "LoanSchedule" s ON s."loanId" = l.id
      WHERE ctr.name ILIKE '%KAYALVIZHI THIMMAYANPUDHUR%'
         OR ctr.code = 'SAT055'
         OR ctr."shortCode" = 'KTH'
      GROUP BY l."loanNumber", c."customerNo", c.name, l."outstandingAmount"
      ORDER BY l."loanNumber";
    `);
    console.table(postCheck.rows);

    await client.query('COMMIT');
    console.log('\n[SUCCESS] Transaction COMMITTED successfully! All 6 loans have been reverted to 4 paid EMIs.\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n[ERROR] Transaction ROLLED BACK due to error:', err);
  } finally {
    await client.end();
  }
}

run().catch(console.error);
