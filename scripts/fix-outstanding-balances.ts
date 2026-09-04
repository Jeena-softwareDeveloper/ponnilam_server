import 'dotenv/config';
import prisma from '../src/utils/prisma';

async function fixOutstandingBalances() {
  console.log('--- Starting Outstanding Balance Fix ---');

  const loans = await prisma.loan.findMany({
    where: {
      status: { in: ['ACTIVE', 'APPROVED'] }
    },
    include: {
      schedules: true,
      collections: { where: { isVoided: false } }
    }
  });

  console.log(`Found ${loans.length} active/approved loans. Checking...`);

  let fixedCount = 0;

  for (const loan of loans) {
    if (loan.schedules.length === 0) continue;

    const realOutstanding = Math.max(0, loan.schedules.reduce((sum, s) => sum + Math.max(0, s.emiAmount - (s.amountPaid || 0)), 0) - (loan.advanceBalance || 0));

    if (loan.outstandingAmount !== realOutstanding) {
      console.log(`\n⚠️ Anomaly detected in Loan: ${loan.loanNumber}`);
      console.log(`  - DB Outstanding: ${loan.outstandingAmount}`);
      console.log(`  - Real Outstanding (computed from schedules): ${realOutstanding}`);
      
      await prisma.loan.update({
        where: { id: loan.id },
        data: { outstandingAmount: realOutstanding }
      });

      console.log(`  ✅ Fixed ${loan.loanNumber}.`);
      fixedCount++;
    }
  }

  console.log(`\n--- Finished! Successfully fixed ${fixedCount} buggy loan(s) ---`);
  await prisma.$disconnect();
}

fixOutstandingBalances().catch((err) => {
  console.error('Error:', err);
  prisma.$disconnect();
  process.exit(1);
});
