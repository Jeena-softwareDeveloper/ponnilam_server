import prisma from './prisma';
import bcrypt from 'bcryptjs';
import { NotificationType, NotificationStatus } from './prisma-enums';
import { generateTemporaryPassword } from './auth.utils';

export async function executePasswordReset(params: {
  staffId: string;
  approvedByUserId: string;
  approvedByName: string;
  notificationId?: string;
}): Promise<{ temporaryPassword: string; staffName: string }> {
  const staff = await prisma.staff.findUnique({ where: { id: params.staffId } });
  if (!staff) throw new Error('Staff not found');

  const temporaryPassword = generateTemporaryPassword();
  const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

  await prisma.$transaction(async (tx) => {
    await tx.staff.update({
      where: { id: params.staffId },
      data: { password: hashedPassword, mustChangePassword: true },
    });

    const notifWhere: any = {
      staffId: params.staffId,
      type: NotificationType.PASSWORD_RESET,
      status: NotificationStatus.PENDING,
    };
    if (params.notificationId) {
      notifWhere.id = params.notificationId;
    }

    await tx.notification.updateMany({
      where: notifWhere,
      data: { status: NotificationStatus.APPROVED, isRead: true },
    });

    const pendingLogs = await tx.auditLog.findMany({
      where: { staffId: params.staffId, action: 'FORGOT_PASSWORD_REQUEST' },
    });
    for (const log of pendingLogs) {
      await tx.auditLog.update({
        where: { id: log.id },
        data: {
          action: 'PASSWORD_RESET_RESOLVED',
          details: `Password reset for ${staff.name} by ${params.approvedByName}`,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        action: 'PASSWORD_RESET_APPROVED',
        entity: 'Auth',
        staffId: params.approvedByUserId,
        details: `Approved password reset for staff ${staff.name} (${staff.username || staff.phone})`,
      },
    });
  });

  return { temporaryPassword, staffName: staff.name };
}

export async function rejectPasswordReset(params: {
  notificationId: string;
  staffId: string;
  rejectedByName: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.notification.update({
      where: { id: params.notificationId },
      data: { status: NotificationStatus.REJECTED, isRead: true },
    });

    const pendingLogs = await tx.auditLog.findMany({
      where: { staffId: params.staffId, action: 'FORGOT_PASSWORD_REQUEST' },
    });
    for (const log of pendingLogs) {
      await tx.auditLog.update({
        where: { id: log.id },
        data: {
          action: 'PASSWORD_RESET_REJECTED',
          details: `Password reset rejected by ${params.rejectedByName}`,
        },
      });
    }
  });
}

export async function listPendingPasswordResetRequests(branchId?: string | null) {
  const where: any = {
    type: NotificationType.PASSWORD_RESET,
    status: NotificationStatus.PENDING,
  };
  if (branchId) {
    where.branchId = branchId;
  }

  return prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      staff: { select: { id: true, name: true, phone: true, username: true } },
    },
  });
}
