import { PrismaClient } from '@prisma/client';
import { processLoanCollection } from '../src/utils/collection.utils';

const prisma = new PrismaClient();

async function markPaidOnDueDate() {
  console.log("Starting script to mark Sathi overdue EMIs as PAID on their exact Due Dates...");
  
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  // Get all active loans for Sathiyamangalam
  const sathiLoans = await prisma.loan.findMany({
    where: {
      customer: {
        center: {
          area: {
            branch: {
              name: 'Sathiyamangalam'
            }
          }
        }
      },
      status: 'ACTIVE'
    },
    include: {
      schedules: {
        where: {
          status: { in: ['PENDING', 'PARTIAL'] },
          dueDate: { lte: today }
        },
        orderBy: { dueDate: 'asc' }
      }
    }
  });

  console.log(`Found ${sathiLoans.length} active loans in Sathi branch with pending EMIs.`);
  let schedulesProcessed = 0;
  let totalAmountCollected = 0;

  for (const loan of sathiLoans) {
    if (loan.schedules.length === 0) continue;

    console.log(`Processing Loan ${loan.loanNumber} - ${loan.schedules.length} pending schedules`);
    
    for (const sch of loan.schedules) {
      const overdueAmount = sch.emiAmount - sch.amountPaid;
      
      if (overdueAmount > 0) {
        try {
          await prisma.$transaction(async (tx) => {
            await processLoanCollection(tx as any, {
              loanId: loan.id,
              amount: overdueAmount,
              trnDate: sch.dueDate, // Use exact due date!
              staffId: loan.staffId,
              remarks: `System Auto-Collection on Due Date`,
              isAdmin: true,
            });
          });
          
          schedulesProcessed++;
          totalAmountCollected += overdueAmount;
          console.log(`  - Collected ₹${overdueAmount} for Due Date: ${sch.dueDate.toISOString().slice(0, 10)}`);
        } catch (err: any) {
          console.error(`  - Error processing schedule for loan ${loan.loanNumber} on ${sch.dueDate}:`, err.message);
        }
      }
    }
  }

  console.log("\n==================================");
  console.log(`Script finished successfully!`);
  console.log(`Schedules Processed: ${schedulesProcessed}`);
  console.log(`Total Amount Collected: ₹${totalAmountCollected}`);
  console.log("==================================");
}

markPaidOnDueDate()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
