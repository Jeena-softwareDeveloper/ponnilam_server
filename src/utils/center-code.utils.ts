import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

const SEQUENCE_PAD = 3;
const MAX_ATTEMPTS = 100;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Normalize a branch code into an uppercase alphanumeric center-code prefix (e.g. "ant" → "ANT"). */
export function normalizeBranchCode(branchCode: string | null | undefined): string {
  return (branchCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Format: <BranchCode><zero-padded sequence>, e.g. formatCenterCode('ANT', 1) → 'ANT001'. */
export function formatCenterCode(prefix: string, seq: number): string {
  return `${prefix}${String(seq).padStart(SEQUENCE_PAD, '0')}`;
}

/** Highest numeric sequence already used for a branch prefix among the given codes. */
export function highestCenterSequence(
  existingCodes: (string | null | undefined)[],
  prefix: string
): number {
  const pattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`);
  let max = 0;
  for (const code of existingCodes) {
    const match = code?.toUpperCase().match(pattern);
    if (match) {
      const n = parseInt(match[1], 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return max;
}

/**
 * Allocate the next unique center code inside a transaction (race-safe), scoped per branch.
 * Format: <BranchCode><3-digit sequence>, e.g. ANT001, ANT002, ANT003.
 * The sequence always continues beyond the branch's current maximum and is verified
 * against a global uniqueness check, so codes are never reused.
 */
export async function generateCenterCodeInTx(
  tx: Tx,
  branchCode: string | null | undefined,
  branchId: string
): Promise<string> {
  const prefix = normalizeBranchCode(branchCode);
  if (!prefix) {
    throw new Error('A valid branch code is required to generate a center code');
  }

  const existing = await tx.center.findMany({
    where: {
      area: { branchId },
      code: { startsWith: prefix },
    },
    select: { code: true },
  });

  const maxSeq = highestCenterSequence(
    existing.map((c) => c.code),
    prefix
  );

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const code = formatCenterCode(prefix, maxSeq + attempt);
    const clash = await tx.center.findFirst({ where: { code }, select: { id: true } });
    if (!clash) return code;
  }

  throw new Error('Unable to generate a unique center code');
}
