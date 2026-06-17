import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const login = async (req: Request, res: Response): Promise<any> => {
  try {
    const { username, password } = req.body;

    // 1. Fallback / Super Admin check
    const envUser = process.env.ADMIN_USERNAME || 'admin';
    const envPass = process.env.ADMIN_PASSWORD || 'password123';

    if (username === envUser && password === envPass) {
      const token = jwt.sign(
        { id: 'env-admin', role: { name: 'Super Admin' } },
        process.env.JWT_SECRET || 'fallback_secret',
        { expiresIn: '1d' }
      );
      
      return res.status(200).json({ message: 'Login successful', token, user: { name: 'Super Admin', role: 'Super Admin' } });
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

    // Generate JWT
    const token = jwt.sign(
      { id: staff.id },
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

    if (user.id === 'env-admin') {
      const allMenus = await prisma.menu.findMany({
        orderBy: { name: 'asc' }
      });
      return res.status(200).json(allMenus);
    }

    const staff = await prisma.staff.findUnique({
      where: { id: user.id },
      include: {
        role: true,
        menus: { include: { menu: true } },
        branch: { include: { menus: { include: { menu: true } } } }
      }
    });

    if (!staff) return res.status(404).json({ error: 'Staff not found' });

    if (staff.role?.name === 'Super Admin') {
      const allMenus = await prisma.menu.findMany({
        orderBy: { name: 'asc' }
      });
      return res.status(200).json(allMenus);
    }

    let allowedMenus: any[] = [];
    const staffSpecificMenus = staff.menus.map((sm: any) => sm.menu);
    if (staffSpecificMenus.length > 0) {
      allowedMenus = staffSpecificMenus;
    } else if (staff.branch && staff.branch.menus) {
      allowedMenus = staff.branch.menus.map((bm: any) => bm.menu);
    }

    return res.status(200).json(allowedMenus);
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

    // TODO: Implement actual notification/email when Notification model is added to schema
    // For now, log the reset request as an audit log
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
