export const requireBranchAccess = (user: any, targetBranchId: string | null | undefined, action: string = 'access this record') => {
  if (user?.role?.name !== 'Admin' && user?.branchId) {
    if (targetBranchId && targetBranchId !== user.branchId) {
      throw new Error(`Security Violation: You are not authorized to ${action} because it belongs to a different branch.`);
    }
  }
};
