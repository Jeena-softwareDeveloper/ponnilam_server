import 'dotenv/config';
import prisma from '../src/utils/prisma';

async function closeOldLoans() {
  console.log('--- Closing Old Loans for SAT082 ---');

  const oldLoanNumbers = [
    'SAT-L0047',
    'SAT-L0048',
    'SAT-L0049',
    'SAT-L0050',
    'SAT-L0051'
  ];

  await prisma.loan.updateMany({
    where: {
      loanNumber: { in: oldLoanNumbers }
    },
    data: {
      status: 'CLOSED'
    }
  });

  console.log(`Successfully closed ${oldLoanNumbers.length} old loans.`);
  await prisma.$disconnect();
}

closeOldLoans().catch((err) => {
  console.error('Error:', err);
  prisma.$disconnect();
  process.exit(1);
});
