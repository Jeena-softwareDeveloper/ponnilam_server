import prisma from './prisma';
import { isAdminUser } from './user.utils';

export type MenuPermission = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

const FULL_ACCESS: MenuPermission = {
  canView: true,
  canCreate: true,
  canEdit: true,
  canDelete: true,
};

type MenuEntry = {
  menu: { path: string | null };
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

function pickMenuPermission(entries: MenuEntry[], menuPath: string): MenuPermission | null {
  const withPath = entries.filter((e) => e.menu.path);
  const exact = withPath.find((e) => e.menu.path === menuPath);
  if (exact) {
    return {
      canView: exact.canView,
      canCreate: exact.canCreate,
      canEdit: exact.canEdit,
      canDelete: exact.canDelete,
    };
  }

  const prefix = withPath
    .sort((a, b) => (b.menu.path!.length - a.menu.path!.length))
    .find((e) => menuPath.startsWith(e.menu.path!));

  if (!prefix) return null;

  return {
    canView: prefix.canView,
    canCreate: prefix.canCreate,
    canEdit: prefix.canEdit,
    canDelete: prefix.canDelete,
  };
}

/** Resolve CRUD permission for a menu path — mirrors /auth/menus fallback order. */
export async function resolveMenuPermission(
  user: { id: string; role?: { name?: string } | string },
  menuPath: string
): Promise<MenuPermission | null> {
  if (isAdminUser(user)) return FULL_ACCESS;

  const staff = await prisma.staff.findUnique({
    where: { id: user.id },
    include: {
      menus: { include: { menu: true } },
      branch: { include: { menus: { include: { menu: true } } } },
      area: { include: { branch: { include: { menus: { include: { menu: true } } } } } },
    },
  });

  if (!staff) return null;

  if (staff.menus.length > 0) {
    return pickMenuPermission(staff.menus, menuPath);
  }
  if (staff.branch?.menus?.length) {
    return pickMenuPermission(staff.branch.menus, menuPath);
  }
  if (staff.area?.branch?.menus?.length) {
    return pickMenuPermission(staff.area.branch.menus, menuPath);
  }

  return null;
}

export async function canEditMenu(user: { id: string; role?: { name?: string } | string }, menuPath: string): Promise<boolean> {
  const permission = await resolveMenuPermission(user, menuPath);
  return permission?.canEdit === true;
}

export async function canCreateMenu(user: { id: string; role?: { name?: string } | string }, menuPath: string): Promise<boolean> {
  const permission = await resolveMenuPermission(user, menuPath);
  return permission?.canCreate === true;
}

export async function canDeleteMenu(user: { id: string; role?: { name?: string } | string }, menuPath: string): Promise<boolean> {
  const permission = await resolveMenuPermission(user, menuPath);
  return permission?.canDelete === true;
}
