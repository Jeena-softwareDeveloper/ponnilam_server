import 'dotenv/config';
import prisma from '../src/utils/prisma';

async function deleteDuplicates() {
  console.log('--- Deleting Duplicate Loans for SAT082 ---');

  const duplicateLoanNumbers = ['SAT-L0433', 'SAT-L0434'];

  for (const loanNo of duplicateLoanNumbers) {
    const loan = await prisma.loan.findUnique({
      where: { loanNumber: loanNo },
      include: { customer: true }
    });

    if (loan) {
      console.log(`Deleting Duplicate Loan: ${loanNo} (Customer: ${loan.customer.name})`);
      
      // Delete schedules first (if cascading is not fully set up)
      await prisma.loanSchedule.deleteMany({
        where: { loanId: loan.id }
      });

      // Delete the loan
      await prisma.loan.delete({
        where: { id: loan.id }
      });
      console.log(`✅ Deleted ${loanNo}.`);
    }
  }

  console.log(`\nFinished deleting duplicates.`);
  await prisma.$disconnect();
}

deleteDuplicates().catch((err) => {
  console.error('Error:', err);
  prisma.$disconnect();
  process.exit(1);
});
