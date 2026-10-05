import { Router } from 'express';
import { createCustomer, updateCustomer, getCustomers, getCustomerById, getCustomerLedger, deleteCustomer, toggleCustomerStatus, uploadKycDoc, lookupIfsc } from './customer.controller';
import upload from '../../middlewares/upload.middleware';

const router = Router();

router.get('/', getCustomers);
router.post('/', createCustomer);
router.post('/upload-kyc', upload.single('file'), uploadKycDoc);
router.get('/lookup-ifsc/:code', lookupIfsc);
router.get('/:id', getCustomerById);
router.get('/:id/ledger', getCustomerLedger);
router.put('/:id', updateCustomer);
router.delete('/:id', deleteCustomer);
router.patch('/:id/toggle-status', toggleCustomerStatus);

export default router;
