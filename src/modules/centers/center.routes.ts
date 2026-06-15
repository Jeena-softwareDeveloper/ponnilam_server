import { Router } from 'express';
import { getCenters } from './center.controller';

const router = Router();

router.get('/', getCenters);

export default router;
