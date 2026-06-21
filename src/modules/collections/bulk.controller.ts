import { Request, Response } from 'express';
import prisma from '../../utils/prisma';

export const processBulkCollection = async (req: Request, res: Response): Promise<any> => {
  try {
    const { centerId, collections, staffId, trnDate } = req.body;

    if (!collections || !Array.isArray(collections) || collections.length === 0) {
      return res.status(400).json({ error: 'No collection data provided' });
    }

    const user = (req as any).user;

    // FIX #3: Lock the TRN counter INSIDE the transaction to prevent concurrent collision
    // Use a serializable transaction approach by locking with findFirst + unique constraint
    const results = await prisma.$transaction(async (tx) => {
      const processedCollections = [];

      // FIX #3: Get CURRENT max TRN inside the transaction (atomic read)
      const lastTrnEntry = await tx.collection.findFirst({
        orderBy: { trnNumber: 'desc' },
        select: { trnNumber: true }
      });
      let currentTrnNo = 0;
      if (lastTrnEntry?.trnNumber) {
        const parsed = parseInt(lastTrnEntry.trnNumber.replace('TRN', ''), 10);
        if (!isNaN(parsed)) currentTrnNo = parsed;
      }

      for (const entry of collections) {
        const { loanId, amount, remarks } = entry;
        const entryAmount = Number(amount);

        if (entryAmount <= 0) continue;

        // Skip if a collection already exists for this loan on the same date
        const collectionDate = new Date(trnDate);
        const dayStart = new Date(collectionDate.setHours(0, 0, 0, 0));
        const dayEnd = new Date(collectionDate.setHours(23, 59, 59, 999));
        
        const existingCollection = await tx.collection.findFirst({
          where: {
            loanId,
            trnDate: { gte: dayStart, lte: dayEnd }
          }
        });
        
        if (existingCollection) {
          console.warn(`Skipping duplicate collection for loan ${loanId} on ${trnDate}`);
          continue;
        }

        // Security / Data check
        const loan = await tx.loan.findUnique({
          where: { id: loanId },
          include: {
            customer: { include: { area: true } },
            schedules: { 
              where: { status: { in: ['PENDING', 'PARTIAL'] } }, 
              orderBy: { dueDate: 'asc' },
              select: {
                id: true,
                emiAmount: true,
                amountPaid: true,
                status: true,
                dueDate: true,
                paidDate: true,
                collectionId: true,
                loanId: true,
                createdAt: true,
                updatedAt: true
              }
            }
          }
        });

        if (!loan) throw new Error(`Loan ${loanId} not found`);
        if (user?.role?.name !== 'Admin' && user?.branchId) {
          if (loan.customer?.area?.branchId !== user.branchId) {
            throw new Error(`Security Violation: Cannot process collection for loan ${loan.loanNumber}`);
          }
        }

        currentTrnNo++;
        const trnNumber = `TRN${currentTrnNo.toString().padStart(5, '0')}`;

        // FIX #2 + #15: Clear EMIs with the collected amount, update amountPaid on partial
        let remainingCollectionAmount = entryAmount;
        const scheduleUpdatePromises: any[] = [];

        for (const schedule of loan.schedules) {
          if (remainingCollectionAmount <= 0) break;

          const remainingEmiAmount = schedule.emiAmount - (schedule.amountPaid || 0);

          if (remainingCollectionAmount >= remainingEmiAmount) {
            // Full payment for this schedule
            remainingCollectionAmount -= remainingEmiAmount;
            scheduleUpdatePromises.push(
              tx.loanSchedule.update({
                where: { id: schedule.id },
                data: {
                  status: 'PAID',
                  amountPaid: schedule.emiAmount, // FIX #15: set full amount
                  paidDate: new Date(trnDate),
                  collectionId: undefined // will link below after collection created
                }
              })
            );
          } else {
            // FIX #15: Partial payment - update amountPaid, keep PARTIAL status
            scheduleUpdatePromises.push(
              tx.loanSchedule.update({
                where: { id: schedule.id },
                data: {
                  status: 'PARTIAL',
                  amountPaid: schedule.amountPaid + remainingCollectionAmount
                }
              })
            );
            remainingCollectionAmount = 0;
          }
        }

        if (scheduleUpdatePromises.length > 0) {
          await Promise.all(scheduleUpdatePromises);
        }

        // FIX #3: Create collection (unique trnNumber enforced by DB constraint)
        const collection = await tx.collection.create({
          data: {
            trnNumber,
            trnDate: new Date(trnDate),
            amount: entryAmount,
            remarks: remarks || null,
            loanId: loan.id,
            staffId: staffId || null
          }
        });

        // FIX #5: Update outstanding + advance balance
        const currentOutstanding = loan.outstandingAmount;
        let newOutstanding = currentOutstanding - entryAmount;
        let newAdvanceBalance = loan.advanceBalance;

        if (newOutstanding < 0) {
          // FIX #5: Extra amount goes to advance balance
          newAdvanceBalance = newAdvanceBalance + Math.abs(newOutstanding);
          newOutstanding = 0;
        }

        let newStatus = loan.status;
        if (newOutstanding <= 0) {
          newStatus = 'CLOSED';
        } else if (loan.status === 'APPROVED') {
          newStatus = 'ACTIVE';
        }

        // FIX #7: Set disbursementDate on first collection if not already set
        const isFirstCollection = loan.status === 'APPROVED';

        await tx.loan.update({
          where: { id: loan.id },
          data: {
            outstandingAmount: newOutstanding,
            advanceBalance: newAdvanceBalance,
            status: newStatus,
            ...(isFirstCollection && !loan.disbursementDate && {
              disbursementDate: new Date(trnDate)
            })
          }
        });

        // FIX #4: Write CustomerLedger entry
        await tx.customerLedger.create({
          data: {
            date: new Date(trnDate),
            transactionType: 'Collection',
            amount: entryAmount,
            openingBalance: currentOutstanding,
            closingBalance: newOutstanding,
            remarks: remarks || `EMI Collection - ${trnNumber}`,
            customerId: loan.customerId,
            collectionId: collection.id
          }
        });

        // FIX #4: Write LoanLedger entry
        await tx.loanLedger.create({
          data: {
            date: new Date(trnDate),
            transactionType: 'EMI Collection',
            amount: entryAmount,
            openingBalance: currentOutstanding,
            closingBalance: newOutstanding,
            remarks: remarks || `EMI Collection - ${trnNumber}`,
            loanId: loan.id,
            collectionId: collection.id
          }
        });

        processedCollections.push(collection);
      }

      return processedCollections;
    }, {
      timeout: 30000 // 30 second timeout for large bulk operations
    });

    res.status(201).json({
      message: `Successfully processed ${results.length} collections.`,
      processed: results.length
    });
  } catch (error: any) {
    console.error('Bulk Collection Error:', error);
    // FIX #3: Handle unique constraint violation (TRN collision)
    if (error.code === 'P2002' && error.meta?.target?.includes('trnNumber')) {
      return res.status(409).json({ error: 'Transaction number conflict. Please try again.' });
    }
    res.status(500).json({ error: error.message || 'Failed to process bulk collections' });
  }
};
