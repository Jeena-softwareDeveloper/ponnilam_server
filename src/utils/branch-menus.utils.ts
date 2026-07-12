import { Prisma } from '@prisma/client';

const BRANCH_MANAGER_MENU_PATHS = [
  '/admin/branch-dashboard',
  '/admin/customers',
  '/admin/customer-ledger',
  '/admin/loans',
  '/admin/collections',
  '/admin/reports',
];

type Tx = Prisma.TransactionClient;

export async function assignBranchManagerMenus(tx: Tx, branchId: string, staffId?: string) {
  const menus = await tx.menu.findMany({
    where: { path: { in: BRANCH_MANAGER_MENU_PATHS } },
  });

  for (const menu of menus) {
    await tx.branchMenu.upsert({
      where: { branchId_menuId: { branchId, menuId: menu.id } },
      create: {
        branchId,
        menuId: menu.id,
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
      },
      update: {
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
      },
    });

    if (staffId) {
      await tx.staffMenu.upsert({
        where: { staffId_menuId: { staffId, menuId: menu.id } },
        create: {
          staffId,
          menuId: menu.id,
          canView: true,
          canCreate: true,
          canEdit: true,
          canDelete: true,
        },
        update: {
          canView: true,
          canCreate: true,
          canEdit: true,
          canDelete: true,
        },
      });
    }
  }
}
