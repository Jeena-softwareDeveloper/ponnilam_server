import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const loan = await prisma.loan.findFirst({
    orderBy: { createdAt: 'desc' },
    include: { schedules: true }
  });
  if (!loan) {
    console.log('Loan not found');
    return;
  }
  console.log('Loan No:', loan.loanNumber);
  console.log('Amount:', loan.amount);
  console.log('Total Due:', loan.totalDueAmount);
  console.log('Outstanding:', loan.outstandingAmount);
  console.log('Net Disb:', loan.netDisbursement);
  const paid = loan.schedules.filter(s => s.status === 'PAID').length;
  console.log('Paid EMIs:', paid);
  console.log('Schedules:', loan.schedules.length);
}
main().finally(() => prisma.$disconnect());
