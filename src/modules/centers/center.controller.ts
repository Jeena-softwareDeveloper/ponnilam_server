import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getCenters = async (req: Request, res: Response): Promise<any> => {
  try {
    const { branchId } = req.query;
    const whereClause: any = {};
    
    if (branchId) {
      whereClause.area = { branchId: String(branchId) };
    }
    
    const centers = await prisma.center.findMany({
      where: whereClause,
      include: { employee: true, area: true },
      orderBy: { name: 'asc' },
    });
    return res.status(200).json(centers);
  } catch (error) {
    console.error('Error fetching centers:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createCenter = async (req: Request, res: Response): Promise<any> => {
  try {
    const { name, code, centerTime, repaymentType, disbursMode, areaId, employeeId, totalMembers } = req.body;
    if (!name || !areaId) return res.status(400).json({ error: 'Name and Area are required' });
    
    // Security check
    const user = (req as any).user;
    if (user?.role?.name !== 'Super Admin' && user?.branchId) {
      const area = await prisma.area.findUnique({ where: { id: areaId } });
      if (!area || area.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Security Violation: Cannot create a center in an area outside your branch.' });
      }
    }

    const center = await prisma.center.create({
      data: {
        name,
        code: code || null,
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
    if (user?.role?.name !== 'Super Admin' && user?.branchId) {
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
    if (user?.role?.name !== 'Super Admin' && user?.branchId) {
      if (existingCenter.area?.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Security Violation: Cannot delete a center from another branch.' });
      }
    }

    await prisma.center.delete({ where: { id } });
    return res.status(200).json({ message: 'Center deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Center not found' });
    if (error.code === 'P2003') return res.status(400).json({ error: 'Cannot delete center because it has associated data' });
    console.error('Error deleting center:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
