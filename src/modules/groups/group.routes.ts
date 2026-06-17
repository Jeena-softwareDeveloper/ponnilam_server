import { Router } from 'express';
import { getGroups, createGroup, updateGroup, deleteGroup } from './group.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';

const router = Router();

// Apply auth middleware to all routes
router.use(requireAuth);

router.get('/', requirePermission('Masters'), getGroups);
router.post('/', requirePermission('Masters'), createGroup);
router.put('/:id', requirePermission('Masters'), updateGroup);
router.delete('/:id', requirePermission('Masters'), deleteGroup);

export default router;
