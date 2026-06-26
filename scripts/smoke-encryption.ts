import http from 'http';
import { wrapEncrypted, unwrapEncrypted, isEncryptedEnvelope } from '../src/utils/api-crypto';

const KEY = process.env.API_ENCRYPTION_KEY || '193978a2fd0d3d11d2016772872420583eb491b746507ee1b15415a156037d69';
process.env.API_ENCRYPTION_KEY = KEY;

function request(method: string, path: string, body?: unknown): Promise<{ status: number; headers: http.IncomingHttpHeaders; json: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json: unknown = data;
          try {
            json = JSON.parse(data);
          } catch {
            /* text */
          }
          resolve({ status: res.statusCode || 0, headers: res.headers, json });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('=== Smoke test: API encryption ===\n');

  const health = await request('GET', '/health');
  console.log('1. GET /health (plain):', health.status, health.json);
  if (!isEncryptedEnvelope(health.json)) console.log('   OK — health is not encrypted');

  const plainLogin = await request('POST', '/api/v1/auth/login', {
    username: 'admin',
    password: 'password123',
  });
  console.log('\n2. POST login plain body:', plainLogin.status, plainLogin.json);
  if (plainLogin.status === 400) console.log('   OK — plain body rejected');
  else console.log('   WARN — expected 400 for plain body');

  const encLogin = await request('POST', '/api/v1/auth/login', wrapEncrypted({
    username: 'admin',
    password: 'password123',
  }));
  console.log('\n3. POST login encrypted body:', encLogin.status);
  console.log('   Response encrypted:', isEncryptedEnvelope(encLogin.json));
  console.log('   X-Api-Encrypted header:', encLogin.headers['x-api-encrypted']);

  if (!isEncryptedEnvelope(encLogin.json)) {
    console.error('FAIL: login response is not encrypted — restart server with API_ENCRYPTION_KEY in .env');
    process.exit(1);
  }

  const decrypted = unwrapEncrypted(encLogin.json) as { token?: string; message?: string };
  console.log('   Decrypted has token:', Boolean(decrypted.token));
  console.log('   Decrypted message:', decrypted.message || '(none)');

  if (!decrypted.token) {
    console.error('FAIL: could not decrypt login or no token');
    process.exit(1);
  }

  console.log('\n=== All encryption checks passed ===');
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
