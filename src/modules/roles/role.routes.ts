import { Router } from 'express';
import { getRoles } from './role.controller';

const router = Router();

router.get('/', getRoles);

export default router;
