const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const loan = await prisma.loan.findFirst({
    where: { loanNumber: 'SAT-L0360' },
    include: { customer: true, schedules: true }
  });
  console.log(JSON.stringify(loan, null, 2));
}

main().finally(() => prisma.$disconnect());
