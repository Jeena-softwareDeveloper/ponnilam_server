import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

export const getStaffs = async (req: Request, res: Response): Promise<any> => {
  try {
    const { areaId } = req.query;
    const staffs = await prisma.staff.findMany({
      where: areaId ? { areaId: String(areaId) } : undefined,
      include: { area: true, role: true, branch: true },
      orderBy: { name: 'asc' },
    });
    return res.status(200).json(staffs);
  } catch (error) {
    console.error('Error fetching staffs:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createStaff = async (req: Request, res: Response): Promise<any> => {
  try {
    const { name, username, phone, email, areaId, branchId, roleId, password } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });
    
    let hashedPassword = 'password123';
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    } else {
      hashedPassword = await bcrypt.hash('password123', 10);
    }

    const staff = await prisma.staff.create({
      data: {
        name,
        username: username || null,
        phone,
        email: email || null,
        areaId: areaId || null,
        branchId: branchId || null,
        roleId: roleId || null,
        password: hashedPassword,
      },
      include: { area: true, role: true, branch: true },
    });
    return res.status(201).json(staff);
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Phone or email already exists' });
    console.error('Error creating staff:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateStaff = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id);
    const { name, username, phone, email, areaId, branchId, roleId, isActive, password } = req.body;
    
    let updateData: any = {
      ...(name !== undefined && { name }),
      ...(username !== undefined && { username: username || null }),
      ...(phone !== undefined && { phone }),
      ...(email !== undefined && { email: email || null }),
      ...(areaId !== undefined && { areaId: areaId || null }),
      ...(branchId !== undefined && { branchId: branchId || null }),
      ...(roleId !== undefined && { roleId: roleId || null }),
      ...(isActive !== undefined && { isActive }),
    };

    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const staff = await prisma.staff.update({
      where: { id },
      data: updateData,
      include: { area: true, role: true, branch: true },
    });
    return res.status(200).json(staff);
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Staff not found' });
    console.error('Error updating staff:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
