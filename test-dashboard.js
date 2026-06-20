const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function dateBoundaries() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);
  const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  return { now, todayStart, todayEnd, yesterdayStart, thisMonthStart, lastMonthEnd };
}

async function run() {
  const { todayStart, thisMonthStart, now } = dateBoundaries();
  
  try {
    console.log("Testing charts...");
    const [activeLoans, closedLoans, overdueGroups, branches] = await Promise.all([
      prisma.loan.count({ where: { status: 'ACTIVE' } }),
      prisma.loan.count({ where: { status: 'CLOSED' } }),
      prisma.loanSchedule.groupBy({
        by: ['loanId'],
        where: { status: 'PENDING', dueDate: { lt: todayStart } },
        _count: { loanId: true }
      }),
      prisma.branch.findMany({ select: { id: true, name: true } })
    ]);
    console.log("Charts baseline OK");

    const topBranchesRaw = await Promise.all(branches.map(async (b) => {
      const s = await prisma.collection.aggregate({
        where: {
          loan: { customer: { area: { branchId: b.id } } },
          trnDate: { gte: thisMonthStart }
        },
        _sum: { amount: true }
      });
      return { name: b.name, amount: s._sum.amount || 0 };
    }));
    console.log("Charts branches OK");
  } catch (e) {
    console.error("Charts Error:", e);
  }

  try {
    console.log("Testing activity...");
    const [recentLoans, overdueSchedules] = await Promise.all([
      prisma.loan.findMany({
        select: {
          id: true, loanNumber: true, amount: true, createdAt: true,
          customer: { select: { name: true, area: { select: { branch: { select: { name: true } } } } } }
        },
        orderBy: { createdAt: 'desc' },
        take: 5
      }),
      prisma.loanSchedule.findMany({
        where: { status: 'PENDING', dueDate: { lt: todayStart } },
        select: { loanId: true, dueDate: true, loan: { select: { outstandingAmount: true } } }
      })
    ]);
    console.log("Activity OK");
  } catch (e) {
    console.error("Activity Error:", e);
  }
}

run().finally(() => prisma.$disconnect());
