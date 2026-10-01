import 'dotenv/config';
import prisma from '../src/utils/prisma';
async function main() {
  const loans = await prisma.loan.findMany({
    where: { advanceBalance: { gt: 0 } },
    include: { customer: { include: { center: true } } },
    orderBy: { loanNumber: 'asc' }
  });
  loans.forEach((l) => {
    const centerName = l.customer?.center?.name ?? 'N/A';
    const centerCode = l.customer?.center?.code ?? 'N/A';
    console.log(l.loanNumber + '  adv=' + l.advanceBalance + '  center=' + centerName + '  code=' + centerCode);
  });
  console.log('Total:', loans.length);
}
main().then(() => prisma.$disconnect());

