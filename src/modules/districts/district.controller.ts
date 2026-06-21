import { Request, Response } from 'express';
import prisma from '../../utils/prisma';

export const getDistricts = async (req: Request, res: Response): Promise<any> => {
  try {
    const { stateId } = req.query;
    const districts = await prisma.district.findMany({
      where: stateId ? { stateId: String(stateId) } : undefined,
      include: { state: true },
      orderBy: { name: 'asc' },
    });
    return res.status(200).json(districts);
  } catch (error) {
    console.error('Error fetching districts:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createDistrict = async (req: Request, res: Response): Promise<any> => {
  try {
    const { name, stateId } = req.body;
    if (!name || !stateId) return res.status(400).json({ error: 'Name and stateId are required' });
    const district = await prisma.district.create({
      data: { name, stateId },
      include: { state: true },
    });
    return res.status(201).json(district);
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'District name already exists in this state' });
    console.error('Error creating district:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateDistrict = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id);
    const { name, stateId, isActive } = req.body;
    const district = await prisma.district.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(stateId !== undefined && { stateId }),
        ...(isActive !== undefined && { isActive }),
      },
      include: { state: true },
    });
    return res.status(200).json(district);
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'District not found' });
    console.error('Error updating district:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteDistrict = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id);
    await prisma.district.delete({ where: { id } });
    return res.status(200).json({ message: 'District deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2003') return res.status(400).json({ error: 'Cannot delete district because it has associated branches' });
    console.error('Error deleting district:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
