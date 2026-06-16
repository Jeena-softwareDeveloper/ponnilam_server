const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkMenus() {
  const menus = await prisma.menu.findMany();
  console.log('ALL MENUS:', menus);
  process.exit(0);
}
checkMenus();
