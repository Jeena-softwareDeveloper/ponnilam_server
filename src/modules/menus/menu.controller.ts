import { Request, Response } from 'express';
import prisma from '../../utils/prisma';

export const getMenus = async (req: Request, res: Response): Promise<any> => {
  try {
    const menus = await prisma.menu.findMany({
      include: { children: true },
      orderBy: { name: 'asc' },
    });
    return res.status(200).json(menus);
  } catch (error) {
    console.error('Error fetching menus:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createMenu = async (req: Request, res: Response): Promise<any> => {
  try {
    const { name, path, icon, parentId } = req.body;
    if (!name) return res.status(400).json({ error: 'Menu name is required' });
    const menu = await prisma.menu.create({
      data: {
        name,
        path: path || null,
        icon: icon || null,
        parentId: parentId || null,
      },
    });
    return res.status(201).json(menu);
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Menu name already exists' });
    console.error('Error creating menu:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateMenu = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id);
    const { name, path, icon, parentId } = req.body;
    const menu = await prisma.menu.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(path !== undefined && { path }),
        ...(icon !== undefined && { icon }),
        ...(parentId !== undefined && { parentId: parentId || null }),
      },
    });
    return res.status(200).json(menu);
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Menu not found' });
    console.error('Error updating menu:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteMenu = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id);
    await prisma.menu.delete({ where: { id } });
    return res.status(200).json({ message: 'Menu deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Menu not found' });
    if (error.code === 'P2003') return res.status(400).json({ error: 'Cannot delete menu because it has associated permissions or children' });
    console.error('Error deleting menu:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Staff Menu Permissions ───────────────────────────────────────────────────

export const getStaffMenus = async (req: Request, res: Response): Promise<any> => {
  try {
    const staffId = String(req.params.staffId);
    const staffMenus = await prisma.staffMenu.findMany({
      where: { staffId },
      include: { menu: true }
    });
    // Return each entry with full CRUD permissions
    return res.status(200).json(staffMenus.map((sm: any) => ({
      id: sm.menu.id,
      name: sm.menu.name,
      path: sm.menu.path,
      parentId: sm.menu.parentId,
      canView: sm.canView,
      canCreate: sm.canCreate,
      canEdit: sm.canEdit,
      canDelete: sm.canDelete,
    })));
  } catch (error) {
    console.error('Error fetching staff menus:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const assignMenus = async (req: Request, res: Response): Promise<any> => {
  try {
    const staffId = String(req.params.staffId);
    // Accept: permissions = [{ menuId, canView, canCreate, canEdit, canDelete }]
    const { menuIds, permissions } = req.body;

    await prisma.staffMenu.deleteMany({ where: { staffId } });

    if (permissions && permissions.length > 0) {
      // New granular format
      const data = permissions.map((p: any) => ({
        staffId,
        menuId: p.menuId,
        canView: p.canView ?? true,
        canCreate: p.canCreate ?? false,
        canEdit: p.canEdit ?? false,
        canDelete: p.canDelete ?? false,
      }));
      await prisma.staffMenu.createMany({ data });
    } else if (menuIds && menuIds.length > 0) {
      // Legacy format fallback
      const data = menuIds.map((menuId: string) => ({
        staffId,
        menuId,
        canView: true,
        canCreate: false,
        canEdit: false,
        canDelete: false,
      }));
      await prisma.staffMenu.createMany({ data });
    }

    return res.status(200).json({ message: 'Permissions updated successfully' });
  } catch (error) {
    console.error('Error assigning menus:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Branch Menu Permissions ──────────────────────────────────────────────────

export const getBranchMenus = async (req: Request, res: Response): Promise<any> => {
  try {
    const branchId = String(req.params.branchId);
    const branchMenus = await prisma.branchMenu.findMany({
      where: { branchId },
      include: { menu: true }
    });
    return res.status(200).json(branchMenus.map((bm: any) => ({
      id: bm.menu.id,
      name: bm.menu.name,
      path: bm.menu.path,
      parentId: bm.menu.parentId,
      canView: bm.canView,
      canCreate: bm.canCreate,
      canEdit: bm.canEdit,
      canDelete: bm.canDelete,
    })));
  } catch (error) {
    console.error('Error fetching branch menus:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const assignBranchMenus = async (req: Request, res: Response): Promise<any> => {
  try {
    const branchId = String(req.params.branchId);
    const { menuIds, permissions } = req.body;

    await prisma.branchMenu.deleteMany({ where: { branchId } });

    if (permissions && permissions.length > 0) {
      const data = permissions.map((p: any) => ({
        branchId,
        menuId: p.menuId,
        canView: p.canView ?? true,
        canCreate: p.canCreate ?? false,
        canEdit: p.canEdit ?? false,
        canDelete: p.canDelete ?? false,
      }));
      await prisma.branchMenu.createMany({ data });
    } else if (menuIds && menuIds.length > 0) {
      const data = menuIds.map((menuId: string) => ({
        branchId,
        menuId,
        canView: true,
        canCreate: false,
        canEdit: false,
        canDelete: false,
      }));
      await prisma.branchMenu.createMany({ data });
    }

    // Reset staff-level overrides for this branch
    const staffsInBranch = await prisma.staff.findMany({
      where: {
        OR: [
          { branchId: branchId },
          { area: { branchId: branchId } }
        ]
      },
      select: { id: true }
    });
    const staffIds = staffsInBranch.map(s => s.id);
    if (staffIds.length > 0) {
      await prisma.staffMenu.deleteMany({ where: { staffId: { in: staffIds } } });
    }

    return res.status(200).json({ message: 'Branch permissions updated successfully' });
  } catch (error) {
    console.error('Error assigning branch menus:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
