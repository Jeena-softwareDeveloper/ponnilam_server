import { Prisma } from '@prisma/client';
import { ScheduleStatus, UNPAID_SCHEDULE_STATUSES } from './prisma-enums';

type Tx = Prisma.TransactionClient;

export { LOAN_COLLECTIBLE_STATUSES, ALLOWED_LOAN_TRANSITIONS, isValidLoanTransition, OPEN_LOAN_STATUSES, UNPAID_SCHEDULE_STATUSES } from './prisma-enums';

/** Flat-rate EMI: remainder on last installment so Σ EMI = principal + interest. */
export function computeFlatEmi(principal: number, ratePercent: number, noOfDues: number) {
  if (noOfDues <= 0 || principal <= 0) {
    return { perDueAmount: 0, lastEmiAmount: 0, totalDueAmount: 0 };
  }
  const totalDueAmount = Math.round(principal * (1 + ratePercent / 100));
  const perDueAmount = Math.floor(totalDueAmount / noOfDues);
  const lastEmiAmount = totalDueAmount - perDueAmount * (noOfDues - 1);
  return { perDueAmount, lastEmiAmount, totalDueAmount };
}

export function resolveLastEmiAmount(totalDueAmount: number, perDueAmount: number, noOfDues: number) {
  if (noOfDues <= 1) return perDueAmount;
  return totalDueAmount - perDueAmount * (noOfDues - 1);
}

export function incrementDueDate(date: Date, frequency: string): Date {
  const next = new Date(date);
  const freq = frequency.toUpperCase();
  if (freq === 'WEEKLY') next.setDate(next.getDate() + 7);
  else if (freq === 'DAILY') next.setDate(next.getDate() + 1);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

export function buildScheduleRows(
  loanId: string,
  noOfDues: number,
  perDueAmount: number,
  startDate: Date,
  frequency: string,
  lastEmiAmount?: number
) {
  const rows: { loanId: string; dueDate: Date; emiAmount: number; status: ScheduleStatus }[] = [];
  let currentDate = new Date(startDate);
  const finalEmi = lastEmiAmount ?? perDueAmount;
  for (let i = 0; i < noOfDues; i++) {
    const emiAmount = i === noOfDues - 1 ? finalEmi : perDueAmount;
    rows.push({
      loanId,
      dueDate: new Date(currentDate),
      emiAmount,
      status: ScheduleStatus.PENDING,
    });
    currentDate = incrementDueDate(currentDate, frequency);
  }
  return rows;
}

export type ScheduleAmountRow = {
  emiAmount: number;
  amountPaid?: number;
  status: string;
};

export function sumUnpaidFromSchedules(schedules: ScheduleAmountRow[]): number {
  return schedules
    .filter((s) => UNPAID_SCHEDULE_STATUSES.includes(s.status as ScheduleStatus))
    .reduce((sum, s) => sum + (s.emiAmount - (s.amountPaid || 0)), 0);
}

export type ScheduleAllocRow = ScheduleAmountRow & { id: string };

/** Pure FIFO allocation for unit tests (mirrors collection.utils allocateCollection). */
export function allocateCollectionPool(
  schedules: ScheduleAllocRow[],
  poolAmount: number
): { schedules: ScheduleAllocRow[]; leftover: number } {
  let remaining = poolAmount;
  const updated = schedules.map((s) => ({ ...s, amountPaid: s.amountPaid || 0 }));

  for (const schedule of updated) {
    if (remaining <= 0) break;
    if (!UNPAID_SCHEDULE_STATUSES.includes(schedule.status as ScheduleStatus)) continue;
    const due = schedule.emiAmount - schedule.amountPaid;
    if (due <= 0) continue;

    if (remaining >= due) {
      remaining -= due;
      schedule.status = ScheduleStatus.PAID;
      schedule.amountPaid = schedule.emiAmount;
    } else {
      schedule.amountPaid += remaining;
      schedule.status = ScheduleStatus.PARTIAL;
      remaining = 0;
    }
  }

  return { schedules: updated, leftover: remaining };
}

export async function sumUnpaidScheduleAmount(tx: Tx, loanId: string): Promise<number> {
  const schedules = await tx.loanSchedule.findMany({
    where: { loanId, status: { in: UNPAID_SCHEDULE_STATUSES } },
    select: { emiAmount: true, amountPaid: true, status: true },
  });
  return sumUnpaidFromSchedules(schedules);
}

export async function handleDroppedLoan(
  tx: Tx,
  loanId: string,
  customerId: string,
  dropDate: Date = new Date()
) {
  await tx.loanSchedule.deleteMany({
    where: { loanId, status: { in: UNPAID_SCHEDULE_STATUSES } },
  });

  const lastLoanLedger = await tx.loanLedger.findFirst({
    where: { loanId },
    orderBy: { createdAt: 'desc' },
  });
  if (lastLoanLedger && lastLoanLedger.closingBalance > 0) {
    await tx.loanLedger.create({
      data: {
        transactionType: 'Loan Dropped',
        amount: lastLoanLedger.closingBalance,
        openingBalance: lastLoanLedger.closingBalance,
        closingBalance: 0,
        remarks: 'Loan dropped — liability reversed',
        loanId,
        date: dropDate,
      },
    });
  }

  const disbEntry = await tx.customerLedger.findFirst({
    where: { customerId, transactionType: 'Disbursement' },
    orderBy: { createdAt: 'desc' },
  });
  if (disbEntry) {
    const lastCustLedger = await tx.customerLedger.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
    const custOpening = lastCustLedger?.closingBalance ?? 0;
    await tx.customerLedger.create({
      data: {
        transactionType: 'Loan Dropped',
        amount: disbEntry.amount,
        openingBalance: custOpening,
        closingBalance: Math.max(0, custOpening - disbEntry.amount),
        remarks: 'Loan dropped — disbursement reversed',
        customerId,
        date: dropDate,
      },
    });
  }

  await tx.loan.update({
    where: { id: loanId },
    data: { outstandingAmount: 0, advanceBalance: 0 },
  });
}

/** Manual close: zero outstanding, mark unpaid schedules paid, write ledger entries. */
export async function handleManualLoanClose(
  tx: Tx,
  loanId: string,
  customerId: string,
  closeDate: Date
) {
  const unpaid = await tx.loanSchedule.findMany({
    where: { loanId, status: { in: UNPAID_SCHEDULE_STATUSES } },
  });

  const waivedAmount = unpaid.reduce(
    (sum, sch) => sum + (sch.emiAmount - (sch.amountPaid || 0)),
    0
  );

  for (const sch of unpaid) {
    await tx.loanSchedule.update({
      where: { id: sch.id },
      data: {
        status: ScheduleStatus.PAID,
        amountPaid: sch.emiAmount,
        paidDate: closeDate,
      },
    });
  }

  await tx.loan.update({
    where: { id: loanId },
    data: { outstandingAmount: 0, advanceBalance: 0 },
  });

  const lastLoanLedger = await tx.loanLedger.findFirst({
    where: { loanId },
    orderBy: { createdAt: 'desc' },
  });
  const loanOpening = lastLoanLedger?.closingBalance ?? waivedAmount;

  await tx.loanLedger.create({
    data: {
      transactionType: 'Loan Closure',
      amount: waivedAmount,
      openingBalance: loanOpening,
      closingBalance: 0,
      remarks: 'Manual loan closure — remaining balance written off',
      loanId,
      date: closeDate,
    },
  });

  if (waivedAmount > 0) {
    const lastCustomerLedger = await tx.customerLedger.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
    const custOpening = lastCustomerLedger?.closingBalance ?? 0;
    await tx.customerLedger.create({
      data: {
        transactionType: 'Loan Closure',
        amount: waivedAmount,
        openingBalance: custOpening,
        closingBalance: Math.max(0, custOpening - waivedAmount),
        remarks: 'Manual loan closure',
        customerId,
        date: closeDate,
      },
    });
  }
}
