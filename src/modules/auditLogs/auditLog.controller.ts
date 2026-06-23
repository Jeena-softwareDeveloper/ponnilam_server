import prisma from '../../utils/prisma';
import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { getDateRangeBounds, getDayRange } from '../../utils/date.utils';

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
    where.createdAt = getDateRangeBounds(startDate, endDate);
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
  const { dayStart: todayStart } = getDayRange(new Date());

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
  const { dayStart: todayStart } = getDayRange(new Date());

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
