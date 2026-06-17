import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Shared helpers ─────────────────────────────────────────────────────────

function buildWhere(areaId?: string, branchId?: string) {
  const whereCustomer: any = areaId ? { areaId } : branchId ? { area: { branchId } } : {};
  const whereLoan: any = areaId ? { customer: { areaId } } : branchId ? { customer: { area: { branchId } } } : {};
  const whereCollection: any = areaId ? { loan: { customer: { areaId } } } : branchId ? { loan: { customer: { area: { branchId } } } } : {};
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
    const { whereCustomer, whereLoan, whereCollection } = buildWhere(areaId, branchId);
    const { todayStart, todayEnd, yesterdayStart, lastMonthEnd } = dateBoundaries();

    const [
      customersTotal, customersLastMonth,
      activeLoansTotal, activeLoansLastMonth,
      outstandingTotal, outstandingLastMonth,
      collectionToday, collectionYesterday,
      overdueCount
    ] = await Promise.all([
      prisma.customer.count({ where: whereCustomer }),
      prisma.customer.count({ where: { ...whereCustomer, createdAt: { lte: lastMonthEnd } } }),
      prisma.loan.count({ where: { ...whereLoan, status: 'ACTIVE' } }),
      prisma.loan.count({ where: { ...whereLoan, status: 'ACTIVE', createdAt: { lte: lastMonthEnd } } }),
      prisma.loan.aggregate({ where: { ...whereLoan, status: 'ACTIVE' }, _sum: { outstandingAmount: true } }),
      prisma.loan.aggregate({ where: { ...whereLoan, status: 'ACTIVE', createdAt: { lte: lastMonthEnd } }, _sum: { outstandingAmount: true } }),
      prisma.collection.aggregate({ where: { ...whereCollection, trnDate: { gte: todayStart, lt: todayEnd } }, _sum: { amount: true } }),
      prisma.collection.aggregate({ where: { ...whereCollection, trnDate: { gte: yesterdayStart, lt: todayStart } }, _sum: { amount: true } }),
      // Overdue: distinct loanIds with pending schedules before today
      prisma.loanSchedule.groupBy({
        by: ['loanId'],
        where: { loan: whereLoan, status: 'PENDING', dueDate: { lt: todayStart } },
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
    const { whereCollection } = buildWhere(areaId, branchId);
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
    const { whereLoan, whereCollection } = buildWhere(areaId, branchId);
    const { todayStart, thisMonthStart } = dateBoundaries();

    const [activeLoans, closedLoans, overdueGroups, branches] = await Promise.all([
      prisma.loan.count({ where: { ...whereLoan, status: 'ACTIVE' } }),
      prisma.loan.count({ where: { ...whereLoan, status: 'CLOSED' } }),
      prisma.loanSchedule.groupBy({
        by: ['loanId'],
        where: { loan: whereLoan, status: 'PENDING', dueDate: { lt: todayStart } },
        _count: { loanId: true }
      }),
      prisma.branch.findMany({
        where: branchId ? { id: branchId } : {},
        select: { id: true, name: true }
      })
    ]);

    const overdueCount = overdueGroups.length;
    const strictActive = Math.max(0, activeLoans - overdueCount);

    const loanStatus = [
      { name: 'Active Loans', value: strictActive, color: '#22c55e' },
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
    const { whereLoan } = buildWhere(areaId, branchId);
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
        where: { loan: whereLoan, status: 'PENDING', dueDate: { lt: todayStart } },
        select: { loanId: true, dueDate: true, loan: { select: { outstandingAmount: true } } }
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

// ─── Legacy combined endpoint (kept for backward compat) ─────────────────────
export const getDashboardStats = getDashboardKpis;
