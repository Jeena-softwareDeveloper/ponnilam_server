import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireBranchAccess } from '../../utils/security.utils';

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

export const createLoan = asyncHandler(async (req: Request, res: Response) => {
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
    const customer = await prisma.customer.findUnique({ where: { id: customerId }, include: { area: true } });
    if (!customer) throw new Error('Customer not found');
    requireBranchAccess(user, customer.area?.branchId, 'create a loan for a customer outside your branch');

    const loanNumber = await generateLoanNo();

    // FIX #10: Fetch package to get interestRate and frequency
    let packageFrequency = 'MONTHLY';
    let resolvedInterestRate = Number(req.body.interestRate || 0);
    if (packageId) {
      const pkg = await prisma.loanPackage.findUnique({ where: { id: packageId } });
      if (pkg) {
        packageFrequency = pkg.frequency;
        if (!resolvedInterestRate) resolvedInterestRate = pkg.interestRate;
      }
    }

    const loan = await prisma.loan.create({
      data: {
        loanNumber,
        customerId, staffId, amount: Number(amount),
        interestRate: resolvedInterestRate, // FIX #10: save interestRate
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

    // FIX #2: Auto-generate EMIs using CORRECT frequency from package
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
        
        // FIX #2: Use correct frequency for date increment
        if (packageFrequency === 'WEEKLY') {
          currentDate.setDate(currentDate.getDate() + 7);
        } else if (packageFrequency === 'DAILY') {
          currentDate.setDate(currentDate.getDate() + 1);
        } else {
          // MONTHLY (default)
          currentDate.setMonth(currentDate.getMonth() + 1);
        }
      }
      
      await prisma.loanSchedule.createMany({ data: schedules });
    }

    res.status(201).json(loan);
});

export const updateLoanStatus = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, remarks } = req.body;

    const existingLoan = await prisma.loan.findUnique({ 
      where: { id: id as string }, 
      include: { customer: { include: { area: true } } } 
    }) as any;
    if (!existingLoan) throw new Error('Loan not found');
    
    const user = (req as any).user;
    requireBranchAccess(user, existingLoan.customer?.area?.branchId, 'update a loan for a customer outside your branch');

    const loan = await prisma.loan.update({
      where: { id: String(id) },
      data: { status, ...(remarks !== undefined && { remarks }) }
    });

    res.json(loan);
});

export const getLoans = asyncHandler(async (req: Request, res: Response) => {
    const { customerId, status, branchId, centerId } = req.query;
    const where: any = {};
    if (customerId) where.customerId = String(customerId);
    if (status) where.status = String(status);

    // FIX #6: Support centerId filter for bulk collection page performance
    if (centerId) {
      where.customer = { ...where.customer, centerId: String(centerId) };
    }

    const user = (req as any).user;
    const userBranchId = user?.branchId;

    if (res.locals.areaIds && res.locals.areaIds.length > 0) {
      where.customer = { ...where.customer, areaId: { in: res.locals.areaIds } };
    } else if (userBranchId) {
      where.customer = { ...where.customer, area: { branchId: userBranchId } };
    } else if (branchId && branchId !== 'all') {
      where.customer = { ...where.customer, area: { branchId: String(branchId) } };
    }


    const loans = await prisma.loan.findMany({
      where,
      include: {
        customer: { include: { area: { include: { branch: true } }, center: true } },
        staff: true,
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(loans);
});

export const getLoanById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const loan = await prisma.loan.findUnique({
      where: { id: String(id) },
      include: {
        customer: { include: { center: true, area: { include: { branch: true } } } },
        staff: true,
        package: true,
        guarantors: true, // FIX #18: include guarantors
        schedules: {
          orderBy: { dueDate: 'asc' }
        },
        collections: {
          orderBy: { trnDate: 'desc' },
          include: { staff: { select: { name: true } } }
        }
      }
    });

    if (!loan) throw new Error('Loan not found');
    res.json(loan);
});

export const deleteLoan = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Security check
    const existingLoan = await prisma.loan.findUnique({ 
      where: { id: id as string },
      include: { customer: { include: { area: true } } }
    }) as any;
    if (!existingLoan) throw new Error('Loan not found');
    
    const user = (req as any).user;
    requireBranchAccess(user, existingLoan.customer?.area?.branchId, 'delete a loan for a customer outside your branch');

    await prisma.loan.delete({ where: { id: String(id) } });
    res.json({ message: 'Loan deleted successfully' });
});
