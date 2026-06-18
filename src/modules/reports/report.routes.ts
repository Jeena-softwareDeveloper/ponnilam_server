import { Router } from 'express';
import {
  getCollectionReport,
  getCenterDetailReport,
  getCenterCustomerReport,
  getEmployeeWiseReport,
  getAreaDueReport,
  getPartyAmountReport
} from './report.controller';

const router = Router();

router.get('/collections', getCollectionReport);
router.get('/center-detail', getCenterDetailReport);
router.get('/center-customers', getCenterCustomerReport);
router.get('/employee-wise', getEmployeeWiseReport);
router.get('/area-due', getAreaDueReport);
router.get('/party-amount', getPartyAmountReport);

export default router;
