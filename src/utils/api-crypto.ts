import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const VERSION = 1;

export type EncryptedEnvelope = {
  _enc: true;
  v: number;
  payload: string;
};

export function isApiEncryptionEnabled(): boolean {
  if (process.env.API_ENCRYPTION_ENABLED === 'false') return false;
  return Boolean(process.env.API_ENCRYPTION_KEY?.trim());
}

function getKey(): Buffer {
  const hex = process.env.API_ENCRYPTION_KEY?.trim();
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('API_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptPayload(data: unknown): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const plaintext = JSON.stringify(data ?? null);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // IV + ciphertext + tag — matches Web Crypto AES-GCM wire format used by the browser client
  return Buffer.concat([iv, encrypted, tag]).toString('base64');
}

export function decryptPayload(payload: string): unknown {
  const key = getKey();
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('Invalid encrypted payload');
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const data = buf.subarray(IV_LEN, buf.length - TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  return JSON.parse(plain);
}

export function wrapEncrypted(data: unknown): EncryptedEnvelope {
  return { _enc: true, v: VERSION, payload: encryptPayload(data) };
}

export function isEncryptedEnvelope(body: unknown): body is EncryptedEnvelope {
  return (
    !!body &&
    typeof body === 'object' &&
    (body as EncryptedEnvelope)._enc === true &&
    typeof (body as EncryptedEnvelope).payload === 'string'
  );
}

export function unwrapEncrypted(body: unknown): unknown {
  if (!isEncryptedEnvelope(body)) return body;
  return decryptPayload(body.payload);
}

export function shouldEncryptPath(path: string): boolean {
  if (!path.startsWith('/api/v1')) return false;
  return true;
}
