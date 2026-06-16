import { Router } from 'express';
import { getLoanPackages, createLoanPackage, updateLoanPackage, deleteLoanPackage } from './loanPackage.controller';

const router = Router();

router.get('/', getLoanPackages);
router.post('/', createLoanPackage);
router.put('/:id', updateLoanPackage);
router.delete('/:id', deleteLoanPackage);

export default router;
