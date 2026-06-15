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

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Main Routes Setup
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/masters/centers', centerRoutes);
app.use('/api/v1/masters/branches', branchRoutes);
app.use('/api/v1/masters/roles', roleRoutes);
app.use('/api/v1/masters/staffs', staffRoutes);
app.use('/api/v1/masters/menus', menuRoutes);
app.use('/api/v1/masters/loan-packages', loanPackageRoutes);

// Base route
app.get('/', (req, res) => {
  res.json({ message: 'NBFC Finance API is running' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
