import { PrismaClient } from '@prisma/client';
import { processLoanCollection } from '../src/utils/collection.utils';

const prisma = new PrismaClient();

async function clearSathiOverdues() {
  console.log("Starting script to clear overdues for Sathi branch...");
  
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  // Get all active loans for Sathiyamangalam
  const sathiLoans = await prisma.loan.findMany({
    where: {
      loanNumber: { startsWith: 'SAT' },
      status: 'ACTIVE'
    },
    include: {
      schedules: {
        where: {
          status: { in: ['PENDING', 'PARTIAL'] },
          dueDate: { lte: today }
        }
      }
    }
  });

  console.log(`Found ${sathiLoans.length} active loans in Sathi branch.`);
  let loansProcessed = 0;
  let totalAmountCollected = 0;

  for (const loan of sathiLoans) {
    if (loan.schedules.length === 0) continue;

    const overdueAmount = loan.schedules.reduce((sum, sch) => sum + (sch.emiAmount - sch.amountPaid), 0);
    
    if (overdueAmount > 0) {
      try {
        await prisma.$transaction(async (tx) => {
          await processLoanCollection(tx as any, {
            loanId: loan.id,
            amount: overdueAmount,
            trnDate: new Date(),
            staffId: loan.staffId, // Use the loan's assigned staff
            remarks: 'System Auto-Collection for Sathi Overdues',
            isAdmin: true,
          });
        });
        
        loansProcessed++;
        totalAmountCollected += overdueAmount;
        console.log(`Loan ${loan.loanNumber} - Collected ₹${overdueAmount} for ${loan.schedules.length} schedules`);
      } catch (err: any) {
        console.error(`Error processing loan ${loan.loanNumber}:`, err.message);
      }
    }
  }

  console.log("\n==================================");
  console.log(`Script finished successfully!`);
  console.log(`Loans Processed: ${loansProcessed}`);
  console.log(`Total Amount Collected: ₹${totalAmountCollected}`);
  console.log("==================================");
}

clearSathiOverdues()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
