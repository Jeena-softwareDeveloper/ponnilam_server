import { Request, Response } from 'express';
import prisma from '../../utils/prisma';
import { asyncHandler } from '../../utils/asyncHandler';

export const getCategories = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const branchId = user?.branchId as string | undefined;

  const categories = await prisma.activityCategory.findMany({
    where: branchId ? { branchId } : {},
    orderBy: { name: 'asc' },
    include: { _count: { select: { activities: true } } }
  });

  res.json(categories);
});

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Category name is required' });

  const user = (req as any).user;
  const branchId = user?.branchId as string | undefined;

  const existing = await prisma.activityCategory.findFirst({
    where: { name: name.trim(), branchId: branchId ?? null }
  });
  if (existing) return res.status(409).json({ error: 'Category with this name already exists' });

  const category = await prisma.activityCategory.create({
    data: { name: name.trim(), branchId: branchId ?? null },
    include: { _count: { select: { activities: true } } }
  });

  res.status(201).json(category);
});

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Category name is required' });

  const category = await prisma.activityCategory.findUnique({ where: { id } });
  if (!category) return res.status(404).json({ error: 'Category not found' });

  const updated = await prisma.activityCategory.update({
    where: { id },
    data: { name: name.trim() },
    include: { _count: { select: { activities: true } } }
  });

  res.json(updated);
});

export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };

  const category = await prisma.activityCategory.findUnique({ where: { id } });
  if (!category) return res.status(404).json({ error: 'Category not found' });

  await prisma.activityCategory.delete({ where: { id } });

  res.json({ success: true });
});
