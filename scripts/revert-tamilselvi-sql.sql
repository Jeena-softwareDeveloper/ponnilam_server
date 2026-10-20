-- ================================================================
-- PONNILAM FIN CORP — REVERT TAMILSELVI TODAY COLLECTION
-- Customer  : TAMILSELVI MARIYAPPAN (TKA001)
-- Loan      : SAT-LO241
-- TRN       : TRN013325
-- Date      : 17/09/2026
--
-- Run order: Step 1 → 2 → 3 → 4 → 5 → 6 → COMMIT
-- If anything looks wrong: ROLLBACK;
-- ================================================================

BEGIN;

-- ================================================================
-- STEP 1: PRE-CHECK — Current state before changes
-- ================================================================
SELECT
    col.id             AS "collectionId",
    col."trnNumber",
    col."collectionDay",
    col.amount         AS "collectedAmount",
    col."isVoided",
    l."loanNumber",
    l."outstandingAmount",
    c."customerNo",
    c.name             AS "customerName"
FROM "Collection" col
JOIN "Loan" l      ON l.id = col."loanId"
JOIN "Customer" c  ON c.id = l."customerId"
WHERE col."trnNumber" = 'TRN013325';

-- ================================================================
-- STEP 2: Check & Delete CustomerLedger entries
-- ================================================================

-- First check what exists:
SELECT id, date, "transactionType", amount, remarks
FROM "CustomerLedger"
WHERE "collectionId" = (
    SELECT id FROM "Collection" WHERE "trnNumber" = 'TRN013325'
);

-- Delete:
DELETE FROM "CustomerLedger"
WHERE "collectionId" = (
    SELECT id FROM "Collection" WHERE "trnNumber" = 'TRN013325'
)
RETURNING id, "transactionType", amount;

-- ================================================================
-- STEP 3: Check & Delete LoanLedger entries
-- ================================================================

-- First check what exists:
SELECT id, date, "transactionType", amount, remarks
FROM "LoanLedger"
WHERE "collectionId" = (
    SELECT id FROM "Collection" WHERE "trnNumber" = 'TRN013325'
);

-- Delete:
DELETE FROM "LoanLedger"
WHERE "collectionId" = (
    SELECT id FROM "Collection" WHERE "trnNumber" = 'TRN013325'
)
RETURNING id, "transactionType", amount;

-- ================================================================
-- STEP 4: Revert LoanSchedule → PENDING
-- ================================================================

UPDATE "LoanSchedule"
SET
    status         = 'PENDING',
    "amountPaid"   = 0,
    "paidDate"     = NULL,
    "collectionId" = NULL,
    "updatedAt"    = NOW()
WHERE "collectionId" = (
    SELECT id FROM "Collection" WHERE "trnNumber" = 'TRN013325'
)
RETURNING id, "dueDate", "emiAmount", status;

-- ================================================================
-- STEP 5: Delete the Collection record
-- ================================================================

DELETE FROM "Collection"
WHERE "trnNumber" = 'TRN013325'
RETURNING id, "trnNumber", amount, "collectionDay";

-- ================================================================
-- STEP 6: Recalculate Loan outstanding balance
-- ================================================================

WITH totals AS (
    SELECT
        s."loanId",
        SUM(
            CASE
                WHEN s.status != 'PAID'
                THEN (s."emiAmount" - COALESCE(s."amountPaid", 0))
                ELSE 0
            END
        ) AS "newOutstanding"
    FROM "LoanSchedule" s
    WHERE s."loanId" = (SELECT id FROM "Loan" WHERE "loanNumber" = 'SAT-LO241')
    GROUP BY s."loanId"
)
UPDATE "Loan" l
SET
    "outstandingAmount" = t."newOutstanding",
    status              = 'ACTIVE',
    "updatedAt"         = NOW()
FROM totals t
WHERE l.id = t."loanId"
RETURNING l."loanNumber", l."outstandingAmount" AS "updatedOutstanding";

-- ================================================================
-- STEP 7: Audit Log
-- ================================================================

INSERT INTO "AuditLog" (id, action, entity, "entityId", details, "createdAt")
VALUES (
    gen_random_uuid(),
    'DELETE',
    'Collection',
    'TRN013325',
    'Admin revert: Deleted collection TRN013325 (17/09/2026) for TKA001 TAMILSELVI MARIYAPPAN, Loan SAT-LO241. CustomerLedger & LoanLedger entries deleted. LoanSchedule reverted to PENDING.',
    NOW()
);

-- ================================================================
-- STEP 8: POST-CHECK — Verify everything is clean
-- ================================================================

-- Loan & Schedule status:
SELECT
    l."loanNumber",
    c."customerNo",
    c.name                AS "customerName",
    l."outstandingAmount" AS "newOutstanding",
    COUNT(sch.id) FILTER (WHERE sch.status = 'PAID')    AS "paidSchedules",
    COUNT(sch.id) FILTER (WHERE sch.status = 'PENDING') AS "pendingSchedules",
    TO_CHAR(
        MIN(sch."dueDate") FILTER (WHERE sch.status = 'PENDING'),
        'YYYY-MM-DD'
    ) AS "nextDueDate"
FROM "Loan" l
JOIN "Customer" c       ON c.id = l."customerId"
JOIN "LoanSchedule" sch ON sch."loanId" = l.id
WHERE l."loanNumber" = 'SAT-LO241'
GROUP BY l."loanNumber", c."customerNo", c.name, l."outstandingAmount";

-- Confirm collection is gone (should return 0 rows):
SELECT * FROM "Collection" WHERE "trnNumber" = 'TRN013325';

-- Confirm ledger is clean (both should return 0):
SELECT
    (SELECT COUNT(*) FROM "CustomerLedger"
     WHERE remarks ILIKE '%TRN013325%') AS "custLedgerByRemarks",
    (SELECT COUNT(*) FROM "LoanLedger"
     WHERE remarks ILIKE '%TRN013325%') AS "loanLedgerByRemarks";

-- ================================================================
-- Everything looks good? → COMMIT
-- Something wrong?      → ROLLBACK
-- ================================================================

COMMIT;
-- ROLLBACK;
