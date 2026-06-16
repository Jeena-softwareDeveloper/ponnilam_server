import { Router } from 'express';
import { login, getAuthMenus } from './auth.controller';
import { authenticateToken } from '../../middlewares/auth.middleware';

const router = Router();

router.post('/login', login);
router.get('/me/menus', authenticateToken, getAuthMenus);

export default router;
