import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const areaId = req.query.areaId as string;
    const branchId = req.query.branchId as string;

    const whereCustomer: any = areaId ? { areaId } : branchId ? { area: { branchId } } : {};
    const whereLoan: any = areaId ? { customer: { areaId } } : branchId ? { customer: { area: { branchId } } } : {};
    const whereCollection: any = areaId ? { loan: { customer: { areaId } } } : branchId ? { loan: { customer: { area: { branchId } } } } : {};

    const now = new Date();
    
    // Today boundaries
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);
    
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    
    // Month boundaries
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    // ==========================================
    // 1. KPIs & Trends
    // ==========================================
    const [
      customersTotal, customersLastMonth,
      activeLoansTotal, activeLoansLastMonth,
      outstandingTotal, outstandingLastMonth,
      collectionToday, collectionYesterday
    ] = await Promise.all([
      prisma.customer.count({ where: whereCustomer }),
      prisma.customer.count({ where: { ...whereCustomer, createdAt: { lte: lastMonthEnd } } }),
      
      prisma.loan.count({ where: { ...whereLoan, status: 'ACTIVE' } }),
      prisma.loan.count({ where: { ...whereLoan, status: 'ACTIVE', createdAt: { lte: lastMonthEnd } } }),
      
      prisma.loan.aggregate({ where: { ...whereLoan, status: 'ACTIVE' }, _sum: { outstandingAmount: true } }),
      prisma.loan.aggregate({ where: { ...whereLoan, status: 'ACTIVE', createdAt: { lte: lastMonthEnd } }, _sum: { outstandingAmount: true } }),
      
      prisma.collection.aggregate({ where: { ...whereCollection, trnDate: { gte: todayStart, lt: todayEnd } }, _sum: { amount: true } }),
      prisma.collection.aggregate({ where: { ...whereCollection, trnDate: { gte: yesterdayStart, lt: todayStart } }, _sum: { amount: true } })
    ]);

    // Overdue Calculations
    // Get loans with pending schedules before today
    const overdueSchedules = await prisma.loanSchedule.findMany({
      where: {
        loan: whereLoan,
        status: 'PENDING',
        dueDate: { lt: todayStart }
      },
      include: { loan: true }
    });

    const uniqueOverdueLoans = new Set(overdueSchedules.map(s => s.loanId));
    const overdueTotal = uniqueOverdueLoans.size;

    // Calculate Percentages
    const calcTrend = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Number((((current - previous) / previous) * 100).toFixed(2));
    };

    const kpis = {
      totalCustomers: customersTotal,
      customersTrend: calcTrend(customersTotal, customersLastMonth),
      activeLoans: activeLoansTotal,
      activeLoansTrend: calcTrend(activeLoansTotal, activeLoansLastMonth),
      todayCollection: collectionToday._sum.amount || 0,
      collectionTrend: calcTrend(collectionToday._sum.amount || 0, collectionYesterday._sum.amount || 0),
      totalOutstanding: outstandingTotal._sum.outstandingAmount || 0,
      outstandingTrend: calcTrend(outstandingTotal._sum.outstandingAmount || 0, outstandingLastMonth._sum.outstandingAmount || 0),
      overdueLoans: overdueTotal,
      overdueTrend: 0 // Mock trend since we don't have historical snapshot of overdue easily
    };

    // ==========================================
    // 2. Collection Trend (This Month)
    // ==========================================
    const thisMonthCollections = await prisma.collection.findMany({
      where: { ...whereCollection, trnDate: { gte: thisMonthStart } },
      select: { amount: true, trnDate: true }
    });

    // Group by Day
    const trendMap = new Map<string, number>();
    const daysInMonth = now.getDate(); // Up to today
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${i.toString().padStart(2, '0')} ${now.toLocaleString('default', { month: 'short' })}`;
      trendMap.set(dateStr, 0);
    }

    thisMonthCollections.forEach(c => {
      const day = new Date(c.trnDate).getDate();
      const dateStr = `${day.toString().padStart(2, '0')} ${now.toLocaleString('default', { month: 'short' })}`;
      if (trendMap.has(dateStr)) {
        trendMap.set(dateStr, trendMap.get(dateStr)! + c.amount);
      }
    });

    const collectionTrend = Array.from(trendMap.entries()).map(([date, amount]) => ({ date, amount }));

    // ==========================================
    // 3. Loan Status Overview
    // ==========================================
    const closedLoansCount = await prisma.loan.count({ where: { ...whereLoan, status: 'CLOSED' } });
    
    // We consider "Active" as Active - Overdue in this chart layout based on screenshot
    const strictActiveCount = Math.max(0, activeLoansTotal - overdueTotal);
    
    const loanStatus = [
      { name: 'Active Loans', value: strictActiveCount, color: '#22c55e' }, // green-500
      { name: 'Closed Loans', value: closedLoansCount, color: '#3b82f6' }, // blue-500
      { name: 'Overdue Loans', value: overdueTotal, color: '#f59e0b' } // amber-500
    ];

    // ==========================================
    // 4. Top 5 Branches (This Month)
    // ==========================================
    // Prisma doesn't support nested relation grouping easily, so fetch and aggregate in memory
    const collectionsWithBranch = await prisma.collection.findMany({
      where: { ...whereCollection, trnDate: { gte: thisMonthStart } },
      include: { loan: { include: { customer: { include: { area: { include: { branch: true } } } } } } }
    });

    const branchMap = new Map<string, number>();
    collectionsWithBranch.forEach(c => {
      const branchName = c.loan?.customer?.area?.branch?.name || 'Unknown Branch';
      branchMap.set(branchName, (branchMap.get(branchName) || 0) + c.amount);
    });

    const topBranches = Array.from(branchMap.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // ==========================================
    // 5. Recent Loans Sanctioned
    // ==========================================
    const recentLoans = await prisma.loan.findMany({
      where: whereLoan,
      include: { customer: { include: { area: { include: { branch: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    const formattedRecentLoans = recentLoans.map(l => ({
      id: l.id,
      loanNumber: l.loanNumber,
      customerName: l.customer?.name || 'Unknown',
      branchName: l.customer?.area?.branch?.name || 'Unknown',
      amount: l.amount,
      date: l.createdAt
    }));

    // ==========================================
    // 6. Overdue Summary
    // ==========================================
    const buckets = [
      { label: '1 - 30 Days', min: 1, max: 30, count: 0, amount: 0 },
      { label: '31 - 60 Days', min: 31, max: 60, count: 0, amount: 0 },
      { label: '61 - 90 Days', min: 61, max: 90, count: 0, amount: 0 },
      { label: '90+ Days', min: 91, max: 99999, count: 0, amount: 0 }
    ];

    // Group overdue schedules by loan to find the oldest overdue days
    const overdueLoansMap = new Map<string, { daysOverdue: number, outstanding: number }>();
    
    overdueSchedules.forEach(s => {
      const days = Math.floor((now.getTime() - new Date(s.dueDate).getTime()) / (1000 * 3600 * 24));
      if (!overdueLoansMap.has(s.loanId)) {
        overdueLoansMap.set(s.loanId, { daysOverdue: days, outstanding: s.loan.outstandingAmount });
      } else {
        // Find maximum days overdue for this loan
        const existing = overdueLoansMap.get(s.loanId)!;
        if (days > existing.daysOverdue) {
          existing.daysOverdue = days;
        }
      }
    });

    overdueLoansMap.forEach((data) => {
      for (const b of buckets) {
        if (data.daysOverdue >= b.min && data.daysOverdue <= b.max) {
          b.count += 1;
          b.amount += data.outstanding;
          break;
        }
      }
    });

    res.json({
      kpis,
      collectionTrend,
      loanStatus,
      topBranches,
      recentLoans: formattedRecentLoans,
      overdueSummary: buckets
    });
  } catch (error) {
    console.error('Advanced Dashboard Error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
};
