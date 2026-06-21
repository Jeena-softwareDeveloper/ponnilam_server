import { Request, Response } from 'express';
import prisma from '../../utils/prisma';

// Helper: build date range
const buildDateWhere = (startDate?: string, endDate?: string, type?: string) => {
  if (startDate && endDate) {
    return { gte: new Date(startDate), lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)) };
  }
  if (type === 'DAILY') {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return { gte: today };
  }
  if (type === 'MONTHLY') {
    const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
    return { gte: start };
  }
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  return { gte: start };
};

// 1. Collection Report (existing - improved)
export const getCollectionReport = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, branchId, type, staffId, centerId } = req.query as Record<string, string>;
    const where: any = { trnDate: buildDateWhere(startDate, endDate, type) };

    const user = (req as any).user;
    const userBranchId = user?.branchId;

    if (res.locals.areaIds?.length > 0) {
      where.loan = { ...where.loan, customer: { ...where.loan?.customer, areaId: { in: res.locals.areaIds } } };
    } else if (userBranchId) {
      where.loan = { ...where.loan, customer: { ...where.loan?.customer, area: { branchId: userBranchId } } };
    } else if (branchId && branchId !== 'all') {
      where.loan = { ...where.loan, customer: { ...where.loan?.customer, area: { branchId } } };
    }
    if (staffId) where.staffId = staffId;
    if (centerId) where.loan = { ...where.loan, customer: { ...where.loan?.customer, centerId } };

    const collections = await prisma.collection.findMany({
      where,
      include: {
        loan: { include: { customer: { include: { area: { include: { branch: true } }, center: true } } } },
        staff: { select: { name: true } }
      },
      orderBy: { trnDate: 'desc' }
    });

    res.json(collections);
  } catch (error) {
    console.error('Collection Report Error:', error);
    res.status(500).json({ error: 'Failed to generate collection report' });
  }
};

// 2. Center Detail Report
export const getCenterDetailReport = async (req: Request, res: Response) => {
  try {
    const { branchId, areaId, centerId, staffId } = req.query as Record<string, string>;
    const user = (req as any).user;
    const userBranchId = user?.branchId;

    const where: any = {};
    if (centerId) {
      where.id = centerId;
    }
    if (staffId) {
      where.employeeId = staffId;
    }
    
    if (userBranchId) {
      where.area = { ...where.area, branchId: userBranchId, ...(areaId ? { id: areaId } : {}) };
    } else if (areaId) {
      where.areaId = areaId;
    } else if (branchId && branchId !== 'all') {
      where.area = { ...where.area, branchId };
    }

    const centers = await prisma.center.findMany({
      where,
      include: {
        area: { include: { branch: true } },
        employee: { select: { name: true, phone: true } },
        customers: {
          include: {
            loans: {
              where: { status: { in: ['ACTIVE', 'APPROVED'] } },
              select: { outstandingAmount: true, perDueAmount: true, status: true }
            }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    const enriched = centers.map(center => {
      const activeLoans = center.customers.flatMap(c => c.loans);
      const totalOutstanding = activeLoans.reduce((sum, l) => sum + l.outstandingAmount, 0);
      const expectedCollection = activeLoans.reduce((sum, l) => sum + l.perDueAmount, 0);
      return {
        ...center,
        totalMembers: center.customers.length,
        activeLoans: activeLoans.length,
        totalOutstanding,
        expectedCollection
      };
    });

    res.json(enriched);
  } catch (error) {
    console.error('Center Detail Report Error:', error);
    res.status(500).json({ error: 'Failed to generate center detail report' });
  }
};

// 3. Center Customer List Report
export const getCenterCustomerReport = async (req: Request, res: Response) => {
  try {
    const { centerId, branchId } = req.query as Record<string, string>;
    const user = (req as any).user;
    const userBranchId = user?.branchId;

    const where: any = {};
    if (centerId) where.centerId = centerId;
    
    if (res.locals.areaIds?.length > 0) {
      where.areaId = { in: res.locals.areaIds };
    } else if (userBranchId) {
      where.area = { branchId: userBranchId };
    } else if (branchId && branchId !== 'all') {
      where.area = { branchId };
    }

    const customers = await prisma.customer.findMany({
      where,
      include: {
        center: true,
        area: { include: { branch: true } },
        loans: {
          where: { status: { in: ['ACTIVE', 'APPROVED'] } },
          select: { 
            loanNumber: true, 
            outstandingAmount: true, 
            perDueAmount: true, 
            status: true, 
            amount: true,
            schedules: {
              where: { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { lt: new Date() } },
              select: { emiAmount: true, amountPaid: true }
            }
          }
        }
      },
      orderBy: [{ center: { name: 'asc' } }, { name: 'asc' }]
    });

    res.json(customers);
  } catch (error) {
    console.error('Center Customer Report Error:', error);
    res.status(500).json({ error: 'Failed to generate customer report' });
  }
};

// 4. Employee Wise Collection Report
export const getEmployeeWiseReport = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, type, branchId } = req.query as Record<string, string>;
    const dateWhere = buildDateWhere(startDate, endDate, type);

    const user = (req as any).user;
    const userBranchId = user?.branchId;

    const where: any = { trnDate: dateWhere };
    if (userBranchId) {
      where.loan = { customer: { area: { branchId: userBranchId } } };
    } else if (branchId && branchId !== 'all') {
      where.loan = { customer: { area: { branchId } } };
    }

    const collections = await prisma.collection.findMany({
      where,
      include: {
        staff: { select: { id: true, name: true, phone: true } },
        loan: { include: { customer: { include: { center: true } } } }
      }
    });

    // Group by staff
    const staffMap = new Map<string, any>();
    collections.forEach(c => {
      const staffId = c.staffId || 'unassigned';
      const staffName = c.staff?.name || 'Unassigned';
      if (!staffMap.has(staffId)) {
        staffMap.set(staffId, {
          staffId, staffName,
          phone: c.staff?.phone || '-',
          totalAmount: 0, totalTransactions: 0, customers: new Set()
        });
      }
      const entry = staffMap.get(staffId)!;
      entry.totalAmount += c.amount;
      entry.totalTransactions += 1;
      entry.customers.add(c.loan?.customerId);
    });

    const result = Array.from(staffMap.values()).map(s => ({
      ...s, totalCustomers: s.customers.size, customers: undefined
    }));

    res.json(result.sort((a, b) => b.totalAmount - a.totalAmount));
  } catch (error) {
    console.error('Employee Report Error:', error);
    res.status(500).json({ error: 'Failed to generate employee report' });
  }
};

// 5. Area Wise Due Report
export const getAreaDueReport = async (req: Request, res: Response) => {
  try {
    const { branchId, areaId } = req.query as Record<string, string>;

    const user = (req as any).user;
    const userBranchId = user?.branchId;

    const loanWhere: any = { status: { in: ['ACTIVE', 'APPROVED'] } };
    
    if (areaId) {
      if (userBranchId) {
        loanWhere.customer = { areaId, area: { branchId: userBranchId } };
      } else {
        loanWhere.customer = { areaId };
      }
    } else if (userBranchId) {
      loanWhere.customer = { area: { branchId: userBranchId } };
    } else if (branchId && branchId !== 'all') {
      loanWhere.customer = { area: { branchId } };
    }

    const loans = await prisma.loan.findMany({
      where: loanWhere,
      include: {
        customer: {
          include: {
            center: true,
            area: { include: { branch: true } }
          }
        },
        schedules: {
          where: { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { lt: new Date() } }
        }
      }
    });

    // Group by area
    const areaMap = new Map<string, any>();
    loans.forEach(loan => {
      const area = loan.customer?.area;
      if (!area) return;
      if (!areaMap.has(area.id)) {
        areaMap.set(area.id, {
          areaId: area.id, areaName: area.name,
          branchName: area.branch?.name || '-',
          totalLoans: 0, overdueLoans: 0,
          totalOutstanding: 0, overdueAmount: 0
        });
      }
      const entry = areaMap.get(area.id)!;
      entry.totalLoans += 1;
      entry.totalOutstanding += loan.outstandingAmount;
      if (loan.schedules.length > 0) {
        entry.overdueLoans += 1;
        entry.overdueAmount += loan.schedules.reduce((sum: number, s: any) => sum + (s.emiAmount - s.amountPaid), 0);
      }
    });

    res.json(Array.from(areaMap.values()).sort((a, b) => b.overdueAmount - a.overdueAmount));
  } catch (error) {
    console.error('Area Due Report Error:', error);
    res.status(500).json({ error: 'Failed to generate area due report' });
  }
};

// 6. Particular Party Amount Received Report
export const getPartyAmountReport = async (req: Request, res: Response) => {
  try {
    const { customerId, loanId, startDate, endDate, type } = req.query as Record<string, string>;
    const user = (req as any).user;
    const userBranchId = user?.branchId;

    const where: any = { trnDate: buildDateWhere(startDate, endDate, type) };

    if (userBranchId) {
      where.loan = { 
        customer: { area: { branchId: userBranchId } },
        ...(customerId ? { customerId } : {})
      };
      if (loanId) where.loanId = loanId;
    } else {
      if (loanId) where.loanId = loanId;
      if (customerId) where.loan = { customerId };
    }

    const collections = await prisma.collection.findMany({
      where,
      include: {
        loan: {
          include: {
            customer: { select: { name: true, customerNo: true, phone: true } },
            package: { select: { name: true } }
          }
        },
        staff: { select: { name: true } }
      },
      orderBy: { trnDate: 'desc' }
    });

    res.json(collections);
  } catch (error) {
    console.error('Party Amount Report Error:', error);
    res.status(500).json({ error: 'Failed to generate party amount report' });
  }
};
