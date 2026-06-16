import { Router } from 'express';
import { getBranches, getNextBranchCode, createBranch, updateBranch } from './branch.controller';

const router = Router();

router.get('/next-code', getNextBranchCode);
router.get('/', getBranches);
router.post('/', createBranch);
router.put('/:id', updateBranch);

export default router;
