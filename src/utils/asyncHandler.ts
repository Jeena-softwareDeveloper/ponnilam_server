import { Request, Response, NextFunction, RequestHandler } from 'express';

// Wrapper to automatically pass async errors to the global error handler
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
