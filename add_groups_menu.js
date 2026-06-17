const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addGroupsMenu() {
  const masters = await prisma.menu.findFirst({ where: { name: 'Masters' } });
  if (!masters) { console.log('Masters menu not found!'); process.exit(1); }

  const groupsMenu = await prisma.menu.upsert({
    where: { name: 'Groups' },
    update: { parentId: masters.id, path: '/admin/masters/groups', icon: 'LayoutList' },
    create: { name: 'Groups', path: '/admin/masters/groups', icon: 'LayoutList', parentId: masters.id }
  });
  console.log('Groups menu:', groupsMenu.name, groupsMenu.path);

  // Assign to all existing staff menus for Super Admin
  const allMenus = await prisma.menu.findMany();
  console.log('Total menus now:', allMenus.length);
  allMenus.forEach(m => console.log(' -', m.name, m.path || ''));

  process.exit(0);
}
addGroupsMenu().catch(e => { console.error(e); process.exit(1); });
