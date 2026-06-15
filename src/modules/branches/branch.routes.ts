import { Router } from 'express';
import { getBranches } from './branch.controller';

const router = Router();

router.get('/', getBranches);

export default router;
