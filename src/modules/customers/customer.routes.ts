import { Router } from 'express';
import { createCustomer, updateCustomer, getCustomers, getCustomerById, getCustomerLedger, deleteCustomer, toggleCustomerStatus } from './customer.controller';

const router = Router();

router.get('/', getCustomers);
router.post('/', createCustomer);
router.get('/:id', getCustomerById);
router.get('/:id/ledger', getCustomerLedger);
router.put('/:id', updateCustomer);
router.delete('/:id', deleteCustomer);
router.patch('/:id/toggle-status', toggleCustomerStatus);

export default router;
