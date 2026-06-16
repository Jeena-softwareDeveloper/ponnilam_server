import { Router } from 'express';
import { getStaffs, createStaff, updateStaff } from './staff.controller';

const router = Router();

router.get('/', getStaffs);
router.post('/', createStaff);
router.put('/:id', updateStaff);

export default router;
