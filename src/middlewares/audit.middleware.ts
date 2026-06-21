import prisma from '../utils/prisma';
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';


export const auditMiddleware = (entity: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    // We only want to log mutations after they succeed
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
      const originalSend = res.send;
      
      res.send = function (body) {
        // Run audit logging asynchronously after response is sent
        res.send = originalSend;
        const result = res.send(body);

        // Only log if successful
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const action = req.method === 'POST' ? 'CREATE' : req.method === 'PUT' ? 'UPDATE' : 'DELETE';
          const staffId = req.user?.id === 'env-admin' ? null : req.user?.id; // Don't log env-admin ID, or let it be null
          
          let details = '';
          try {
             details = JSON.stringify(req.body);
          } catch(e) {}

          // Entity ID can be extracted from params if it's an update/delete
          const entityId = req.params.id ? String(req.params.id) : null;

          prisma.auditLog.create({
            data: {
              action,
              entity,
              entityId,
              details,
              staffId
            }
          }).catch(err => console.error('Error saving audit log:', err));
        }

        return result;
      };
    }
    next();
  };
};
