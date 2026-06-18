import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getAreas = async (req: Request, res: Response): Promise<any> => {
  try {
    const { branchId } = req.query;
    const areas = await prisma.area.findMany({
      where: branchId ? { branchId: String(branchId) } : undefined,
      include: { branch: true },
      orderBy: { name: 'asc' },
    });
    return res.status(200).json(areas);
  } catch (error) {
    console.error('Error fetching areas:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createArea = async (req: Request, res: Response): Promise<any> => {
  try {
    const { name, branchId } = req.body;
    if (!name || !branchId) return res.status(400).json({ error: 'Name and branchId are required' });
    const area = await prisma.area.create({
      data: { name, branchId },
      include: { branch: true },
    });
    return res.status(201).json(area);
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Area name already exists' });
    console.error('Error creating area:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateArea = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id);
    const { name, branchId, isActive } = req.body;
    
    // Security check
    const existingArea = await prisma.area.findUnique({ where: { id } });
    if (!existingArea) return res.status(404).json({ error: 'Area not found' });
    
    const user = (req as any).user;
    if (user?.role?.name !== 'Super Admin' && user?.branchId) {
      if (existingArea.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Security Violation: Cannot modify an area from another branch.' });
      }
    }

    const area = await prisma.area.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(branchId !== undefined && { branchId }),
        ...(isActive !== undefined && { isActive }),
      },
      include: { branch: true },
    });
    return res.status(200).json(area);
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Area not found' });
    console.error('Error updating area:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteArea = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id);

    const existingArea = await prisma.area.findUnique({ where: { id } });
    if (!existingArea) return res.status(404).json({ error: 'Area not found' });
    
    const user = (req as any).user;
    if (user?.role?.name !== 'Super Admin' && user?.branchId) {
      if (existingArea.branchId !== user.branchId) {
      }
    }

    await prisma.area.delete({ where: { id } });
    return res.status(204).send();
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Area not found' });
    const errStr = String(error);
    if (error.code === 'P2003' || error.code === 'P2014' || errStr.includes('foreign key constraint') || errStr.includes('23001')) {
      return res.status(400).json({ error: 'Cannot delete area because it has associated centers or customers' });
    }
    console.error('Error deleting area:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
