import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getLoanPackages = async (req: Request, res: Response): Promise<any> => {
  try {
    const packages = await prisma.loanPackage.findMany({
      orderBy: { name: 'asc' },
    });
    return res.status(200).json(packages);
  } catch (error) {
    console.error('Error fetching loan packages:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
