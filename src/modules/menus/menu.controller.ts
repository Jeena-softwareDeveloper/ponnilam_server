import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getMenus = async (req: Request, res: Response): Promise<any> => {
  try {
    const menus = await prisma.menu.findMany({
      orderBy: { id: 'asc' },
    });
    return res.status(200).json(menus);
  } catch (error) {
    console.error('Error fetching menus:', error);
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
    const { menuIds } = req.body; // Array of menu IDs to assign

    // First delete all existing permissions for this staff
    await prisma.staffMenu.deleteMany({
      where: { staffId }
    });

    // Bulk insert new permissions
    if (menuIds && menuIds.length > 0) {
      const data = menuIds.map((menuId: string) => ({
        staffId,
        menuId
      }));
      await prisma.staffMenu.createMany({ data });
    }

    return res.status(200).json({ message: 'Permissions updated successfully' });
  } catch (error) {
    console.error('Error assigning menus:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
