import prisma from '../../utils/prisma';
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { NotificationType, NotificationStatus } from '../../utils/prisma-enums';
import { asyncHandler } from '../../utils/asyncHandler';


export const login = asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  // 1. Database Check
  const staff = await prisma.staff.findFirst({
    where: {
      OR: [
        { phone: username },
        { email: username },
        { username: username }
      ]
    },
    include: { role: true, branch: true, area: { include: { branch: true } } }
  });

  if (!staff) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (!staff.isActive) {
    return res.status(403).json({ error: 'Account is inactive' });
  }

  // Compare passwords (bcrypt only — no plaintext fallback)
  if (!staff.password.startsWith('$2b$') && !staff.password.startsWith('$2a$')) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const isMatch = await bcrypt.compare(password, staff.password);
  const isFirstLogin =
    (staff.username && (await bcrypt.compare(staff.username, staff.password))) ||
    (staff.phone && (await bcrypt.compare(staff.phone, staff.password)));

  if (!isMatch) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

    // Generate JWT with strict branch assignment
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not configured. Server startup failed.');
    }
    const token = jwt.sign(
      {
        id: staff.id,
        branchId: staff.branchId || staff.area?.branchId || null
      },
      jwtSecret,
      { expiresIn: '1d' }
    );

  if (isFirstLogin || staff.mustChangePassword) {
    return res.status(200).json({
      message: 'Password change required',
      forcePasswordChange: true,
      token,
      user: {
        id: staff.id,
        name: staff.name,
        role: staff.role?.name || 'User',
        area: staff.area?.name || null,
        branch: staff.branch?.name || staff.area?.branch?.name || null,
        branchId: staff.branchId || staff.area?.branchId || null
      }
    });
  }

  // Audit Log the login
  await prisma.auditLog.create({
    data: {
      action: 'LOGIN',
      entity: 'Auth',
      staffId: staff.id,
      details: 'User logged in successfully'
    }
  });

  return res.status(200).json({
    message: 'Login successful',
    token,
    user: {
      id: staff.id,
      name: staff.name,
      role: staff.role?.name || 'User',
      area: staff.area?.name || null,
      branch: staff.branch?.name || staff.area?.branch?.name || null,
      branchId: staff.branchId || staff.area?.branchId || null
    }
  });

});

export const getAuthMenus = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Admin (env or role) gets all menus with full CRUD
  const buildFullAccess = (menus: any[]) =>
    menus.map(m => ({ ...m, canView: true, canCreate: true, canEdit: true, canDelete: true }));



  const staff = await prisma.staff.findUnique({
    where: { id: user.id },
    include: {
      role: true,
      menus: { include: { menu: true } },
      branch: { include: { menus: { include: { menu: true } } } },
      area: { include: { branch: { include: { menus: { include: { menu: true } } } } } }
    }
  });

  if (!staff) return res.status(404).json({ error: 'Staff not found' });

  if (staff.role?.name === 'Admin') {
    const allMenus = await prisma.menu.findMany({ orderBy: { name: 'asc' } });
    return res.status(200).json(buildFullAccess(allMenus));
  }

  // Non-admin: build menus WITH their CRUD permissions
  let allowedEntries: any[] = [];
  const staffSpecificMenus = staff.menus; // StaffMenu[] with canView etc.

  if (staffSpecificMenus.length > 0) {
    allowedEntries = staffSpecificMenus.map((sm: any) => ({
      ...sm.menu,
      canView: sm.canView,
      canCreate: sm.canCreate,
      canEdit: sm.canEdit,
      canDelete: sm.canDelete,
    }));
  } else if (staff.branch?.menus?.length) {
    allowedEntries = staff.branch.menus.map((bm: any) => ({
      ...bm.menu,
      canView: bm.canView,
      canCreate: bm.canCreate,
      canEdit: bm.canEdit,
      canDelete: bm.canDelete,
    }));
  } else if (staff.area?.branch?.menus?.length) {
    allowedEntries = staff.area.branch.menus.map((bm: any) => ({
      ...bm.menu,
      canView: bm.canView,
      canCreate: bm.canCreate,
      canEdit: bm.canEdit,
      canDelete: bm.canDelete,
    }));
  }

  // Filter to only menus with canView = true
  return res.status(200).json(allowedEntries.filter((m: any) => m.canView !== false));
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user || !user.id || user.id === 'env-admin') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.staff.update({
    where: { id: user.id },
    data: { password: hashedPassword, mustChangePassword: false },
  });

  return res.status(200).json({ message: 'Password updated successfully' });
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username is required' });

  const staff = await prisma.staff.findFirst({
    where: {
      OR: [
        { username },
        { phone: username },
        { email: username }
      ]
    }
  });

  if (!staff) {
    return res.status(200).json({ message: 'If the username exists, a reset request has been sent to the admin.' });
  }

  const pending = await prisma.notification.findFirst({
    where: {
      staffId: staff.id,
      type: NotificationType.PASSWORD_RESET,
      status: NotificationStatus.PENDING,
    },
  });
  if (pending) {
    return res.status(200).json({ message: 'If the username exists, a reset request has been sent to the admin.' });
  }

  // Create a notification for Admins / Branch Managers
  await prisma.notification.create({
    data: {
      type: NotificationType.PASSWORD_RESET,
      title: 'Password Reset Request',
      message: `${staff.name} (${staff.username || staff.phone}) requested a password reset.`,
      staffId: staff.id,
      branchId: staff.branchId,
      status: NotificationStatus.PENDING,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: 'FORGOT_PASSWORD_REQUEST',
      entity: 'Auth',
      staffId: staff.id,
      details: `Password reset requested for ${staff.name} (${staff.username || staff.phone})`
    }
  });

  return res.status(200).json({ message: 'If the username exists, a reset request has been sent to the admin.' });
});
