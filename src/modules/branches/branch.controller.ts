import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

export const getBranches = async (req: Request, res: Response): Promise<any> => {
  try {
    const branches = await prisma.branch.findMany({
      orderBy: { code: 'asc' },
      include: { state: true, district: true },
    });
    return res.status(200).json(branches);
  } catch (error) {
    console.error('Error fetching branches:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getNextBranchCode = async (req: Request, res: Response): Promise<any> => {
  try {
    const lastBranch = await prisma.branch.findFirst({
      orderBy: { createdAt: 'desc' },
      where: { code: { startsWith: 'BR' } },
    });

    let nextCode = 'BR001';
    if (lastBranch && lastBranch.code) {
      const match = lastBranch.code.match(/BR(\d+)/);
      if (match && match[1]) {
        const nextNum = parseInt(match[1]) + 1;
        nextCode = `BR${nextNum.toString().padStart(3, '0')}`;
      }
    }
    return res.status(200).json({ code: nextCode });
  } catch (error) {
    console.error('Error generating branch code:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createBranch = async (req: Request, res: Response): Promise<any> => {
  try {
    const { name, code, stateId, districtId, location, phone, adminName, adminUsername, adminPhone, adminPassword, adminRoleId } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'Name and code are required' });

    // Handle creation in a transaction if admin is provided
    if (adminName && adminPhone) {
      const branch = await prisma.$transaction(async (tx) => {
        const newBranch = await tx.branch.create({
          data: { name, code, stateId: stateId || null, districtId: districtId || null, location: location || null, phone: phone || null },
        });

        // Use provided roleId or find 'Branch Manager'
        let roleId = adminRoleId;
        if (!roleId) {
          let role = await tx.role.findFirst({ where: { name: 'Branch Manager' } });
          if (!role) {
            role = await tx.role.create({ data: { name: 'Branch Manager' } });
          }
          roleId = role.id;
        }

        const hashedPassword = await bcrypt.hash(adminPassword || 'password123', 10);

        const newStaff = await tx.staff.create({
          data: {
            name: adminName,
            username: adminUsername || null,
            phone: adminPhone,
            password: hashedPassword,
            branchId: newBranch.id,
            roleId: roleId,
          }
        });

        // Default: Assign Dashboard menu to Branch and the Admin
        const dashboardMenu = await tx.menu.findFirst({ where: { name: 'Dashboard' } });
        if (dashboardMenu) {
          await tx.branchMenu.create({ data: { branchId: newBranch.id, menuId: dashboardMenu.id } });
          await tx.staffMenu.create({ data: { staffId: newStaff.id, menuId: dashboardMenu.id } });
        }

        return newBranch;
      });
      return res.status(201).json(branch);
    } else {
      const branch = await prisma.$transaction(async (tx) => {
        const newBranch = await tx.branch.create({
          data: { name, code, stateId: stateId || null, districtId: districtId || null, location: location || null, phone: phone || null },
        });

        // Default: Assign Dashboard menu to Branch
        const dashboardMenu = await tx.menu.findFirst({ where: { name: 'Dashboard' } });
        if (dashboardMenu) {
          await tx.branchMenu.create({ data: { branchId: newBranch.id, menuId: dashboardMenu.id } });
        }

        return newBranch;
      });
      return res.status(201).json(branch);
    }
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Branch code or admin phone/username already exists' });
    console.error('Error creating branch:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateBranch = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id);
    const { name, code, stateId, districtId, location, phone, isActive } = req.body;
    const branch = await prisma.branch.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(code !== undefined && { code }),
        ...(stateId !== undefined && { stateId }),
        ...(districtId !== undefined && { districtId }),
        ...(location !== undefined && { location }),
        ...(phone !== undefined && { phone }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    return res.status(200).json(branch);
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Branch not found' });
    console.error('Error updating branch:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
