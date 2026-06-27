// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { seedDemoData } from './seed-demo-data';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');

  // 1. Create Roles
  const adminRole = await prisma.role.upsert({
    where: { name: 'Admin' },
    update: {},
    create: { name: 'Admin', isActive: true },
  });

  const staffRole = await prisma.role.upsert({
    where: { name: 'Staff' },
    update: {},
    create: { name: 'Staff', isActive: true },
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

  await prisma.menu.upsert({
    where: { name: 'Audit Logs' },
    update: {},
    create: { name: 'Audit Logs', path: '/admin/audit-logs', icon: 'Shield' },
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
    where: { name: 'Groups' },
    update: { parentId: mastersMenu.id },
    create: { name: 'Groups', path: '/admin/masters/groups', icon: 'Users', parentId: mastersMenu.id },
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

  // 3. Create Admin Staff (One Admin)
  const seedPassword = process.env.SEED_ADMIN_PASSWORD || 'password123';
  const hashedPassword = await bcrypt.hash(seedPassword, 10);
  const mustChangePassword = !process.env.SEED_ADMIN_PASSWORD;

  const adminStaff = await prisma.staff.upsert({
    where: { phone: '9000000000' },
    update: {
      password: hashedPassword,
      mustChangePassword: mustChangePassword,
    },
    create: {
      name: 'Admin System',
      username: 'admin',
      email: 'admin@financeos.com',
      phone: '9000000000',
      password: hashedPassword,
      isActive: true,
      mustChangePassword: mustChangePassword,
      branchId: null,
      roleId: adminRole.id,
    },
  });

  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log('═══════════════════════════════════════════');
    console.log('  Admin login — username: admin');
    console.log(`  Temporary password: ${seedPassword}`);
    console.log('  Change this password immediately after first login.');
    console.log('═══════════════════════════════════════════');
  }

  // 4. Map ALL Menus to Admin Staff
  const allMenus = await prisma.menu.findMany();
  
  for (const menu of allMenus) {
    const existingPerm = await prisma.staffMenu.findFirst({
      where: { staffId: adminStaff.id, menuId: menu.id }
    });
    
    if (!existingPerm) {
      await prisma.staffMenu.create({
        data: { 
          staffId: adminStaff.id, 
          menuId: menu.id, 
          canView: true, 
          canCreate: true, 
          canEdit: true, 
          canDelete: true 
        }
      });
    }
  }

  // 5. Demo data — 3 branches, 4 collection staff, 5 centers
  await seedDemoData(prisma, staffRole.id, process.env.SEED_STAFF_PASSWORD || 'password123');

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
