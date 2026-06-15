import { Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from './auth.middleware';

const prisma = new PrismaClient();

export const checkMenuAccess = (menuPath: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
    try {
      const staffId = req.user?.id; // Assuming user.id contains the staff ID from JWT
      
      if (!staffId) {
        return res.status(403).json({ error: 'Access denied. Unknown user.' });
      }

      // Check if this staff has permission for the requested menu path
      const permission = await prisma.staffMenu.findFirst({
        where: {
          staffId: staffId,
          menu: {
            path: menuPath
          }
        }
      });

      if (!permission) {
        return res.status(403).json({ error: `Access denied for menu path: ${menuPath}` });
      }

      next();
    } catch (error) {
      console.error('RBAC Error:', error);
      return res.status(500).json({ error: 'Internal server error during permission check.' });
    }
  };
};
