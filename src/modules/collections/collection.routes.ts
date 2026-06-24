import { Router } from 'express';
import { createCollection, getCollections, voidCollectionEntry } from './collection.controller';
import { processBulkCollection } from './bulk.controller';

const router = Router();

router.get('/', getCollections);
router.post('/', createCollection);
router.post('/bulk', processBulkCollection);
router.post('/:id/void', voidCollectionEntry);

export default router;
