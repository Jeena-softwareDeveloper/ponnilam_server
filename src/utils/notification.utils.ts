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
  const where = branchId ? { branchId } : {};
  
  return prisma.notification.findMany({
    where,
    select: {
      id: true,
      type: true,
      title: true,
      message: true,
      isRead: true,
      status: true,
      staffId: true,
      branchId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
  }) as Promise<NotificationRow[]>;
}

export async function getNotificationById(id: string): Promise<NotificationRow | null> {
  return prisma.notification.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      title: true,
      message: true,
      isRead: true,
      status: true,
      staffId: true,
      branchId: true,
      createdAt: true,
      updatedAt: true,
    },
  }) as Promise<NotificationRow | null>;
}
