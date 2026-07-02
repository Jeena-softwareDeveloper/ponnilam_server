import { Prisma } from '@prisma/client';

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

async function customerNoPrefix(
  tx: Tx,
  centerId?: string,
  branchIdFallback?: string
): Promise<string> {
  if (centerId) {
    const center = await tx.center.findUnique({ where: { id: centerId }, select: { name: true } });
    if (center?.name) return nameCodePrefix(center.name);
  }
  if (branchIdFallback) {
    const branch = await tx.branch.findUnique({ where: { id: branchIdFallback }, select: { name: true } });
    if (branch?.name) return nameCodePrefix(branch.name);
  }
  return 'CUS';
}

async function branchPrefix(branchId: string | undefined, tx: Tx): Promise<string> {
  if (!branchId) return 'CUS';
  const branch = await tx.branch.findUnique({ where: { id: branchId } });
  return nameCodePrefix(branch?.name || '', 'CUS');
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

export async function nextCustomerNo(
  tx: Tx,
  centerId?: string,
  branchIdFallback?: string
): Promise<string> {
  const prefix = await customerNoPrefix(tx, centerId, branchIdFallback);
  const key = `CUS:${prefix}`;
  return allocateUniqueFormatted(
    tx,
    key,
    (n) => `${prefix}${n.toString().padStart(3, '0')}`,
    (customerNo) => tx.customer.findFirst({ where: { customerNo }, select: { id: true } }).then(Boolean),
    async (innerTx) => {
      const rows = await innerTx.customer.findMany({
        where: { customerNo: { startsWith: prefix } },
        select: { customerNo: true },
      });
      return maxNumericSuffix(innerTx, rows.map((r) => ({ value: r.customerNo })), new RegExp(`^${prefix}(\\d+)$`));
    }
  );
}

export async function nextLoanNumber(tx: Tx, branchId?: string): Promise<string> {
  const prefix = await loanPrefix(branchId, tx);
  const key = `LOAN:${prefix}`;
  return allocateUniqueFormatted(
    tx,
    key,
    (n) => `${prefix}L${n.toString().padStart(4, '0')}`,
    (loanNumber) => tx.loan.findFirst({ where: { loanNumber }, select: { id: true } }).then(Boolean),
    async (innerTx) => {
      const rows = await innerTx.loan.findMany({
        where: { loanNumber: { startsWith: prefix } },
        select: { loanNumber: true },
      });
      return maxNumericSuffix(innerTx, rows.map((r) => ({ value: r.loanNumber })), new RegExp(`^${prefix.replace('-', '\\-')}L(\\d+)$`));
    }
  );
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
