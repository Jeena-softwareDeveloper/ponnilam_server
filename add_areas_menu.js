const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addAreasMenu() {
  console.log('=== Adding Areas Menu ===');

  const mastersMenu = await prisma.menu.findFirst({ where: { name: 'Masters' } });
  
  if (!mastersMenu) {
    console.error('Masters menu not found!');
    process.exit(1);
  }

  let areasMenu = await prisma.menu.findFirst({ where: { name: 'Areas' } });
  
  if (!areasMenu) {
    areasMenu = await prisma.menu.create({
      data: {
        name: 'Areas',
        path: '/admin/masters/areas',
        parentId: mastersMenu.id
      }
    });
    console.log('Created Areas menu:', areasMenu.id);
  } else {
    console.log('Areas menu already exists:', areasMenu.id);
  }

  // Assign to Super Admin
  const superAdminRole = await prisma.role.findFirst({ where: { name: 'Super Admin' } });
  if (superAdminRole) {
    const superAdmins = await prisma.staff.findMany({ where: { roleId: superAdminRole.id } });
    
    for (const admin of superAdmins) {
      const existing = await prisma.staffMenu.findFirst({ 
        where: { staffId: admin.id, menuId: areasMenu.id } 
      });
      
      if (!existing) {
        await prisma.staffMenu.create({ 
          data: { staffId: admin.id, menuId: areasMenu.id } 
        });
        console.log(`Assigned Areas menu to Super Admin: ${admin.name}`);
      }
    }
  }

  console.log('=== Done! ===');
  process.exit(0);
}

addAreasMenu().catch(e => { console.error(e); process.exit(1); });
