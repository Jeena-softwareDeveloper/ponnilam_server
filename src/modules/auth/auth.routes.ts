import { Router } from 'express';
import {
  login,
  identifyPhone,
  getAuthMenus,
  changePassword,
  forgotPassword,
  sendOtp,
  verifyOtp,
  getCustomerPortalData,
} from './auth.controller';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { rateLimit } from '../../middlewares/rateLimit.middleware';

const router = Router();

router.post('/login', login);
router.post('/identify-phone', rateLimit(20, 15 * 60 * 1000, (req) => String(req.body?.phone || '')), identifyPhone);
router.post('/send-otp', rateLimit(10, 15 * 60 * 1000, (req) => String(req.body?.phone || '')), sendOtp);
router.post('/verify-otp', rateLimit(15, 15 * 60 * 1000, (req) => String(req.body?.phone || '')), verifyOtp);
router.get('/customer-portal', authenticateToken, getCustomerPortalData);
router.post('/change-password', authenticateToken, changePassword);
router.post(
  '/forgot-password',
  rateLimit(5, 15 * 60 * 1000, (req) => String(req.body?.username || '')),
  forgotPassword
);
router.get('/menus', authenticateToken, getAuthMenus);

export default router;
