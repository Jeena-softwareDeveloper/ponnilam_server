import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getCenters = async (req: Request, res: Response): Promise<any> => {
  try {
    const centers = await prisma.center.findMany({
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
    const { name, code, centerTime, repaymentType, disbursMode, areaId, employeeId } = req.body;
    if (!name || !areaId) return res.status(400).json({ error: 'Name and Area are required' });
    const center = await prisma.center.create({
      data: {
        name,
        code: code || null,
        centerTime: centerTime || null,
        repaymentType: repaymentType || 'WEEKLY',
        disbursMode: disbursMode || 'CASH',
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
    const { name, code, centerTime, repaymentType, disbursMode, areaId, employeeId, isActive } = req.body as {
      name?: string; code?: string; centerTime?: string;
      repaymentType?: string; disbursMode?: string; areaId?: string;
      employeeId?: string; isActive?: boolean;
    };
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
