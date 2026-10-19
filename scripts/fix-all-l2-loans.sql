-- ============================================================================
-- FIX ALL 25 L2 LOANS ACROSS 5 CENTERS:
-- 1. TAMILSELVI KARATTUPALAYAM (TKA001-L2 to TKA004-L2)
-- 2. KANNIYAMMAL KASIPALAYAM (KKA001-L2 to KKA006-L2)
-- 3. SELVI CHIKKARASAMPALAYAM (SCA001-L2 to SCA005-L2)
-- 4. MANJULA IKKARAINEGAMAM (MIK001-L2 to MIK005-L2)
-- 5. BHUVANESWAR KASIPALAYAM (BKA001-L2 to BKA005-L2)
-- ============================================================================

BEGIN;

-- 1. Delete schedules of all 25 L2 loans
DELETE FROM public."LoanSchedule"
WHERE "loanId" IN (
  SELECT id FROM public."Loan" 
  WHERE "loanNumber" IN (
    'TKA001-L2', 'TKA002-L2', 'TKA003-L2', 'TKA004-L2',
    'KKA001-L2', 'KKA002-L2', 'KKA003-L2', 'KKA004-L2', 'KKA005-L2', 'KKA006-L2',
    'SCA001-L2', 'SCA002-L2', 'SCA003-L2', 'SCA004-L2', 'SCA005-L2',
    'MIK001-L2', 'MIK002-L2', 'MIK003-L2', 'MIK004-L2', 'MIK005-L2',
    'BKA001-L2', 'BKA002-L2', 'BKA003-L2', 'BKA004-L2', 'BKA005-L2'
  )
);

-- 2. Delete guarantors of all 25 L2 loans
DELETE FROM public."LoanGuarantor"
WHERE "loanId" IN (
  SELECT id FROM public."Loan" 
  WHERE "loanNumber" IN (
    'TKA001-L2', 'TKA002-L2', 'TKA003-L2', 'TKA004-L2',
    'KKA001-L2', 'KKA002-L2', 'KKA003-L2', 'KKA004-L2', 'KKA005-L2', 'KKA006-L2',
    'SCA001-L2', 'SCA002-L2', 'SCA003-L2', 'SCA004-L2', 'SCA005-L2',
    'MIK001-L2', 'MIK002-L2', 'MIK003-L2', 'MIK004-L2', 'MIK005-L2',
    'BKA001-L2', 'BKA002-L2', 'BKA003-L2', 'BKA004-L2', 'BKA005-L2'
  )
);

-- 3. Delete ledgers of all 25 L2 loans
DELETE FROM public."LoanLedger"
WHERE "loanId" IN (
  SELECT id FROM public."Loan" 
  WHERE "loanNumber" IN (
    'TKA001-L2', 'TKA002-L2', 'TKA003-L2', 'TKA004-L2',
    'KKA001-L2', 'KKA002-L2', 'KKA003-L2', 'KKA004-L2', 'KKA005-L2', 'KKA006-L2',
    'SCA001-L2', 'SCA002-L2', 'SCA003-L2', 'SCA004-L2', 'SCA005-L2',
    'MIK001-L2', 'MIK002-L2', 'MIK003-L2', 'MIK004-L2', 'MIK005-L2',
    'BKA001-L2', 'BKA002-L2', 'BKA003-L2', 'BKA004-L2', 'BKA005-L2'
  )
);

-- 4. Delete the 25 L2 loans
DELETE FROM public."Loan"
WHERE "loanNumber" IN (
  'TKA001-L2', 'TKA002-L2', 'TKA003-L2', 'TKA004-L2',
  'KKA001-L2', 'KKA002-L2', 'KKA003-L2', 'KKA004-L2', 'KKA005-L2', 'KKA006-L2',
  'SCA001-L2', 'SCA002-L2', 'SCA003-L2', 'SCA004-L2', 'SCA005-L2',
  'MIK001-L2', 'MIK002-L2', 'MIK003-L2', 'MIK004-L2', 'MIK005-L2',
  'BKA001-L2', 'BKA002-L2', 'BKA003-L2', 'BKA004-L2', 'BKA005-L2'
);

-- 5. Reset future schedules (Weeks 20-28) to PENDING for all 25 first cycle loans
UPDATE public."LoanSchedule"
SET 
  status = 'PENDING',
  "amountPaid" = 0,
  "paidDate" = NULL,
  "collectionId" = NULL
WHERE "loanId" IN (
  SELECT id FROM public."Loan"
  WHERE "loanNumber" IN (
    'SAT-L0241', 'SAT-L0242', 'SAT-L0243', 'SAT-L0244',
    'SAT-L0246', 'SAT-L0247', 'SAT-L0248', 'SAT-L0249', 'SAT-L0250', 'SAT-L0251',
    'SAT-L0252', 'SAT-L0253', 'SAT-L0254', 'SAT-L0255', 'SAT-L0256',
    'SAT-L0257', 'SAT-L0258', 'SAT-L0259', 'SAT-L0260', 'SAT-L0261',
    'SAT-L0277', 'SAT-L0278', 'SAT-L0279', 'SAT-L0280', 'SAT-L0281'
  )
)
AND "dueDate" >= '2026-10-18 00:00:00';

-- 6. Restore outstandingAmount = 5850 and status = ACTIVE for all 25 first cycle loans
UPDATE public."Loan"
SET 
  "outstandingAmount" = 5850,
  "advanceBalance" = 0,
  status = 'ACTIVE',
  "updatedAt" = NOW()
WHERE "loanNumber" IN (
  'SAT-L0241', 'SAT-L0242', 'SAT-L0243', 'SAT-L0244',
  'SAT-L0246', 'SAT-L0247', 'SAT-L0248', 'SAT-L0249', 'SAT-L0250', 'SAT-L0251',
  'SAT-L0252', 'SAT-L0253', 'SAT-L0254', 'SAT-L0255', 'SAT-L0256',
  'SAT-L0257', 'SAT-L0258', 'SAT-L0259', 'SAT-L0260', 'SAT-L0261',
  'SAT-L0277', 'SAT-L0278', 'SAT-L0279', 'SAT-L0280', 'SAT-L0281'
);

-- 7. Fix LoanLedger entries from 'Pre-Close' to 'Collection' with closing 5850
UPDATE public."LoanLedger"
SET 
  "transactionType" = 'Collection',
  "closingBalance" = 5850
WHERE "loanId" IN (
  SELECT id FROM public."Loan"
  WHERE "loanNumber" IN (
    'SAT-L0241', 'SAT-L0242', 'SAT-L0243', 'SAT-L0244',
    'SAT-L0246', 'SAT-L0247', 'SAT-L0248', 'SAT-L0249', 'SAT-L0250', 'SAT-L0251',
    'SAT-L0252', 'SAT-L0253', 'SAT-L0254', 'SAT-L0255', 'SAT-L0256',
    'SAT-L0257', 'SAT-L0258', 'SAT-L0259', 'SAT-L0260', 'SAT-L0261',
    'SAT-L0277', 'SAT-L0278', 'SAT-L0279', 'SAT-L0280', 'SAT-L0281'
  )
)
AND "transactionType" = 'Pre-Close';

-- 8. Fix CustomerLedger entries from 'Pre-Close' to 'Collection'
UPDATE public."CustomerLedger"
SET 
  "transactionType" = 'Collection'
WHERE "customerId" IN (
  SELECT id FROM public."Customer"
  WHERE "customerNo" IN (
    'TKA001', 'TKA002', 'TKA003', 'TKA004',
    'KKA001', 'KKA002', 'KKA003', 'KKA004', 'KKA005', 'KKA006',
    'SCA001', 'SCA002', 'SCA003', 'SCA004', 'SCA005',
    'MIK001', 'MIK002', 'MIK003', 'MIK004', 'MIK005',
    'BKA001', 'BKA002', 'BKA003', 'BKA004', 'BKA005'
  )
)
AND "transactionType" = 'Pre-Close';

COMMIT;
