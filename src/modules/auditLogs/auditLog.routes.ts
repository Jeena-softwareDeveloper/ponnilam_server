import { Router } from 'express';
import { getAuditLogs, getActiveSessions, getAuditStats } from './auditLog.controller';

const router = Router();

router.get('/', getAuditLogs);
router.get('/active-sessions', getActiveSessions);
router.get('/stats', getAuditStats);

export default router;
