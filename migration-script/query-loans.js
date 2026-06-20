const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const loans = await prisma.loan.findMany({
    include: {
      customer: { include: { center: true, area: { include: { branch: true } } } },
      package: true,
      staff: true
    },
    take: 5
  });
  console.log(JSON.stringify(loans, null, 2));
}
run().finally(() => prisma.$disconnect());
