import prisma from '../../utils/prisma';
import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireBranchAccess } from '../../utils/security.utils';


// Generate TRN Number
const generateTrnNo = async () => {
  const lastTrn = await prisma.collection.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  if (!lastTrn || !lastTrn.trnNumber) {
    return 'TRN0001';
  }

  const lastNo = parseInt(lastTrn.trnNumber.replace('TRN', ''), 10);
  const nextNo = (lastNo + 1).toString().padStart(4, '0');
  return `TRN${nextNo}`;
};

export const createCollection = asyncHandler(async (req: Request, res: Response) => {
    const { loanId, staffId, amount, penalty, trnDate, remarks, trnMode } = req.body;

    if (!loanId || !amount) {
      throw new Error('Loan ID and Amount are required');
    }

    // Security check
    const user = (req as any).user;
    const loan = await prisma.loan.findUnique({ where: { id: loanId }, include: { customer: { include: { area: true } } } });
    if (!loan) throw new Error('Loan not found');
    requireBranchAccess(user, loan.customer?.area?.branchId, 'create a collection for a loan outside your branch');

    // FIX: Prevent duplicate collection for same loan on same date with same amount
    const collectionDate = new Date(trnDate);
    const dayStart = new Date(collectionDate.setHours(0, 0, 0, 0));
    const dayEnd = new Date(collectionDate.setHours(23, 59, 59, 999));
    
    const existingCollection = await prisma.collection.findFirst({
      where: {
        loanId,
        amount: Number(amount),
        trnDate: { gte: dayStart, lte: dayEnd }
      }
    });
    
    if (existingCollection) {
      return res.status(409).json({ 
        error: `A collection of ₹${amount} already exists for this loan on ${new Date(trnDate).toLocaleDateString()}. Duplicate collections are not allowed.` 
      });
    }

    const trnNumber = await generateTrnNo();

    // Use a transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // 1. Get current loan
      const loan = await tx.loan.findUnique({
        where: { id: String(loanId) },
        include: { schedules: { 
          where: { status: { in: ['PENDING', 'PARTIAL'] } }, 
          orderBy: { dueDate: 'asc' },
          select: {
            id: true, emiAmount: true, amountPaid: true, status: true,
            dueDate: true, paidDate: true, collectionId: true, loanId: true,
            createdAt: true, updatedAt: true
          }
        } }
      });

      if (!loan) throw new Error('Loan not found');

      let remainingCollectionAmount = Number(amount);
      const updatedSchedules: any[] = [];

      // 2. Clear EMIs with the collected amount
      for (const schedule of loan.schedules) {
        if (remainingCollectionAmount <= 0) break;

        const remainingEmiAmount = schedule.emiAmount - (schedule.amountPaid || 0);

        if (remainingCollectionAmount >= remainingEmiAmount) {
          // Fully pay this EMI
          remainingCollectionAmount -= remainingEmiAmount;
          updatedSchedules.push(tx.loanSchedule.update({
            where: { id: schedule.id },
            data: { 
              status: 'PAID', 
              paidDate: new Date(trnDate),
              amountPaid: schedule.emiAmount
            }
          }));
        } else {
          // Partially paying an EMI
          updatedSchedules.push(tx.loanSchedule.update({
            where: { id: schedule.id },
            data: { 
              status: 'PARTIAL', 
              amountPaid: { increment: remainingCollectionAmount }
            }
          }));
          remainingCollectionAmount = 0;
          break;
        }
      }

      await Promise.all(updatedSchedules);

      // 3. Create the Collection record
      const collection = await tx.collection.create({
        data: {
          trnNumber,
          trnDate: new Date(trnDate),
          amount: Number(amount),
          remarks,
          loanId: loan.id,
          staffId: staffId || undefined
        }
      });

      // 4. Update the Loan's outstanding amount
      const newOutstanding = Math.max(0, loan.outstandingAmount - Number(amount));
      let newStatus = loan.status;
      
      // If outstanding is 0 or less, auto-close the loan
      if (newOutstanding <= 0) {
        newStatus = 'CLOSED';
      } else if (loan.status === 'APPROVED') {
        newStatus = 'ACTIVE';
      }

      await tx.loan.update({
        where: { id: loan.id },
        data: { outstandingAmount: newOutstanding, status: newStatus }
      });

      // 5. Write CustomerLedger entry
      const lastCustomerLedger = await tx.customerLedger.findFirst({
        where: { customerId: loan.customerId },
        orderBy: { createdAt: 'desc' },
      });
      const customerOpeningBalance = lastCustomerLedger ? lastCustomerLedger.closingBalance : 0;
      const customerClosingBalance = customerOpeningBalance - Number(amount);

      await tx.customerLedger.create({
        data: {
          transactionType: 'Collection',
          amount: Number(amount),
          openingBalance: customerOpeningBalance,
          closingBalance: customerClosingBalance,
          remarks: remarks || null,
          customerId: loan.customerId,
          collectionId: collection.id,
          date: new Date(trnDate),
        }
      });

      // 6. Write LoanLedger entry
      const lastLoanLedger = await tx.loanLedger.findFirst({
        where: { loanId: loan.id },
        orderBy: { createdAt: 'desc' },
      });
      const loanOpeningBalance = lastLoanLedger ? lastLoanLedger.closingBalance : loan.outstandingAmount;
      const loanClosingBalance = newOutstanding;

      await tx.loanLedger.create({
        data: {
          transactionType: 'EMI Collection',
          amount: Number(amount),
          openingBalance: loanOpeningBalance,
          closingBalance: loanClosingBalance,
          remarks: remarks || null,
          loanId: loan.id,
          collectionId: collection.id,
          date: new Date(trnDate),
        }
      });

      return collection;
    });

    res.status(201).json(result);
});

export const getCollections = asyncHandler(async (req: Request, res: Response) => {
    const { loanId, staffId, branchId } = req.query;
    const where: any = {};
    if (loanId) where.loanId = String(loanId);
    if (staffId) where.staffId = String(staffId);

    const user = (req as any).user;
    const userBranchId = user?.branchId;

    if (res.locals.areaIds && res.locals.areaIds.length > 0) {
      where.loan = { customer: { areaId: { in: res.locals.areaIds } } };
    } else if (userBranchId) {
      where.loan = { customer: { area: { branchId: userBranchId } } };
    } else if (branchId && branchId !== 'all') {
      where.loan = { customer: { area: { branchId: String(branchId) } } };
    }

    const collections = await prisma.collection.findMany({
      where,
      include: {
        loan: {
          include: { customer: { include: { area: { include: { branch: true } } } } }
        },
        staff: true
      },
      orderBy: { trnDate: 'desc' }
    });
    
    res.json(collections);
});
