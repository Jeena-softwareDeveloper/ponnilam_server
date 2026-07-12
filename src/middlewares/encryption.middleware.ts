import { Request, Response, NextFunction } from 'express';
import {
  isApiEncryptionEnabled,
  isEncryptedEnvelope,
  shouldEncryptPath,
  unwrapEncrypted,
  wrapEncrypted,
} from '../utils/api-crypto';

/** Decrypt incoming JSON bodies wrapped as `{ _enc, payload }`. */
export function decryptRequestBody(req: Request, res: Response, next: NextFunction): void {
  if (!isApiEncryptionEnabled() || !shouldEncryptPath(req.path)) {
    return next();
  }

  const methodsWithBody = ['POST', 'PUT', 'PATCH', 'DELETE'];
  const hasBody =
    methodsWithBody.includes(req.method) &&
    req.body &&
    typeof req.body === 'object' &&
    Object.keys(req.body).length > 0;

  if (!hasBody) {
    return next();
  }

  if (isEncryptedEnvelope(req.body)) {
    try {
      req.body = unwrapEncrypted(req.body);
    } catch {
      res.status(400).json({ error: 'Invalid encrypted request payload' });
      return;
    }
  } else {
    res.status(400).json({ error: 'Encrypted request body required' });
    return;
  }

  next();
}

/** Encrypt all `res.json()` payloads for `/api/v1/*` routes. */
export function encryptResponseBody(req: Request, res: Response, next: NextFunction): void {
  if (!isApiEncryptionEnabled() || !shouldEncryptPath(req.path)) {
    return next();
  }

  const originalJson = res.json.bind(res);

  res.json = function encryptJson(body: unknown) {
    if (isEncryptedEnvelope(body)) {
      return originalJson(body);
    }
    try {
      res.setHeader('X-Api-Encrypted', '1');
      return originalJson(wrapEncrypted(body));
    } catch (err) {
      console.error('Response encryption failed:', err);
      return originalJson(body);
    }
  };

  next();
}
