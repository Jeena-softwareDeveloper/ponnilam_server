import { Router } from 'express';
import { getCenters, createCenter, updateCenter, deleteCenter, getCenterById } from './center.controller';

const router = Router();

router.get('/', getCenters);
router.post('/', createCenter);
router.get('/:id', getCenterById);
router.put('/:id', updateCenter);
router.delete('/:id', deleteCenter);

export default router;
