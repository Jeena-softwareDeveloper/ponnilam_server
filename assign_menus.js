const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function assignMenus() {
  console.log('=== Assigning menus to all staff ===');

  const allMenus = await prisma.menu.findMany();
  console.log(`Total menus: ${allMenus.length}`);

  const dashboardMenu = allMenus.find(m => m.name === 'Dashboard');
  const branchDashMenu = allMenus.find(m => m.name === 'Branch Dashboard');
  
  // Menus for branch staff (non-admin)
  const branchStaffMenuNames = ['Branch Dashboard', 'Customers', 'Loans', 'Collections', 'Reports'];
  const branchStaffMenus = allMenus.filter(m => branchStaffMenuNames.includes(m.name));

  const allStaff = await prisma.staff.findMany({ include: { role: true } });
  console.log(`Total staff: ${allStaff.length}`);

  for (const staff of allStaff) {
    const roleName = staff.role?.name;
    console.log(`\nProcessing: ${staff.name} (${roleName})`);

    // Clear existing menus and reassign cleanly
    await prisma.staffMenu.deleteMany({ where: { staffId: staff.id } });

    if (roleName === 'Super Admin') {
      // Super admin gets ALL menus except Branch Dashboard
      const adminMenus = allMenus.filter(m => m.name !== 'Branch Dashboard');
      for (const menu of adminMenus) {
        await prisma.staffMenu.create({ data: { staffId: staff.id, menuId: menu.id } });
        console.log(`  + ${menu.name}`);
      }
    } else {
      // Branch staff gets: Branch Dashboard + Customers + Loans + Collections + Reports
      for (const menu of branchStaffMenus) {
        await prisma.staffMenu.create({ data: { staffId: staff.id, menuId: menu.id } });
        console.log(`  + ${menu.name}`);
      }
    }
  }

  console.log('\n=== Done! ===');
  process.exit(0);
}

assignMenus().catch(e => { console.error(e); process.exit(1); });
