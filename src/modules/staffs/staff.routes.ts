import { Router } from 'express';
import { getStaffs, createStaff, updateStaff, deleteStaff, getRequests, resolveResetRequest } from './staff.controller';

const router = Router();

router.get('/requests', getRequests);
router.post('/resolve-reset/:id', resolveResetRequest);
router.get('/', getStaffs);
router.post('/', createStaff);
router.put('/:id', updateStaff);
router.delete('/:id', deleteStaff);

export default router;
