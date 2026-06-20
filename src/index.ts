import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Import module routes
import authRoutes from './modules/auth/auth.routes';
import centerRoutes from './modules/centers/center.routes';
import branchRoutes from './modules/branches/branch.routes';
import roleRoutes from './modules/roles/role.routes';
import staffRoutes from './modules/staffs/staff.routes';
import menuRoutes from './modules/menus/menu.routes';
import loanPackageRoutes from './modules/loanPackages/loanPackage.routes';
import areaRoutes from './modules/areas/area.routes';
import groupRoutes from './modules/groups/group.routes';
import stateRoutes from './modules/states/state.routes';
import districtRoutes from './modules/districts/district.routes';
import customerRoutes from './modules/customers/customer.routes';
import loanRoutes from './modules/loans/loan.routes';
import collectionRoutes from './modules/collections/collection.routes';
import reportRoutes from './modules/reports/report.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import notificationRoutes from './modules/notifications/notifications.routes';

// Import Middlewares
import { authenticateToken, branchScope } from './middlewares/auth.middleware';
import { auditMiddleware } from './middlewares/audit.middleware';
import { errorHandler } from './middlewares/error.middleware';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Main Routes Setup
app.use('/api/v1/auth', authRoutes);

// Protect all masters routes with authenticateToken
app.use('/api/v1/masters', authenticateToken);

// Apply Branch Scoping (for Branch Users)
app.use('/api/v1/masters', branchScope);

// Apply specific routes and audit logs
app.use('/api/v1/masters/centers', auditMiddleware('Center'), centerRoutes);
app.use('/api/v1/masters/groups', auditMiddleware('Group'), groupRoutes);
app.use('/api/v1/masters/areas', auditMiddleware('Area'), areaRoutes);
app.use('/api/v1/masters/branches', auditMiddleware('Branch'), branchRoutes);
app.use('/api/v1/masters/states', auditMiddleware('State'), stateRoutes);
app.use('/api/v1/masters/districts', auditMiddleware('District'), districtRoutes);
app.use('/api/v1/masters/roles', auditMiddleware('Role'), roleRoutes);
app.use('/api/v1/masters/staffs', auditMiddleware('Staff'), staffRoutes);
app.use('/api/v1/masters/menus', auditMiddleware('Menu'), menuRoutes);
app.use('/api/v1/masters/loan-packages', auditMiddleware('LoanPackage'), loanPackageRoutes);

// Customer Routes (Can be under /customers directly or /masters/customers)
// The prompt implies it's a new Phase, so we can group it under /customers
// But we still want it protected and branch-scoped. 
// We'll put it under a new prefix /api/v1/customers that applies the middlewares.
app.use('/api/v1/customers', authenticateToken, branchScope, auditMiddleware('Customer'), customerRoutes);
app.use('/api/v1/loans', authenticateToken, branchScope, auditMiddleware('Loan'), loanRoutes);
app.use('/api/v1/collections', authenticateToken, branchScope, auditMiddleware('Collection'), collectionRoutes);
app.use('/api/v1/reports', authenticateToken, branchScope, auditMiddleware('Report'), reportRoutes);
app.use('/api/v1/dashboard', authenticateToken, branchScope, dashboardRoutes);
app.use('/api/v1/notifications', authenticateToken, notificationRoutes);

// Base route
app.get('/', (req, res) => {
  res.json({ message: 'NBFC Finance API is running' });
});

// Global Error Handler (must be the last middleware)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
