import prisma from '../../utils/prisma';
import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireBranchAccess } from '../../utils/security.utils';
import {
  buildScheduleRows,
  handleDroppedLoan,
  handleManualLoanClose,
  isValidLoanTransition,
  resolveLastEmiAmount,
} from '../../utils/loan.utils';
import { LoanStatus, OPEN_LOAN_STATUSES } from '../../utils/prisma-enums';
import { nextLoanNumber } from '../../utils/sequence.utils';
import { parsePagination, paginatedResponse } from '../../utils/pagination.utils';
import { assertMenuPermission, checkAreaScope, resolveStaffId } from '../../utils/validation.helpers';

export const createLoan = asyncHandler(async (req: Request, res: Response) => {
  const {
    customerId, staffId, amount, noOfDues, perDueAmount, totalDueAmount,
    deductionAmount, netDisbursement,
    salary, interest, additional, otherIncome, totalIncome,
    food, rent, mobile, education, loanObligation, otherExpense, totalExpense,
    eligibleEmi,
    disbursementDate, firstDueDate,
    packageId, applicationDate, remarks, guarantors,
  } = req.body;

  if (!customerId) return res.status(400).json({ error: 'Customer is required' });
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Valid loan amount is required' });
  if (!noOfDues || Number(noOfDues) <= 0) return res.status(400).json({ error: 'Number of dues is required' });

  const user = (req as any).user;
  const createPerm = await assertMenuPermission(user, '/admin/loans', 'canCreate');
  if (createPerm) return res.status(403).json({ error: createPerm });

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { area: true, center: true },
  });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  if (!customer.isActive) return res.status(400).json({ error: 'Cannot create loan for inactive customer' });
  requireBranchAccess(user, customer.area?.branchId, 'create a loan for a customer outside your branch');
  const areaScopeErr = checkAreaScope(user, res.locals.areaIds, customer.areaId);
  if (areaScopeErr) return res.status(403).json({ error: areaScopeErr });

  const staffResult = await resolveStaffId(staffId, user);
  if ('error' in staffResult) return res.status(400).json({ error: staffResult.error });
  const resolvedStaffId = staffResult.staffId;

  if (!packageId) {
    return res.status(400).json({ error: 'Loan package is required' });
  }

  const existingOpen = await prisma.loan.findFirst({
    where: { customerId, status: { in: OPEN_LOAN_STATUSES } },
  });
  if (existingOpen) {
    return res.status(400).json({ error: `Customer already has an open loan (${existingOpen.loanNumber})` });
  }

  const numDues = Number(noOfDues);
  const perDue = Number(perDueAmount);
  const totalDue = Number(totalDueAmount);
  const lastEmi = resolveLastEmiAmount(totalDue, perDue, numDues);
  const scheduleSum = numDues <= 1 ? perDue : perDue * (numDues - 1) + lastEmi;
  if (Math.abs(totalDue - scheduleSum) > 0.01) {
    return res.status(400).json({ error: 'Total due must equal sum of all EMI installments' });
  }
  const net = Number(netDisbursement);
  const deduct = Number(deductionAmount);
  if (Math.abs(net - (Number(amount) - deduct)) > 0.01) {
    return res.status(400).json({ error: 'Net disbursement must equal loan amount minus deduction' });
  }

  const pkg = await prisma.loanPackage.findUnique({ where: { id: packageId } });
  if (!pkg) return res.status(400).json({ error: 'Invalid loan package' });
  if (!pkg.isActive) return res.status(400).json({ error: 'Selected loan package is inactive' });

  let packageFrequency = pkg.frequency;
  let resolvedInterestRate = Number(req.body.interestRate || pkg.interestRate);

  const loan = await prisma.$transaction(async (tx) => {
    const loanNumber = await nextLoanNumber(tx, customer.area?.branchId || user?.branchId);

    const created = await tx.loan.create({
      data: {
        loanNumber,
        customerId,
        staffId: resolvedStaffId,
        amount: Number(amount),
        interestRate: resolvedInterestRate,
        noOfDues: numDues,
        perDueAmount: perDue,
        totalDueAmount: totalDue,
        deductionAmount: deduct,
        netDisbursement: net,
        outstandingAmount: totalDue,
        salary: Number(salary || 0),
        interest: Number(interest || 0),
        additional: Number(additional || 0),
        otherIncome: Number(otherIncome || 0),
        totalIncome: Number(totalIncome || 0),
        food: Number(food || 0),
        rent: Number(rent || 0),
        mobile: Number(mobile || 0),
        education: Number(education || 0),
        loanObligation: Number(loanObligation || 0),
        otherExpense: Number(otherExpense || 0),
        totalExpense: Number(totalExpense || 0),
        eligibleEmi: Number(eligibleEmi || 0),
        disbursementDate: disbursementDate ? new Date(disbursementDate) : null,
        firstDueDate: firstDueDate ? new Date(firstDueDate) : null,
        packageId,
        applicationDate: applicationDate ? new Date(applicationDate) : null,
        remarks: remarks || null,
        status: LoanStatus.PENDING,
        ...(guarantors?.length > 0 && {
          guarantors: {
            create: guarantors.map((g: any) => ({
              name: g.name,
              relationship: g.relationship,
              mobileNo: g.mobileNo,
            })),
          },
        }),
      },
    });

    if (created.firstDueDate && created.noOfDues > 0 && created.perDueAmount > 0) {
      const lastEmi = resolveLastEmiAmount(created.totalDueAmount, created.perDueAmount, created.noOfDues);
      await tx.loanSchedule.createMany({
        data: buildScheduleRows(created.id, created.noOfDues, created.perDueAmount, created.firstDueDate, packageFrequency, lastEmi),
      });
    }

    return created;
  });

  res.status(201).json(loan);
});

export const updateLoanStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, remarks, sanctionDate, disbursementDate } = req.body;

  const existingLoan = await prisma.loan.findUnique({
    where: { id: String(id) },
    include: { customer: { include: { area: true, center: true } }, package: true },
  });
  if (!existingLoan) return res.status(404).json({ error: 'Loan not found' });

  const user = (req as any).user;
  requireBranchAccess(user, existingLoan.customer?.area?.branchId, 'update a loan for a customer outside your branch');
  const areaScopeErr = checkAreaScope(user, res.locals.areaIds, existingLoan.customer?.areaId);
  if (areaScopeErr) return res.status(403).json({ error: areaScopeErr });

  if (!isValidLoanTransition(existingLoan.status, status)) {
    return res.status(400).json({ error: `Cannot change loan status from ${existingLoan.status} to ${status}` });
  }

  const resolvedSanction = sanctionDate ? String(sanctionDate).slice(0, 10) : null;
  const resolvedDisbursement = disbursementDate
    ? String(disbursementDate).slice(0, 10)
    : status === LoanStatus.APPROVED && resolvedSanction
      ? resolvedSanction
      : null;

  if (resolvedSanction && resolvedDisbursement && resolvedDisbursement > resolvedSanction) {
    return res.status(400).json({ error: 'Disbursement date cannot be after loan start date' });
  }

  if (existingLoan.status !== status) {
    const editPerm = await assertMenuPermission(user, '/admin/loans', 'canEdit');
    if (editPerm) return res.status(403).json({ error: editPerm });
  }

  const loan = await prisma.$transaction(async (tx) => {
    const updatedLoan = await tx.loan.update({
      where: { id: String(id) },
      data: {
        status,
        ...(remarks !== undefined && { remarks }),
        ...(sanctionDate && { sanctionDate: new Date(sanctionDate) }),
        ...(disbursementDate && { disbursementDate: new Date(disbursementDate) }),
        ...(status === LoanStatus.APPROVED && !disbursementDate && { disbursementDate: new Date(sanctionDate || Date.now()) }),
      },
    });

    if (status === LoanStatus.DROPPED && existingLoan.status !== LoanStatus.DROPPED) {
      await handleDroppedLoan(tx, existingLoan.id, existingLoan.customerId);
    }

    if (status === LoanStatus.CLOSED && existingLoan.status !== LoanStatus.CLOSED) {
      await handleManualLoanClose(
        tx,
        existingLoan.id,
        existingLoan.customerId,
        disbursementDate ? new Date(disbursementDate) : new Date()
      );
    }

    if (status === LoanStatus.APPROVED && existingLoan.status !== LoanStatus.APPROVED) {
      const packageFrequency =
        existingLoan.package?.frequency?.toUpperCase() ||
        existingLoan.customer?.center?.repaymentType?.toUpperCase() ||
        'WEEKLY';
      const scheduleStart = existingLoan.firstDueDate
        ? new Date(existingLoan.firstDueDate)
        : sanctionDate
          ? new Date(sanctionDate)
          : new Date(updatedLoan.sanctionDate || updatedLoan.createdAt);

      await tx.loanSchedule.deleteMany({ where: { loanId: existingLoan.id } });

      if (updatedLoan.noOfDues > 0 && updatedLoan.perDueAmount > 0) {
        const lastEmi = resolveLastEmiAmount(updatedLoan.totalDueAmount, updatedLoan.perDueAmount, updatedLoan.noOfDues);
        await tx.loanSchedule.createMany({
          data: buildScheduleRows(
            updatedLoan.id,
            updatedLoan.noOfDues,
            updatedLoan.perDueAmount,
            scheduleStart,
            packageFrequency,
            lastEmi
          ),
        });
      }

      const liabilityAmount = existingLoan.totalDueAmount || 0;
      const disbursedAmount = existingLoan.netDisbursement || existingLoan.amount || 0;

      const lastCustomerLedger = await tx.customerLedger.findFirst({
        where: { customerId: existingLoan.customerId },
        orderBy: { createdAt: 'desc' },
      });
      const custOpening = lastCustomerLedger?.closingBalance ?? 0;

      await tx.customerLedger.create({
        data: {
          transactionType: 'Disbursement',
          amount: disbursedAmount,
          openingBalance: custOpening,
          closingBalance: custOpening + disbursedAmount,
          remarks: `Loan ${existingLoan.loanNumber} disbursement`,
          customerId: existingLoan.customerId,
          date: updatedLoan.disbursementDate || new Date(),
        },
      });

      const lastLoanLedger = await tx.loanLedger.findFirst({
        where: { loanId: existingLoan.id },
        orderBy: { createdAt: 'desc' },
      });
      const loanOpening = lastLoanLedger?.closingBalance ?? 0;

      await tx.loanLedger.create({
        data: {
          transactionType: 'Disbursement',
          amount: liabilityAmount,
          openingBalance: loanOpening,
          closingBalance: loanOpening + liabilityAmount,
          remarks: `Loan ${existingLoan.loanNumber} approved`,
          loanId: existingLoan.id,
          date: updatedLoan.disbursementDate || new Date(),
        },
      });
    }

    return updatedLoan;
  });

  res.json(loan);
});

export const getLoans = asyncHandler(async (req: Request, res: Response) => {
  const { customerId, status, branchId, centerId } = req.query;
  const where: any = {};
  if (customerId) where.customerId = String(customerId);
  if (status) {
    const statuses = String(status).split(',').map((s) => s.trim());
    where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
  }

  if (centerId) {
    where.customer = { ...where.customer, centerId: String(centerId) };
  }

  const user = (req as any).user;
  const userBranchId = user?.branchId;

  if (res.locals.areaIds?.length > 0) {
    where.customer = { ...where.customer, areaId: { in: res.locals.areaIds } };
  } else if (userBranchId) {
    where.customer = { ...where.customer, area: { branchId: userBranchId } };
  } else if (branchId && branchId !== 'all') {
    where.customer = { ...where.customer, area: { branchId: String(branchId) } };
  }

  const { page, limit, skip } = parsePagination(req.query as Record<string, string>);

  const [loans, total] = await Promise.all([
    prisma.loan.findMany({
      where,
      include: {
        customer: { include: { area: { include: { branch: true } }, center: true } },
        staff: true,
        schedules: { orderBy: { dueDate: 'asc' } },
        collections: { where: { isVoided: false }, take: 5, orderBy: { trnDate: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.loan.count({ where }),
  ]);
  res.json(paginatedResponse(loans, total, page, limit));
});

export const getLoanById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const loan = await prisma.loan.findUnique({
    where: { id: String(id) },
    include: {
      customer: { include: { center: true, area: { include: { branch: true } }, kyc: true, bank: true, coApplicant: true } },
      staff: true,
      package: true,
      guarantors: true,
      schedules: { orderBy: { dueDate: 'asc' } },
      collections: { where: { isVoided: false }, orderBy: { trnDate: 'desc' }, include: { staff: { select: { name: true } } } },
    },
  });

  if (!loan) return res.status(404).json({ error: 'Loan not found' });

  const user = (req as any).user;
  requireBranchAccess(user, loan.customer?.area?.branchId, 'view this loan');
  const areaScopeErr = checkAreaScope(user, res.locals.areaIds, loan.customer?.areaId);
  if (areaScopeErr) return res.status(403).json({ error: areaScopeErr });

  res.json(loan);
});

export const updateLoanFinancial = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    amount, noOfDues, perDueAmount, totalDueAmount, deductionAmount, netDisbursement,
    firstDueDate, remarks,
  } = req.body;

  const existingLoan = await prisma.loan.findUnique({
    where: { id: String(id) },
    include: { customer: { include: { area: true, center: true } }, package: true },
  });
  if (!existingLoan) return res.status(404).json({ error: 'Loan not found' });

  const user = (req as any).user;
  requireBranchAccess(user, existingLoan.customer?.area?.branchId, 'update a loan outside your branch');
  const areaScopeErr = checkAreaScope(user, res.locals.areaIds, existingLoan.customer?.areaId);
  if (areaScopeErr) return res.status(403).json({ error: areaScopeErr });
  const editPerm = await assertMenuPermission(user, '/admin/loans', 'canEdit');
  if (editPerm) return res.status(403).json({ error: editPerm });

  if (existingLoan.status !== LoanStatus.PENDING && existingLoan.status !== LoanStatus.APPROVED) {
    return res.status(400).json({ error: 'Financial fields can only be edited for PENDING or APPROVED loans' });
  }

  const [paidSchedules, collectionCount] = await Promise.all([
    prisma.loanSchedule.count({
      where: { loanId: existingLoan.id, status: { in: ['PAID', 'PARTIAL'] } },
    }),
    prisma.collection.count({ where: { loanId: existingLoan.id, isVoided: false } }),
  ]);
  if (paidSchedules > 0 || collectionCount > 0) {
    return res.status(400).json({ error: 'Cannot change financial details after collections have been recorded.' });
  }

  const numDues = Number(noOfDues ?? existingLoan.noOfDues);
  const perDue = Number(perDueAmount ?? existingLoan.perDueAmount);
  const totalDue = Number(totalDueAmount ?? existingLoan.totalDueAmount);
  const lastEmi = resolveLastEmiAmount(totalDue, perDue, numDues);
  const scheduleSum = numDues <= 1 ? perDue : perDue * (numDues - 1) + lastEmi;
  if (Math.abs(totalDue - scheduleSum) > 0.01) {
    return res.status(400).json({ error: 'Total due must equal sum of all EMI installments' });
  }

  const loanAmount = Number(amount ?? existingLoan.amount);
  const deduct = Number(deductionAmount ?? existingLoan.deductionAmount);
  const net = Number(netDisbursement ?? existingLoan.netDisbursement);
  if (Math.abs(net - (loanAmount - deduct)) > 0.01) {
    return res.status(400).json({ error: 'Net disbursement must equal loan amount minus deduction' });
  }

  const loan = await prisma.$transaction(async (tx) => {
    const updated = await tx.loan.update({
      where: { id: String(id) },
      data: {
        amount: loanAmount,
        noOfDues: numDues,
        perDueAmount: perDue,
        totalDueAmount: totalDue,
        deductionAmount: deduct,
        netDisbursement: net,
        outstandingAmount: totalDue,
        ...(firstDueDate && { firstDueDate: new Date(firstDueDate) }),
        ...(remarks !== undefined && { remarks }),
      },
    });

    if (existingLoan.status === LoanStatus.APPROVED) {
      const packageFrequency =
        existingLoan.package?.frequency?.toUpperCase() ||
        existingLoan.customer?.center?.repaymentType?.toUpperCase() ||
        'WEEKLY';
      const scheduleStart = updated.firstDueDate
        ? new Date(updated.firstDueDate)
        : new Date(updated.sanctionDate || updated.createdAt);

      await tx.loanSchedule.deleteMany({ where: { loanId: existingLoan.id } });
      if (numDues > 0 && perDue > 0) {
        await tx.loanSchedule.createMany({
          data: buildScheduleRows(
            updated.id,
            numDues,
            perDue,
            scheduleStart,
            packageFrequency,
            lastEmi
          ),
        });
      }
    }

    return updated;
  });

  res.json(loan);
});

export const deleteLoan = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const existingLoan = await prisma.loan.findUnique({
    where: { id: String(id) },
    include: { customer: { include: { area: true } }, collections: { take: 1 } },
  });
  if (!existingLoan) return res.status(404).json({ error: 'Loan not found' });

  const user = (req as any).user;
  requireBranchAccess(user, existingLoan.customer?.area?.branchId, 'delete a loan for a customer outside your branch');
  const areaScopeErr = checkAreaScope(user, res.locals.areaIds, existingLoan.customer?.areaId);
  if (areaScopeErr) return res.status(403).json({ error: areaScopeErr });
  const deletePerm = await assertMenuPermission(user, '/admin/loans', 'canDelete');
  if (deletePerm) return res.status(403).json({ error: deletePerm });

  if (existingLoan.status !== LoanStatus.PENDING) {
    return res.status(400).json({ error: 'Only pending loans can be deleted' });
  }
  if (existingLoan.collections.length > 0) {
    return res.status(400).json({ error: 'Cannot delete loan with collections' });
  }

  await prisma.loan.delete({ where: { id: String(id) } });
  res.json({ message: 'Loan deleted successfully' });
});

export const getLoanLedger = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const loan = await prisma.loan.findUnique({
    where: { id: String(id) },
    include: { customer: { include: { area: true } } },
  });
  if (!loan) return res.status(404).json({ error: 'Loan not found' });

  const user = (req as any).user;
  requireBranchAccess(user, loan.customer?.area?.branchId, 'view this loan ledger');
  const areaScopeErr = checkAreaScope(user, res.locals.areaIds, loan.customer?.areaId);
  if (areaScopeErr) return res.status(403).json({ error: areaScopeErr });

  const ledger = await prisma.loanLedger.findMany({
    where: { loanId: String(id) },
    include: { collection: { select: { trnNumber: true } } },
    orderBy: { date: 'asc' },
  });

  res.json(ledger);
});
