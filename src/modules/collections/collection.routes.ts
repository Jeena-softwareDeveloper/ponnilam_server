import { Router } from 'express';
import { createCollection, getCollections } from './collection.controller';

const router = Router();

router.get('/', getCollections);
router.post('/', createCollection);

export default router;
