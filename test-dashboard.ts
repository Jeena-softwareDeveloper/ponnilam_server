import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Testing Dashboard Queries...');
  console.time('Queries');
  
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    customersTotal,
    activeLoansTotal,
    outstandingTotal,
    overdueCount
  ] = await Promise.all([
    prisma.customer.count(),
    prisma.loan.count({ where: { status: { in: ['ACTIVE', 'PENDING'] } } }),
    prisma.loan.aggregate({ _sum: { outstandingAmount: true } }),
    prisma.loanSchedule.groupBy({
      by: ['loanId'],
      where: { status: { in: ['PENDING', 'PARTIAL'] } },
      _count: { loanId: true }
    })
  ]);

  console.timeEnd('Queries');
  console.log('Customers:', customersTotal);
  console.log('Active Loans:', activeLoansTotal);
  console.log('Outstanding:', outstandingTotal._sum.outstandingAmount);
  console.log('Overdue Loans:', overdueCount.length);

}

main().catch(console.error).finally(() => prisma.$disconnect());
