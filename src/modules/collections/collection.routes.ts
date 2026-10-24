import { Router } from 'express';
import { createCollection, getCollections, voidCollectionEntry } from './collection.controller';
import { processBulkCollection } from './bulk.controller';
import {
  submitStaffEntries,
  getStaffEntriesSummary,
  getStaffEntries,
  getPendingStaffEntries,
  getConfirmedStaffEntries,
  confirmStaffEntries,
  rejectStaffEntries,
} from './staff-entry.controller';

const router = Router();

// Staff field entries (Waiting list & Cash Confirmation)
router.post('/staff-entry', submitStaffEntries);
router.get('/staff-entries/pending', getPendingStaffEntries);
router.get('/staff-entries/confirmed', getConfirmedStaffEntries);
router.get('/staff-entries/summary', getStaffEntriesSummary);
router.get('/staff-entries', getStaffEntries);
router.post('/staff-entries/confirm', confirmStaffEntries);
router.post('/staff-entries/reject', rejectStaffEntries);

// Standard collections
router.get('/', getCollections);
router.post('/', createCollection);
router.post('/bulk', processBulkCollection);
router.post('/:id/void', voidCollectionEntry);

export default router;
