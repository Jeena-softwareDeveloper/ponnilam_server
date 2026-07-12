import { Router } from 'express';
import { getAreas, createArea, updateArea, deleteArea } from './area.controller';

const router = Router();

router.get('/', getAreas);
router.post('/', createArea);
router.put('/:id', updateArea);
router.delete('/:id', deleteArea);

export default router;
