const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixDashboardMenus() {
  console.log('Fixing dashboard menus...');

  // 1. Restore Admin Dashboard menu path back to /admin/dashboard
  const adminDashMenu = await prisma.menu.upsert({
    where: { name: 'Dashboard' },
    update: { path: '/admin/dashboard', icon: 'LayoutDashboard' },
    create: { name: 'Dashboard', path: '/admin/dashboard', icon: 'LayoutDashboard' },
  });
  console.log('Admin Dashboard menu:', adminDashMenu.path);

  // 2. Create a Branch Dashboard menu with separate name
  const branchDashMenu = await prisma.menu.upsert({
    where: { name: 'Branch Dashboard' },
    update: { path: '/admin/branch-dashboard', icon: 'LayoutDashboard' },
    create: { name: 'Branch Dashboard', path: '/admin/branch-dashboard', icon: 'LayoutDashboard' },
  });
  console.log('Branch Dashboard menu:', branchDashMenu.path);

  // 3. Find Super Admin role and assign Admin Dashboard only
  const superAdminRole = await prisma.role.findFirst({ where: { name: 'Super Admin' } });
  const superAdmins = superAdminRole ? await prisma.staff.findMany({ where: { roleId: superAdminRole.id } }) : [];

  for (const admin of superAdmins) {
    // Ensure Admin Dashboard is assigned
    const hasAdminDash = await prisma.staffMenu.findFirst({ where: { staffId: admin.id, menuId: adminDashMenu.id } });
    if (!hasAdminDash) {
      await prisma.staffMenu.create({ data: { staffId: admin.id, menuId: adminDashMenu.id } });
      console.log(`Assigned Admin Dashboard to: ${admin.name}`);
    }
    // Remove Branch Dashboard if assigned (super admin doesn't need it)
    await prisma.staffMenu.deleteMany({ where: { staffId: admin.id, menuId: branchDashMenu.id } });
  }

  // 4. Find all non-super-admin staff and assign Branch Dashboard
  const allStaff = await prisma.staff.findMany({ include: { role: true } });
  const branchStaff = allStaff.filter(s => s.role?.name !== 'Super Admin');

  for (const staff of branchStaff) {
    // Remove old Admin Dashboard menu from branch staff
    await prisma.staffMenu.deleteMany({ where: { staffId: staff.id, menuId: adminDashMenu.id } });

    // Assign Branch Dashboard
    const hasBranchDash = await prisma.staffMenu.findFirst({ where: { staffId: staff.id, menuId: branchDashMenu.id } });
    if (!hasBranchDash) {
      await prisma.staffMenu.create({ data: { staffId: staff.id, menuId: branchDashMenu.id } });
    }
    console.log(`Branch staff ${staff.name}: -> Branch Dashboard`);
  }

  console.log('Done!');
  process.exit(0);
}

fixDashboardMenus().catch(e => { console.error(e); process.exit(1); });
