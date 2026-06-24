import { Router } from 'express';
import { getRoles, createRole, updateRole, deleteRole } from './role.controller';
import { requireAdmin } from '../../middlewares/admin.middleware';

const router = Router();

router.get('/', getRoles);
router.post('/', requireAdmin, createRole);
router.put('/:id', requireAdmin, updateRole);
router.delete('/:id', requireAdmin, deleteRole);

export default router;
