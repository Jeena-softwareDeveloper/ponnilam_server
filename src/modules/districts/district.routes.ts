import { Router } from 'express';
import { getDistricts, createDistrict, updateDistrict, deleteDistrict } from './district.controller';

const router = Router();

router.get('/', getDistricts);
router.post('/', createDistrict);
router.put('/:id', updateDistrict);
router.delete('/:id', deleteDistrict);

export default router;
