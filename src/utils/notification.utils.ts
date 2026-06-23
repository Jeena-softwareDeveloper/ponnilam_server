import prisma from './prisma';

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  status: string;
  staffId: string | null;
  branchId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function listNotifications(branchId?: string | null, limit = 50): Promise<NotificationRow[]> {
  if (branchId) {
    return prisma.$queryRaw<NotificationRow[]>`
      SELECT id, type, title, message, isRead, status, staffId, branchId, createdAt, updatedAt
      FROM Notification
      WHERE branchId = ${branchId}
      ORDER BY datetime(createdAt) DESC
      LIMIT ${limit}
    `;
  }

  return prisma.$queryRaw<NotificationRow[]>`
    SELECT id, type, title, message, isRead, status, staffId, branchId, createdAt, updatedAt
    FROM Notification
    ORDER BY datetime(createdAt) DESC
    LIMIT ${limit}
  `;
}

export async function getNotificationById(id: string): Promise<NotificationRow | null> {
  const rows = await prisma.$queryRaw<NotificationRow[]>`
    SELECT id, type, title, message, isRead, status, staffId, branchId, createdAt, updatedAt
    FROM Notification
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ?? null;
}
