import prisma from '../../utils/prisma';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { generateTemporaryPassword } from '../../utils/auth.utils';
import { isAdminUser } from '../../utils/user.utils';
import {
  assertCanManageStaff,
  assertRoleAssignmentAllowed,
  enforceStaffBranchOnCreate,
  loadStaffOrThrow,
  StaffSecurityError,
} from '../../utils/staff-security.utils';

function withoutPassword<T extends { password?: string }>(staff: T) {
  const { password: _, ...safe } = staff;
  return safe;
}

function normalizeStaffPhone(phone: string): string {
  return String(phone || '').trim().replace(/\D/g, '');
}

function normalizeStaffEmail(email?: string | null): string | null {
  const trimmed = String(email || '').trim();
  if (!trimmed) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return '__INVALID__';
  }
  return trimmed.toLowerCase();
}

function duplicateStaffMessage(target: string[] | undefined): string {
  const field = (target?.[0] || '').toLowerCase();
  if (field.includes('phone')) return 'This phone number is already registered to another staff member';
  if (field.includes('email')) return 'This email is already registered to another staff member';
  if (field.includes('username')) return 'This username is already taken by another staff member';
  return 'Phone, email, or username already exists';
}

async function assertStaffFieldsUnique(
  data: { phone: string; email: string | null; username: string | null },
  excludeId?: string
): Promise<string | null> {
  const notSelf = excludeId ? { id: { not: excludeId } } : {};

  const phoneMatch = await prisma.staff.findFirst({
    where: { ...notSelf, phone: data.phone },
    select: { name: true },
  });
  if (phoneMatch) {
    return `Phone ${data.phone} is already registered to "${phoneMatch.name}"`;
  }

  if (data.email) {
    const emailMatch = await prisma.staff.findFirst({
      where: { ...notSelf, email: data.email },
      select: { name: true },
    });
    if (emailMatch) {
      return `Email "${data.email}" is already registered to "${emailMatch.name}"`;
    }
  }

  if (data.username) {
    const usernameMatch = await prisma.staff.findFirst({
      where: { ...notSelf, username: data.username },
      select: { name: true },
    });
    if (usernameMatch) {
      return `Username "${data.username}" is already used by "${usernameMatch.name}"`;
    }
  }

  return null;
}

function handleStaffError(res: Response, error: any) {
  if (error instanceof StaffSecurityError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error.code === 'P2002') {
    return res.status(409).json({ error: duplicateStaffMessage(error.meta?.target) });
  }
  if (error.code === 'P2025') return res.status(404).json({ error: 'Staff not found' });
  if (error.code === 'P2003') return res.status(400).json({ error: 'Cannot delete staff because it has associated records' });
  console.error('Staff error:', error);
  return res.status(500).json({ error: 'Internal server error' });
}

export const getStaffs = async (req: Request, res: Response): Promise<any> => {
  try {
    const { areaId, branchId } = req.query;

    const user = (req as any).user;
    const userBranchId = user?.branchId;

    let whereClause: any = {};
    const activeBranchId = userBranchId || branchId;

    if (areaId) {
      whereClause.areaId = String(areaId);
    }
    if (activeBranchId) {
      whereClause.OR = [
        { branchId: String(activeBranchId) },
        { area: { branchId: String(activeBranchId) } },
      ];
    }

    const staffs = await prisma.staff.findMany({
      where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
      include: { area: true, role: true, branch: true },
      orderBy: { name: 'asc' },
    });

    const filteredStaffs = staffs
      .filter((s) => s.username !== 'admin' && s.role?.name !== 'Admin')
      .map(withoutPassword);
    return res.status(200).json(filteredStaffs);
  } catch (error) {
    return handleStaffError(res, error);
  }
};

export const createStaff = async (req: Request, res: Response): Promise<any> => {
  try {
    const user = (req as any).user;
    let { name, username, phone, email, areaId, branchId, roleId, password } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });
    if (!roleId) return res.status(400).json({ error: 'Role is required' });

    const normalizedPhone = normalizeStaffPhone(phone);
    if (!/^\d{10}$/.test(normalizedPhone)) {
      return res.status(400).json({ error: 'Enter a valid 10-digit phone number' });
    }

    const normalizedEmail = normalizeStaffEmail(email);
    if (normalizedEmail === '__INVALID__') {
      return res.status(400).json({ error: 'Enter a valid email address (e.g. staff@example.com) or leave email empty' });
    }

    const normalizedUsername = username?.trim() || null;
    const duplicateErr = await assertStaffFieldsUnique({
      phone: normalizedPhone,
      email: normalizedEmail,
      username: normalizedUsername,
    });
    if (duplicateErr) return res.status(409).json({ error: duplicateErr });

    await assertRoleAssignmentAllowed(user, roleId);
    const scoped = enforceStaffBranchOnCreate(user, { branchId, areaId });
    branchId = scoped.branchId;
    areaId = scoped.areaId;

    if (areaId && branchId) {
      const area = await prisma.area.findUnique({ where: { id: areaId } });
      if (!area || area.branchId !== branchId) {
        return res.status(400).json({ error: 'Area does not belong to the selected branch' });
      }
    } else if (areaId) {
      const area = await prisma.area.findUnique({ where: { id: areaId } });
      if (!area) return res.status(400).json({ error: 'Invalid area' });
      if (!isAdminUser(user) && user?.branchId && area.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Cannot assign staff to an area outside your branch' });
      }
    }

    let hashedPassword = '';
    let mustChangePassword = false;
    let temporaryPassword: string | undefined;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    } else {
      temporaryPassword = generateTemporaryPassword();
      hashedPassword = await bcrypt.hash(temporaryPassword, 10);
      mustChangePassword = true;
    }

    const staff = await prisma.staff.create({
      data: {
        name,
        username: normalizedUsername,
        phone: normalizedPhone,
        email: normalizedEmail,
        areaId: areaId || null,
        branchId: branchId || null,
        roleId,
        password: hashedPassword,
        mustChangePassword,
      },
      include: { area: true, role: true, branch: true },
    });

    return res.status(201).json({
      ...withoutPassword(staff),
      ...(temporaryPassword ? { temporaryPassword } : {}),
    });
  } catch (error) {
    return handleStaffError(res, error);
  }
};

export const updateStaff = async (req: Request, res: Response): Promise<any> => {
  try {
    const user = (req as any).user;
    const id = String(req.params.id);
    const existing = await loadStaffOrThrow(id);
    assertCanManageStaff(user, existing, 'update this staff member');

    const { name, username, phone, email, areaId, branchId, roleId, isActive, password } = req.body;

    if (roleId) {
      await assertRoleAssignmentAllowed(user, roleId);
    }

    const normalizedPhone = phone !== undefined ? normalizeStaffPhone(phone) : undefined;
    if (normalizedPhone !== undefined && !/^\d{10}$/.test(normalizedPhone)) {
      return res.status(400).json({ error: 'Enter a valid 10-digit phone number' });
    }

    let normalizedEmail: string | null | undefined;
    if (email !== undefined) {
      normalizedEmail = normalizeStaffEmail(email);
      if (normalizedEmail === '__INVALID__') {
        return res.status(400).json({ error: 'Enter a valid email address (e.g. staff@example.com) or leave email empty' });
      }
    }

    const normalizedUsername = username !== undefined ? (username?.trim() || null) : undefined;

    const duplicateErr = await assertStaffFieldsUnique(
      {
        phone: normalizedPhone ?? existing.phone,
        email: normalizedEmail !== undefined ? normalizedEmail : existing.email,
        username: normalizedUsername !== undefined ? normalizedUsername : existing.username,
      },
      id
    );
    if (duplicateErr) return res.status(409).json({ error: duplicateErr });

    if (!isAdminUser(user)) {
      if (branchId !== undefined && branchId !== user.branchId) {
        return res.status(403).json({ error: 'Cannot move staff to another branch' });
      }
      if (areaId) {
        const area = await prisma.area.findUnique({ where: { id: areaId } });
        if (!area || area.branchId !== user.branchId) {
          return res.status(403).json({ error: 'Cannot assign staff to an area outside your branch' });
        }
      }
    }

    const updateData: any = {
      ...(name !== undefined && { name }),
      ...(normalizedUsername !== undefined && { username: normalizedUsername }),
      ...(normalizedPhone !== undefined && { phone: normalizedPhone }),
      ...(normalizedEmail !== undefined && { email: normalizedEmail }),
      ...(areaId !== undefined && { areaId: areaId || null }),
      ...(branchId !== undefined && isAdminUser(user) && { branchId: branchId || null }),
      ...(roleId !== undefined && roleId && { roleId }),
      ...(isActive !== undefined && { isActive }),
    };

    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
      updateData.mustChangePassword = false;
    }

    const staff = await prisma.staff.update({
      where: { id },
      data: updateData,
      include: { area: true, role: true, branch: true },
    });

    return res.status(200).json(withoutPassword(staff));
  } catch (error) {
    return handleStaffError(res, error);
  }
};

export const deleteStaff = async (req: Request, res: Response): Promise<any> => {
  try {
    const user = (req as any).user;
    const id = String(req.params.id);
    const existing = await loadStaffOrThrow(id);
    assertCanManageStaff(user, existing, 'delete this staff member');

    await prisma.staff.delete({ where: { id } });
    return res.status(200).json({ message: 'Staff deleted successfully' });
  } catch (error) {
    return handleStaffError(res, error);
  }
};

export const getRequests = async (req: Request, res: Response): Promise<any> => {
  try {
    const user = (req as any).user;
    const where: any = { action: 'FORGOT_PASSWORD_REQUEST' };
    if (user?.role?.name !== 'Admin' && user?.branchId) {
      where.staff = { OR: [{ branchId: user.branchId }, { area: { branchId: user.branchId } }] };
    }
    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { staff: { select: { id: true, name: true, phone: true, username: true } } },
    });
    return res.status(200).json(logs);
  } catch (error) {
    return handleStaffError(res, error);
  }
};

export const resolveResetRequest = async (req: Request, res: Response): Promise<any> => {
  try {
    const user = (req as any).user;
    const logId = String(req.params.id);

    const requestLog = await prisma.auditLog.findUnique({ where: { id: logId } });
    if (!requestLog || !requestLog.staffId || requestLog.action !== 'FORGOT_PASSWORD_REQUEST') {
      return res.status(404).json({ error: 'Reset request not found' });
    }

    const staff = await loadStaffOrThrow(requestLog.staffId);
    assertCanManageStaff(user, staff, 'reset password for this staff member');

    const temporaryPassword = generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    await prisma.staff.update({
      where: { id: staff.id },
      data: { password: hashedPassword, mustChangePassword: true },
    });

    await prisma.auditLog.update({
      where: { id: logId },
      data: {
        action: 'PASSWORD_RESET_RESOLVED',
        details: `Password reset for ${staff.name} by ${user.name || user.id}`,
      },
    });

    return res.status(200).json({
      message: 'Password reset successfully. Share the temporary password securely with the staff member.',
      temporaryPassword,
    });
  } catch (error) {
    return handleStaffError(res, error);
  }
};
