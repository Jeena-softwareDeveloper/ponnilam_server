import { Router } from 'express';
import { getCenters, createCenter, updateCenter, deleteCenter, getCenterById, importCustomersToNewCenter, getCenterCollectionSheet, getCenterJointLiabilitySheet } from './center.controller';

const router = Router();

router.get('/', getCenters);
router.post('/', createCenter);
router.post('/import-customers', importCustomersToNewCenter);
router.get('/:id/collection-sheet', getCenterCollectionSheet);
router.get('/:id/joint-liability-sheet', getCenterJointLiabilitySheet);
router.get('/:id', getCenterById);
router.put('/:id', updateCenter);
router.delete('/:id', deleteCenter);

export default router;
