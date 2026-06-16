import { Router } from 'express';
import { getCenters, createCenter, updateCenter, deleteCenter } from './center.controller';

const router = Router();

router.get('/', getCenters);
router.post('/', createCenter);
router.put('/:id', updateCenter);
router.delete('/:id', deleteCenter);

export default router;
