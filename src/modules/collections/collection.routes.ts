import { Router } from 'express';
import { createCollection, getCollections } from './collection.controller';
import { processBulkCollection } from './bulk.controller';

const router = Router();

router.get('/', getCollections);
router.post('/', createCollection);
router.post('/bulk', processBulkCollection);

export default router;
