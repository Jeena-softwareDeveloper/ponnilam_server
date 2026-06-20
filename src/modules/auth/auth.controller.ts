import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const login = async (req: Request, res: Response): Promise<any> => {
  try {
    const { username, password } = req.body;

    // 1. Fallback / Admin check
    const envUser = process.env.ADMIN_USERNAME || 'admin';
    const envPass = process.env.ADMIN_PASSWORD || 'password123';

    if (username === envUser && password === envPass) {
      const token = jwt.sign(
        { id: 'env-admin', role: { name: 'Admin' } },
        process.env.JWT_SECRET || 'fallback_secret',
        { expiresIn: '1d' }
      );
      
      return res.status(200).json({ message: 'Login successful', token, user: { name: 'Admin', role: 'Admin' } });
    }

    // 2. Database Check
    const staff = await prisma.staff.findFirst({
      where: {
        OR: [
          { phone: username },
          { email: username },
          { username: username }
        ]
      },
      include: { role: true, branch: true, area: { include: { branch: true } } }
    });

    if (!staff) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!staff.isActive) {
      return res.status(403).json({ error: 'Account is inactive' });
    }

    // Compare passwords
    let isMatch = false;
    let isFirstLogin = false;
    if (staff.password.startsWith('$2b$') || staff.password.startsWith('$2a$')) {
      isMatch = await bcrypt.compare(password, staff.password);
      isFirstLogin = (await bcrypt.compare(staff.username || '', staff.password)) || (await bcrypt.compare(staff.phone || '', staff.password));
    } else {
      isMatch = (password === staff.password);
      isFirstLogin = (staff.password === staff.username) || (staff.password === staff.phone);
    }

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT with strict branch assignment
    const token = jwt.sign(
      { 
        id: staff.id,
        branchId: staff.branchId || staff.area?.branchId || null
      },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '1d' }
    );

    if (isFirstLogin) {
      return res.status(200).json({ 
        message: 'Password change required', 
        forcePasswordChange: true, 
        token 
      });
    }

    // Audit Log the login
    await prisma.auditLog.create({
      data: {
        action: 'LOGIN',
        entity: 'Auth',
        staffId: staff.id,
        details: 'User logged in successfully'
      }
    });

    return res.status(200).json({ 
      message: 'Login successful', 
      token,
      user: {
        id: staff.id,
        name: staff.name,
        role: staff.role?.name || 'User',
        area: staff.area?.name || null,
        branch: staff.branch?.name || staff.area?.branch?.name || null,
        branchId: staff.branchId || staff.area?.branchId || null
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAuthMenus = async (req: Request, res: Response): Promise<any> => {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Admin (env or role) gets all menus with full CRUD
    const buildFullAccess = (menus: any[]) =>
      menus.map(m => ({ ...m, canView: true, canCreate: true, canEdit: true, canDelete: true }));

    if (user.id === 'env-admin') {
      const allMenus = await prisma.menu.findMany({ orderBy: { name: 'asc' } });
      return res.status(200).json(buildFullAccess(allMenus));
    }

    const staff = await prisma.staff.findUnique({
      where: { id: user.id },
      include: {
        role: true,
        menus: { include: { menu: true } },
        branch: { include: { menus: { include: { menu: true } } } },
        area: { include: { branch: { include: { menus: { include: { menu: true } } } } } }
      }
    });

    if (!staff) return res.status(404).json({ error: 'Staff not found' });

    if (staff.role?.name === 'Admin') {
      const allMenus = await prisma.menu.findMany({ orderBy: { name: 'asc' } });
      return res.status(200).json(buildFullAccess(allMenus));
    }

    // Non-admin: build menus WITH their CRUD permissions
    let allowedEntries: any[] = [];
    const staffSpecificMenus = staff.menus; // StaffMenu[] with canView etc.

    if (staffSpecificMenus.length > 0) {
      allowedEntries = staffSpecificMenus.map((sm: any) => ({
        ...sm.menu,
        canView: sm.canView,
        canCreate: sm.canCreate,
        canEdit: sm.canEdit,
        canDelete: sm.canDelete,
      }));
    } else if (staff.branch?.menus?.length) {
      allowedEntries = staff.branch.menus.map((bm: any) => ({
        ...bm.menu,
        canView: bm.canView,
        canCreate: bm.canCreate,
        canEdit: bm.canEdit,
        canDelete: bm.canDelete,
      }));
    } else if (staff.area?.branch?.menus?.length) {
      allowedEntries = staff.area.branch.menus.map((bm: any) => ({
        ...bm.menu,
        canView: bm.canView,
        canCreate: bm.canCreate,
        canEdit: bm.canEdit,
        canDelete: bm.canDelete,
      }));
    }

    // Filter to only menus with canView = true
    return res.status(200).json(allowedEntries.filter((m: any) => m.canView !== false));
  } catch (error) {
    console.error('Error fetching auth menus:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const changePassword = async (req: Request, res: Response): Promise<any> => {
  try {
    const user = (req as any).user;
    if (!user || !user.id || user.id === 'env-admin') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.staff.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    });

    return res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const forgotPassword = async (req: Request, res: Response): Promise<any> => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username is required' });

    const staff = await prisma.staff.findFirst({
      where: {
        OR: [
          { username },
          { phone: username },
          { email: username }
        ]
      }
    });

    if (!staff) {
      return res.status(200).json({ message: 'If the username exists, a reset request has been sent to the admin.' });
    }

    // Create a notification for Admins / Branch Managers
    await prisma.notification.create ( {
      data: {
        type: 'PASSWORD_RESET',
        title: 'Password Reset Request',
        message: `${staff.name} (${staff.username || staff.phone}) requested a password reset.`,
        referenceId: staff.id,
        branchId: staff.branchId, // So Branch Manager can see it
        status: 'PENDING'
      }
    } ) ;

    await prisma.auditLog.create({
      data: {
        action: 'FORGOT_PASSWORD_REQUEST',
        entity: 'Auth',
        staffId: staff.id,
        details: `Password reset requested for ${staff.name} (${staff.username || staff.phone})`
      }
    });

    return res.status(200).json({ message: 'If the username exists, a reset request has been sent to the admin.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
