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

function branchPrefix(branchId: string | undefined, tx: Tx): Promise<string> {
  if (!branchId) return Promise.resolve('CUS');
  return tx.branch.findUnique({ where: { id: branchId } }).then((branch) => {
    if (!branch?.name) return 'CUS';
    return branch.name.trim().replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase();
  });
}

export async function nextCustomerNo(tx: Tx, branchId?: string): Promise<string> {
  const prefix = await branchPrefix(branchId, tx);
  const n = await nextSequenceValue(tx, `CUS:${prefix}`);
  return `${prefix}${n.toString().padStart(3, '0')}`;
}

export async function nextLoanNumber(tx: Tx, branchId?: string): Promise<string> {
  let prefix = 'L';
  if (branchId) {
    const branch = await tx.branch.findUnique({ where: { id: branchId } });
    if (branch?.name) {
      prefix = branch.name.trim().replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() + '-';
    }
  }
  const n = await nextSequenceValue(tx, `LOAN:${prefix}`);
  return `${prefix}L${n.toString().padStart(4, '0')}`;
}

export async function nextTrnNumber(tx: Tx): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const n = await nextSequenceValue(tx, 'TRN');
    const trnNumber = `TRN${n.toString().padStart(6, '0')}`;
    const exists = await tx.collection.findFirst({
      where: { trnNumber },
      select: { id: true },
    });
    if (!exists) return trnNumber;

    // Sequence behind existing rows — bump to max in DB and retry
    const maxTrn = await maxExistingTrnNumber(tx);
    if (maxTrn >= n) {
      await tx.sequence.upsert({
        where: { id: 'TRN' },
        create: { id: 'TRN', value: maxTrn },
        update: { value: maxTrn },
      });
    }
  }
  throw new Error('Unable to allocate a unique transaction number');
}

async function maxExistingTrnNumber(tx: Tx): Promise<number> {
  const rows = await tx.collection.findMany({ select: { trnNumber: true } });
  let max = 0;
  for (const row of rows) {
    const n = parseInt(String(row.trnNumber).replace(/^TRN/i, ''), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return max;
}
