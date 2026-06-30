import './load-env';
import prisma from '../src/utils/prisma';

async function main() {
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
    console.log(`TRN sequence set to ${maxTrn}`);
  }

  const customers = await prisma.customer.findMany({ select: { customerNo: true } });
  const customerPrefixes = new Map<string, number>();
  for (const c of customers) {
    if (!c.customerNo) continue;
    const match = c.customerNo.match(/^([A-Z]+)(\d+)$/);
    if (!match) continue;
    const [, prefix, numStr] = match;
    const num = parseInt(numStr, 10);
    if (!isNaN(num)) {
      customerPrefixes.set(prefix, Math.max(customerPrefixes.get(prefix) || 0, num));
    }
  }
  for (const [prefix, max] of customerPrefixes) {
    const key = `CUS:${prefix}`;
    await prisma.sequence.upsert({
      where: { id: key },
      create: { id: key, value: max },
      update: { value: max },
    });
    console.log(`${key} sequence set to ${max}`);
  }

  const loans = await prisma.loan.findMany({ select: { loanNumber: true } });
  const loanPrefixes = new Map<string, number>();
  for (const l of loans) {
    if (!l.loanNumber) continue;
    const match = l.loanNumber.match(/^(.+L)(\d+)$/);
    if (!match) continue;
    const [, prefix, numStr] = match;
    const num = parseInt(numStr, 10);
    if (!isNaN(num)) {
      loanPrefixes.set(prefix, Math.max(loanPrefixes.get(prefix) || 0, num));
    }
  }
  for (const [prefix, max] of loanPrefixes) {
    const key = `LOAN:${prefix}`;
    await prisma.sequence.upsert({
      where: { id: key },
      create: { id: key, value: max },
      update: { value: max },
    });
    console.log(`${key} sequence set to ${max}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
