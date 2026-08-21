import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { LoanStatus, ScheduleStatus } from '../src/utils/prisma-enums';
import { nextTrnNumber } from '../src/utils/sequence.utils';
import { sumUnpaidScheduleAmount } from '../src/utils/loan.utils';
import { toCollectionDay } from '../src/utils/date.utils';

const prisma = new PrismaClient();

async function deepClearSathiOverdue() {
  console.log("Starting DEEP CLEAR script for Sathi branch...");
  
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  // 1. Get all active/approved loans for Sathiyamangalam
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
      status: { in: ['ACTIVE', 'APPROVED'] }
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

  console.log(`Found ${sathiLoans.length} loans with pending overdue EMIs.`);

  let schedulesProcessed = 0;
  let totalAmountCollected = 0;

  for (const loan of sathiLoans) {
    if (loan.schedules.length === 0) continue;

    console.log(`\nProcessing Loan ${loan.loanNumber} - ${loan.schedules.length} pending schedules`);
    
    try {
      await prisma.$transaction(async (tx) => {
        
        let loanAmountCollected = 0;

        for (const sch of loan.schedules) {
          const due = Number(sch.emiAmount) - (Number(sch.amountPaid) || 0);
          if (due <= 0) continue;

          // Create collection for this specific schedule
          const trnNumber = await nextTrnNumber(tx as any);
          const collectionDay = toCollectionDay(new Date(sch.dueDate));
          
          // Check if collection already exists for this exact day to avoid duplicates
          const existingCollection = await tx.collection.findFirst({
            where: { loanId: loan.id, collectionDay, isVoided: false }
          });
          
          let collectionId = existingCollection?.id;
          
          if (!existingCollection) {
            const collection = await tx.collection.create({
              data: {
                trnNumber,
                trnDate: sch.dueDate,
                collectionDay,
                amount: due,
                remarks: 'Deep Clear Auto-Collection',
                loanId: loan.id,
                staffId: loan.staffId,
              }
            });
            collectionId = collection.id;
          }

          // Directly update the schedule to PAID
          await tx.loanSchedule.update({
            where: { id: sch.id },
            data: {
              status: ScheduleStatus.PAID,
              amountPaid: sch.emiAmount,
              paidDate: sch.dueDate,
              collectionId: collectionId
            }
          });

          loanAmountCollected += due;
          schedulesProcessed++;
          totalAmountCollected += due;
          console.log(`  - Marked PAID: ₹${due} for Due Date: ${sch.dueDate.toISOString().slice(0, 10)}`);
        }

        // Update Loan outstanding amount and status
        const newOutstanding = await sumUnpaidScheduleAmount(tx as any, loan.id);
        
        let newStatus = loan.status;
        if (newOutstanding <= 0) {
          newStatus = LoanStatus.CLOSED;
        } else if (loan.status === 'APPROVED' && loanAmountCollected > 0) {
          newStatus = LoanStatus.ACTIVE;
        }

        await tx.loan.update({
          where: { id: loan.id },
          data: {
            outstandingAmount: Math.max(0, newOutstanding),
            status: newStatus,
            ...(loan.status === 'APPROVED' && { disbursementDate: loan.schedules[0].dueDate })
          }
        });

      });
    } catch (err: any) {
      console.error(`  - FAILED to process loan ${loan.loanNumber}:`, err.message);
    }
  }

  console.log("\n==================================");
  console.log("Deep Clear Script finished successfully!");
  console.log(`Total Schedules Cleared: ${schedulesProcessed}`);
  console.log(`Total Amount Collected: ₹${totalAmountCollected}`);
  console.log("==================================");
}

deepClearSathiOverdue().catch(console.error).finally(() => prisma.$disconnect());
