import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getBranches = async (req: Request, res: Response): Promise<any> => {
  try {
    const { centerId } = req.query;
    
    const branches = await prisma.branch.findMany({
      where: centerId ? { centerId: String(centerId) } : undefined,
      include: {
        center: true, // Join with Center table to get Center name
      },
      orderBy: { code: 'asc' },
    });
    return res.status(200).json(branches);
  } catch (error) {
    console.error('Error fetching branches:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
