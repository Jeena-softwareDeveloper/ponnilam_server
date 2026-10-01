import 'dotenv/config';
import prisma from '../src/utils/prisma';

async function checkSat082Duplicates() {
  const loans = await prisma.loan.findMany({
    where: {
      loanNumber: { in: ['SAT-L0432', 'SAT-L0433', 'SAT-L0434', 'SAT-L0435', 'SAT-L0436', 'SAT-L0437', 'SAT-L0438'] }
    },
    include: { customer: true }
  });

  for (const loan of loans) {
    console.log(`Loan: ${loan.loanNumber} | Customer: ${loan.customer.name} (${loan.customer.customerNo}) | Status: ${loan.status} | Created: ${loan.createdAt}`);
  }
}

checkSat082Duplicates().then(() => prisma.$disconnect());
