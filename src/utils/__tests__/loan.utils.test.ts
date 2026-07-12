import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFlatEmi,
  buildScheduleRows,
  sumUnpaidFromSchedules,
  nextInstallmentDemand,
  installmentDemandForDueDate,
  loanDemandForCollectionDate,
  allocateCollectionPool,
  resolveLastEmiAmount,
  incrementDueDate,
} from '../loan.utils';
import { ScheduleStatus } from '../prisma-enums';

describe('computeFlatEmi', () => {
  it('TC-EMI-01: standard 10% / 10 dues', () => {
    const { perDueAmount, lastEmiAmount, totalDueAmount } = computeFlatEmi(10000, 10, 10);
    assert.equal(totalDueAmount, 11000);
    assert.equal(perDueAmount, 1100);
    assert.equal(lastEmiAmount, 1100);
    assert.equal(perDueAmount * 9 + lastEmiAmount, totalDueAmount);
  });

  it('TC-EMI-02: 7 dues — remainder on last EMI', () => {
    const { perDueAmount, lastEmiAmount, totalDueAmount } = computeFlatEmi(10000, 10, 7);
    assert.equal(totalDueAmount, 11000);
    assert.equal(perDueAmount, 1571);
    assert.equal(lastEmiAmount, 1574);
    assert.equal(perDueAmount * 6 + lastEmiAmount, totalDueAmount);
  });
});

describe('buildScheduleRows', () => {
  it('TC-EMI-05: schedule sum equals total due', () => {
    const { perDueAmount, lastEmiAmount, totalDueAmount } = computeFlatEmi(10000, 10, 7);
    const rows = buildScheduleRows('loan-1', 7, perDueAmount, new Date('2025-01-01'), 'WEEKLY', lastEmiAmount);
    const sum = rows.reduce((s, r) => s + r.emiAmount, 0);
    assert.equal(rows.length, 7);
    assert.equal(sum, totalDueAmount);
    assert.equal(rows[6].emiAmount, lastEmiAmount);
  });
});

describe('nextInstallmentDemand', () => {
  it('returns one EMI when many pending schedules exist', () => {
    const schedules = Array.from({ length: 28 }, (_, i) => ({
      emiAmount: 650,
      amountPaid: 0,
      status: ScheduleStatus.PENDING,
      dueDate: new Date(`2026-07-${String(9 + i * 7).padStart(2, '0')}`),
    }));
    assert.equal(nextInstallmentDemand(schedules, 650, 18200), 650);
  });

  it('returns partial balance on next due schedule', () => {
    const schedules = [
      { emiAmount: 650, amountPaid: 200, status: ScheduleStatus.PARTIAL, dueDate: new Date('2026-07-09') },
      { emiAmount: 650, amountPaid: 0, status: ScheduleStatus.PENDING, dueDate: new Date('2026-07-16') },
    ];
    assert.equal(nextInstallmentDemand(schedules, 650, 1100), 450);
  });

  it('falls back to perDueAmount when no schedules', () => {
    assert.equal(nextInstallmentDemand([], 650, 5000), 650);
  });
});

describe('installmentDemandForDueDate', () => {
  it('returns demand only for schedules due on the selected date', () => {
    const schedules = [
      { emiAmount: 650, amountPaid: 0, status: ScheduleStatus.PENDING, dueDate: '2026-07-04' },
      { emiAmount: 650, amountPaid: 0, status: ScheduleStatus.PENDING, dueDate: '2026-07-11' },
    ];
    assert.equal(installmentDemandForDueDate(schedules, '2026-07-04', 5000), 650);
    assert.equal(installmentDemandForDueDate(schedules, '2026-07-11', 5000), 650);
    assert.equal(installmentDemandForDueDate(schedules, '2026-07-05', 5000), 0);
  });

  it('uses due-date demand only when collectionDate is set', () => {
    const schedules = [
      { emiAmount: 650, amountPaid: 0, status: ScheduleStatus.PENDING, dueDate: '2026-07-06' },
      { emiAmount: 650, amountPaid: 0, status: ScheduleStatus.PENDING, dueDate: '2026-07-13' },
    ];
    assert.equal(loanDemandForCollectionDate(schedules, '2026-07-06', 650, 5000), 650);
    assert.equal(loanDemandForCollectionDate(schedules, '2026-07-13', 650, 5000), 650);
    assert.equal(loanDemandForCollectionDate(schedules, '2026-07-06', 650, 0), 0);
  });
});

describe('sumUnpaidFromSchedules', () => {
  it('TC-OUT-02: after one full EMI paid', () => {
    const schedules = [
      { emiAmount: 1100, amountPaid: 1100, status: ScheduleStatus.PAID },
      { emiAmount: 1100, amountPaid: 0, status: ScheduleStatus.PENDING },
    ];
    assert.equal(sumUnpaidFromSchedules(schedules), 1100);
  });

  it('TC-OUT-03: partial payment', () => {
    const schedules = [
      { emiAmount: 1100, amountPaid: 500, status: ScheduleStatus.PARTIAL },
      { emiAmount: 1100, amountPaid: 0, status: ScheduleStatus.PENDING },
    ];
    assert.equal(sumUnpaidFromSchedules(schedules), 1700);
  });
});

describe('allocateCollectionPool', () => {
  it('TC-COL-01: FIFO pays oldest schedule first', () => {
    const schedules = [
      { id: '1', emiAmount: 1100, amountPaid: 0, status: ScheduleStatus.PENDING },
      { id: '2', emiAmount: 1100, amountPaid: 0, status: ScheduleStatus.PENDING },
    ];
    const { schedules: updated, leftover } = allocateCollectionPool(schedules, 1100);
    assert.equal(updated[0].status, ScheduleStatus.PAID);
    assert.equal(updated[1].status, ScheduleStatus.PENDING);
    assert.equal(leftover, 0);
    assert.equal(sumUnpaidFromSchedules(updated), 1100);
  });

  it('TC-COL-03: partial allocation', () => {
    const schedules = [
      { id: '1', emiAmount: 1100, amountPaid: 0, status: ScheduleStatus.PENDING },
    ];
    const { schedules: updated, leftover } = allocateCollectionPool(schedules, 500);
    assert.equal(updated[0].status, ScheduleStatus.PARTIAL);
    assert.equal(updated[0].amountPaid, 500);
    assert.equal(leftover, 0);
    assert.equal(sumUnpaidFromSchedules(updated), 600);
  });
});

describe('resolveLastEmiAmount', () => {
  it('matches computeFlatEmi last installment', () => {
    const emi = computeFlatEmi(10000, 10, 7);
    assert.equal(resolveLastEmiAmount(emi.totalDueAmount, emi.perDueAmount, 7), emi.lastEmiAmount);
  });
});

describe('incrementDueDate', () => {
  it('weekly adds 7 days', () => {
    const start = new Date('2025-01-01');
    const next = incrementDueDate(start, 'WEEKLY');
    assert.equal(next.toISOString().slice(0, 10), '2025-01-08');
  });
});
