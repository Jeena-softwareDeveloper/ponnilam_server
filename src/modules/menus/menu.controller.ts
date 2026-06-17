import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

export const getStaffMenus = async (req: Request, res: Response): Promise<any> => {
  try {
    const staffId = String(req.params.staffId);
    const staffMenus = await prisma.staffMenu.findMany({
      where: { staffId },
      include: { menu: true }
    });
    return res.status(200).json(staffMenus.map((sm: any) => sm.menu));
  } catch (error) {
    console.error('Error fetching staff menus:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const assignMenus = async (req: Request, res: Response): Promise<any> => {
  try {
    const staffId = String(req.params.staffId);
    const { menuIds } = req.body;
    await prisma.staffMenu.deleteMany({ where: { staffId } });
    if (menuIds && menuIds.length > 0) {
      const data = menuIds.map((menuId: string) => ({ staffId, menuId }));
      await prisma.staffMenu.createMany({ data });
    }
    return res.status(200).json({ message: 'Permissions updated successfully' });
  } catch (error) {
    console.error('Error assigning menus:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getBranchMenus = async (req: Request, res: Response): Promise<any> => {
  try {
    const branchId = String(req.params.branchId);
    const branchMenus = await prisma.branchMenu.findMany({
      where: { branchId },
      include: { menu: true }
    });
    return res.status(200).json(branchMenus.map((bm: any) => bm.menu));
  } catch (error) {
    console.error('Error fetching branch menus:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const assignBranchMenus = async (req: Request, res: Response): Promise<any> => {
  try {
    const branchId = String(req.params.branchId);
    const { menuIds } = req.body;
    await prisma.branchMenu.deleteMany({ where: { branchId } });
    if (menuIds && menuIds.length > 0) {
      const data = menuIds.map((menuId: string) => ({ branchId, menuId }));
      await prisma.branchMenu.createMany({ data });
    }
    return res.status(200).json({ message: 'Branch permissions updated successfully' });
  } catch (error) {
    console.error('Error assigning branch menus:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
