import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const branch = await prisma.branch.findUnique({ where: { code: 'BR001' } });
  if (!branch) throw new Error('Branch BR001 not found');

  const customers = await prisma.customer.findMany({
    where: {
      area: { branchId: branch.id },
      customerNo: { startsWith: 'CUS' }
    }
  });

  const loans = await prisma.loan.findMany({
    where: {
      customer: { area: { branchId: branch.id } },
      loanNumber: { startsWith: 'LN' }
    }
  });

  console.log(`Found ${customers.length} customers with CUS... prefix in BR001`);
  console.log(`Found ${loans.length} loans with LN... prefix in BR001`);
}

main().finally(() => prisma.$disconnect());
