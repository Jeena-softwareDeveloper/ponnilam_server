const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkStaff() {
  const staff = await prisma.staff.findMany({
    include: { role: true, area: true }
  });
  console.log('Staff:', JSON.stringify(staff.map(s => ({
    id: s.id, name: s.name, role: s.role?.name, branchId: s.branchId, areaId: s.areaId
  })), null, 2));

  const staffMenus = await prisma.staffMenu.findMany({
    include: { menu: true }
  });
  console.log('\nStaff Menus:');
  staffMenus.forEach(sm => console.log(`  staffId=${sm.staffId}: ${sm.menu.name} (${sm.menu.path})`));
  
  process.exit(0);
}
checkStaff().catch(e => { console.error(e); process.exit(1); });
