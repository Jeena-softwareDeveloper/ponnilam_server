import prisma from './prisma';
import { toCollectionDay } from './date.utils';

/** Sync sequence counters from existing rows on server startup. */
export async function syncSequencesOnStartup(): Promise<void> {
  try {
    await backfillEmptyCollectionDays();
    const collections = await prisma.collection.findMany({ select: { trnNumber: true } });
    let maxTrn = 0;
    for (const c of collections) {
      const n = parseInt(String(c.trnNumber).replace(/^TRN/i, ''), 10);
      if (!isNaN(n) && n > maxTrn) maxTrn = n;
    }
    if (maxTrn > 0) {
      await prisma.sequence.upsert({
        where: { id: 'TRN' },
        create: { id: 'TRN', value: maxTrn },
        update: { value: maxTrn },
      });
    }

    const customers = await prisma.customer.findMany({ select: { customerNo: true } });
    const customerPrefixes = new Map<string, number>();
    for (const c of customers) {
      if (!c.customerNo) continue;
      const match = c.customerNo.match(/^([A-Z]+)(\d+)$/);
      if (!match) continue;
      const [, prefix, numStr] = match;
      const num = parseInt(numStr, 10);
      if (!isNaN(num)) customerPrefixes.set(prefix, Math.max(customerPrefixes.get(prefix) || 0, num));
    }
    for (const [prefix, max] of customerPrefixes) {
      await prisma.sequence.upsert({
        where: { id: `CUS:${prefix}` },
        create: { id: `CUS:${prefix}`, value: max },
        update: { value: max },
      });
    }

    const loans = await prisma.loan.findMany({ select: { loanNumber: true } });
    const loanPrefixes = new Map<string, number>();
    for (const l of loans) {
      if (!l.loanNumber) continue;
      const match = l.loanNumber.match(/^(.+L)(\d+)$/);
      if (!match) continue;
      const [, prefix, numStr] = match;
      const num = parseInt(numStr, 10);
      if (!isNaN(num)) loanPrefixes.set(prefix, Math.max(loanPrefixes.get(prefix) || 0, num));
    }
    for (const [prefix, max] of loanPrefixes) {
      await prisma.sequence.upsert({
        where: { id: `LOAN:${prefix}` },
        create: { id: `LOAN:${prefix}`, value: max },
        update: { value: max },
      });
    }

    console.log('[startup] Sequence counters synced from database');
  } catch (err) {
    console.warn('[startup] Sequence sync skipped:', (err as Error).message);
  }
}

async function backfillEmptyCollectionDays(): Promise<void> {
  const rows = await prisma.collection.findMany({
    where: { collectionDay: '' },
    select: { id: true, trnDate: true },
  });
  for (const row of rows) {
    await prisma.collection.update({
      where: { id: row.id },
      data: { collectionDay: toCollectionDay(row.trnDate) },
    });
  }
  if (rows.length) console.log(`[startup] Backfilled collectionDay for ${rows.length} collection(s)`);
}
