import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Find all ACTIVE/APPROVED loans - check for pre-close stuck ones
  const loans = await prisma.loan.findMany({
    where: { status: { in: ['ACTIVE', 'APPROVED', 'CLOSED'] } },
    include: { schedules: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  console.log('Total loans checked:', loans.length);
  for (const loan of loans) {
    const unpaid = loan.schedules.filter(s => s.status === 'PENDING' || s.status === 'PARTIAL');
    const unpaidSum = unpaid.reduce((a, s) => a + (s.emiAmount - (s.amountPaid || 0)), 0);
    const adv = loan.advanceBalance || 0;
    console.log(
      loan.loanNumber,
      loan.status,
      'outstanding:', loan.outstandingAmount,
      'advance:', adv,
      'unpaidSchedSum:', unpaidSum,
      'unpaidCount:', unpaid.length
    );
  }
}
main().finally(() => prisma.$disconnect());
