import { Prisma } from '@prisma/client';
import { LOAN_COLLECTIBLE_STATUSES, sumUnpaidScheduleAmount } from './loan.utils';
import { LoanStatus, ScheduleStatus, UNPAID_SCHEDULE_STATUSES } from './prisma-enums';
import { getDayRange } from './date.utils';

type Tx = Prisma.TransactionClient;

type ScheduleRow = {
  id: string;
  emiAmount: number;
  amountPaid: number;
  status: string;
  dueDate: Date;
};

export async function getNextTrnNumber(tx: Tx): Promise<string> {
  const entries = await tx.collection.findMany({ select: { trnNumber: true } });
  let max = 0;
  for (const entry of entries) {
    const parsed = parseInt(String(entry.trnNumber).replace(/^TRN/i, ''), 10);
    if (!isNaN(parsed) && parsed > max) max = parsed;
  }
  return `TRN${(max + 1).toString().padStart(6, '0')}`;
}

export async function allocateCollection(
  tx: Tx,
  loanId: string,
  schedules: ScheduleRow[],
  poolAmount: number,
  trnDate: Date,
  collectionId: string
) {
  let remaining = poolAmount;
  for (const schedule of schedules) {
    if (remaining <= 0) break;
    const due = schedule.emiAmount - (schedule.amountPaid || 0);
    if (due <= 0) continue;

    if (remaining >= due) {
      remaining -= due;
      await tx.loanSchedule.update({
        where: { id: schedule.id },
        data: {
          status: ScheduleStatus.PAID,
          paidDate: trnDate,
          amountPaid: schedule.emiAmount,
          collectionId,
        },
      });
    } else {
      await tx.loanSchedule.update({
        where: { id: schedule.id },
        data: {
          status: ScheduleStatus.PARTIAL,
          amountPaid: (schedule.amountPaid || 0) + remaining,
          collectionId,
        },
      });
      remaining = 0;
    }
  }
  return remaining;
}

export type ProcessCollectionResult = {
  collection: { id: string; trnNumber: string };
  skipped?: boolean;
  skipReason?: string;
};

export async function processLoanCollection(
  tx: Tx,
  params: {
    loanId: string;
    amount: number;
    trnDate: Date;
    trnNumber: string;
    staffId?: string | null;
    remarks?: string | null;
    centerId?: string;
    userBranchId?: string;
    isAdmin?: boolean;
  }
): Promise<ProcessCollectionResult> {
  const { loanId, amount, trnDate, trnNumber, staffId, remarks, centerId, userBranchId, isAdmin } = params;

  if (amount <= 0) {
    return { collection: { id: '', trnNumber: '' }, skipped: true, skipReason: 'Amount must be greater than zero' };
  }

  const { dayStart, dayEnd } = getDayRange(trnDate);

  const existing = await tx.collection.findFirst({
    where: { loanId, trnDate: { gte: dayStart, lte: dayEnd } },
  });
  if (existing) {
    return { collection: { id: existing.id, trnNumber: existing.trnNumber }, skipped: true, skipReason: 'Duplicate collection for this loan on the same date' };
  }

  const loan = await tx.loan.findUnique({
    where: { id: loanId },
    include: {
      customer: { include: { area: true } },
      schedules: {
        where: { status: { in: UNPAID_SCHEDULE_STATUSES } },
        orderBy: { dueDate: 'asc' },
      },
    },
  });

  if (!loan) throw new Error(`Loan ${loanId} not found`);

  if (!LOAN_COLLECTIBLE_STATUSES.includes(loan.status as LoanStatus)) {
    throw new Error(`Cannot collect on loan ${loan.loanNumber} with status ${loan.status}`);
  }

  if (!isAdmin && userBranchId && loan.customer?.area?.branchId !== userBranchId) {
    throw new Error(`Security violation: loan ${loan.loanNumber} is outside your branch`);
  }

  if (centerId && loan.customer?.centerId !== centerId) {
    throw new Error(`Loan ${loan.loanNumber} does not belong to the selected center`);
  }

  const customer = await tx.customer.findUnique({ where: { id: loan.customerId } });
  if (customer && !customer.isActive) {
    throw new Error(`Customer is inactive — collection not allowed for loan ${loan.loanNumber}`);
  }

  const collection = await tx.collection.create({
    data: {
      trnNumber,
      trnDate,
      amount,
      remarks: remarks || null,
      loanId: loan.id,
      staffId: staffId || loan.staffId,
    },
  });

  const pool = amount + (loan.advanceBalance || 0);
  const scheduleOutstanding = await sumUnpaidScheduleAmount(tx, loan.id);
  if (amount > scheduleOutstanding + 0.01) {
    throw new Error(
      `Amount ₹${amount} exceeds outstanding balance ₹${scheduleOutstanding.toFixed(2)}`
    );
  }

  const leftover = await allocateCollection(tx, loan.id, loan.schedules, pool, trnDate, collection.id);

  const newScheduleOutstanding = await sumUnpaidScheduleAmount(tx, loan.id);
  let newOutstanding = newScheduleOutstanding;
  let newAdvanceBalance = leftover;

  let newStatus = loan.status;
  if (newOutstanding <= 0) {
    newOutstanding = 0;
    newStatus = LoanStatus.CLOSED;
  } else if (loan.status === LoanStatus.APPROVED) {
    newStatus = LoanStatus.ACTIVE;
  }

  await tx.loan.update({
    where: { id: loan.id },
    data: {
      outstandingAmount: newOutstanding,
      advanceBalance: newAdvanceBalance,
      status: newStatus,
      ...(loan.status === LoanStatus.APPROVED && !loan.disbursementDate && { disbursementDate: trnDate }),
    },
  });

  const lastCustomerLedger = await tx.customerLedger.findFirst({
    where: { customerId: loan.customerId },
    orderBy: { createdAt: 'desc' },
  });
  const customerOpening = lastCustomerLedger ? lastCustomerLedger.closingBalance : 0;
  const customerClosing = customerOpening - amount;

  await tx.customerLedger.create({
    data: {
      transactionType: 'Collection',
      amount,
      openingBalance: customerOpening,
      closingBalance: customerClosing,
      remarks: remarks || null,
      customerId: loan.customerId,
      collectionId: collection.id,
      date: trnDate,
    },
  });

  const lastLoanLedger = await tx.loanLedger.findFirst({
    where: { loanId: loan.id },
    orderBy: { createdAt: 'desc' },
  });
  const loanOpening = lastLoanLedger ? lastLoanLedger.closingBalance : loan.outstandingAmount;
  const loanClosing = newOutstanding;

  await tx.loanLedger.create({
    data: {
      transactionType: 'EMI Collection',
      amount,
      openingBalance: loanOpening,
      closingBalance: loanClosing,
      remarks: remarks || null,
      loanId: loan.id,
      collectionId: collection.id,
      date: trnDate,
    },
  });

  return { collection: { id: collection.id, trnNumber: collection.trnNumber } };
}
