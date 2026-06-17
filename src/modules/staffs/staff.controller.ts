import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export const getStaffs = async (req: Request, res: Response): Promise<any> => {
  try {
    const { areaId, branchId } = req.query;
    
    let whereClause: any = {};
    if (areaId) {
      whereClause.areaId = String(areaId);
    }
    if (branchId) {
      whereClause.OR = [
        { branchId: String(branchId) },
        { area: { branchId: String(branchId) } }
      ];
    }

    const staffs = await prisma.staff.findMany({
      where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
      include: { area: true, role: true, branch: true },
      orderBy: { name: 'asc' },
    });
    
    // Filter out super admin explicitly
    const filteredStaffs = staffs.filter(s => s.username !== 'admin' && s.role?.name !== 'Super Admin');
    return res.status(200).json(filteredStaffs);
  } catch (error) {
    console.error('Error fetching staffs:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createStaff = async (req: Request, res: Response): Promise<any> => {
  try {
    const { name, username, phone, email, areaId, branchId, roleId, password } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });
    
    let hashedPassword = '';
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    } else {
      const defaultPass = username || phone;
      hashedPassword = await bcrypt.hash(defaultPass, 10);
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

export const deleteStaff = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id);
    await prisma.staff.delete({ where: { id } });
    return res.status(200).json({ message: 'Staff deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Staff not found' });
    if (error.code === 'P2003') return res.status(400).json({ error: 'Cannot delete staff because it has associated records' });
    console.error('Error deleting staff:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getRequests = async (req: Request, res: Response): Promise<any> => {
  try {
    // Fetch password reset requests from audit logs (Notification model not in schema yet)
    const logs = await prisma.auditLog.findMany({
      where: { action: 'FORGOT_PASSWORD_REQUEST' },
      orderBy: { createdAt: 'desc' },
      include: { staff: { select: { id: true, name: true, phone: true, username: true } } }
    });
    return res.status(200).json(logs);
  } catch (error) {
    console.error('Error fetching requests:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const resolveResetRequest = async (req: Request, res: Response): Promise<any> => {
  try {
    const staffId = String(req.params.id);

    const staff = await prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) {
      return res.status(404).json({ error: 'Staff not found' });
    }

    // Reset password to username (or phone if no username)
    const defaultPass = staff.username || staff.phone;
    const hashedPassword = await bcrypt.hash(defaultPass, 10);

    await prisma.staff.update({
      where: { id: staff.id },
      data: { password: hashedPassword }
    });

    await prisma.auditLog.create({
      data: {
        action: 'PASSWORD_RESET_RESOLVED',
        entity: 'Staff',
        staffId: staff.id,
        details: `Password reset to default for ${staff.name}`
      }
    });

    return res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resolving request:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
