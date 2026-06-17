import { Router } from 'express';
import { getNotifications, markAsRead, approvePasswordReset, rejectPasswordReset } from './notifications.controller';
import { authenticateToken } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.get('/', getNotifications);
router.put('/:id/read', markAsRead);
router.post('/:id/approve-reset', approvePasswordReset);
router.post('/:id/reject-reset', rejectPasswordReset);

export default router;
