import { Request, Response } from 'express';
import * as path from 'path';
import prisma from '../../utils/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { parsePagination, paginatedResponse } from '../../utils/pagination.utils';
import { uploadFileToFtp, syncAllActivitiesToFtp } from '../../utils/ftp.utils';

export const getActivities = asyncHandler(async (req: Request, res: Response) => {
  const branchId = req.query.branchId as string | undefined;
  const user = (req as any).user;
  const activeBranchId = user?.branchId || (branchId !== 'all' ? branchId : undefined);

  const where: any = {};
  if (activeBranchId) {
    where.branchId = activeBranchId;
  }

  const { page, limit, skip } = parsePagination(req.query as Record<string, string>);

  const [activities, total] = await Promise.all([
    prisma.activity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        branch: { select: { name: true } },
        category: { select: { id: true, name: true } }
      }
    }),
    prisma.activity.count({ where })
  ]);

  res.json(paginatedResponse(activities, total, page, limit));
});

export const createActivity = asyncHandler(async (req: Request, res: Response) => {
  const { slug, categoryId } = req.body;
  const files = req.files as Express.Multer.File[];

  if (!slug) return res.status(400).json({ error: 'Slug is required' });
  if (!files || files.length === 0) return res.status(400).json({ error: 'At least one photo is required' });

  const user = (req as any).user;
  const branchId = user?.branchId; // Optional branch attachment

  const activities = await Promise.all(files.map(file => {
    const photoUrl = `/uploads/activities/${file.filename}`;
    return prisma.activity.create({
      data: {
        slug,
        photoUrl,
        branchId,
        categoryId: categoryId || null,
      },
      include: {
        branch: { select: { name: true } },
        category: { select: { name: true } }
      }
    });
  }));

  // Fire-and-forget FTP upload — does NOT block the response
  Promise.allSettled(
    files.map(file => {
      const localPath = path.join(process.cwd(), 'public', 'uploads', 'activities', file.filename);
      return uploadFileToFtp(localPath, file.filename).catch((err) =>
        console.error(`[FTP] Failed to upload ${file.filename}:`, err.message)
      );
    })
  );

  res.status(201).json(activities);
});

export const updateActivity = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const { slug, categoryId } = req.body;

  const activity = await prisma.activity.findUnique({ where: { id } });
  if (!activity) return res.status(404).json({ error: 'Activity not found' });

  const updated = await prisma.activity.update({
    where: { id },
    data: {
      ...(slug ? { slug } : {}),
      categoryId: categoryId === '' ? null : categoryId ?? activity.categoryId,
    },
    include: {
      branch: { select: { name: true } },
      category: { select: { id: true, name: true } }
    }
  });

  res.json(updated);
});

export const deleteActivity = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };

  const activity = await prisma.activity.findUnique({ where: { id } });
  if (!activity) return res.status(404).json({ error: 'Activity not found' });

  await prisma.activity.delete({ where: { id } });

  res.json({ success: true });
});

/** Manual sync: upload all existing local activity photos to FTP */
export const syncActivitiesToFtp = asyncHandler(async (req: Request, res: Response) => {
  const result = await syncAllActivitiesToFtp();
  res.json({ message: 'FTP sync complete', ...result });
});
