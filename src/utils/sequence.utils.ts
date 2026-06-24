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
  const n = await nextSequenceValue(tx, 'TRN');
  return `TRN${n.toString().padStart(6, '0')}`;
}
