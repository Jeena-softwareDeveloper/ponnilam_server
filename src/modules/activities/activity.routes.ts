import { Router } from 'express';
import { getActivities, createActivity, updateActivity, deleteActivity, syncActivitiesToFtp } from './activity.controller';
import upload from '../../middlewares/upload.middleware';

const router = Router();

router.get('/', getActivities);
router.post('/', upload.array('photos', 20), createActivity);
router.put('/:id', updateActivity);
router.delete('/:id', deleteActivity);
router.post('/sync-ftp', syncActivitiesToFtp);

export default router;
