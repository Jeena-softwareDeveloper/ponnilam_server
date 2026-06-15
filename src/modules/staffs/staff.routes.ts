import { Router } from 'express';
import { getStaffs } from './staff.controller';

const router = Router();

router.get('/', getStaffs);

export default router;
