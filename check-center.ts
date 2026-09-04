import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const centers = await prisma.center.findMany({
    where: { name: { contains: 'SELVI' } },
    include: { area: true }
  });
  console.log(JSON.stringify(centers, null, 2));
}
main().finally(() => prisma.$disconnect());
