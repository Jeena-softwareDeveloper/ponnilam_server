-- ============================================================
-- fix-preclose-ant-l023.sql
-- Repairs loan ANT-L023 (SANTHI MURGAN) which got stuck in
-- ACTIVE state after a pre-close payment was entered via
-- Record Collection. The bug caused future-dated schedules
-- to remain PENDING even though the full outstanding was paid.
--
-- WHAT THIS DOES:
--  1. Mark all remaining PENDING/PARTIAL schedules as PAID
--  2. Set loan outstanding=0, advanceBalance=0, status=CLOSED
--  3. Write corrective LoanLedger entry (closingBalance=0)
--  4. Write corrective CustomerLedger entry (closingBalance=0)
--
-- Run this on the production PostgreSQL database.
-- ============================================================

BEGIN;

-- Step 1: Get the loan ID for ANT-L023
-- (Replace the WHERE below if loanNumber differs)
DO $$
DECLARE
  v_loan_id TEXT;
  v_customer_id TEXT;
  v_outstanding NUMERIC;
  v_advance NUMERIC;
  v_last_loan_ledger_balance NUMERIC;
  v_last_cust_ledger_balance NUMERIC;
  v_last_collection_date TIMESTAMP;
BEGIN
  SELECT id, "customerId", "outstandingAmount", "advanceBalance"
    INTO v_loan_id, v_customer_id, v_outstanding, v_advance
    FROM "Loan"
   WHERE "loanNumber" = 'ANT-L023'
     AND status IN ('ACTIVE', 'APPROVED')
  LIMIT 1;

  IF v_loan_id IS NULL THEN
    RAISE NOTICE 'Loan ANT-L023 not found or already closed. Nothing to fix.';
    RETURN;
  END IF;

  RAISE NOTICE 'Found loan % (id: %), outstanding: %, advance: %', 'ANT-L023', v_loan_id, v_outstanding, v_advance;

  -- Get date of the last active collection
  SELECT MAX("trnDate") INTO v_last_collection_date
    FROM "Collection"
   WHERE "loanId" = v_loan_id AND "isVoided" = false;

  -- Step 1: Mark all PENDING/PARTIAL schedules as PAID
  UPDATE "LoanSchedule"
     SET status = 'PAID',
         "amountPaid" = "emiAmount",
         "paidDate" = COALESCE(v_last_collection_date, NOW())
   WHERE "loanId" = v_loan_id
     AND status IN ('PENDING', 'PARTIAL');

  RAISE NOTICE 'Marked remaining schedules as PAID.';

  -- Step 2: Close the loan
  UPDATE "Loan"
     SET "outstandingAmount" = 0,
         "advanceBalance" = 0,
         status = 'CLOSED',
         "updatedAt" = NOW()
   WHERE id = v_loan_id;

  RAISE NOTICE 'Loan set to CLOSED, outstanding=0, advanceBalance=0.';

  -- Step 3: Write corrective LoanLedger entry
  SELECT "closingBalance" INTO v_last_loan_ledger_balance
    FROM "LoanLedger"
   WHERE "loanId" = v_loan_id
   ORDER BY "createdAt" DESC
   LIMIT 1;

  IF v_last_loan_ledger_balance IS NULL THEN
    v_last_loan_ledger_balance := v_outstanding;
  END IF;

  INSERT INTO "LoanLedger" (
    id, "loanId", date, "transactionType", amount,
    "openingBalance", "closingBalance", remarks, "createdAt", "updatedAt"
  ) VALUES (
    gen_random_uuid()::TEXT,
    v_loan_id,
    NOW(),
    'Pre-Close Correction',
    0,
    v_last_loan_ledger_balance,
    0,
    'Corrective entry: loan was stuck ACTIVE after pre-close. Outstanding corrected to 0.',
    NOW(),
    NOW()
  );

  RAISE NOTICE 'LoanLedger corrective entry written (openingBalance: %, closingBalance: 0).', v_last_loan_ledger_balance;

  -- Step 4: Write corrective CustomerLedger entry
  SELECT "closingBalance" INTO v_last_cust_ledger_balance
    FROM "CustomerLedger"
   WHERE "customerId" = v_customer_id
   ORDER BY "createdAt" DESC
   LIMIT 1;

  IF v_last_cust_ledger_balance IS NULL THEN
    v_last_cust_ledger_balance := 0;
  END IF;

  IF v_last_cust_ledger_balance != 0 THEN
    INSERT INTO "CustomerLedger" (
      id, "customerId", date, "transactionType", amount,
      "openingBalance", "closingBalance", remarks, "createdAt", "updatedAt"
    ) VALUES (
      gen_random_uuid()::TEXT,
      v_customer_id,
      NOW(),
      'Pre-Close Correction',
      0,
      v_last_cust_ledger_balance,
      0,
      'Corrective entry: loan ANT-L023 closed via pre-close payment.',
      NOW(),
      NOW()
    );

    RAISE NOTICE 'CustomerLedger corrective entry written (openingBalance: %, closingBalance: 0).', v_last_cust_ledger_balance;
  ELSE
    RAISE NOTICE 'CustomerLedger already at 0, no corrective entry needed.';
  END IF;

  RAISE NOTICE '=== ANT-L023 successfully fixed and CLOSED. ===';
END;
$$;

COMMIT;
