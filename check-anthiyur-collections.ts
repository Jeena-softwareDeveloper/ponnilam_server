import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const todayStr = new Date().toISOString().split('T')[0]; // e.g. "2026-10-01"
  const todayStart = new Date(todayStr + 'T00:00:00.000Z');
  const todayEnd   = new Date(todayStr + 'T23:59:59.999Z');

  console.log('=================================================');
  console.log(`  ANTHIYUR — Collection Check (${todayStr})`);
  console.log('=================================================\n');

  // 1. Today's collections for Anthiyur branch
  const todayCollections = await prisma.collection.findMany({
    where: {
      isVoided: false,
      trnDate: { gte: todayStart, lte: todayEnd },
      loan: {
        customer: {
          area: {
            branch: { name: { contains: 'ANTHIYUR', mode: 'insensitive' } }
          }
        }
      },
    },
    include: {
      loan: { include: { customer: true } },
      staff: true,
    },
    orderBy: { trnDate: 'asc' },
  });

  const totalCollected = todayCollections.reduce((s, c) => s + c.amount, 0);

  console.log(`Today's Collections — ${todayCollections.length} entries | Total: ₹${totalCollected}`);
  console.log('─'.repeat(80));
  if (todayCollections.length === 0) {
    console.log('  ❌ No collections entered today for ANTHIYUR branch.');
  } else {
    for (const c of todayCollections) {
      console.log(
        `  ${c.trnNumber.padEnd(12)} | ${c.loan?.loanNumber?.padEnd(12)} | ${(c.loan?.customer?.name ?? '-').padEnd(25)} | ₹${c.amount} | ${c.staff?.name ?? '-'}`
      );
    }
  }

  // 2. Check ANT-L023 (SANTHI MURGAN) loan
  console.log('\n--- Loan ANT-L023 (SANTHI MURGAN) ---');
  const loan = await prisma.loan.findFirst({
    where: { loanNumber: 'ANT-L023' },
    include: {
      customer: true,
      schedules: { orderBy: { dueDate: 'asc' } },
      collections: {
        where: { isVoided: false },
        orderBy: { trnDate: 'desc' },
        take: 6,
        include: { staff: true },
      },
    },
  });

  if (!loan) {
    console.log('  ⚠️  Loan ANT-L023 not found.');
  } else {
    const unpaid = loan.schedules.filter(s => s.status === 'PENDING' || s.status === 'PARTIAL');
    const unpaidSum = unpaid.reduce((a, s) => a + (s.emiAmount - (s.amountPaid || 0)), 0);
    const paidCount = loan.schedules.filter(s => s.status === 'PAID').length;

    console.log(`  Customer      : ${loan.customer?.name}`);
    console.log(`  Status        : ${loan.status}  ${loan.status === 'CLOSED' ? '✅' : '⚠️ (should be CLOSED)'}`);
    console.log(`  Outstanding   : ₹${loan.outstandingAmount}`);
    console.log(`  Advance Bal   : ₹${loan.advanceBalance}`);
    console.log(`  Schedules     : ${paidCount} PAID / ${unpaid.length} UNPAID (total ${loan.schedules.length})`);
    if (unpaid.length > 0) {
      console.log(`  ⚠️  Unpaid sum  : ₹${unpaidSum} — loan NOT properly closed!`);
    }
    console.log('\n  Recent Collections (latest 6):');
    console.log('  ' + '─'.repeat(70));
    for (const c of loan.collections) {
      console.log(
        `  ${c.trnNumber.padEnd(12)} | ${c.trnDate.toISOString().split('T')[0]} | ₹${String(c.amount).padStart(8)} | ${c.remarks ?? '-'}`
      );
    }
  }

  // 3. Anthiyur loans with EMI due today (Oct 1)
  console.log('\n--- ANTHIYUR: EMI Due Today ---');
  const dueToday = await prisma.loanSchedule.findMany({
    where: {
      status: { in: ['PENDING', 'PARTIAL'] },
      dueDate: { gte: todayStart, lte: todayEnd },
      loan: {
        customer: {
          area: {
            branch: { name: { contains: 'ANTHIYUR', mode: 'insensitive' } }
          }
        }
      },
    },
    include: {
      loan: {
        include: {
          customer: true,
          collections: {
            where: { isVoided: false, trnDate: { gte: todayStart, lte: todayEnd } },
          },
        },
      },
    },
    orderBy: { dueDate: 'asc' },
  });

  if (dueToday.length === 0) {
    console.log('  No EMI schedules due today for ANTHIYUR loans.');
  } else {
    console.log(`  ${dueToday.length} EMI(s) due today:`);
    for (const s of dueToday) {
      const collectedToday = s.loan?.collections?.length > 0 ? '✅ Collected' : '❌ Not collected';
      console.log(
        `  ${s.loan?.loanNumber?.padEnd(14)} | ${(s.loan?.customer?.name ?? '-').padEnd(25)} | ₹${s.emiAmount} | ${collectedToday}`
      );
    }
  }

  console.log('\n=================================================');
  console.log('  Done.');
  console.log('=================================================');
}

main().finally(() => prisma.$disconnect());
