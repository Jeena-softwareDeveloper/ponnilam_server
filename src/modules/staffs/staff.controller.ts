import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getStaffs = async (req: Request, res: Response): Promise<any> => {
  try {
    const { branchId } = req.query;
    
    const staffs = await prisma.staff.findMany({
      where: branchId ? { branchId: String(branchId) } : undefined,
      include: {
        branch: true,
        role: true,
      },
      orderBy: { name: 'asc' },
    });
    return res.status(200).json(staffs);
  } catch (error) {
    console.error('Error fetching staffs:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
