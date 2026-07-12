import { Router } from 'express';
import { createLoan, updateLoanStatus, updateLoanFinancial, getLoans, getLoanById, deleteLoan, getLoanLedger } from './loan.controller';

const router = Router();

router.get('/', getLoans);
router.post('/', createLoan);
router.get('/:id', getLoanById);
router.put('/:id/status', updateLoanStatus);
router.put('/:id/financial', updateLoanFinancial);
router.delete('/:id', deleteLoan);
router.get('/:id/ledger', getLoanLedger);

export default router;

