import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
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
    // username can be phone, email, or username
    const staff = await prisma.staff.findFirst({
      where: {
        OR: [
          { phone: username },
          { email: username },
          { username: username }
        ]
      },
      include: { role: true, area: { include: { branch: true } } }
    });

    if (!staff) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!staff.isActive) {
      return res.status(403).json({ error: 'Account is inactive' });
    }

    // Compare passwords
    // Note: For now, we support plain text fallback if bcrypt fails (during migration),
    // but we should always hash passwords on creation.
    let isMatch = false;
    if (staff.password.startsWith('$2b$') || staff.password.startsWith('$2a$')) {
      isMatch = await bcrypt.compare(password, staff.password);
    } else {
      isMatch = (password === staff.password);
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
        branch: staff.area?.branch?.name || null
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

    // Super Admin gets all menus
    if (user.role?.name === 'Super Admin') {
      const menus = await prisma.menu.findMany({
        orderBy: { name: 'asc' },
      });
      return res.status(200).json(menus);
    }

    // Regular staff gets menus assigned via StaffMenu
    const staffMenus = await prisma.staffMenu.findMany({
      where: { staffId: user.id },
      include: { menu: true },
      orderBy: { menu: { name: 'asc' } }
    });

    const menus = staffMenus.map(sm => sm.menu);

    // Always ensure Branch Dashboard is present for everyone as the first item
    const hasBranchDashboard = menus.some(m => m.name === 'Branch Dashboard' || m.path === '/admin/branch-dashboard');
    if (!hasBranchDashboard) {
      const dashboardMenu = await prisma.menu.findFirst({ where: { name: 'Branch Dashboard' } });
      if (dashboardMenu) {
        menus.unshift(dashboardMenu);
      }
    }

    return res.status(200).json(menus);
  } catch (error) {
    console.error('Error fetching auth menus:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
