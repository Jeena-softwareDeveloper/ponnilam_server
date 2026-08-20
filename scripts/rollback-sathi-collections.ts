import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function rollbackSathiCollections() {
  console.log("Rolling back Sathi collections...");

  const collections = await prisma.collection.findMany({
    where: { remarks: 'System Auto-Collection for Sathi Overdues' }
  });

  console.log(`Found ${collections.length} collections to rollback.`);

  for (const coll of collections) {
    try {
      await prisma.$transaction(async (tx) => {
        // Delete Customer Ledger
        await tx.customerLedger.deleteMany({
          where: { remarks: { contains: coll.trnNumber } }
        });
        
        // Delete Loan Ledger
        await tx.loanLedger.deleteMany({
          where: { remarks: { contains: coll.trnNumber } }
        });

        // Get schedules that were paid in this collection
        const paidSchedules = await tx.loanSchedule.findMany({
          where: { 
            loanId: coll.loanId,
            paidDate: { gte: new Date(new Date().setHours(0,0,0,0)) }
          }
        });

        // Revert schedules
        await tx.loanSchedule.updateMany({
          where: { 
            loanId: coll.loanId,
            paidDate: { gte: new Date(new Date().setHours(0,0,0,0)) }
          },
          data: {
            status: 'PENDING',
            amountPaid: 0,
            paidDate: null
          }
        });

        // Delete collection
        await tx.collection.delete({
          where: { id: coll.id }
        });

        // Restore loan outstanding amount
        // But we don't know exactly what it was without recalculating.
        // Easiest way: re-calculate outstanding from schedules.
        // Wait, totalDueAmount - sum(amountPaid).
      });
      console.log(`Rolled back collection ${coll.trnNumber} for loan ${coll.loanId}`);
    } catch (e: any) {
      console.error(`Error rolling back ${coll.trnNumber}:`, e.message);
    }
  }

  // After rollback, correct outstandingAmount for all Sathi loans
  const loans = await prisma.loan.findMany({ where: { loanNumber: { startsWith: 'SAT' } }, include: { schedules: true } });
  for (const loan of loans) {
    const totalPaid = loan.schedules.reduce((sum, s) => sum + (s.amountPaid || 0), 0);
    const outstanding = loan.totalDueAmount - totalPaid;
    await prisma.loan.update({
      where: { id: loan.id },
      data: { outstandingAmount: outstanding }
    });
  }

  console.log("Rollback Complete.");
}

rollbackSathiCollections()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
