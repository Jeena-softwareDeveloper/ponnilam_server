import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFlatEmi,
  buildScheduleRows,
  sumUnpaidFromSchedules,
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
