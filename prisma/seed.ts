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
  const dashboardMenu = await prisma.menu.upsert({
    where: { name: 'Dashboard' },
    update: {},
    create: { name: 'Dashboard', path: '/admin/dashboard', icon: 'LayoutDashboard' },
  });

  const mastersMenu = await prisma.menu.upsert({
    where: { name: 'Masters' },
    update: {},
    create: { name: 'Masters', path: '', icon: 'Database' },
  });

  const centersMenu = await prisma.menu.upsert({
    where: { name: 'Centers' },
    update: {},
    create: { name: 'Centers', path: '/admin/masters/centers', icon: 'MapPin', parentId: mastersMenu.id },
  });

  const branchesMenu = await prisma.menu.upsert({
    where: { name: 'Branches' },
    update: {},
    create: { name: 'Branches', path: '/admin/masters/branches', icon: 'Building2', parentId: mastersMenu.id },
  });

  const rolesMenu = await prisma.menu.upsert({
    where: { name: 'Roles' },
    update: {},
    create: { name: 'Roles', path: '/admin/masters/roles', icon: 'Shield', parentId: mastersMenu.id },
  });

  const staffsMenu = await prisma.menu.upsert({
    where: { name: 'Staffs' },
    update: {},
    create: { name: 'Staffs', path: '/admin/masters/staffs', icon: 'Users', parentId: mastersMenu.id },
  });

  const loanPackagesMenu = await prisma.menu.upsert({
    where: { name: 'Loan Packages' },
    update: {},
    create: { name: 'Loan Packages', path: '/admin/masters/loan-packages', icon: 'Package', parentId: mastersMenu.id },
  });

  // 3. Create Centers
  const center1 = await prisma.center.upsert({
    where: { code: 'CHN' },
    update: {
      name: 'ESWARI RAJIV GANDHI NAGAR', 
      totalMembers: 6,
      centerTime: '6.30AM',
      repaymentType: 'WEEKLY',
      disbursMode: 'CASH',
      areaLocality: 'ATHANI ROAD',
    },
    create: { 
      name: 'ESWARI RAJIV GANDHI NAGAR', 
      code: 'CHN', 
      totalMembers: 6,
      centerTime: '6.30AM',
      repaymentType: 'WEEKLY',
      disbursMode: 'CASH',
      areaLocality: 'ATHANI ROAD',
      isActive: true 
    },
  });

  const center2 = await prisma.center.upsert({
    where: { code: 'MDU' },
    update: {
      name: 'GURUNATHAL DASARIPALAYAM', 
      totalMembers: 12,
      centerTime: '8.00AM',
      repaymentType: 'MONTHLY',
      disbursMode: 'BANK',
      areaLocality: 'NORTH STREET',
    },
    create: { 
      name: 'GURUNATHAL DASARIPALAYAM', 
      code: 'MDU', 
      totalMembers: 12,
      centerTime: '8.00AM',
      repaymentType: 'MONTHLY',
      disbursMode: 'BANK',
      areaLocality: 'NORTH STREET',
      isActive: true 
    },
  });

  // 4. Create Branches
  const branch1 = await prisma.branch.upsert({
    where: { code: 'BR-001' },
    update: {},
    create: { name: 'Anna Nagar Branch', code: 'BR-001', address: '123 Main St', phone: '9876543210', isActive: true, centerId: center1.id },
  });

  const branch2 = await prisma.branch.upsert({
    where: { code: 'BR-002' },
    update: {},
    create: { name: 'T Nagar Branch', code: 'BR-002', address: '45 South Mada St', phone: '9876543211', isActive: true, centerId: center1.id },
  });

  // 5. Create Super Admin Staff
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

  // 6. Map All Menus to Super Admin Staff
  const allMenus = [dashboardMenu, mastersMenu, centersMenu, branchesMenu, rolesMenu, staffsMenu, loanPackagesMenu];
  
  for (const menu of allMenus) {
    // We use a query first because upsert with @@unique needs specific where structure, but findFirst is safer
    const existingPerm = await prisma.staffMenu.findFirst({
      where: { staffId: adminStaff.id, menuId: menu.id }
    });
    
    if (!existingPerm) {
      await prisma.staffMenu.create({
        data: { staffId: adminStaff.id, menuId: menu.id }
      });
    }
  }

  // 7. Create Loan Packages
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
