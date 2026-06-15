import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getCenters = async (req: Request, res: Response): Promise<any> => {
  try {
    const centers = await prisma.center.findMany({
      include: { employee: true },
      orderBy: { name: 'asc' },
    });
    return res.status(200).json(centers);
  } catch (error) {
    console.error('Error fetching centers:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
