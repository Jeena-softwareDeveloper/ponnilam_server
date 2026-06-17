const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function syncMenus() {
  console.log('=== Syncing all menus ===');

  // 1. Fix Permissions menu - should be under Masters
  const mastersMenu = await prisma.menu.findFirst({ where: { name: 'Masters' } });
  
  if (mastersMenu) {
    await prisma.menu.update({
      where: { name: 'Permissions' },
      data: { parentId: mastersMenu.id, path: '/admin/masters/permissions' }
    });
    console.log('Fixed: Permissions -> under Masters');
  }

  // 2. Get ALL menus
  const allMenus = await prisma.menu.findMany();
  console.log(`Total menus in DB: ${allMenus.length}`);
  allMenus.forEach(m => console.log(`  - ${m.name} (${m.path || 'no path'})`));

  // 3. Find all Super Admin staff and assign ALL menus
  const superAdminRole = await prisma.role.findFirst({ where: { name: 'Super Admin' } });
  if (superAdminRole) {
    const superAdmins = await prisma.staff.findMany({ where: { roleId: superAdminRole.id } });
    console.log(`\nFound ${superAdmins.length} Super Admin(s)`);
    
    for (const admin of superAdmins) {
      const existing = await prisma.staffMenu.findMany({ where: { staffId: admin.id } });
      const existingMenuIds = existing.map(e => e.menuId);
      
      for (const menu of allMenus) {
        // Skip Branch Dashboard for Super Admin
        if (menu.name === 'Branch Dashboard') continue;
        
        if (!existingMenuIds.includes(menu.id)) {
          await prisma.staffMenu.create({ data: { staffId: admin.id, menuId: menu.id } });
          console.log(`  Assigned: ${menu.name} -> ${admin.name}`);
        }
      }
    }
  }

  // 4. For non-super-admin staff: ensure they have Branch Dashboard
  const branchDashMenu = await prisma.menu.findFirst({ where: { name: 'Branch Dashboard' } });
  const allStaff = await prisma.staff.findMany({ include: { role: true } });
  
  for (const staff of allStaff) {
    const roleName = staff.role?.name;
    if (roleName !== 'Super Admin' && branchDashMenu) {
      const has = await prisma.staffMenu.findFirst({ where: { staffId: staff.id, menuId: branchDashMenu.id } });
      if (!has) {
        await prisma.staffMenu.create({ data: { staffId: staff.id, menuId: branchDashMenu.id } });
        console.log(`  Assigned Branch Dashboard -> ${staff.name}`);
      }
    }
  }

  console.log('\n=== Done! ===');
  
  const allStaffFinal = await prisma.staff.findMany({ include: { role: true } });
  for (const s of allStaffFinal) {
    const count = await prisma.staffMenu.count({ where: { staffId: s.id } });
    console.log(`  ${s.name} (${s.role?.name}): ${count} menus`);
  }
  
  process.exit(0);
}

syncMenus().catch(e => { console.error(e); process.exit(1); });
