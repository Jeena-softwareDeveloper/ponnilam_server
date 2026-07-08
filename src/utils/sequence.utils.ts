import { Prisma } from '@prisma/client';
import { customerSequenceKey } from './center-short-code.service';

type Tx = Prisma.TransactionClient;

export async function nextSequenceValue(tx: Tx, key: string): Promise<number> {
  const existing = await tx.sequence.findUnique({ where: { id: key } });
  if (!existing) {
    const created = await tx.sequence.create({ data: { id: key, value: 1 } });
    return created.value;
  }
  const updated = await tx.sequence.update({
    where: { id: key },
    data: { value: { increment: 1 } },
  });
  return updated.value;
}

async function allocateUniqueFormatted(
  tx: Tx,
  sequenceKey: string,
  format: (n: number) => string,
  exists: (value: string) => Promise<boolean>,
  resyncSequence?: (tx: Tx) => Promise<number>
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const n = await nextSequenceValue(tx, sequenceKey);
    const value = format(n);
    if (!(await exists(value))) return value;

    if (resyncSequence) {
      const max = await resyncSequence(tx);
      if (max >= n) {
        await tx.sequence.upsert({
          where: { id: sequenceKey },
          create: { id: sequenceKey, value: max },
          update: { value: max },
        });
      }
    }
  }
  throw new Error(`Unable to allocate unique number for ${sequenceKey}`);
}

export function nameCodePrefix(name: string, fallback = 'CUS'): string {
  return name.trim().replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || fallback;
}


async function loanPrefix(branchId: string | undefined, tx: Tx): Promise<string> {
  if (!branchId) return 'L';
  const branch = await tx.branch.findUnique({ where: { id: branchId } });
  if (!branch?.name) return 'L';
  return branch.name.trim().replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() + '-';
}

async function maxNumericSuffix(
  tx: Tx,
  rows: { value: string | null }[],
  pattern: RegExp
): Promise<number> {
  let max = 0;
  for (const row of rows) {
    const m = String(row.value || '').match(pattern);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return max;
}

/** Smallest positive integer not in used (fills gaps from deleted customers). */
export function lowestAvailableSuffix(used: Iterable<number>): number {
  const set = new Set(used);
  let n = 1;
  while (set.has(n)) n++;
  return n;
}

function loanNumberPattern(prefix: string): RegExp {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}L(\\d+)$`);
}

export async function lowestAvailableLoanSuffix(tx: Tx, prefix: string): Promise<number> {
  const rows = await tx.loan.findMany({
    where: { loanNumber: { startsWith: prefix } },
    select: { loanNumber: true },
  });
  const pattern = loanNumberPattern(prefix);
  const used: number[] = [];
  for (const row of rows) {
    const m = String(row.loanNumber || '').match(pattern);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n)) used.push(n);
    }
  }
  return lowestAvailableSuffix(used);
}

export async function nextLoanNumber(tx: Tx, branchId?: string): Promise<string> {
  const prefix = await loanPrefix(branchId, tx);
  const key = `LOAN:${prefix}`;
  const format = (n: number) => `${prefix}L${n.toString().padStart(4, '0')}`;

  for (let attempt = 0; attempt < 10; attempt++) {
    const n = await lowestAvailableLoanSuffix(tx, prefix);
    const loanNumber = format(n);
    const taken = await tx.loan.findFirst({ where: { loanNumber }, select: { id: true } });
    if (!taken) {
      const existingSeq = await tx.sequence.findUnique({ where: { id: key } });
      const seqValue = Math.max(existingSeq?.value ?? 0, n);
      await tx.sequence.upsert({
        where: { id: key },
        create: { id: key, value: seqValue },
        update: { value: seqValue },
      });
      return loanNumber;
    }
  }
  throw new Error(`Unable to allocate unique loan number for ${prefix}`);
}

function staffNoPattern(prefix: string): RegExp {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}(\\d{3})$`);
}

/**
 * Determines the prefix for a new customer number.
 *
 * Priority:
 *  1. center.shortCode  — new enterprise format (e.g. JKA, JPA, JPK)
 *  2. center.name 3-letter abbreviation — legacy fallback for centres that
 *     existed before the shortCode migration and have not yet been backfilled
 *  3. branch.name 3-letter abbreviation — when no centre is provided
 *  4. 'CUS' — absolute last-resort fallback
 *
 * This function MUST NOT be changed to drop the legacy fallback because
 * existing customer numbers (JEE001-008, JOT001-009, etc.) must continue
 * to increment correctly for those centres.
 */
async function customerNoPrefix(
  tx: Tx,
  centerId?: string,
  branchIdFallback?: string
): Promise<string> {
  if (centerId) {
    const center = await tx.center.findUnique({
      where: { id: centerId },
      select: { name: true, shortCode: true },
    });
    // ✅ NEW: prefer the unique short code (set on new/backfilled centres)
    if (center?.shortCode) return center.shortCode;
    // ✅ LEGACY FALLBACK: old 3-letter name prefix for pre-migration centres
    if (center?.name) return nameCodePrefix(center.name);
  }
  if (branchIdFallback) {
    const branch = await tx.branch.findUnique({ where: { id: branchIdFallback }, select: { name: true } });
    if (branch?.name) return nameCodePrefix(branch.name);
  }
  return 'CUS';
}

function customerNoPattern(prefix: string): RegExp {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}(\\d+)$`);
}

export async function lowestAvailableCustomerSuffix(tx: Tx, prefix: string): Promise<number> {
  const rows = await tx.customer.findMany({
    where: { customerNo: { startsWith: prefix } },
    select: { customerNo: true },
  });
  const pattern = customerNoPattern(prefix);
  const used: number[] = [];
  for (const row of rows) {
    const m = String(row.customerNo || '').match(pattern);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n)) used.push(n);
    }
  }
  return lowestAvailableSuffix(used);
}

/**
 * Generate the next unique customer number for a given center.
 *
 * For centres with a shortCode (new/backfilled), the sequence key is
 * "CUS:<shortCode>" and the prefix is the shortCode itself (e.g. "JKA").
 * For legacy centres without a shortCode, the prefix is the old 3-letter
 * name abbreviation so existing sequences are never disrupted.
 */
export async function nextCustomerNo(
  tx: Tx,
  centerId?: string,
  branchIdFallback?: string
): Promise<string> {
  const prefix = await customerNoPrefix(tx, centerId, branchIdFallback);
  const key = customerSequenceKey(prefix); // "CUS:<prefix>"
  const format = (n: number) => `${prefix}${n.toString().padStart(3, '0')}`;

  for (let attempt = 0; attempt < 10; attempt++) {
    const n = await lowestAvailableCustomerSuffix(tx, prefix);
    const customerNo = format(n);
    const taken = await tx.customer.findFirst({ where: { customerNo }, select: { id: true } });
    if (!taken) {
      const existingSeq = await tx.sequence.findUnique({ where: { id: key } });
      const seqValue = Math.max(existingSeq?.value ?? 0, n);
      await tx.sequence.upsert({
        where: { id: key },
        create: { id: key, value: seqValue },
        update: { value: seqValue },
      });
      return customerNo;
    }
  }
  throw new Error(`Unable to allocate unique customer number for ${prefix}`);
}

async function staffNoPrefix(branchId: string | undefined, tx: Tx): Promise<string> {
  if (!branchId) return 'EMPS';
  const branch = await tx.branch.findUnique({ where: { id: branchId }, select: { name: true } });
  return `${nameCodePrefix(branch?.name || '', 'EMP')}S`;
}

export async function lowestAvailableStaffSuffix(tx: Tx, prefix: string): Promise<number> {
  const rows = await tx.staff.findMany({
    where: { staffNo: { startsWith: prefix } },
    select: { staffNo: true },
  });
  const pattern = staffNoPattern(prefix);
  const used: number[] = [];
  for (const row of rows) {
    const m = String(row.staffNo || '').match(pattern);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n)) used.push(n);
    }
  }
  return lowestAvailableSuffix(used);
}

export async function nextStaffNo(tx: Tx, branchId?: string): Promise<string> {
  const prefix = await staffNoPrefix(branchId, tx);
  const key = `STAFF:${prefix}`;
  const format = (n: number) => `${prefix}${n.toString().padStart(3, '0')}`;

  for (let attempt = 0; attempt < 10; attempt++) {
    const n = await lowestAvailableStaffSuffix(tx, prefix);
    const staffNo = format(n);
    const taken = await tx.staff.findFirst({ where: { staffNo }, select: { id: true } });
    if (!taken) {
      const existingSeq = await tx.sequence.findUnique({ where: { id: key } });
      const seqValue = Math.max(existingSeq?.value ?? 0, n);
      await tx.sequence.upsert({
        where: { id: key },
        create: { id: key, value: seqValue },
        update: { value: seqValue },
      });
      return staffNo;
    }
  }
  throw new Error(`Unable to allocate unique staff number for ${prefix}`);
}

export async function nextTrnNumber(tx: Tx): Promise<string> {
  return allocateUniqueFormatted(
    tx,
    'TRN',
    (n) => `TRN${n.toString().padStart(6, '0')}`,
    (trnNumber) => tx.collection.findFirst({ where: { trnNumber }, select: { id: true } }).then(Boolean),
    async (innerTx) => {
      const rows = await innerTx.collection.findMany({ select: { trnNumber: true } });
      return maxNumericSuffix(innerTx, rows.map((r) => ({ value: r.trnNumber })), /^TRN(\d+)$/i);
    }
  );
}
