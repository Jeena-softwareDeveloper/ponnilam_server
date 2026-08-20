import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { buildScheduleRows, resolveLastEmiAmount } from '../src/utils/loan.utils';
import { nextTrnNumber } from '../src/utils/sequence.utils';

const prisma = new PrismaClient();

async function main() {
  console.log("Starting Sathyamangalam Loan Sync...");

  // 1. Read seed file
  const seedPath = path.join(__dirname, 'seed/09-LoanSeed.ts');
  const seedContent = fs.readFileSync(seedPath, 'utf8');
  
  // Extract LOANS array string
  const match = seedContent.match(/const LOANS = (\[[\s\S]*?\]);\n/);
  if (!match) throw new Error('Could not find LOANS array in 09-LoanSeed.ts');
  
  let loansDataStr = match[1];
  // Strip trailing commas from objects to ensure eval parses correctly in strict contexts if needed
  // Using eval to safely evaluate the JS object array
  const LOANS = eval(loansDataStr);

  console.log(`Extracted ${LOANS.length} loans from seed.`);

  let updatedCount = 0;
  let skippedCount = 0;

  const dbLoans = await prisma.loan.findMany({
    where: { loanNumber: { startsWith: 'SAT' }, status: { in: ['ACTIVE', 'CLOSED'] } },
    include: { package: true, customer: true },
    orderBy: { createdAt: 'asc' }
  });

  console.log(`Found ${dbLoans.length} Sathi loans in DB.`);
  if (dbLoans.length !== LOANS.length) {
    console.warn(`Mismatch: ${dbLoans.length} DB loans vs ${LOANS.length} seed loans. Proceeding sequentially anyway up to the minimum.`);
  }

  // Process sequentially by mapping index
  for (let i = 0; i < Math.min(dbLoans.length, LOANS.length); i++) {
    const loanData = LOANS[i];
    const dbLoan = dbLoans[i];
    const customer = dbLoan.customer;

    try {
      await prisma.$transaction(async (tx) => {

        // Calculate dates
        const disbursementDate = loanData.disbursementDate ? new Date(loanData.disbursementDate) : null;
        if (!disbursementDate) {
          console.warn(`No disbursement date for ${dbLoan.loanNumber}, skipping.`);
          skippedCount++;
          return;
        }

        // Sathi loans are weekly (Chit based). So first due date is +7 days.
        const firstDueDate = new Date(disbursementDate.getTime());
        firstDueDate.setDate(firstDueDate.getDate() + 7);

        // Update Loan dates
        await tx.loan.update({
          where: { id: dbLoan.id },
          data: {
            sanctionDate: disbursementDate,
            disbursementDate: disbursementDate,
            firstDueDate: firstDueDate
          }
        });

        // Delete existing schedules to regenerate
        await tx.loanSchedule.deleteMany({
          where: { loanId: dbLoan.id }
        });

        // Rebuild schedules
        const lastEmiAmount = resolveLastEmiAmount(dbLoan.totalDueAmount, dbLoan.perDueAmount, dbLoan.noOfDues);
        const scheduleRows = buildScheduleRows(
          dbLoan.id,
          dbLoan.noOfDues,
          dbLoan.perDueAmount,
          firstDueDate,
          dbLoan.package.frequency, // 'WEEKLY'
          lastEmiAmount
        );

        // Calculate paid EMIs based on outstandingAmount
        const outstandingAmount = loanData.outstandingAmount || 0;
        const totalDueAmount = dbLoan.totalDueAmount;
        const amountPaid = totalDueAmount - outstandingAmount;

        let remainingPaid = amountPaid;
        const finalSchedules = scheduleRows.map(sch => {
          if (remainingPaid >= sch.emiAmount) {
            remainingPaid -= sch.emiAmount;
            return {
              ...sch,
              status: 'PAID' as any,
              amountPaid: sch.emiAmount,
              paidDate: new Date() // Fallback, would ideally be exact date
            };
          } else if (remainingPaid > 0) {
            const partial = remainingPaid;
            remainingPaid = 0;
            return {
              ...sch,
              status: 'PARTIAL' as any,
              amountPaid: partial,
              paidDate: new Date()
            };
          }
          return sch;
        });

        await tx.loanSchedule.createMany({
          data: finalSchedules
        });

        // Insert Collection if amountPaid > 0 and no collections exist
        const existingCollections = await tx.collection.count({
          where: { loanId: dbLoan.id }
        });

        if (amountPaid > 0 && existingCollections === 0) {
          const trnNumber = await nextTrnNumber(tx);
          
          const collection = await tx.collection.create({
            data: {
              trnNumber,
              trnDate: new Date(), // using current date for legacy migration
              amount: amountPaid,
              loanId: dbLoan.id,
              staffId: dbLoan.staffId,
              paymentType: 'CASH', 
              status: 'COMPLETED',
              remarks: 'Legacy Sync'
            }
          });

          // Ledger Entries
          // Loan Ledger
          await tx.loanLedger.create({
            data: {
              loanId: dbLoan.id,
              date: new Date(),
              transactionType: 'RECEIPT',
              amount: amountPaid,
              openingBalance: dbLoan.outstandingAmount + amountPaid, // approximated
              closingBalance: dbLoan.outstandingAmount,
              remarks: `Collection ${trnNumber} received (Legacy Sync)`
            }
          });

          // Customer Ledger
          await tx.customerLedger.create({
            data: {
              customerId: customer.id,
              date: new Date(),
              transactionType: 'RECEIPT',
              amount: amountPaid,
              openingBalance: dbLoan.outstandingAmount + amountPaid, // approximated
              closingBalance: dbLoan.outstandingAmount,
              remarks: `Collection ${trnNumber} against Loan ${dbLoan.loanNumber}`
            }
          });
        }

        updatedCount++;
        if (updatedCount % 50 === 0) {
          console.log(`Processed ${updatedCount} loans...`);
        }
      });
    } catch (e: any) {
      console.error(`Error processing loan for customer ${loanData.customerNo}:`, e.message);
    }
  }

  console.log(`\nSync Complete!`);
  console.log(`Successfully updated: ${updatedCount}`);
  console.log(`Skipped: ${skippedCount}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
