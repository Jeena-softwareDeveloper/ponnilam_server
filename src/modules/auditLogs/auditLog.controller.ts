import prisma from '../../utils/prisma';
import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';

// GET /api/v1/audit-logs - full audit history
export const getAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const {
    staffId,
    action,
    entity,
    startDate,
    endDate,
    page = '1',
    limit = '100',
  } = req.query as Record<string, string>;

  const where: any = {};

  if (staffId) where.staffId = staffId;
  if (action) where.action = action;
  if (entity) where.entity = entity;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 100;
  const skip = (pageNum - 1) * limitNum;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        staff: {
          select: {
            id: true,
            name: true,
            username: true,
            phone: true,
            role: { select: { name: true } },
            branch: { select: { name: true } },
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.auditLog.count({ where })
  ]);

  return res.status(200).json({ logs, total, page: pageNum, limit: limitNum });
});

// GET /api/v1/audit-logs/active-sessions - who logged in today and hasn't logged out
export const getActiveSessions = asyncHandler(async (req: Request, res: Response) => {
  // Get today's login logs
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const loginLogs = await prisma.auditLog.findMany({
    where: {
      action: 'LOGIN',
      createdAt: { gte: todayStart }
    },
    include: {
      staff: {
        select: {
          id: true,
          name: true,
          username: true,
          phone: true,
          role: { select: { name: true } },
          branch: { select: { name: true } },
          isActive: true,
        }
      }
    },
    orderBy: { createdAt: 'desc' },
  });

  // Deduplicate by staffId (keep latest login per staff)
  const seen = new Set<string>();
  const uniqueSessions = loginLogs.filter(log => {
    if (!log.staffId || seen.has(log.staffId)) return false;
    seen.add(log.staffId);
    return true;
  });

  return res.status(200).json(uniqueSessions);
});

// GET /api/v1/audit-logs/stats
export const getAuditStats = asyncHandler(async (req: Request, res: Response) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [totalToday, loginToday, createToday, updateToday, deleteToday, totalAll] = await Promise.all([
    prisma.auditLog.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.auditLog.count({ where: { action: 'LOGIN', createdAt: { gte: todayStart } } }),
    prisma.auditLog.count({ where: { action: 'CREATE', createdAt: { gte: todayStart } } }),
    prisma.auditLog.count({ where: { action: 'UPDATE', createdAt: { gte: todayStart } } }),
    prisma.auditLog.count({ where: { action: 'DELETE', createdAt: { gte: todayStart } } }),
    prisma.auditLog.count(),
  ]);

  return res.status(200).json({ totalToday, loginToday, createToday, updateToday, deleteToday, totalAll });
});
