import { Router } from 'express';
import { login, getAuthMenus, changePassword, forgotPassword } from './auth.controller';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { rateLimit } from '../../middlewares/rateLimit.middleware';

const router = Router();

router.post('/login', login);
router.post('/change-password', authenticateToken, changePassword);
router.post(
  '/forgot-password',
  rateLimit(5, 15 * 60 * 1000, (req) => String(req.body?.username || '')),
  forgotPassword
);
router.get('/menus', authenticateToken, getAuthMenus);

export default router;
