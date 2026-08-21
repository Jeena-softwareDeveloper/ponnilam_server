import { PrismaClient } from '@prisma/client';
import { processLoanCollection } from '../src/utils/collection.utils';
const prisma = new PrismaClient();

async function test() {
  const loan = await prisma.loan.findFirst({where: {loanNumber: 'SAT51-L001'}, include: {schedules: {where: {status: 'PENDING'}, orderBy: {dueDate: 'asc'}}}});
  if (!loan) return;
  console.log('Pending schedules to process:', loan.schedules.length);
  for (const sch of loan.schedules) {
    try {
      await prisma.$transaction(async (tx) => {
        const res = await processLoanCollection(tx as any, { loanId: loan.id, amount: sch.emiAmount, trnDate: sch.dueDate, isAdmin: true});
        console.log(`Processed ${sch.dueDate}: skipped=${res.skipped}`);
      });
    } catch (e: any) {
      console.log(`Error on ${sch.dueDate}:`, e.message);
    }
  }
  const after = await prisma.loan.findFirst({where: {loanNumber: 'SAT51-L001'}, include: {schedules: {orderBy: {dueDate: 'asc'}}}});
  if (after) console.log('Schedules after:', after.schedules.map(s => s.status));
}
test();
