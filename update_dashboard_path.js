const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addBranchDashboardMenu() {
  console.log('Adding Branch Dashboard menu...');

  // Upsert Branch Dashboard menu
  const branchDashboardMenu = await prisma.menu.upsert({
    where: { name: 'Dashboard' },
    update: { path: '/admin/branch-dashboard', icon: 'LayoutDashboard' },
    create: { name: 'Dashboard', path: '/admin/branch-dashboard', icon: 'LayoutDashboard' },
  });

  console.log('Branch Dashboard menu:', branchDashboardMenu);

  // Find all staff and ensure they have this menu
  const allStaff = await prisma.staff.findMany();
  for (const staff of allStaff) {
    const has = await prisma.staffMenu.findFirst({
      where: { staffId: staff.id, menuId: branchDashboardMenu.id }
    });
    if (!has) {
      await prisma.staffMenu.create({ data: { staffId: staff.id, menuId: branchDashboardMenu.id } });
      console.log(`Assigned to staff: ${staff.name}`);
    }
  }

  console.log('Done!');
  process.exit(0);
}

addBranchDashboardMenu().catch(e => { console.error(e); process.exit(1); });
