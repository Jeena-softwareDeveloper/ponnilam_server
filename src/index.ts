import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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
import auditLogRoutes from './modules/auditLogs/auditLog.routes';
import { authenticateToken, branchScope } from './middlewares/auth.middleware';
import { requireAdmin } from './middlewares/admin.middleware';
import { auditMiddleware } from './middlewares/audit.middleware';
import { errorHandler } from './middlewares/error.middleware';
import { decryptRequestBody, encryptResponseBody } from './middlewares/encryption.middleware';

dotenv.config();

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
  process.exit(1);
}

const app = express();

const isLocalDevOrigin = (origin: string) =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'https://ponnilam-ui.vercel.app',
      'https://ponnilamfinance.com',
      'https://app.ponnilamfincorp.com',
    ];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Local dev: any localhost port (Next.js may use 3002, 3003, etc.)
    if (process.env.NODE_ENV !== 'production' && isLocalDevOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Role', 'X-User-Branch-Id', 'X-Api-Encrypted'],
}));
app.use(express.json());
app.use(decryptRequestBody);
app.use(encryptResponseBody);

app.use('/api/v1/auth', authRoutes);

// Protect all masters routes with authenticateToken + branch scoping
app.use('/api/v1/masters', authenticateToken);
app.use('/api/v1/masters', branchScope);
app.use('/api/v1/masters/branches', requireAdmin, auditMiddleware('Branch'), branchRoutes);
app.use('/api/v1/masters/states', requireAdmin, auditMiddleware('State'), stateRoutes);
app.use('/api/v1/masters/districts', requireAdmin, auditMiddleware('District'), districtRoutes);
app.use('/api/v1/masters/roles', auditMiddleware('Role'), roleRoutes);
app.use('/api/v1/masters/menus', requireAdmin, auditMiddleware('Menu'), menuRoutes);
app.use('/api/v1/masters/loan-packages', auditMiddleware('LoanPackage'), loanPackageRoutes);
app.use('/api/v1/masters/centers', auditMiddleware('Center'), centerRoutes);
app.use('/api/v1/masters/groups', auditMiddleware('Group'), groupRoutes);
app.use('/api/v1/masters/areas', auditMiddleware('Area'), areaRoutes);
app.use('/api/v1/masters/staffs', auditMiddleware('Staff'), staffRoutes);

app.use('/api/v1/customers', authenticateToken, branchScope, auditMiddleware('Customer'), customerRoutes);
app.use('/api/v1/loans', authenticateToken, branchScope, auditMiddleware('Loan'), loanRoutes);
app.use('/api/v1/collections', authenticateToken, branchScope, auditMiddleware('Collection'), collectionRoutes);
app.use('/api/v1/reports', authenticateToken, branchScope, auditMiddleware('Report'), reportRoutes);
app.use('/api/v1/dashboard', authenticateToken, branchScope, dashboardRoutes);
app.use('/api/v1/notifications', authenticateToken, notificationRoutes);
app.use('/api/v1/audit-logs', authenticateToken, branchScope, auditLogRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), service: 'NBFC API' });
});

app.get('/', (req, res) => {
  res.json({ message: 'NBFC Finance API is running' });
});

// Global Error Handler (must be the last middleware)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT);
