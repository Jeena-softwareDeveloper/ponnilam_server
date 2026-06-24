import { Router } from 'express';
import { getLoanPackages, createLoanPackage, updateLoanPackage, deleteLoanPackage } from './loanPackage.controller';
import { requireAdmin } from '../../middlewares/admin.middleware';

const router = Router();

router.get('/', getLoanPackages);
router.post('/', requireAdmin, createLoanPackage);
router.put('/:id', requireAdmin, updateLoanPackage);
router.delete('/:id', requireAdmin, deleteLoanPackage);

export default router;
