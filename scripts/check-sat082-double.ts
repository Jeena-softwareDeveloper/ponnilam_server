import 'dotenv/config';
import prisma from '../src/utils/prisma';

async function checkSat082DoubleLoans() {
  const center = await prisma.center.findFirst({
    where: { code: 'SAT082' }
  });

  if (!center) {
    console.log('Center SAT082 not found!');
    return;
  }

  const loans = await prisma.loan.findMany({
    where: { customer: { centerId: center.id } },
    include: {
      customer: true
    }
  });

  console.log(`Loans for Center ${center.name}:`);
  for (const loan of loans) {
    console.log(`- ${loan.loanNumber} | ${loan.customer.name} | Status: ${loan.status} | EMI: ${loan.perDueAmount} | Dues: ${loan.noOfDues}`);
  }
}

checkSat082DoubleLoans().then(() => prisma.$disconnect());
