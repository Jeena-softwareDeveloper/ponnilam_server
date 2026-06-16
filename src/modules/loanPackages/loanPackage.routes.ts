import { Router } from 'express';
import { getLoanPackages, createLoanPackage, updateLoanPackage } from './loanPackage.controller';

const router = Router();

router.get('/', getLoanPackages);
router.post('/', createLoanPackage);
router.put('/:id', updateLoanPackage);

export default router;
