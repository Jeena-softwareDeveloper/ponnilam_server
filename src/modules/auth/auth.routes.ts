import { Router } from 'express';
import { login, getAuthMenus, changePassword, forgotPassword } from './auth.controller';
import { authenticateToken } from '../../middlewares/auth.middleware';

const router = Router();

router.post('/login', login);
router.post('/change-password', authenticateToken, changePassword);
router.post('/forgot-password', forgotPassword);
router.get('/menus', authenticateToken, getAuthMenus);

export default router;
