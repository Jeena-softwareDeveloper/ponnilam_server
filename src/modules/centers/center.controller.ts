import { Request, Response } from 'express';
import prisma from '../../utils/prisma';

// Generate Center Code (e.g., SAT001 from "Sattur" center name)
const generateCenterCode = async (name: string) => {
  const prefix = name.trim().replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase();
  // Count existing centers with the same prefix
  const existing = await prisma.center.findMany({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
  });
  let nextNo = 1;
  if (existing.length > 0 && existing[0].code) {
    const lastNum = parseInt(existing[0].code.replace(prefix, ''), 10);
    if (!isNaN(lastNum)) nextNo = lastNum + 1;
  }
  return `${prefix}${nextNo.toString().padStart(3, '0')}`;
};

export const getCenters = async (req: Request, res: Response): Promise<any> => {
  try {
    const { branchId, staffId } = req.query;
    const user = (req as any).user;
    const userBranchId = user?.branchId;
    
    const whereClause: any = {};
    
    if (userBranchId) {
      whereClause.area = { branchId: userBranchId };
    } else if (branchId && branchId !== 'all') {
      whereClause.area = { branchId: String(branchId) };
    }

    if (staffId) {
      whereClause.employeeId = String(staffId);
    }
    
    const centers = await prisma.center.findMany({
      where: whereClause,
      include: { 
        employee: true, 
        area: true,
        customers: {
          include: {
            loans: {
              select: { status: true }
            }
          }
        }
      },
      orderBy: { name: 'asc' },
    });

    const enrichedCenters = centers.map(center => {
      let activeLoansCount = 0;
      let pendingSetupCount = 0;

      center.customers.forEach(customer => {
        const hasActiveLoan = customer.loans.some(l => l.status === 'ACTIVE');
        if (hasActiveLoan) {
          activeLoansCount++;
        } else {
          // No active loan means they are pending setup
          pendingSetupCount++;
        }
      });

      // Remove the large customers array to keep the payload small
      const { customers, ...rest } = center;
      return {
        ...rest,
        activeLoansCount,
        pendingSetupCount,
        mappedCustomersCount: customers.length
      };
    });

    return res.status(200).json(enrichedCenters);
  } catch (error) {
    console.error('Error fetching centers:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getCenterById = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const center = await prisma.center.findUnique({
      where: { id: String(id) },
      include: { 
        employee: true, 
        area: true,
        customers: {
          include: {
            loans: {
              select: { status: true, outstandingAmount: true }
            }
          }
        }
      }
    });
    if (!center) return res.status(404).json({ error: 'Center not found' });

    // Security check
    const user = (req as any).user;
    if (user?.role?.name !== 'Admin' && user?.branchId) {
      if (center.area?.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Security Violation: Cannot view a center outside your branch.' });
      }
    }

    let activeLoansCount = 0;
    let pendingSetupCount = 0;
    let totalOutstandingAmount = 0;

    center.customers.forEach(customer => {
      const activeLoans = customer.loans.filter(l => l.status === 'ACTIVE');
      if (activeLoans.length > 0) {
        activeLoansCount++;
        totalOutstandingAmount += activeLoans.reduce((sum, l) => sum + (l.outstandingAmount || 0), 0);
      } else {
        pendingSetupCount++;
      }
    });

    const { customers, ...rest } = center;

    return res.status(200).json({
      ...rest,
      customers,
      activeLoansCount,
      pendingSetupCount,
      totalOutstandingAmount,
      totalMembers: customers.length
    });
  } catch (error) {
    console.error('Error fetching center by id:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createCenter = async (req: Request, res: Response): Promise<any> => {
  try {
    const { name, centerTime, repaymentType, disbursMode, areaId, employeeId, totalMembers } = req.body;
    if (!name || !areaId) return res.status(400).json({ error: 'Name and Area are required' });
    
    // Security check
    const user = (req as any).user;
    if (user?.role?.name !== 'Admin' && user?.branchId) {
      const area = await prisma.area.findUnique({ where: { id: areaId } });
      if (!area || area.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Security Violation: Cannot create a center in an area outside your branch.' });
      }
    }

    // Auto-generate center code from name (e.g. "Sattur" → SAT001)
    const generatedCode = await generateCenterCode(name);

    const center = await prisma.center.create({
      data: {
        name,
        code: generatedCode,
        centerTime: centerTime || null,
        repaymentType: repaymentType || 'WEEKLY',
        disbursMode: disbursMode || 'CASH',
        totalMembers: totalMembers ? parseInt(totalMembers) : 0,
        areaId,
        employeeId: employeeId || null,
      },
      include: { employee: true, area: true },
    });
    return res.status(201).json(center);
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Center name or code already exists' });
    console.error('Error creating center:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateCenter = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { name, code, centerTime, repaymentType, disbursMode, areaId, employeeId, isActive, totalMembers } = req.body as {
      name?: string; code?: string; centerTime?: string;
      repaymentType?: string; disbursMode?: string; areaId?: string;
      employeeId?: string; isActive?: boolean; totalMembers?: any;
    };

    // Security check
    const existingCenter = await prisma.center.findUnique({ where: { id: String(id) }, include: { area: true } });
    if (!existingCenter) return res.status(404).json({ error: 'Center not found' });
    
    const user = (req as any).user;
    if (user?.role?.name !== 'Admin' && user?.branchId) {
      if (existingCenter.area?.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Security Violation: Cannot modify a center from another branch.' });
      }
      if (areaId && areaId !== existingCenter.areaId) {
        const newArea = await prisma.area.findUnique({ where: { id: areaId } });
        if (newArea && newArea.branchId !== user.branchId) {
          return res.status(403).json({ error: 'Security Violation: Cannot move center to an area outside your branch.' });
        }
      }
    }

    const center = await prisma.center.update({
      where: { id: String(id) },
      data: {
        ...(name !== undefined && { name }),
        ...(code !== undefined && { code }),
        ...(centerTime !== undefined && { centerTime }),
        ...(repaymentType !== undefined && { repaymentType }),
        ...(disbursMode !== undefined && { disbursMode }),
        ...(areaId !== undefined && { areaId }),
        ...(employeeId !== undefined && { employeeId: employeeId || null }),
        ...(isActive !== undefined && { isActive }),
        ...(totalMembers !== undefined && { totalMembers: parseInt(totalMembers) }),
      },
      include: { employee: true },
    });
    return res.status(200).json(center);
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Center not found' });
    console.error('Error updating center:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteCenter = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id);

    // Security check
    const existingCenter = await prisma.center.findUnique({ where: { id }, include: { area: true } });
    if (!existingCenter) return res.status(404).json({ error: 'Center not found' });
    
    const user = (req as any).user;
    if (user?.role?.name !== 'Admin' && user?.branchId) {
      if (existingCenter.area?.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Security Violation: Cannot delete a center from another branch.' });
      }
    }

    await prisma.center.delete({ where: { id } });
    return res.status(200).json({ message: 'Center deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Center not found' });
    const errStr = String(error);
    if (error.code === 'P2003' || error.code === 'P2014' || errStr.includes('foreign key constraint') || errStr.includes('23001')) {
      return res.status(400).json({ error: 'Cannot delete center because it has associated data' });
    }
    console.error('Error deleting center:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
