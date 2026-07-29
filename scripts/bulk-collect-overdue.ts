import { PrismaClient } from '@prisma/client';
import { processLoanCollection } from '../src/utils/collection.utils';

const prisma = new PrismaClient();

async function main() {
  const branchCode = process.argv[2] || 'BR002'; // Default to ANTHIYUR branch
  const staffUsername = process.argv[3] || 'admin'; // Using admin staff for the collection entry
  const collectionDateInput = process.argv[4]; // Optional: Date of collection, defaults to today

  console.log(`Starting bulk collection for Branch: ${branchCode}`);

  const branch = await prisma.branch.findUnique({
    where: { code: branchCode },
  });

  if (!branch) {
    console.error(`Branch with code ${branchCode} not found.`);
    process.exit(1);
  }

  const staff = await prisma.staff.findUnique({
    where: { username: staffUsername },
  });

  if (!staff) {
    console.error(`Staff with username ${staffUsername} not found.`);
    process.exit(1);
  }

  const today = collectionDateInput ? new Date(collectionDateInput) : new Date();
  today.setHours(23, 59, 59, 999); // Normalize to end of day to include all schedules due today

  // Find all ACTIVE loans in this branch
  const activeLoans = await prisma.loan.findMany({
    where: {
      status: 'ACTIVE',
      customer: {
        area: {
          branchId: branch.id,
        },
      },
    },
    include: {
      schedules: {
        where: {
          dueDate: {
            lte: today, // Overdue or due today
          },
          status: {
            in: ['PENDING', 'PARTIAL'],
          },
        },
        orderBy: {
          dueDate: 'asc',
        },
      },
    },
  });

  console.log(`Found ${activeLoans.length} active loans in branch ${branch.name}.`);

  let totalProcessed = 0;
  let totalAmountCollected = 0;

  for (const loan of activeLoans) {
    if (loan.schedules.length === 0) continue;

    // Calculate total overdue amount for this loan
    const totalOverdue = loan.schedules.reduce((sum, sch) => sum + (sch.emiAmount - sch.amountPaid), 0);
    
    if (totalOverdue <= 0) continue;

    console.log(`Processing Loan ${loan.loanNumber} - Overdue Amount: ₹${totalOverdue}`);

    try {
      await prisma.$transaction(async (tx) => {
        await processLoanCollection(tx, {
          loanId: loan.id,
          amount: totalOverdue,
          trnDate: today,
          staffId: staff.id,
          remarks: 'Bulk automated collection for overdue',
          isAdmin: true, // Bypass branch checks since this is an admin script
        });
      }, { timeout: 15000 });

      totalProcessed++;
      totalAmountCollected += totalOverdue;
      console.log(`✅ Successfully collected ₹${totalOverdue} for Loan ${loan.loanNumber}`);
    } catch (error: any) {
      console.error(`❌ Failed to collect for Loan ${loan.loanNumber}: ${error.message}`);
    }
  }

  console.log('---------------------------------------------------');
  console.log('Bulk Collection Summary:');
  console.log(`Total Loans Processed: ${totalProcessed}`);
  console.log(`Total Amount Collected: ₹${totalAmountCollected}`);
  console.log('---------------------------------------------------');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
