import { Router } from 'express';
import { getMenus, getStaffMenus, assignMenus } from './menu.controller';

const router = Router();

router.get('/', getMenus);
router.get('/staff/:staffId', getStaffMenus);
router.post('/staff/:staffId', assignMenus);

export default router;
