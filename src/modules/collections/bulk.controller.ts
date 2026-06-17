import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Generate TRN Number
const generateTrnNo = async (tx: any) => {
  const lastTrn = await tx.collection.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  if (!lastTrn || !lastTrn.trnNumber) {
    return 'TRN0001';
  }

  const lastNo = parseInt(lastTrn.trnNumber.replace('TRN', ''), 10);
  const nextNo = (lastNo + 1).toString().padStart(4, '0');
  return `TRN${nextNo}`;
};

export const processBulkCollection = async (req: Request, res: Response): Promise<any> => {
  try {
    const { centerId, collections, staffId, trnDate } = req.body;
    // collections is an array of { loanId, customerId, amount, remarks }

    if (!collections || !Array.isArray(collections) || collections.length === 0) {
      return res.status(400).json({ error: 'No collection data provided' });
    }

    const user = (req as any).user;
    
    // Process everything in a single massive transaction
    const results = await prisma.$transaction(async (tx) => {
      const processedCollections = [];
      let trnCounter = 0; // to ensure unique TRNs if generated in the same ms

      // 1. First get the last TRN Number once
      const lastTrnEntry = await tx.collection.findFirst({
        orderBy: { createdAt: 'desc' },
      });
      let currentTrnNo = 0;
      if (lastTrnEntry && lastTrnEntry.trnNumber) {
        currentTrnNo = parseInt(lastTrnEntry.trnNumber.replace('TRN', ''), 10);
      }

      for (const entry of collections) {
        const { loanId, customerId, amount, remarks } = entry;
        const entryAmount = Number(amount);

        if (entryAmount <= 0) continue; // Skip if amount is 0 or less

        // Security / Data check
        const loan = await tx.loan.findUnique({
          where: { id: loanId },
          include: { 
            customer: { include: { area: true } },
            schedules: { where: { status: 'PENDING' }, orderBy: { dueDate: 'asc' } }
          }
        });

        if (!loan) throw new Error(`Loan ${loanId} not found`);
        if (user?.role?.name !== 'Super Admin' && user?.branchId) {
          if (loan.customer?.area?.branchId !== user.branchId) {
             throw new Error(`Security Violation: Cannot process collection for loan ${loan.loanNumber}`);
          }
        }

        currentTrnNo++;
        const nextTrnStr = currentTrnNo.toString().padStart(4, '0');
        const trnNumber = `TRN${nextTrnStr}`;

        // 2. Clear EMIs with the collected amount
        let remainingCollectionAmount = entryAmount;
        const updatedSchedules: any[] = [];

        for (const schedule of loan.schedules) {
          if (remainingCollectionAmount <= 0) break;

          if (remainingCollectionAmount >= schedule.emiAmount) {
            remainingCollectionAmount -= schedule.emiAmount;
            updatedSchedules.push(
              tx.loanSchedule.update({
                where: { id: schedule.id },
                data: { status: 'PAID', paidDate: new Date(trnDate) }
              })
            );
          } else {
            // Partial payments do not mark schedule as PAID
            break;
          }
        }

        // Wait for schedule updates
        if (updatedSchedules.length > 0) {
          await Promise.all(updatedSchedules);
        }

        // 3. Create the Collection record
        const collection = await tx.collection.create({
          data: {
            trnNumber,
            trnDate: new Date(trnDate),
            amount: entryAmount,
            remarks,
            loanId: loan.id,
            staffId: staffId || undefined
          }
        });

        // 4. Update the Loan's outstanding and advance balances
        let newOutstanding = loan.outstandingAmount - entryAmount;
        let advanceAdded = 0;

        if (newOutstanding < 0) {
          advanceAdded = Math.abs(newOutstanding);
          newOutstanding = 0;
        }

        const newAdvanceBalance = loan.advanceBalance + advanceAdded;
        let newStatus = loan.status;
        
        if (newOutstanding <= 0) {
          newStatus = 'CLOSED';
        } else if (loan.status === 'APPROVED') {
          newStatus = 'ACTIVE';
        }

        await tx.loan.update({
          where: { id: loan.id },
          data: { 
            outstandingAmount: newOutstanding, 
            advanceBalance: newAdvanceBalance,
            status: newStatus 
          }
        });

        // 5. Create Customer Ledger Entry
        // Since we don't have a definitive "Customer Total Balance" across all loans yet,
        // we'll use the specific loan's outstanding amount as the ledger balance basis for this feature.
        await tx.customerLedger.create({
          data: {
            date: new Date(trnDate),
            transactionType: 'Collection',
            amount: entryAmount,
            openingBalance: loan.outstandingAmount,
            closingBalance: newOutstanding,
            remarks: `Bulk collection for ${loan.loanNumber}`,
            customerId: loan.customerId,
            collectionId: collection.id
          }
        });

        // 6. Create Loan Ledger Entry
        await tx.loanLedger.create({
          data: {
            date: new Date(trnDate),
            transactionType: 'EMI Collection',
            amount: entryAmount,
            openingBalance: loan.outstandingAmount,
            closingBalance: newOutstanding,
            remarks: remarks || `Collected via Bulk Entry`,
            loanId: loan.id,
            collectionId: collection.id
          }
        });

        processedCollections.push(collection);
      }

      return processedCollections;
    });

    res.status(201).json({ 
      message: `Successfully processed ${results.length} collections.`,
      processed: results.length
    });
  } catch (error: any) {
    console.error('Bulk Collection Error:', error);
    res.status(500).json({ error: error.message || 'Failed to process bulk collections' });
  }
};
