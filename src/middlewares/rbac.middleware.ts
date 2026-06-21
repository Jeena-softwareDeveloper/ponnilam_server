import prisma from '../utils/prisma';
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';


export const checkMenuAccess = (menuPath: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
    try {
      const staffId = req.user?.id;
      const userBranchId = req.user?.branchId;
      
      if (!staffId) {
        return res.status(403).json({ error: 'Access denied. Unknown user.' });
      }

      // FIX: Check StaffMenu first, then BranchMenu
      const permission = await prisma.staffMenu.findFirst({
        where: {
          staffId: staffId,
          menu: {
            path: menuPath
          }
        }
      });

      if (permission) {
        return next();
      }

      // If no staff-specific permission, check BranchMenu
      if (userBranchId) {
        const branchPermission = await prisma.branchMenu.findFirst({
          where: {
            branchId: userBranchId,
            menu: {
              path: menuPath
            }
          }
        });

        if (branchPermission) {
          return next();
        }
      }

      return res.status(403).json({ error: `Access denied for menu path: ${menuPath}` });
    } catch (error) {
      console.error('RBAC Error:', error);
      return res.status(500).json({ error: 'Internal server error during permission check.' });
    }
  };
};
