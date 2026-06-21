import { Request, Response } from 'express';
import prisma from '../../utils/prisma';

export const getRoles = async (req: Request, res: Response): Promise<any> => {
  try {
    const roles = await prisma.role.findMany({ 
      where: { name: { not: 'Admin' } },
      orderBy: { name: 'asc' } 
    });
    return res.status(200).json(roles);
  } catch (error) {
    console.error('Error fetching roles:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createRole = async (req: Request, res: Response): Promise<any> => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Role name is required' });
    const role = await prisma.role.create({ data: { name } });
    return res.status(201).json(role);
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Role name already exists' });
    console.error('Error creating role:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateRole = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id);
    const { name, isActive } = req.body;
    const role = await prisma.role.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    return res.status(200).json(role);
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Role not found' });
    console.error('Error updating role:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteRole = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id);
    await prisma.role.delete({ where: { id } });
    return res.status(200).json({ message: 'Role deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Role not found' });
    if (error.code === 'P2003') return res.status(400).json({ error: 'Cannot delete role because it is assigned to staff' });
    console.error('Error deleting role:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
