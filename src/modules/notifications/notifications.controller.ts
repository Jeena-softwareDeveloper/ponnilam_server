import prisma from '../../utils/prisma';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';


export const getNotifications = async (req: Request, res: Response): Promise<any> => {
  try {
    const user = (req as any).user;
    
    let whereClause: any = {};
    
    // If not Admin, only show notifications for their branch
    if (user?.role?.name !== 'Admin' && user?.branchId) {
      whereClause = { branchId: user.branchId };
    }

    const notifications = await prisma.notification.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 50 // Limit to recent 50
    });

    return res.status(200).json(notifications);
  } catch (error) {
    console.error('Get notifications error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const markAsRead = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    
    // Security check optional here since it just marks read, but good practice
    const user = (req as any).user;
    const notif = await prisma.notification.findUnique({ where: { id: id as string } });
    if (!notif) return res.status(404).json({ error: 'Notification not found' });
    
    if (user?.role?.name !== 'Admin' && user?.branchId) {
      if (notif.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    await prisma.notification.update({
      where: { id: id as string },
      data: { isRead: true }
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

    const notif = await prisma.notification.findUnique({ where: { id: id as string } });
    if (!notif) return res.status(404).json({ error: 'Notification not found' });
    
    if (user?.role?.name !== 'Admin' && user?.branchId) {
      if (notif.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    if (notif.type !== 'PASSWORD_RESET') {
      return res.status(400).json({ error: 'Invalid notification type' });
    }

    if (!notif.referenceId) {
      return res.status(400).json({ error: 'No staff reference found' });
    }

    // Reset password to default 'password123'
    const defaultPassword = 'password123';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    await prisma.$transaction([
      prisma.staff.update({
        where: { id: notif.referenceId },
        data: { password: hashedPassword }
      }),
      prisma.notification.update({
        where: { id: id as string },
        data: { status: 'APPROVED', isRead: true }
      }),
      prisma.auditLog.create({
        data: {
          action: 'PASSWORD_RESET_APPROVED',
          entity: 'Auth',
          staffId: user.id, // The manager/admin who approved it
          details: `Approved password reset for staff ${notif.referenceId}`
        }
      })
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

    const notif = await prisma.notification.findUnique({ where: { id: id as string } });
    if (!notif) return res.status(404).json({ error: 'Notification not found' });
    
    if (user?.role?.name !== 'Admin' && user?.branchId) {
      if (notif.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    await prisma.notification.update({
      where: { id: id as string },
      data: { status: 'REJECTED', isRead: true }
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Reject password reset error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
