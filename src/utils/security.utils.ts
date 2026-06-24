export const requireBranchAccess = (user: any, targetBranchId: string | null | undefined, action: string = 'access this record') => {
  if (user?.role?.name !== 'Admin' && user?.branchId) {
    if (!targetBranchId || targetBranchId !== user.branchId) {
      throw new Error(`Security Violation: You are not authorized to ${action} because it belongs to a different branch.`);
    }
  }
};

/** Verify record is in caller's area scope (area staff) or branch (branch staff). */
export const requireAreaScope = (
  user: any,
  areaIds: string[] | undefined,
  recordAreaId: string | null | undefined,
  action: string = 'access this record'
) => {
  if (user?.role?.name === 'Admin') return;
  if (user?.areaId && recordAreaId && recordAreaId !== user.areaId) {
    throw new Error(`Security Violation: You are not authorized to ${action} outside your area.`);
  }
  if (areaIds?.length && recordAreaId && !areaIds.includes(recordAreaId)) {
    throw new Error(`Security Violation: You are not authorized to ${action} outside your branch areas.`);
  }
};
