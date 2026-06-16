// @ts-nocheck
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');

  // 1. Create Roles
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'Super Admin' },
    update: {},
    create: { name: 'Super Admin', isActive: true },
  });

  const branchManagerRole = await prisma.role.upsert({
    where: { name: 'Branch Manager' },
    update: {},
    create: { name: 'Branch Manager', isActive: true },
  });

  const cashierRole = await prisma.role.upsert({
    where: { name: 'Cashier' },
    update: {},
    create: { name: 'Cashier', isActive: true },
  });

  // 2. Create Menus
  // TOP LEVEL
  await prisma.menu.upsert({
    where: { name: 'Dashboard' },
    update: {},
    create: { name: 'Dashboard', path: '/admin/dashboard', icon: 'LayoutDashboard' },
  });

  await prisma.menu.upsert({
    where: { name: 'Branch Dashboard' },
    update: {},
    create: { name: 'Branch Dashboard', path: '/admin/branch-dashboard', icon: 'LayoutDashboard' },
  });

  await prisma.menu.upsert({
    where: { name: 'Customers' },
    update: {},
    create: { name: 'Customers', path: '/admin/customers', icon: 'Users' },
  });

  await prisma.menu.upsert({
    where: { name: 'Customer Ledger' },
    update: {},
    create: { name: 'Customer Ledger', path: '/admin/customer-ledger', icon: 'BookOpen' },
  });

  await prisma.menu.upsert({
    where: { name: 'Loans' },
    update: {},
    create: { name: 'Loans', path: '/admin/loans', icon: 'Banknote' },
  });

  await prisma.menu.upsert({
    where: { name: 'Collections' },
    update: {},
    create: { name: 'Collections', path: '/admin/collections', icon: 'Wallet' },
  });

  await prisma.menu.upsert({
    where: { name: 'Reports' },
    update: {},
    create: { name: 'Reports', path: '/admin/reports', icon: 'PieChart' },
  });

  await prisma.menu.upsert({
    where: { name: 'Settings' },
    update: {},
    create: { name: 'Settings', path: '/admin/settings', icon: 'Settings' },
  });

  const mastersMenu = await prisma.menu.upsert({
    where: { name: 'Masters' },
    update: {},
    create: { name: 'Masters', path: '', icon: 'Database' },
  });

  // MASTERS SUB-MENUS
  await prisma.menu.upsert({
    where: { name: 'States' },
    update: { parentId: mastersMenu.id },
    create: { name: 'States', path: '/admin/masters/states', icon: 'MapPin', parentId: mastersMenu.id },
  });

  await prisma.menu.upsert({
    where: { name: 'Districts' },
    update: { parentId: mastersMenu.id },
    create: { name: 'Districts', path: '/admin/masters/districts', icon: 'MapPin', parentId: mastersMenu.id },
  });

  await prisma.menu.upsert({
    where: { name: 'Areas' },
    update: { parentId: mastersMenu.id },
    create: { name: 'Areas', path: '/admin/masters/areas', icon: 'MapPin', parentId: mastersMenu.id },
  });

  await prisma.menu.upsert({
    where: { name: 'Centers' },
    update: { parentId: mastersMenu.id },
    create: { name: 'Centers', path: '/admin/masters/centers', icon: 'MapPin', parentId: mastersMenu.id },
  });

  await prisma.menu.upsert({
    where: { name: 'Branches' },
    update: { parentId: mastersMenu.id },
    create: { name: 'Branches', path: '/admin/masters/branches', icon: 'Building2', parentId: mastersMenu.id },
  });

  await prisma.menu.upsert({
    where: { name: 'Roles' },
    update: { parentId: mastersMenu.id },
    create: { name: 'Roles', path: '/admin/masters/roles', icon: 'Shield', parentId: mastersMenu.id },
  });

  await prisma.menu.upsert({
    where: { name: 'Staffs' },
    update: { parentId: mastersMenu.id },
    create: { name: 'Staffs', path: '/admin/masters/staffs', icon: 'Users', parentId: mastersMenu.id },
  });

  await prisma.menu.upsert({
    where: { name: 'Loan Packages' },
    update: { parentId: mastersMenu.id },
    create: { name: 'Loan Packages', path: '/admin/masters/loan-packages', icon: 'Package', parentId: mastersMenu.id },
  });

  await prisma.menu.upsert({
    where: { name: 'Menus' },
    update: { parentId: mastersMenu.id },
    create: { name: 'Menus', path: '/admin/masters/menus', icon: 'LayoutList', parentId: mastersMenu.id },
  });

  await prisma.menu.upsert({
    where: { name: 'Permissions' },
    update: { parentId: mastersMenu.id },
    create: { name: 'Permissions', path: '/admin/masters/permissions', icon: 'Shield', parentId: mastersMenu.id },
  });

  // 3. Create Branches
  const branch1 = await prisma.branch.upsert({
    where: { code: 'BR-001' },
    update: {},
    create: { name: 'Anna Nagar Branch', code: 'BR-001', location: '123 Main St', phone: '9876543210', isActive: true },
  });

  const branch2 = await prisma.branch.upsert({
    where: { code: 'BR-002' },
    update: {},
    create: { name: 'T Nagar Branch', code: 'BR-002', location: '45 South Mada St', phone: '9876543211', isActive: true },
  });

  // 4. Create Areas
  const area1 = await prisma.area.upsert({
    where: { name: 'Anna Nagar Area' },
    update: {},
    create: { name: 'Anna Nagar Area', branchId: branch1.id, isActive: true },
  });

  const area2 = await prisma.area.upsert({
    where: { name: 'T Nagar Area' },
    update: {},
    create: { name: 'T Nagar Area', branchId: branch2.id, isActive: true },
  });

  // 5. Create Centers
  const center1 = await prisma.center.upsert({
    where: { name: 'ESWARI RAJIV GANDHI NAGAR' },
    update: {
      centerTime: '6.30AM',
      repaymentType: 'WEEKLY',
      disbursMode: 'CASH',
      areaId: area1.id,
    },
    create: { 
      name: 'ESWARI RAJIV GANDHI NAGAR', 
      code: 'CHN', 
      centerTime: '6.30AM',
      repaymentType: 'WEEKLY',
      disbursMode: 'CASH',
      areaId: area1.id,
      isActive: true 
    },
  });

  const center2 = await prisma.center.upsert({
    where: { name: 'GURUNATHAL DASARIPALAYAM' },
    update: {
      centerTime: '8.00AM',
      repaymentType: 'MONTHLY',
      disbursMode: 'BANK',
      areaId: area2.id,
    },
    create: { 
      name: 'GURUNATHAL DASARIPALAYAM', 
      code: 'MDU', 
      centerTime: '8.00AM',
      repaymentType: 'MONTHLY',
      disbursMode: 'BANK',
      areaId: area2.id,
      isActive: true 
    },
  });

  // 6. Create Super Admin Staff
  const adminStaff = await prisma.staff.upsert({
    where: { phone: '9000000000' },
    update: {},
    create: {
      name: 'Admin System',
      email: 'admin@financeos.com',
      phone: '9000000000',
      password: 'password123', // should be hashed in real app
      isActive: true,
      branchId: branch1.id,
      roleId: superAdminRole.id,
    },
  });

  // 7. Map ALL Menus to Super Admin Staff
  const allMenus = await prisma.menu.findMany();
  
  for (const menu of allMenus) {
    const existingPerm = await prisma.staffMenu.findFirst({
      where: { staffId: adminStaff.id, menuId: menu.id }
    });
    
    if (!existingPerm) {
      await prisma.staffMenu.create({
        data: { staffId: adminStaff.id, menuId: menu.id }
      });
    }
  }

  // 8. Create Loan Packages
  await prisma.loanPackage.upsert({
    where: { name: '100 Days Daily' },
    update: {},
    create: { name: '100 Days Daily', interestRate: 10, durationDays: 100, frequency: 'DAILY', isActive: true },
  });

  await prisma.loanPackage.upsert({
    where: { name: '50 Weeks Weekly' },
    update: {},
    create: { name: '50 Weeks Weekly', interestRate: 15, durationDays: 350, frequency: 'WEEKLY', isActive: true },
  });

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
