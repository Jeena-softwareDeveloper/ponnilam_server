import prisma from '../../utils/prisma';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { assignBranchManagerMenus } from '../../utils/branch-menus.utils';
import { generateTemporaryPassword } from '../../utils/auth.utils';
import { assertMenuPermission } from '../../utils/validation.helpers';
import { denyUnlessMenuPermission } from '../../utils/master-permissions';

const MENU_PATH = '/admin/masters/branches';

export const getBranches = async (req: Request, res: Response): Promise<any> => {
  try {
    const user = (req as any).user;
    const where: any = {};
    if (user?.role?.name !== 'Admin' && user?.branchId) {
      where.id = user.branchId;
    }

    const branches = await prisma.branch.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: { code: 'asc' },
      include: { 
        state: true, 
        district: true,
        staffs: {
          orderBy: { createdAt: 'asc' },
          take: 1
        }
      },
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
      orderBy: { code: 'desc' },
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
    const user = (req as any).user;
    const createPerm = await assertMenuPermission(user, MENU_PATH, 'canCreate');
    if (createPerm) return res.status(403).json({ error: createPerm });

    const { name, code, stateId, districtId, location, phone, adminName, adminUsername, adminPhone, adminPassword, adminRoleId } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'Name and code are required' });

    if (stateId && districtId) {
      const district = await prisma.district.findUnique({ where: { id: districtId } });
      if (!district || district.stateId !== stateId) {
        return res.status(400).json({ error: 'District does not belong to the selected state' });
      }
    }

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

        const tempPassword = adminPassword || generateTemporaryPassword();
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        const newStaff = await tx.staff.create({
          data: {
            name: adminName,
            username: adminUsername || null,
            phone: adminPhone,
            password: hashedPassword,
            branchId: newBranch.id,
            roleId: roleId,
            mustChangePassword: !adminPassword,
          }
        });

        await assignBranchManagerMenus(tx, newBranch.id, newStaff.id);

        return { branch: newBranch, ...( !adminPassword ? { temporaryPassword: tempPassword } : {}) };
      });
      return res.status(201).json(branch);
    } else {
      const branch = await prisma.$transaction(async (tx) => {
        const newBranch = await tx.branch.create({
          data: { name, code, stateId: stateId || null, districtId: districtId || null, location: location || null, phone: phone || null },
        });

        await assignBranchManagerMenus(tx, newBranch.id);

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
    const user = (req as any).user;
    const editPerm = await assertMenuPermission(user, MENU_PATH, 'canEdit');
    if (editPerm) return res.status(403).json({ error: editPerm });

    const id = String(req.params.id);
    const { name, code, stateId, districtId, location, phone, isActive, adminName, adminUsername, adminPhone, adminPassword, adminRoleId } = req.body;
    
    const branch = await prisma.$transaction(async (tx) => {
      if (stateId && districtId) {
        const district = await tx.district.findUnique({ where: { id: districtId } });
        if (!district || district.stateId !== stateId) {
          throw new Error('District does not belong to the selected state');
        }
      }

      const updatedBranch = await tx.branch.update({
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

      // Handle updating the Branch Manager if details are provided
      if (adminName && adminPhone) {
        const managerRole = await tx.role.findFirst({ where: { name: 'Branch Manager' } });
        const existingStaff = await tx.staff.findFirst({
          where: {
            branchId: id,
            ...(managerRole ? { roleId: managerRole.id } : {}),
          },
          orderBy: { createdAt: 'asc' },
        });

        let roleId = adminRoleId;
        if (!roleId) {
          let role = await tx.role.findFirst({ where: { name: 'Branch Manager' } });
          if (!role) role = await tx.role.create({ data: { name: 'Branch Manager' } });
          roleId = role.id;
        }

        const dataToUpdate: any = {
          name: adminName,
          phone: adminPhone,
          username: adminUsername || null,
          roleId: roleId,
        };

        if (adminPassword) {
          dataToUpdate.password = await bcrypt.hash(adminPassword, 10);
        }

        if (existingStaff) {
          await tx.staff.update({
            where: { id: existingStaff.id },
            data: dataToUpdate
          });
        } else {
          if (!adminPassword) {
            dataToUpdate.password = await bcrypt.hash(generateTemporaryPassword(), 10);
            dataToUpdate.mustChangePassword = true;
          }
          dataToUpdate.branchId = id;
          const newStaff = await tx.staff.create({ data: dataToUpdate });
          await assignBranchManagerMenus(tx, id, newStaff.id);
        }
      }
      return updatedBranch;
    });

    return res.status(200).json(branch);
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Branch not found' });
    if (error.code === 'P2002') return res.status(409).json({ error: 'Admin phone or username already exists' });
    console.error('Error updating branch:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteBranch = async (req: Request, res: Response): Promise<any> => {
  try {
    if (await denyUnlessMenuPermission(req, res, MENU_PATH, 'canDelete')) return;

    const id = String(req.params.id);
    await prisma.branch.delete({ where: { id } });
    return res.status(200).json({ message: 'Branch deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Branch not found' });
    const errStr = String(error);
    if (error.code === 'P2003' || error.code === 'P2014' || errStr.includes('foreign key constraint') || errStr.includes('23001')) {
      return res.status(400).json({ error: 'Cannot delete branch because it contains associated areas, centers, or staff' });
    }
    console.error('Error deleting branch:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
