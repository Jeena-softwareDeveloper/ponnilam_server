import { Router } from 'express';
import { getLoanPackages } from './loanPackage.controller';

const router = Router();

router.get('/', getLoanPackages);

export default router;
