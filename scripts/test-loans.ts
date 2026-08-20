import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function test() {
  const loans = await prisma.loan.findMany({ where: { status: 'ACTIVE' }, include: { customer: { include: { center: true } } } });
  console.log('Total ACTIVE loans:', loans.length);
  const sathiLoans = loans.filter(l => l.loanNumber.startsWith('SAT'));
  console.log('Total ACTIVE SAT- loans:', sathiLoans.length);
  const otherLoans = loans.filter(l => !l.loanNumber.startsWith('SAT'));
  console.log('Total ACTIVE non-SAT loans:', otherLoans.length);
  if (otherLoans.length > 0) {
    console.log('Sample non-SAT loan:', otherLoans[0].loanNumber, otherLoans[0].customer?.center?.name);
  }
}
test().finally(() => prisma.$disconnect());
