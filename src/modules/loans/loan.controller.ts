import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Generate Loan Number (e.g., L0001)
const generateLoanNo = async () => {
  const lastLoan = await prisma.loan.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  if (!lastLoan || !lastLoan.loanNumber) {
    return 'L0001';
  }

  const lastNo = parseInt(lastLoan.loanNumber.replace('L', ''), 10);
  const nextNo = (lastNo + 1).toString().padStart(4, '0');
  return `L${nextNo}`;
};

export const createLoan = async (req: Request, res: Response) => {
  try {
    const {
      customerId, staffId, amount, noOfDues, perDueAmount, totalDueAmount,
      deductionAmount, netDisbursement,
      salary, interest, additional, otherIncome, totalIncome,
      food, rent, mobile, education, loanObligation, otherExpense, totalExpense,
      eligibleEmi,
      disbursementDate, firstDueDate,
      packageId, applicationDate, remarks, status, guarantors
    } = req.body;

    // Security check
    const user = (req as any).user;
    if (user?.role?.name !== 'Super Admin' && user?.branchId) {
      const customer = await prisma.customer.findUnique({ where: { id: customerId }, include: { area: true } });
      if (!customer || customer.area?.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Security Violation: Cannot create a loan for a customer outside your branch.' });
      }
    }

    const loanNumber = await generateLoanNo();

    const loan = await prisma.loan.create({
      data: {
        loanNumber,
        customerId, staffId, amount: Number(amount),
        noOfDues: Number(noOfDues), perDueAmount: Number(perDueAmount),
        totalDueAmount: Number(totalDueAmount), deductionAmount: Number(deductionAmount),
        netDisbursement: Number(netDisbursement), outstandingAmount: Number(totalDueAmount), // Initial outstanding is total due
        
        salary: Number(salary || 0), interest: Number(interest || 0),
        additional: Number(additional || 0), otherIncome: Number(otherIncome || 0),
        totalIncome: Number(totalIncome || 0),

        food: Number(food || 0), rent: Number(rent || 0), mobile: Number(mobile || 0),
        education: Number(education || 0), loanObligation: Number(loanObligation || 0),
        otherExpense: Number(otherExpense || 0), totalExpense: Number(totalExpense || 0),

        eligibleEmi: Number(eligibleEmi || 0),
        
        
        disbursementDate: disbursementDate ? new Date(disbursementDate) : null,
        firstDueDate: firstDueDate ? new Date(firstDueDate) : null,
        packageId: packageId || null,
        applicationDate: applicationDate ? new Date(applicationDate) : null,
        remarks: remarks || null,
        status: status || 'PENDING',
        
        ...(guarantors && guarantors.length > 0 && {
          guarantors: {
            create: guarantors.map((g: any) => ({
              name: g.name,
              relationship: g.relationship,
              mobileNo: g.mobileNo
            }))
          }
        })
      }
    });

    // Auto-generate EMIs if firstDueDate is provided
    if (loan.firstDueDate && loan.noOfDues > 0 && loan.perDueAmount > 0) {
      const schedules = [];
      let currentDate = new Date(loan.firstDueDate);
      
      for (let i = 0; i < loan.noOfDues; i++) {
        schedules.push({
          loanId: loan.id,
          dueDate: new Date(currentDate),
          emiAmount: loan.perDueAmount,
          status: 'PENDING'
        });
        
        // Add 1 month to date
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
      
      await prisma.loanSchedule.createMany({
        data: schedules
      });
    }

    res.status(201).json(loan);
  } catch (error) {
    console.error('Create Loan Error:', error);
    res.status(500).json({ error: 'Failed to sanction loan' });
  }
};

export const updateLoanStatus = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Security check
    const existingLoan = await prisma.loan.findUnique({ 
      where: { id }, 
      include: { customer: { include: { area: true } } } 
    });
    if (!existingLoan) return res.status(404).json({ error: 'Loan not found' });
    
    const user = (req as any).user;
    if (user?.role?.name !== 'Super Admin' && user?.branchId) {
      if (existingLoan.customer?.area?.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Security Violation: Cannot update a loan for a customer outside your branch.' });
      }
    }

    const loan = await prisma.loan.update({
      where: { id: String(id) },
      data: { status }
    });

    res.json(loan);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update loan status' });
  }
};

export const getLoans = async (req: Request, res: Response) => {
  try {
    const { customerId, status } = req.query;
    const where: any = {};
    if (customerId) where.customerId = String(customerId);
    if (status) where.status = String(status);

    // Apply branch scoping for Area (indirectly through customer or staff)
    if (res.locals.areaIds && res.locals.areaIds.length > 0) {
      where.customer = { areaId: { in: res.locals.areaIds } };
    }

    const loans = await prisma.loan.findMany({
      where,
      include: {
        customer: true,
        staff: true,
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(loans);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch loans' });
  }
};

export const getLoanById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const loan = await prisma.loan.findUnique({
      where: { id: String(id) },
      include: {
        customer: true,
        staff: true,
        schedules: {
          orderBy: { dueDate: 'asc' }
        },
        collections: {
          orderBy: { trnDate: 'desc' }
        }
      }
    });

    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    res.json(loan);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch loan details' });
  }
};

export const deleteLoan = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;

    // Security check
    const existingLoan = await prisma.loan.findUnique({ 
      where: { id }, 
      include: { customer: { include: { area: true } } } 
    });
    if (!existingLoan) return res.status(404).json({ error: 'Loan not found' });
    
    const user = (req as any).user;
    if (user?.role?.name !== 'Super Admin' && user?.branchId) {
      if (existingLoan.customer?.area?.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Security Violation: Cannot delete a loan for a customer outside your branch.' });
      }
    }

    await prisma.loan.delete({ where: { id: String(id) } });
    res.json({ message: 'Loan deleted successfully' });
  } catch (error) {
    console.error('Delete Loan Error:', error);
    res.status(500).json({ error: 'Failed to delete loan' });
  }
};
