import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const roles = await prisma.role.findMany();
  console.log('--- ROLES ---');
  console.table(roles);

  const staffs = await prisma.staff.findMany({
    include: { role: true }
  });
  console.log('--- STAFFS ---');
  console.table(staffs.map(s => ({
    name: s.name,
    username: s.username,
    role: s.role?.name
  })));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
