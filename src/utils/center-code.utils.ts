import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/** Allocate next center code inside a transaction (race-safe). */
export async function generateCenterCodeInTx(tx: Tx, name: string): Promise<string> {
  const prefix = name.trim().replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || 'CTR';

  for (let attempt = 0; attempt < 10; attempt++) {
    const existing = await tx.center.findMany({
      where: { code: { startsWith: prefix } },
      orderBy: { code: 'desc' },
      take: 1,
    });

    let nextNo = 1;
    if (existing.length > 0 && existing[0].code) {
      const lastNum = parseInt(existing[0].code.replace(prefix, ''), 10);
      if (!isNaN(lastNum)) nextNo = lastNum + 1 + attempt;
      else nextNo = 1 + attempt;
    } else {
      nextNo = 1 + attempt;
    }

    const code = `${prefix}${nextNo.toString().padStart(3, '0')}`;
    const clash = await tx.center.findFirst({ where: { code }, select: { id: true } });
    if (!clash) return code;
  }

  throw new Error('Unable to generate a unique center code');
}
