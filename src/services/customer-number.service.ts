import { Prisma } from '@prisma/client';
import { lowestAvailableSuffix } from '../utils/sequence.utils';
import { ensureCenterShortCode, escapeRegExp } from './center-short-code.service';

type Tx = Prisma.TransactionClient;

const SUFFIX_PAD = 3;
const MAX_ATTEMPTS = 10;

export interface CustomerNumberParams {
  /** Center the customer belongs to — drives the per-center short-code prefix. */
  centerId?: string | null;
  /** Fallback branch used only when the customer has no center. */
  branchId?: string | null;
}

/** Prefix for customers without a center: normalized branch code, else "CUS". */
async function branchFallbackPrefix(tx: Tx, branchId?: string | null): Promise<string> {
  if (branchId) {
    const branch = await tx.branch.findUnique({ where: { id: branchId }, select: { code: true } });
    const code = (branch?.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code) return code;
  }
  return 'CUS';
}

/**
 * Resolve the customer-number prefix.
 * Center customers use the center's unique short code (created on demand);
 * center-less customers fall back to the branch code.
 */
async function resolveCustomerPrefix(tx: Tx, params: CustomerNumberParams): Promise<string> {
  if (params.centerId) {
    return ensureCenterShortCode(tx, params.centerId);
  }
  return branchFallbackPrefix(tx, params.branchId);
}

/** Lowest free running number for a prefix, gap-filling any deleted customers. */
async function nextRunningNumber(tx: Tx, prefix: string): Promise<number> {
  const rows = await tx.customer.findMany({
    where: { customerNo: { startsWith: prefix } },
    select: { customerNo: true },
  });
  const pattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`);
  const used: number[] = [];
  for (const row of rows) {
    const match = row.customerNo?.match(pattern);
    if (match) {
      const n = parseInt(match[1], 10);
      if (!Number.isNaN(n)) used.push(n);
    }
  }
  return lowestAvailableSuffix(used);
}

/**
 * Generate the next unique customer number.
 * Format: <CenterShortCode><zero-padded running sequence>, e.g. JPA001, JPA002.
 * Each center keeps its own sequence; existing numbers are never modified.
 */
export async function generateCustomerNumber(tx: Tx, params: CustomerNumberParams): Promise<string> {
  const prefix = await resolveCustomerPrefix(tx, params);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const n = await nextRunningNumber(tx, prefix);
    const customerNo = `${prefix}${String(n).padStart(SUFFIX_PAD, '0')}`;
    const taken = await tx.customer.findFirst({ where: { customerNo }, select: { id: true } });
    if (!taken) return customerNo;
  }

  throw new Error(`Unable to allocate a unique customer number for prefix "${prefix}"`);
}
