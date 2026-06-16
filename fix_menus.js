const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixMenus() {
  console.log('Ensuring all menus exist...');

  // Upsert all menus
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

  const statesMenu = await prisma.menu.upsert({
    where: { name: 'States' },
    update: {},
    create: { name: 'States', path: '/admin/masters/states', icon: 'MapPin', parentId: mastersMenu.id },
  });

  const districtsMenu = await prisma.menu.upsert({
    where: { name: 'Districts' },
    update: {},
    create: { name: 'Districts', path: '/admin/masters/districts', icon: 'MapPin', parentId: mastersMenu.id },
  });

  const centersMenu = await prisma.menu.upsert({
    where: { name: 'Centers' },
    update: { parentId: mastersMenu.id },
    create: { name: 'Centers', path: '/admin/masters/centers', icon: 'MapPin', parentId: mastersMenu.id },
  });

  const branchesMenu = await prisma.menu.upsert({
    where: { name: 'Branches' },
    update: { parentId: mastersMenu.id },
    create: { name: 'Branches', path: '/admin/masters/branches', icon: 'Building2', parentId: mastersMenu.id },
  });

  const rolesMenu = await prisma.menu.upsert({
    where: { name: 'Roles' },
    update: { parentId: mastersMenu.id },
    create: { name: 'Roles', path: '/admin/masters/roles', icon: 'Shield', parentId: mastersMenu.id },
  });

  const staffsMenu = await prisma.menu.upsert({
    where: { name: 'Staffs' },
    update: { parentId: mastersMenu.id },
    create: { name: 'Staffs', path: '/admin/masters/staffs', icon: 'Users', parentId: mastersMenu.id },
  });

  const loanPackagesMenu = await prisma.menu.upsert({
    where: { name: 'Loan Packages' },
    update: { parentId: mastersMenu.id },
    create: { name: 'Loan Packages', path: '/admin/masters/loan-packages', icon: 'Package', parentId: mastersMenu.id },
  });

  const customersMenu = await prisma.menu.upsert({
    where: { name: 'Customers' },
    update: {},
    create: { name: 'Customers', path: '/admin/customers', icon: 'Users' },
  });

  const loansMenu = await prisma.menu.upsert({
    where: { name: 'Loans' },
    update: {},
    create: { name: 'Loans', path: '/admin/loans', icon: 'Banknote' },
  });

  const collectionsMenu = await prisma.menu.upsert({
    where: { name: 'Collections' },
    update: {},
    create: { name: 'Collections', path: '/admin/collections', icon: 'Wallet' },
  });

  const reportsMenu = await prisma.menu.upsert({
    where: { name: 'Reports' },
    update: {},
    create: { name: 'Reports', path: '/admin/reports', icon: 'PieChart' },
  });

  const permissionsMenu = await prisma.menu.upsert({
    where: { name: 'Permissions' },
    update: {},
    create: { name: 'Permissions', path: '/admin/masters/permissions', icon: 'Shield' },
  });

  const allMenus = [
    dashboardMenu, mastersMenu, statesMenu, districtsMenu, centersMenu,
    branchesMenu, rolesMenu, staffsMenu, loanPackagesMenu,
    customersMenu, loansMenu, collectionsMenu, reportsMenu, permissionsMenu
  ];

  console.log(`Total menus: ${allMenus.length}`);

  // Find all staff and assign Dashboard to everyone who doesn't have it
  const allStaff = await prisma.staff.findMany();
  console.log(`Found ${allStaff.length} staff members`);

  for (const staff of allStaff) {
    // Check if they have Dashboard
    const hasDashboard = await prisma.staffMenu.findFirst({
      where: { staffId: staff.id, menuId: dashboardMenu.id }
    });
    if (!hasDashboard) {
      await prisma.staffMenu.create({
        data: { staffId: staff.id, menuId: dashboardMenu.id }
      });
      console.log(`  -> Assigned Dashboard to staff: ${staff.name}`);
    }
  }

  // Find Super Admin staff and assign ALL menus
  const superAdminRole = await prisma.role.findFirst({ where: { name: 'Super Admin' } });
  if (superAdminRole) {
    const superAdmins = await prisma.staff.findMany({ where: { roleId: superAdminRole.id } });
    for (const admin of superAdmins) {
      for (const menu of allMenus) {
        const exists = await prisma.staffMenu.findFirst({
          where: { staffId: admin.id, menuId: menu.id }
        });
        if (!exists) {
          await prisma.staffMenu.create({ data: { staffId: admin.id, menuId: menu.id } });
          console.log(`  -> Assigned ${menu.name} to Super Admin: ${admin.name}`);
        }
      }
    }
  }

  // Also assign to BranchMenus for all branches
  const branches = await prisma.branch.findMany();
  for (const branch of branches) {
    const hasDashboard = await prisma.branchMenu.findFirst({
      where: { branchId: branch.id, menuId: dashboardMenu.id }
    });
    if (!hasDashboard) {
      await prisma.branchMenu.create({
        data: { branchId: branch.id, menuId: dashboardMenu.id }
      });
      console.log(`  -> Assigned Dashboard BranchMenu to branch: ${branch.name}`);
    }
  }

  console.log('Done!');
  process.exit(0);
}

fixMenus().catch(e => { console.error(e); process.exit(1); });
