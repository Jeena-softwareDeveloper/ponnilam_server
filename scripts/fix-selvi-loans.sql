-- ============================================================================
-- FIX SELVI CHIKKARASAMPALAYAM CENTER LOANS
-- 1. Delete mistakenly created 2nd Cycle loans (SCA001-L2 to SCA005-L2)
-- 2. Restore 1st Cycle loans (SAT-L0252 to SAT-L0256) back to ACTIVE state
--    with 9 remaining pending EMIs (Weeks 20 to 28) and Outstanding = Rs. 5,850
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- STEP 1: Delete schedules and records for the 5 fake L2 loans
-- ----------------------------------------------------------------------------
DELETE FROM public."LoanSchedule"
WHERE "loanId" IN (
  SELECT id FROM public."Loan" 
  WHERE "loanNumber" IN ('SCA001-L2', 'SCA002-L2', 'SCA003-L2', 'SCA004-L2', 'SCA005-L2')
);

DELETE FROM public."LoanGuarantor"
WHERE "loanId" IN (
  SELECT id FROM public."Loan" 
  WHERE "loanNumber" IN ('SCA001-L2', 'SCA002-L2', 'SCA003-L2', 'SCA004-L2', 'SCA005-L2')
);

DELETE FROM public."LoanLedger"
WHERE "loanId" IN (
  SELECT id FROM public."Loan" 
  WHERE "loanNumber" IN ('SCA001-L2', 'SCA002-L2', 'SCA003-L2', 'SCA004-L2', 'SCA005-L2')
);

DELETE FROM public."Loan"
WHERE "loanNumber" IN ('SCA001-L2', 'SCA002-L2', 'SCA003-L2', 'SCA004-L2', 'SCA005-L2');


-- ----------------------------------------------------------------------------
-- STEP 2: Restore future schedules (Weeks 20 to 28) for 1st cycle loans to PENDING
-- Due dates: 2026-10-19 to 2026-12-14
-- ----------------------------------------------------------------------------
UPDATE public."LoanSchedule"
SET 
  status = 'PENDING',
  "amountPaid" = 0,
  "paidDate" = NULL,
  "collectionId" = NULL
WHERE "loanId" IN (
  'e27da04e-d535-497a-9bf1-8a99b49c0cc0', -- SAT-L0252 (SCA001)
  '811fe673-b5fa-4ddd-bfa8-264e0b1bb1c2', -- SAT-L0253 (SCA002)
  '235dec22-b67c-4c0e-89aa-d011f8a77b3d', -- SAT-L0254 (SCA003)
  '2c44eb38-9f64-49c0-9d21-c47ca2467e70', -- SAT-L0255 (SCA004)
  'd2cdae9f-ba37-4a7b-88e3-835e2da8addc'  -- SAT-L0256 (SCA005)
)
AND "dueDate" >= '2026-10-19 00:00:00';


-- ----------------------------------------------------------------------------
-- STEP 3: Restore Loan outstandingAmount = 5850 and status = ACTIVE
-- ----------------------------------------------------------------------------
UPDATE public."Loan"
SET 
  "outstandingAmount" = 5850,
  "advanceBalance" = 0,
  status = 'ACTIVE',
  "updatedAt" = NOW()
WHERE id IN (
  'e27da04e-d535-497a-9bf1-8a99b49c0cc0', -- SAT-L0252 (SCA001)
  '811fe673-b5fa-4ddd-bfa8-264e0b1bb1c2', -- SAT-L0253 (SCA002)
  '235dec22-b67c-4c0e-89aa-d011f8a77b3d', -- SAT-L0254 (SCA003)
  '2c44eb38-9f64-49c0-9d21-c47ca2467e70', -- SAT-L0255 (SCA004)
  'd2cdae9f-ba37-4a7b-88e3-835e2da8addc'  -- SAT-L0256 (SCA005)
);


-- ----------------------------------------------------------------------------
-- STEP 4: Fix LoanLedger entries from 'Pre-Close' to 'Collection' with closing 5850
-- ----------------------------------------------------------------------------
UPDATE public."LoanLedger"
SET 
  "transactionType" = 'Collection',
  "closingBalance" = 5850
WHERE "collectionId" IN (
  '3758d253-9219-4eca-b177-ae5d44f54dc4', -- TRN015227
  '4dce122c-fda0-4482-a3c5-5541a43918f2', -- TRN015228
  '7c884c39-313d-478a-8874-98c93b29eb58', -- TRN015229
  '174868c4-442d-4e2a-903e-add91cc5ab24', -- TRN015230
  '190abe1e-4740-4873-b0d5-b97f86041dfb'  -- TRN015231
);


-- ----------------------------------------------------------------------------
-- STEP 5: Fix CustomerLedger entries from 'Pre-Close' to 'Collection'
-- ----------------------------------------------------------------------------
UPDATE public."CustomerLedger"
SET 
  "transactionType" = 'Collection'
WHERE "collectionId" IN (
  '3758d253-9219-4eca-b177-ae5d44f54dc4', -- TRN015227
  '4dce122c-fda0-4482-a3c5-5541a43918f2', -- TRN015228
  '7c884c39-313d-478a-8874-98c93b29eb58', -- TRN015229
  '174868c4-442d-4e2a-903e-add91cc5ab24', -- TRN015230
  '190abe1e-4740-4873-b0d5-b97f86041dfb'  -- TRN015231
);

COMMIT;
