import { Router } from 'express';
import { createCustomer, updateCustomer, getCustomers, getCustomerById, getCustomerLedger } from './customer.controller';

const router = Router();

router.get('/', getCustomers);
router.post('/', createCustomer);
router.get('/:id', getCustomerById);
router.get('/:id/ledger', getCustomerLedger);
router.put('/:id', updateCustomer);

export default router;