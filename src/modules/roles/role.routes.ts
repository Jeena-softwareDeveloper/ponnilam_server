import { Router } from 'express';
import { getRoles, createRole, updateRole } from './role.controller';

const router = Router();

router.get('/', getRoles);
router.post('/', createRole);
router.put('/:id', updateRole);

export default router;
