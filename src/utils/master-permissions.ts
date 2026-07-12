import { Request, Response } from 'express';
import { assertMenuPermission, MenuAction } from './validation.helpers';

export async function denyUnlessMenuPermission(
  req: Request,
  res: Response,
  menuPath: string,
  action: MenuAction
): Promise<boolean> {
  const user = (req as any).user;
  const err = await assertMenuPermission(user, menuPath, action);
  if (err) {
    res.status(403).json({ error: err });
    return true;
  }
  return false;
}
