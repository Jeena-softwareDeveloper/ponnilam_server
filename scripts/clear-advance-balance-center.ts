import 'dotenv/config';
import prisma from '../src/utils/prisma';

// ─── CONFIG ─────────────────────────────────────────────────────────────────
// Change this to your center name or code
const CENTER_NAME = 'ESWARI RAJIV GANDHI NAGAR'; // DB name (screenshot shows as SUGUNA RAJAN NAGAR)

// Set to false to actually apply the changes
const DRY_RUN = false;
// ─────────────────────────────────────────────────────────────────────────────

async function clearAdvanceBalance() {
  console.log('=== Clear Advance Balance for Center ===');
  console.log(`Center  : ${CENTER_NAME}`);
  console.log(`Dry Run : ${DRY_RUN}`);
  console.log('');

  // 1. Find the center
  const center = await prisma.center.findFirst({
    where: {
      OR: [
        { name: { equals: CENTER_NAME } },
        { name: { contains: CENTER_NAME } },
        { code: CENTER_NAME },
      ],
    },
  });

  if (!center) {
    console.error(`❌ Center "${CENTER_NAME}" not found!`);
    return;
  }

  console.log(`✅ Found Center: ${center.name} (ID: ${center.id})`);

  // 2. Find all active loans in this center that have advanceBalance > 0
  const loans = await prisma.loan.findMany({
    where: {
      customer: {
        centerId: center.id,
      },
      advanceBalance: { gt: 0 },
    },
    include: {
      customer: {
        select: { name: true, customerNo: true },
      },
    },
    orderBy: { loanNumber: 'asc' },
  });

  if (loans.length === 0) {
    console.log('ℹ️  No loans with advance balance found in this center.');
    return;
  }

  console.log(`\nFound ${loans.length} loan(s) with advance balance:\n`);
  console.log(
    'LoanNumber'.padEnd(15),
    'CustomerNo'.padEnd(12),
    'CustomerName'.padEnd(30),
    'AdvanceBalance'
  );
  console.log('─'.repeat(75));

  let totalAdvance = 0;
  for (const loan of loans) {
    const adv = loan.advanceBalance ?? 0;
    totalAdvance += adv;
    console.log(
      loan.loanNumber.padEnd(15),
      (loan.customer?.customerNo ?? '').padEnd(12),
      (loan.customer?.name ?? '').padEnd(30),
      `₹${adv.toFixed(2)}`
    );
  }
  console.log('─'.repeat(75));
  console.log(`${'TOTAL'.padEnd(57)} ₹${totalAdvance.toFixed(2)}`);

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN — No changes made.');
    console.log('   Set DRY_RUN = false to apply the changes.');
    return;
  }

  // 3. Reset advanceBalance to 0 for all found loans
  console.log('\nApplying changes...');

  await prisma.$transaction(async (tx) => {
    for (const loan of loans) {
      await tx.loan.update({
        where: { id: loan.id },
        data: { advanceBalance: 0 },
      });
      console.log(
        `  ✅ Cleared ₹${loan.advanceBalance.toFixed(2)} → ₹0.00  [${loan.loanNumber}]`
      );
    }
  });

  console.log(`\n✅ Done! Cleared advance balance for ${loans.length} loan(s).`);
}

clearAdvanceBalance()
  .catch((err) => {
    console.error('Script failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
