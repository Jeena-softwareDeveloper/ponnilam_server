import { Router } from 'express';
import { createLoan, updateLoanStatus, getLoans, getLoanById } from './loan.controller';

const router = Router();

router.get('/', getLoans);
router.post('/', createLoan);
router.get('/:id', getLoanById);
router.put('/:id/status', updateLoanStatus);

export default router;
