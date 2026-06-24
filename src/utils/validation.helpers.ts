import prisma from './prisma';
import { isAdminUser } from './user.utils';
import { resolveMenuPermission, MenuPermission } from './permissions.utils';

export type MenuAction = 'canCreate' | 'canEdit' | 'canDelete';

const ACTION_LABELS: Record<MenuAction, string> = {
  canCreate: 'create',
  canEdit: 'edit',
  canDelete: 'delete',
};

export async function assertMenuPermission(
  user: { id: string; role?: { name?: string } | string } | null | undefined,
  menuPath: string,
  action: MenuAction
): Promise<string | null> {
  if (!user) return 'Unauthorized';
  if (isAdminUser(user)) return null;
  const perm = await resolveMenuPermission(user, menuPath);
  if (!perm?.[action]) {
    return `You do not have permission to ${ACTION_LABELS[action]} this resource.`;
  }
  return null;
}

export function checkAreaScope(
  user: { role?: { name?: string }; areaId?: string | null } | null | undefined,
  areaIds: string[] | undefined,
  recordAreaId: string | null | undefined
): string | null {
  if (!user || user.role?.name === 'Admin') return null;
  if (user.areaId && recordAreaId && recordAreaId !== user.areaId) {
    return 'Security Violation: You are not authorized to access records outside your area.';
  }
  if (areaIds?.length && recordAreaId && !areaIds.includes(recordAreaId)) {
    return 'Security Violation: You are not authorized to access records outside your branch areas.';
  }
  return null;
}

export async function resolveStaffId(
  staffId: string | undefined,
  user: { id: string; role?: { name?: string }; branchId?: string | null } | null | undefined,
  options: { required?: boolean; fallbackToUser?: boolean } = {}
): Promise<{ staffId: string } | { error: string }> {
  const { required = false, fallbackToUser = true } = options;
  const resolvedId = staffId || (fallbackToUser ? user?.id : undefined);
  if (!resolvedId) {
    return required ? { error: 'Staff is required' } : { staffId: user?.id || '' };
  }
  if (!resolvedId) return { error: 'Staff is required' };

  const staff = await prisma.staff.findUnique({
    where: { id: resolvedId },
    include: { area: true },
  });
  if (!staff || !staff.isActive) return { error: 'Invalid or inactive staff selected' };

  if (!isAdminUser(user) && user?.branchId) {
    const staffBranch = staff.branchId || staff.area?.branchId;
    if (staffBranch && staffBranch !== user.branchId) {
      return { error: 'Selected staff does not belong to your branch' };
    }
  }

  return { staffId: resolvedId };
}

export function isValidMobile(mobile: string): boolean {
  return /^\d{10}$/.test(String(mobile || '').trim());
}

const VALID_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'];

export function validateLoanPackageFields(data: {
  interestRate?: number;
  durationDays?: number;
  frequency?: string;
}): string | null {
  if (data.interestRate !== undefined && (Number.isNaN(data.interestRate) || data.interestRate <= 0)) {
    return 'Interest rate must be greater than zero';
  }
  if (data.durationDays !== undefined && (Number.isNaN(data.durationDays) || data.durationDays <= 0)) {
    return 'Duration must be greater than zero';
  }
  if (data.frequency !== undefined && !VALID_FREQUENCIES.includes(String(data.frequency).toUpperCase())) {
    return 'Frequency must be DAILY, WEEKLY, or MONTHLY';
  }
  return null;
}
