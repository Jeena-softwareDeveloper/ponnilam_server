import { Request, Response } from 'express';
import prisma from '../../utils/prisma';
import { LoanStatus, LOAN_COLLECTIBLE_STATUSES, UNPAID_SCHEDULE_STATUSES } from '../../utils/prisma-enums';

// ─── Shared helpers ─────────────────────────────────────────────────────────

function buildWhere(areaId?: string, branchId?: string) {
  const validBranchId = branchId && branchId !== 'all' ? branchId : undefined;
  const whereCustomer: any = areaId ? { areaId } : validBranchId ? { area: { branchId: validBranchId } } : {};
  const whereLoan: any = areaId ? { customer: { areaId } } : validBranchId ? { customer: { area: { branchId: validBranchId } } } : {};
  const whereCollection: any = areaId ? { loan: { customer: { areaId } } } : validBranchId ? { loan: { customer: { area: { branchId: validBranchId } } } } : {};
  return { whereCustomer, whereLoan, whereCollection };
}

function dateBoundaries() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);
  const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  return { now, todayStart, todayEnd, yesterdayStart, thisMonthStart, lastMonthEnd };
}

function calcTrend(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

// ─── 1. KPIs (fast counts only) ─────────────────────────────────────────────

export const getDashboardKpis = async (req: Request, res: Response) => {
  try {
    const { areaId, branchId } = req.query as Record<string, string>;
    const user = (req as any).user;
    const activeBranchId = user?.branchId || branchId;
    const { whereCustomer, whereLoan, whereCollection } = buildWhere(areaId, activeBranchId);
    const { todayStart, todayEnd, yesterdayStart, lastMonthEnd } = dateBoundaries();

    const openLoanStatuses = { in: LOAN_COLLECTIBLE_STATUSES };
    const [
      customersTotal, customersLastMonth,
      activeLoansTotal, activeLoansLastMonth,
      outstandingTotal, outstandingLastMonth,
      collectionToday, collectionYesterday,
      overdueCount
    ] = await Promise.all([
      prisma.customer.count({ where: whereCustomer }),
      prisma.customer.count({ where: { ...whereCustomer, createdAt: { lte: lastMonthEnd } } }),
      prisma.loan.count({ where: { ...whereLoan, status: { in: LOAN_COLLECTIBLE_STATUSES } } }),
      prisma.loan.count({ where: { ...whereLoan, status: { in: LOAN_COLLECTIBLE_STATUSES }, createdAt: { lte: lastMonthEnd } } }),
      prisma.loan.aggregate({ where: { ...whereLoan, status: openLoanStatuses }, _sum: { outstandingAmount: true } }),
      prisma.loan.aggregate({ where: { ...whereLoan, status: openLoanStatuses, createdAt: { lte: lastMonthEnd } }, _sum: { outstandingAmount: true } }),
      prisma.collection.aggregate({ where: { ...whereCollection, trnDate: { gte: todayStart, lt: todayEnd } }, _sum: { amount: true } }),
      prisma.collection.aggregate({ where: { ...whereCollection, trnDate: { gte: yesterdayStart, lt: todayStart } }, _sum: { amount: true } }),
      prisma.loanSchedule.groupBy({
        by: ['loanId'],
        where: { loan: { ...whereLoan, status: openLoanStatuses }, status: { in: UNPAID_SCHEDULE_STATUSES }, dueDate: { lt: todayStart } },
        _count: { loanId: true }
      })
    ]);

    res.json({
      totalCustomers: customersTotal,
      customersTrend: calcTrend(customersTotal, customersLastMonth),
      activeLoans: activeLoansTotal,
      activeLoansTrend: calcTrend(activeLoansTotal, activeLoansLastMonth),
      todayCollection: collectionToday._sum.amount || 0,
      collectionTrend: calcTrend(collectionToday._sum.amount || 0, collectionYesterday._sum.amount || 0),
      totalOutstanding: outstandingTotal._sum.outstandingAmount || 0,
      outstandingTrend: calcTrend(outstandingTotal._sum.outstandingAmount || 0, outstandingLastMonth._sum.outstandingAmount || 0),
      overdueLoans: overdueCount.length,
    });
  } catch (err) {
    console.error('Dashboard KPIs Error:', err);
    res.status(500).json({ error: 'Failed to load KPIs' });
  }
};

// ─── 2. Collection Trend (chart data) ────────────────────────────────────────

export const getDashboardTrend = async (req: Request, res: Response) => {
  try {
    const { areaId, branchId } = req.query as Record<string, string>;
    const user = (req as any).user;
    const activeBranchId = user?.branchId || branchId;
    const { whereCollection } = buildWhere(areaId, activeBranchId);
    const { now, thisMonthStart } = dateBoundaries();

    const rows = await prisma.collection.findMany({
      where: { ...whereCollection, trnDate: { gte: thisMonthStart } },
      select: { amount: true, trnDate: true }
    });

    const trendMap = new Map<string, number>();
    for (let i = 1; i <= now.getDate(); i++) {
      const key = `${String(i).padStart(2, '0')} ${now.toLocaleString('default', { month: 'short' })}`;
      trendMap.set(key, 0);
    }
    rows.forEach(c => {
      const d = new Date(c.trnDate).getDate();
      const key = `${String(d).padStart(2, '0')} ${now.toLocaleString('default', { month: 'short' })}`;
      if (trendMap.has(key)) trendMap.set(key, trendMap.get(key)! + c.amount);
    });

    res.json(Array.from(trendMap.entries()).map(([date, amount]) => ({ date, amount })));
  } catch (err) {
    console.error('Dashboard Trend Error:', err);
    res.status(500).json({ error: 'Failed to load collection trend' });
  }
};

// ─── 3. Charts: Loan Portfolio + Top Branches ────────────────────────────────

export const getDashboardCharts = async (req: Request, res: Response) => {
  try {
    const { areaId, branchId } = req.query as Record<string, string>;
    const user = (req as any).user;
    const activeBranchId = user?.branchId || branchId;
    const { whereLoan, whereCollection } = buildWhere(areaId, activeBranchId);
    const { todayStart, thisMonthStart } = dateBoundaries();

    const [activeLoans, closedLoans, overdueGroups, branches] = await Promise.all([
      prisma.loan.count({ where: { ...whereLoan, status: LoanStatus.ACTIVE } }),
      prisma.loan.count({ where: { ...whereLoan, status: LoanStatus.CLOSED } }),
      prisma.loanSchedule.groupBy({
        by: ['loanId'],
        where: { loan: { ...whereLoan, status: { in: LOAN_COLLECTIBLE_STATUSES } }, status: { in: UNPAID_SCHEDULE_STATUSES }, dueDate: { lt: todayStart } },
        _count: { loanId: true }
      }),
      prisma.branch.findMany({
        where: activeBranchId ? { id: activeBranchId } : {},
        select: { id: true, name: true }
      })
    ]);

    const overdueCount = overdueGroups.length;

    const loanStatus = [
      { name: 'Active Loans', value: activeLoans, color: '#22c55e' },
      { name: 'Closed Loans', value: closedLoans, color: '#3b82f6' },
      { name: 'Overdue Loans', value: overdueCount, color: '#f59e0b' }
    ];

    // Top branches — one aggregate per branch (parallelised)
    const topBranchesRaw = await Promise.all(branches.map(async (b) => {
      const s = await prisma.collection.aggregate({
        where: {
          loan: { customer: { area: areaId ? { id: areaId, branchId: b.id } : { branchId: b.id } } },
          trnDate: { gte: thisMonthStart }
        },
        _sum: { amount: true }
      });
      return { name: b.name, amount: s._sum.amount || 0 };
    }));

    const topBranches = topBranchesRaw
      .filter(b => b.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    res.json({ loanStatus, topBranches });
  } catch (err) {
    console.error('Dashboard Charts Error:', err);
    res.status(500).json({ error: 'Failed to load chart data' });
  }
};

// ─── 4. Recent Activity + Overdue Summary ────────────────────────────────────

export const getDashboardActivity = async (req: Request, res: Response) => {
  try {
    const { areaId, branchId } = req.query as Record<string, string>;
    const user = (req as any).user;
    const activeBranchId = user?.branchId || branchId;
    const { whereLoan } = buildWhere(areaId, activeBranchId);
    const { now, todayStart } = dateBoundaries();

    const [recentLoans, overdueSchedules] = await Promise.all([
      prisma.loan.findMany({
        where: whereLoan,
        select: {
          id: true, loanNumber: true, amount: true, createdAt: true,
          customer: { select: { name: true, area: { select: { branch: { select: { name: true } } } } } }
        },
        orderBy: { createdAt: 'desc' },
        take: 5
      }),
      prisma.loanSchedule.findMany({
        where: { loan: whereLoan, status: { in: UNPAID_SCHEDULE_STATUSES }, dueDate: { lt: todayStart } },
        select: { loanId: true, dueDate: true, emiAmount: true, amountPaid: true, loan: { select: { outstandingAmount: true } } }
      })
    ]);

    // Overdue buckets
    const buckets = [
      { label: '1 - 30 Days', min: 1, max: 30, count: 0, amount: 0 },
      { label: '31 - 60 Days', min: 31, max: 60, count: 0, amount: 0 },
      { label: '61 - 90 Days', min: 61, max: 90, count: 0, amount: 0 },
      { label: '90+ Days', min: 91, max: 99999, count: 0, amount: 0 }
    ];

    const seen = new Map<string, { days: number; outstanding: number }>();
    overdueSchedules.forEach(s => {
      const days = Math.floor((now.getTime() - new Date(s.dueDate).getTime()) / 86400000);
      if (!seen.has(s.loanId)) seen.set(s.loanId, { days, outstanding: s.loan.outstandingAmount });
      else if (days > seen.get(s.loanId)!.days) seen.get(s.loanId)!.days = days;
    });
    seen.forEach(({ days, outstanding }) => {
      const b = buckets.find(bk => days >= bk.min && days <= bk.max);
      if (b) { b.count++; b.amount += outstanding; }
    });

    res.json({
      recentLoans: recentLoans.map(l => ({
        id: l.id,
        loanNumber: l.loanNumber,
        customerName: l.customer?.name || 'Unknown',
        branchName: l.customer?.area?.branch?.name || 'Unknown',
        amount: l.amount,
        date: l.createdAt
      })),
      overdueSummary: buckets
    });
  } catch (err) {
    console.error('Dashboard Activity Error:', err);
    res.status(500).json({ error: 'Failed to load activity' });
  }
};

