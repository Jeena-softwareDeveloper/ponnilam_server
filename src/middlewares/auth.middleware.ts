import prisma from '../utils/prisma';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';


export interface AuthRequest extends Request {
  user?: any;
}

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ error: 'Server configuration error: JWT_SECRET not set' });
    }
    const decoded = jwt.verify(token, jwtSecret) as any;


    // Lookup staff in DB to get role and branch details
    const staff = await prisma.staff.findUnique({
      where: { id: decoded.id },
      include: { role: true, area: true }
    });

    if (!staff) {
      return res.status(401).json({ error: 'Access denied. User not found.' });
    }

    if (!staff.isActive) {
      return res.status(403).json({ error: 'Access denied. User account is inactive.' });
    }

    req.user = {
      ...staff,
      // Strictly enforce branchId from the token if present, fallback to live DB value
      branchId: decoded.branchId || staff.branchId || staff.area?.branchId || null
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

export const branchScope = async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
  if (req.user?.role?.name !== 'Admin') {

    // ─── Force branchId / areaId on query and body ───────────────────────────
    if (req.user?.branchId) {
      req.query.branchId = req.user.branchId;
      if (req.method === 'POST' || req.method === 'PUT') {
        req.body.branchId = req.user.branchId;
      }
    }
    if (req.user?.areaId) {
      req.query.areaId = req.user.areaId;
      if (req.method === 'POST' || req.method === 'PUT') {
        req.body.areaId = req.user.areaId;
      }
    }

    // ─── Build res.locals.areaIds for scoped list queries ────────────────────
    // Controllers use res.locals.areaIds to filter findMany results
    try {
      if (req.user?.areaId) {
        // Staff with a specific area — restrict to that area only
        res.locals.areaIds = [req.user.areaId];
      } else if (req.user?.branchId) {
        // Branch-level staff — restrict to all areas in their branch
        const areas = await prisma.area.findMany({
          where: { branchId: req.user.branchId },
          select: { id: true }
        });
        res.locals.areaIds = areas.map((a: { id: string }) => a.id);
      } else {
        res.locals.areaIds = [];
      }
    } catch (err) {
      console.error('branchScope areaIds lookup failed:', err);
      res.locals.areaIds = [];
    }
  } else {
    // Admin — no restriction
    res.locals.areaIds = [];
  }

  next();
};
