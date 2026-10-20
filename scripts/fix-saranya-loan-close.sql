-- ================================================================
-- FIX: SARANYA V (TKA005) — SAT-LO245
-- Problem : Rs 9100 collected (full outstanding) but loan not CLOSED
--           because future-dated EMI schedules still show PENDING
-- Fix     : Mark all remaining PENDING schedules as PAID using
--           today's collection (TRN013326), set Loan status = CLOSED,
--           outstandingAmount = 0
-- ================================================================

BEGIN;

-- ================================================================
-- STEP 1: PRE-CHECK — See current state
-- ================================================================
SELECT
    l."loanNumber",
    l.status          AS "loanStatus",
    l."outstandingAmount",
    l."advanceBalance",
    c."customerNo",
    c.name            AS "customerName",
    COUNT(sch.id) FILTER (WHERE sch.status = 'PAID')    AS "paidEMIs",
    COUNT(sch.id) FILTER (WHERE sch.status = 'PENDING') AS "pendingEMIs",
    COUNT(sch.id) FILTER (WHERE sch.status = 'PARTIAL') AS "partialEMIs",
    COUNT(sch.id)                                        AS "totalEMIs"
FROM "Loan" l
JOIN "Customer" c       ON c.id = l."customerId"
JOIN "LoanSchedule" sch ON sch."loanId" = l.id
WHERE l."loanNumber" = 'SAT-LO245'
GROUP BY l."loanNumber", l.status, l."outstandingAmount", l."advanceBalance", c."customerNo", c.name;

-- Show all schedules:
SELECT
    sch.id,
    TO_CHAR(sch."dueDate", 'YYYY-MM-DD') AS "dueDate",
    sch."emiAmount",
    sch."amountPaid",
    sch.status,
    sch."collectionId"
FROM "LoanSchedule" sch
WHERE sch."loanId" = (SELECT id FROM "Loan" WHERE "loanNumber" = 'SAT-LO245')
ORDER BY sch."dueDate";

-- Show today's collection for this loan:
SELECT id, "trnNumber", amount, "collectionDay", "isVoided"
FROM "Collection"
WHERE "loanId" = (SELECT id FROM "Loan" WHERE "loanNumber" = 'SAT-LO245')
  AND "isVoided" = false
ORDER BY "trnDate" DESC
LIMIT 5;

-- ================================================================
-- STEP 2: Mark ALL remaining PENDING/PARTIAL schedules as PAID
--         Link them to today's collection (TRN013326)
-- ================================================================
UPDATE "LoanSchedule"
SET
    status         = 'PAID',
    "amountPaid"   = "emiAmount",
    "paidDate"     = (
        SELECT "trnDate" FROM "Collection"
        WHERE "trnNumber" = 'TRN013326'
    ),
    "collectionId" = (
        SELECT id FROM "Collection"
        WHERE "trnNumber" = 'TRN013326'
    ),
    "updatedAt"    = NOW()
WHERE "loanId" = (SELECT id FROM "Loan" WHERE "loanNumber" = 'SAT-LO245')
  AND status IN ('PENDING', 'PARTIAL')
RETURNING id, TO_CHAR("dueDate", 'YYYY-MM-DD') AS "dueDate", "emiAmount", status;

-- ================================================================
-- STEP 3: Close the Loan — outstandingAmount = 0, status = CLOSED
-- ================================================================
UPDATE "Loan"
SET
    "outstandingAmount" = 0,
    "advanceBalance"    = 0,
    status              = 'CLOSED',
    "updatedAt"         = NOW()
WHERE "loanNumber" = 'SAT-LO245'
RETURNING "loanNumber", status, "outstandingAmount";

-- ================================================================
-- STEP 4: Fix LoanLedger closing balance for today's collection
--         (closingBalance should be 0 since loan is now fully paid)
-- ================================================================
UPDATE "LoanLedger"
SET
    "closingBalance" = 0,
    "updatedAt"      = NOW()
WHERE "collectionId" = (
    SELECT id FROM "Collection" WHERE "trnNumber" = 'TRN013326'
)
RETURNING id, "transactionType", amount, "openingBalance", "closingBalance";

-- ================================================================
-- STEP 5: Audit Log
-- ================================================================
INSERT INTO "AuditLog" (id, action, entity, "entityId", details, "createdAt")
VALUES (
    gen_random_uuid(),
    'UPDATE',
    'Loan',
    (SELECT id FROM "Loan" WHERE "loanNumber" = 'SAT-LO245'),
    'Admin fix: SARANYA V (TKA005) SAT-LO245 — Rs 9100 was collected via TRN013326 but loan was not closed. Marked all remaining PENDING schedules as PAID, set Loan status=CLOSED, outstandingAmount=0.',
    NOW()
);

-- ================================================================
-- STEP 6: POST-CHECK — Verify everything is correct
-- ================================================================
SELECT
    l."loanNumber",
    l.status          AS "loanStatus",
    l."outstandingAmount",
    c."customerNo",
    c.name            AS "customerName",
    COUNT(sch.id) FILTER (WHERE sch.status = 'PAID')    AS "paidEMIs",
    COUNT(sch.id) FILTER (WHERE sch.status = 'PENDING') AS "pendingEMIs",
    COUNT(sch.id)                                        AS "totalEMIs"
FROM "Loan" l
JOIN "Customer" c       ON c.id = l."customerId"
JOIN "LoanSchedule" sch ON sch."loanId" = l.id
WHERE l."loanNumber" = 'SAT-LO245'
GROUP BY l."loanNumber", l.status, l."outstandingAmount", c."customerNo", c.name;

-- pendingEMIs = 0, loanStatus = CLOSED, outstandingAmount = 0 ← expected!

-- ================================================================
-- Looks correct? COMMIT. Something wrong? ROLLBACK.
-- ================================================================
COMMIT;
-- ROLLBACK;
