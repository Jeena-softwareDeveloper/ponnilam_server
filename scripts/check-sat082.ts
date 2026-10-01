import 'dotenv/config';
import prisma from '../src/utils/prisma';

async function checkSat082() {
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

      
      customer: true,
      schedules: {
        take: 1
      }
    }
  });

  for (const loan of loans) {
    console.log(`Loan: ${loan.loanNumber}, Customer: ${loan.customer.name}, perDueAmount: ${loan.perDueAmount}, schedule EMI: ${loan.schedules[0]?.emiAmount}`);
  }
}

checkSat082().then(() => prisma.$disconnect());
