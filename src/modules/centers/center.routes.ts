import { Router } from 'express';
import { getCenters, createCenter, updateCenter } from './center.controller';

const router = Router();

router.get('/', getCenters);
router.post('/', createCenter);
router.put('/:id', updateCenter);

export default router;
