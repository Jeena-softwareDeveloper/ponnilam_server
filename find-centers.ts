import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const allCenters = await prisma.center.findMany({
    select: { id: true, name: true, code: true, shortCode: true }
  });
  console.log(`Total centers found: ${allCenters.length}`);
  for (const c of allCenters) {
    console.log(`${c.code} | ${c.shortCode} | ${c.name}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
