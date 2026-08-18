import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Menus...');

  // Level 1 Menus
  const dashboard = await prisma.menu.upsert({
    where: { name: 'Dashboard' },
    update: { path: '/admin/dashboard', icon: 'LayoutDashboard' },
    create: { name: 'Dashboard', path: '/admin/dashboard', icon: 'LayoutDashboard' },
  });

  const branchDashboard = await prisma.menu.upsert({
    where: { name: 'Branch Dashboard' },
    update: { path: '/admin/branch-dashboard', icon: 'Building2' },
    create: { name: 'Branch Dashboard', path: '/admin/branch-dashboard', icon: 'Building2' },
  });

  const customers = await prisma.menu.upsert({
    where: { name: 'Customers' },
    update: { path: '/admin/customers', icon: 'Users' },
    create: { name: 'Customers', path: '/admin/customers', icon: 'Users' },
  });

  const loans = await prisma.menu.upsert({
    where: { name: 'Loans' },
    update: { path: '/admin/loans', icon: 'Banknote' },
    create: { name: 'Loans', path: '/admin/loans', icon: 'Banknote' },
  });

  const collections = await prisma.menu.upsert({
    where: { name: 'Collections' },
    update: { path: '/admin/collections', icon: 'Wallet' },
    create: { name: 'Collections', path: '/admin/collections', icon: 'Wallet' },
  });
  
  const reports = await prisma.menu.upsert({
    where: { name: 'Reports' },
    update: { path: '/admin/reports', icon: 'PieChart' },
    create: { name: 'Reports', path: '/admin/reports', icon: 'PieChart' },
  });

  const activities = await prisma.menu.upsert({
    where: { name: 'Activities' },
    update: { path: '/admin/activities', icon: 'Image' },
    create: { name: 'Activities', path: '/admin/activities', icon: 'Image' },
  });

  // Masters Parent
  const masters = await prisma.menu.upsert({
    where: { name: 'Masters' },
    update: { path: '/admin/masters', icon: 'Database' },
    create: { name: 'Masters', path: '/admin/masters', icon: 'Database' },
  });

  // Masters Children
  const masterMenus = [
    { name: 'State', path: '/admin/masters/state' },
    { name: 'District', path: '/admin/masters/district' },
    { name: 'Branch', path: '/admin/masters/branch' },
    { name: 'Areas', path: '/admin/masters/areas' },
    { name: 'Centers', path: '/admin/masters/centers' },
    { name: 'Staff', path: '/admin/masters/staff' },
    { name: 'Roles', path: '/admin/masters/roles' },
    { name: 'Loan Packages', path: '/admin/masters/loan-packages' },
  ];

  for (const m of masterMenus) {
    await prisma.menu.upsert({
      where: { name: m.name },
      update: { path: m.path, parentId: masters.id },
      create: { name: m.name, path: m.path, parentId: masters.id },
    });
  }

  // System
  const settings = await prisma.menu.upsert({
    where: { name: 'Settings' },
    update: { path: '/admin/settings', icon: 'Settings' },
    create: { name: 'Settings', path: '/admin/settings', icon: 'Settings' },
  });

  const auditLogs = await prisma.menu.upsert({
    where: { name: 'Audit Logs' },
    update: { path: '/admin/audit-logs', icon: 'Shield' },
    create: { name: 'Audit Logs', path: '/admin/audit-logs', icon: 'Shield' },
  });

  console.log('✅ Menus seeded successfully!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
