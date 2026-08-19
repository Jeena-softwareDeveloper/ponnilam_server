import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Starting Sathyamangalam Loan Re-sequencing Script...");

  // Fetch all loans for Sathyamangalam branch (starting with SAT-L or SAT-LO)
  const satLoans = await prisma.loan.findMany({
    where: {
      loanNumber: { startsWith: 'SAT' }
    },
    orderBy: {
      createdAt: 'asc' // Sort chronologically to maintain proper sequence based on creation time
    }
  });

  const loansToUpdate = satLoans.filter(l => 
    l.loanNumber.startsWith('SAT-L') || l.loanNumber.startsWith('SAT-LO')
  );

  if (loansToUpdate.length === 0) {
    console.log("No loans found for Sathyamangalam branch with prefix SAT-L or SAT-LO.");
    return;
  }

  console.log(`Found ${loansToUpdate.length} loans. Re-sequencing them chronologically...`);

  await prisma.$transaction(async (tx) => {
    let currentNumber = 1;

    // Pass 1: Rename all to a temporary prefix to avoid Unique Constraint errors
    console.log("Pass 1: Freeing up the loan numbers namespace...");
    for (const loan of loansToUpdate) {
      await tx.loan.update({
        where: { id: loan.id },
        data: { loanNumber: `TEMP-${loan.id}` }
      });
    }

    // Pass 2: Assign proper sequential numbers chronologically
    console.log("Pass 2: Assigning correct sequential numbers...");
    for (const loan of loansToUpdate) {
      const newLoanNumber = `SAT-L${currentNumber.toString().padStart(4, '0')}`;
      
      // Only update if it's different from original
      if (loan.loanNumber !== newLoanNumber) {
        console.log(`Updating Loan ID: ${loan.id} from ${loan.loanNumber} -> ${newLoanNumber}`);
        await tx.loan.update({
          where: { id: loan.id },
          data: { loanNumber: newLoanNumber }
        });

        // Optional: Update ledgers if they contain the old loan number in remarks
        await tx.loanLedger.updateMany({
          where: { loanId: loan.id, remarks: { contains: loan.loanNumber } },
          data: {
            remarks: `Loan ${newLoanNumber} approved`
          }
        });

        await tx.customerLedger.updateMany({
          where: { customerId: loan.customerId, remarks: { contains: loan.loanNumber } },
          data: {
            remarks: `Loan ${newLoanNumber} disbursement`
          }
        });
      }

      currentNumber++;
    }

    // Update the Sequence table so future loans start from the new max number
    const finalMaxNumber = currentNumber - 1;
    const sequenceKey = 'LOAN:SAT-';
    console.log(`Updating sequence ${sequenceKey} to ${finalMaxNumber}`);
    await tx.sequence.upsert({
      where: { id: sequenceKey },
      create: { id: sequenceKey, value: finalMaxNumber },
      update: { value: finalMaxNumber },
    });
  });

  console.log("Re-sequencing completed successfully! 🎉");
}

main()
  .catch((e) => {
    console.error("Error running script:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
