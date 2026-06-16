import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getCollectionReport = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, branchId, type } = req.query;

    const where: any = {};
    
    if (startDate && endDate) {
      where.trnDate = {
        gte: new Date(String(startDate)),
        lte: new Date(String(endDate))
      };
    } else if (type === 'DAILY') {
      const today = new Date();
      today.setHours(0,0,0,0);
      where.trnDate = { gte: today };
    } else if (type === 'MONTHLY') {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0,0,0,0);
      where.trnDate = { gte: startOfMonth };
    }

    if (branchId) {
      where.loan = { customer: { area: { branchId: String(branchId) } } };
    }

    // Role scoping
    if (res.locals.areaIds && res.locals.areaIds.length > 0) {
      where.loan = { ...where.loan, customer: { areaId: { in: res.locals.areaIds } } };
    }

    const collections = await prisma.collection.findMany({
      where,
      include: {
        loan: {
          include: {
            customer: {
              include: { area: { include: { branch: true } } }
            }
          }
        },
        staff: true
      },
      orderBy: { trnDate: 'desc' }
    });

    res.json(collections);
  } catch (error) {
    console.error('Report Error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
};
