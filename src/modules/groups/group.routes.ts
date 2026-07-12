import { Router } from 'express';
import { getGroups, createGroup, updateGroup, deleteGroup } from './group.controller';
import { authenticateToken } from '../../middlewares/auth.middleware';

const router = Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

router.get('/', getGroups);
router.post('/', createGroup);
router.put('/:id', updateGroup);
router.delete('/:id', deleteGroup);

export default router;
