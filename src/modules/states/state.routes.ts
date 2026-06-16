import { Router } from 'express';
import { getStates, createState, updateState, deleteState } from './state.controller';

const router = Router();

router.get('/', getStates);
router.post('/', createState);
router.put('/:id', updateState);
router.delete('/:id', deleteState);

export default router;
