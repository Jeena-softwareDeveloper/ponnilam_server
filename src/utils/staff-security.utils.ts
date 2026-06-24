import prisma from './prisma';
import { requireBranchAccess } from './security.utils';
import { isAdminUser } from './user.utils';

type StaffTarget = {
  id?: string;
  username?: string | null;
  role?: { name?: string } | null;
  branchId?: string | null;
  area?: { branchId?: string } | null;
};

export class StaffSecurityError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export function getStaffBranchId(staff: StaffTarget): string | null | undefined {
  return staff.branchId || staff.area?.branchId;
}

export async function loadStaffOrThrow(id: string) {
  const staff = await prisma.staff.findUnique({
    where: { id },
    include: { role: true, area: true },
  });
  if (!staff) throw new StaffSecurityError('Staff not found', 404);
  return staff;
}

export function assertCanManageStaff(user: any, target: StaffTarget, action = 'manage this staff member') {
  if (target.username === 'admin' || target.role?.name === 'Admin') {
    if (!isAdminUser(user)) {
      throw new StaffSecurityError(`Security Violation: You are not authorized to ${action}.`, 403);
    }
    return;
  }
  if (!isAdminUser(user)) {
    const targetBranchId = getStaffBranchId(target);
    requireBranchAccess(user, targetBranchId, action);
  }
}

export async function assertRoleAssignmentAllowed(user: any, roleId: string) {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new StaffSecurityError('Invalid role', 400);
  if (!isAdminUser(user) && role.name === 'Admin') {
    throw new StaffSecurityError('Security Violation: Cannot assign Admin role.', 403);
  }
  return role;
}

export function enforceStaffBranchOnCreate(user: any, body: { branchId?: string | null; areaId?: string | null }) {
  if (isAdminUser(user)) return body;
  if (!user?.branchId) {
    throw new StaffSecurityError('Branch assignment required.', 400);
  }
  return { ...body, branchId: user.branchId };
}
