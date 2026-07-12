import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction): any => {
  if (req.user?.role?.name !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
};
