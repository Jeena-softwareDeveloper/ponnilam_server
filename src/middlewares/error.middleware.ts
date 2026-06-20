import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction): any => {
  console.error(`[Error] ${req.method} ${req.path} ->`, err.message || err);

  // Prisma Unique Constraint Violation
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = err.meta?.target as string[];
      const fields = target ? target.join(', ') : 'field';
      return res.status(400).json({ error: `This ${fields} is already registered.` });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Record not found.' });
    }
  }

  // Custom Application Errors
  if (err.name === 'AppError' || err.statusCode) {
    return res.status(err.statusCode || 400).json({ error: err.message });
  }

  // Security Errors from our util
  if (err.message && err.message.startsWith('Security Violation')) {
    return res.status(403).json({ error: err.message });
  }

  // Generic 500 Internal Server Error
  return res.status(500).json({ error: err.message || 'An unexpected error occurred on the server.' });
};
