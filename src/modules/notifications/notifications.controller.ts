import prisma from '../../utils/prisma';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { NotificationType, NotificationStatus } from '../../utils/prisma-enums';
import { DEFAULT_RESET_PASSWORD } from '../../utils/auth.utils';
import { isAdminUser } from '../../utils/user.utils';
import { getNotificationById, listNotifications } from '../../utils/notification.utils';

export const getNotifications = async (req: Request, res: Response): Promise<any> => {
  try {
    const user = (req as any).user;
    const branchId = !isAdminUser(user) && user?.branchId ? user.branchId : null;
    const notifications = await listNotifications(branchId);
    return res.status(200).json(notifications);
  } catch (error) {
    console.error('Get notifications error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const markAsRead = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const notif = await getNotificationById(id as string);
    if (!notif) return res.status(404).json({ error: 'Notification not found' });

    if (!isAdminUser(user) && user?.branchId) {
      if (notif.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    await prisma.notification.update({
      where: { id: id as string },
      data: { isRead: true },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const approvePasswordReset = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    const notif = await getNotificationById(id as string);
    if (!notif) return res.status(404).json({ error: 'Notification not found' });

    if (!isAdminUser(user) && user?.branchId) {
      if (notif.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    if (notif.type !== NotificationType.PASSWORD_RESET) {
      return res.status(400).json({ error: 'Invalid notification type' });
    }

    if (!notif.staffId) {
      return res.status(400).json({ error: 'No staff reference found' });
    }

    const hashedPassword = await bcrypt.hash(DEFAULT_RESET_PASSWORD, 10);

    await prisma.$transaction([
      prisma.staff.update({
        where: { id: notif.staffId },
        data: { password: hashedPassword },
      }),
      prisma.notification.update({
        where: { id: id as string },
        data: { status: NotificationStatus.APPROVED, isRead: true },
      }),
      prisma.auditLog.create({
        data: {
          action: 'PASSWORD_RESET_APPROVED',
          entity: 'Auth',
          staffId: user.id,
          details: `Approved password reset for staff ${notif.staffId}`,
        },
      }),
    ]);

    return res.status(200).json({ success: true, message: 'Password reset to default.' });
  } catch (error) {
    console.error('Approve password reset error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const rejectPasswordReset = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    const notif = await getNotificationById(id as string);
    if (!notif) return res.status(404).json({ error: 'Notification not found' });

    if (!isAdminUser(user) && user?.branchId) {
      if (notif.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    await prisma.notification.update({
      where: { id: id as string },
      data: { status: NotificationStatus.REJECTED, isRead: true },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Reject password reset error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
