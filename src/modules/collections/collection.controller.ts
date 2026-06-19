import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

export const createCollection = async (req: Request, res: Response): Promise<any> => {
  try {
    const { loanId, staffId, amount, penalty, trnDate, remarks, trnMode } = req.body;

    // Security check
    const user = (req as any).user;
    if (user?.role?.name !== 'Admin' && user?.branchId) {
      const loan = await prisma.loan.findUnique({ where: { id: loanId }, include: { customer: { include: { area: true } } } });
      if (!loan || loan.customer?.area?.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Security Violation: Cannot create a collection for a loan outside your branch.' });
      }
    }

    if (!loanId || !amount) {
      return res.status(400).json({ error: 'Loan ID and Amount are required' });
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

      return collection;
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error('Create Collection Error:', error);
    res.status(500).json({ error: error.message || 'Failed to process collection' });
  }
};

export const getCollections = async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch collections' });
  }
};
