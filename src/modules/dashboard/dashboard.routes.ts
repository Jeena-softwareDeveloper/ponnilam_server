import { Router } from 'express';
import {
  getDashboardKpis,
  getDashboardTrend,
  getDashboardCharts,
  getDashboardActivity
} from './dashboard.controller';

const router = Router();

// Each section loads independently — no big monolithic call
// Note: authenticateToken is already applied at the index.ts level for /api/v1/dashboard
router.get('/kpis', getDashboardKpis);
router.get('/trend', getDashboardTrend);
router.get('/charts', getDashboardCharts);
router.get('/activity', getDashboardActivity);

// Legacy route for backward compat
router.get('/stats', getDashboardKpis);

export default router;

