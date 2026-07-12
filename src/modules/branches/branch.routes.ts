import { Router } from 'express';
import { getBranches, getNextBranchCode, createBranch, updateBranch, deleteBranch } from './branch.controller';

const router = Router();

router.get('/next-code', getNextBranchCode);
router.get('/', getBranches);
router.post('/', createBranch);
router.put('/:id', updateBranch);
router.delete('/:id', deleteBranch);

export default router;
