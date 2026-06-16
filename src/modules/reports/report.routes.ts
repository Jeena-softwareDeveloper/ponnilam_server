import { Router } from 'express';
import { getCollectionReport } from './report.controller';

const router = Router();

router.get('/collections', getCollectionReport);

export default router;
