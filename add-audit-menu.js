const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const menu = await prisma.menu.upsert({
    where: { name: 'Audit Logs' },
    update: {},
    create: {
      name: 'Audit Logs',
      path: '/admin/audit-logs',
      icon: 'Shield',
      parentId: null
    }
  });
  console.log('Menu created/found:', menu.name, menu.id);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
