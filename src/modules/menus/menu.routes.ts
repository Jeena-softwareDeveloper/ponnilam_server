import { Router } from 'express';
import { getMenus, createMenu, updateMenu, deleteMenu, getStaffMenus, assignMenus, getBranchMenus, assignBranchMenus } from './menu.controller';

const router = Router();

router.get('/', getMenus);
router.post('/', createMenu);
router.put('/:id', updateMenu);
router.delete('/:id', deleteMenu);
router.get('/staff/:staffId', getStaffMenus);
router.post('/staff/:staffId', assignMenus);
router.get('/branch/:branchId', getBranchMenus);
router.post('/branch/:branchId', assignBranchMenus);

export default router;
