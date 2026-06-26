/**
 * Full API smoke + performance test against a running server.
 * Run: npx ts-node scripts/full-api-test.ts
 */
import http from 'http';
import dotenv from 'dotenv';
import { wrapEncrypted, unwrapEncrypted, isEncryptedEnvelope } from '../src/utils/api-crypto';

dotenv.config();

const API = '/api/v1';
const ADMIN_USER = process.env.ADMIN_USERNAME || process.env.E2E_ADMIN_USER || 'admin';
const ADMIN_PASS =
  process.env.ADMIN_PASSWORD ||
  process.env.E2E_ADMIN_PASSWORD ||
  process.env.SEED_ADMIN_PASSWORD ||
  'password123';

type Result = { method: string; path: string; status: number; ms: number; ok: boolean; note?: string };

const results: Result[] = [];
let token = '';
let loginUser = '';
let isAdmin = false;

const LOGIN_CANDIDATES: [string, string][] = [
  [ADMIN_USER, ADMIN_PASS],
  ['harish', 'password123'],
  ['jayanthi', 'password123'],
];

async function tryLogin(): Promise<boolean> {
  for (const [user, pass] of LOGIN_CANDIDATES) {
    const res = await request('POST', `${API}/auth/login`, { username: user, password: pass }, false);
    if (res.status === 200 && res.json && typeof res.json === 'object' && 'token' in res.json) {
      token = (res.json as { token: string }).token;
      loginUser = user;
      isAdmin = user === 'admin';
      results.push({
        method: 'POST',
        path: `${API}/auth/login`,
        status: res.status,
        ms: res.ms,
        ok: true,
        note: `as ${user}`,
      });
      return true;
    }
  }
  results.push({
    method: 'POST',
    path: `${API}/auth/login`,
    status: 401,
    ms: 0,
    ok: false,
    note: 'all credentials failed',
  });
  return false;
}

function request(
  method: string,
  path: string,
  body?: unknown,
  auth = false
): Promise<{ status: number; json: unknown; ms: number; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const encrypted = body !== undefined ? wrapEncrypted(body) : undefined;
    const payload = encrypted ? JSON.stringify(encrypted) : undefined;
    const start = Date.now();
    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          const ms = Date.now() - start;
          let json: unknown = data;
          try {
            json = JSON.parse(data);
            if (isEncryptedEnvelope(json)) json = unwrapEncrypted(json);
          } catch {
            /* plain text */
          }
          resolve({ status: res.statusCode || 0, json, ms, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function testPlain(method: string, path: string, body: unknown, expectStatus: number) {
  return new Promise<void>((resolve) => {
    const payload = JSON.stringify(body);
    const start = Date.now();
    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path,
        method,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          const ms = Date.now() - start;
          const ok = res.statusCode === expectStatus;
          results.push({
            method,
            path,
            status: res.statusCode || 0,
            ms,
            ok,
            note: ok ? 'plain body rejected' : data.slice(0, 80),
          });
          resolve();
        });
      }
    );
    req.on('error', (e) => {
      results.push({ method, path, status: 0, ms: 0, ok: false, note: e.message });
      resolve();
    });
    req.write(payload);
    req.end();
  });
}

async function test(
  method: string,
  path: string,
  opts: {
    body?: unknown;
    auth?: boolean;
    expect?: number | number[];
    slowMs?: number;
    note?: string;
    adminOnly?: boolean;
  } = {}
) {
  let expect = opts.expect ?? 200;
  if (opts.adminOnly && !isAdmin) expect = 403;
  const expected = Array.isArray(expect) ? expect : [expect];
  try {
    const res = await request(method, path, opts.body, opts.auth ?? true);
    const ok = expected.includes(res.status);
    results.push({
      method,
      path,
      status: res.status,
      ms: res.ms,
      ok,
      note: opts.note || (ok ? undefined : JSON.stringify(res.json).slice(0, 120)),
    });
    return res;
  } catch (e: any) {
    results.push({ method, path, status: 0, ms: 0, ok: false, note: e.message });
    return null;
  }
}

function pickCustomerNo(data: unknown): string | null {
  const items = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && 'items' in data
      ? (data as { items: { customerNo?: string }[] }).items
      : [];
  return items[0]?.customerNo ?? null;
}

function pickId(data: unknown): string | null {
  if (Array.isArray(data) && data[0]?.id) return data[0].id;
  if (data && typeof data === 'object' && 'items' in data) {
    const items = (data as { items: { id: string }[] }).items;
    return items[0]?.id ?? null;
  }
  return null;
}

async function main() {
  console.log('=== Full API Test ===\n');

  await test('GET', '/health', { auth: false, expect: 200 });
  await test('GET', '/', { auth: false, expect: 200 });

  const login = await tryLogin();
  if (!token) {
    console.error('Login failed for all credentials — set ADMIN_PASSWORD in server/.env');
    printReport();
    process.exit(1);
  }
  console.log(`Logged in as: ${loginUser}\n`);

  // Auth
  await test('GET', `${API}/auth/menus`);

  // Masters — list
  const branches = await test('GET', `${API}/masters/branches`, { adminOnly: true });
  await test('GET', `${API}/masters/branches/next-code`, { adminOnly: true });
  await test('GET', `${API}/masters/states`, { adminOnly: true });
  await test('GET', `${API}/masters/districts`, { adminOnly: true });
  await test('GET', `${API}/masters/roles`);
  await test('GET', `${API}/masters/menus`, { adminOnly: true });
  await test('GET', `${API}/masters/loan-packages`);
  await test('GET', `${API}/masters/centers`);
  await test('GET', `${API}/masters/groups`);
  await test('GET', `${API}/masters/areas`);
  await test('GET', `${API}/masters/staffs`);
  await test('GET', `${API}/masters/staffs/requests`);

  const branchId = pickId(branches?.json);
  const staffs = await test('GET', `${API}/masters/staffs`);
  const staffId = pickId(staffs?.json);
  const centers = await test('GET', `${API}/masters/centers`);
  const centerId = pickId(centers?.json);
  const customers = await test('GET', `${API}/customers?page=1&limit=50`, {
    slowMs: 2000,
    note: 'paginated list',
  });
  await test('GET', `${API}/customers?page=1&limit=200`, {
    slowMs: 3000,
    note: 'max page size',
  });
  const customerId = pickId(customers?.json);
  const loans = await test('GET', `${API}/loans?page=1&limit=50`, { slowMs: 2000 });
  const loanId = pickId(loans?.json);
  await test('GET', `${API}/collections?page=1&limit=50`, { slowMs: 2000 });

  if (customerId) {
    await test('GET', `${API}/customers/${customerId}`);
    await test('GET', `${API}/customers/${customerId}/ledger`, { slowMs: 2000 });
  }
  if (loanId) {
    await test('GET', `${API}/loans/${loanId}`);
    await test('GET', `${API}/loans/${loanId}/ledger`, { slowMs: 2000 });
  }
  if (centerId) {
    await test('GET', `${API}/masters/centers/${centerId}`);
    await test('GET', `${API}/masters/centers/${centerId}/collection-sheet`, { slowMs: 3000 });
    await test('GET', `${API}/masters/centers/${centerId}/joint-liability-sheet`, { slowMs: 3000 });
  }
  if (branchId && staffId) {
    await test('GET', `${API}/masters/menus/staff/${staffId}`);
    await test('GET', `${API}/masters/menus/branch/${branchId}`);
  }

  // Dashboard
  await test('GET', `${API}/dashboard/kpis`, { slowMs: 2000 });
  await test('GET', `${API}/dashboard/trend`, { slowMs: 2000 });
  await test('GET', `${API}/dashboard/charts`, { slowMs: 2000 });
  await test('GET', `${API}/dashboard/activity`, { slowMs: 2000 });
  await test('GET', `${API}/dashboard/stats`, { slowMs: 2000 });

  // Reports
  const today = new Date().toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  await test('GET', `${API}/reports/collections?fromDate=${monthAgo}&toDate=${today}`, { slowMs: 3000 });
  await test('GET', `${API}/reports/center-detail?fromDate=${monthAgo}&toDate=${today}`, { slowMs: 3000 });
  await test('GET', `${API}/reports/center-customers`, { slowMs: 3000 });
  await test('GET', `${API}/reports/employee-wise?fromDate=${monthAgo}&toDate=${today}`, { slowMs: 3000 });
  await test('GET', `${API}/reports/area-due`, { slowMs: 3000 });
  const customerNo = pickCustomerNo(customers?.json);
  if (customerNo) {
    await test('GET', `${API}/reports/party-amount?customerNo=${customerNo}`, { slowMs: 3000 });
  }

  // Notifications & audit
  await test('GET', `${API}/notifications`);
  await test('GET', `${API}/audit-logs`, { slowMs: 2000 });
  await test('GET', `${API}/audit-logs/active-sessions`);
  await test('GET', `${API}/audit-logs/stats`);

  // Security — unauthenticated
  const saved = token;
  token = '';
  await test('GET', `${API}/customers`, { expect: 401, note: 'no auth' });
  token = saved;

  // Plain body rejected (unencrypted JSON)
  await testPlain('POST', `${API}/auth/login`, { username: 'admin', password: 'x' }, 400);

  printReport();
  const failed = results.filter((r) => !r.ok).length;
  process.exit(failed > 0 ? 1 : 0);
}

function printReport() {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const slow = results.filter((r) => r.ok && r.ms > 2000);

  console.log(`\nLogin user: ${loginUser}${isAdmin ? ' (admin)' : ' (staff — admin-only routes expect 403)'}`);
  console.log('\n--- Results ---');
  console.log(`Total: ${results.length} | Pass: ${passed} | Fail: ${failed}`);
  if (failed) {
    console.log('\nFailures:');
    results.filter((r) => !r.ok).forEach((r) => {
      console.log(`  FAIL ${r.method} ${r.path} → ${r.status} ${r.note || ''}`);
    });
  }
  if (slow.length) {
    console.log('\nSlow (>2s):');
    slow.sort((a, b) => b.ms - a.ms).forEach((r) => {
      console.log(`  ${r.ms}ms ${r.method} ${r.path}`);
    });
  }
  const avg = results.filter((r) => r.ok).reduce((s, r) => s + r.ms, 0) / (passed || 1);
  console.log(`\nAvg response (passed): ${avg.toFixed(0)}ms`);

  const custList = results.find((r) => r.path.includes('/customers?page=1&limit=200'));
  if (custList) {
    console.log(`Customers list (200): ${custList.ms}ms status ${custList.status}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
