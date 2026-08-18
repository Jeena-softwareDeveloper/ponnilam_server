import { Request, Response } from 'express';
import prisma from '../../utils/prisma';
import { asyncHandler } from '../../utils/asyncHandler';

export const getPublicActivities = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const skip = (page - 1) * limit;

  const [activities, total] = await Promise.all([
    prisma.activity.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        category: { select: { id: true, name: true } }
      }
    }),
    prisma.activity.count()
  ]);

  res.json({
    data: activities,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  });
});
