// Isolated local origin integration probe; removes only its own test account.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import mysql from 'mysql2/promise';
const proxy = process.env.OBI_TEST_PROXY || 'http://127.0.0.1:5521';
const origin = 'http://127.0.0.1:50377';
const email = `five-probe-${randomBytes(12).toString('hex')}@example.test`;
const password = randomBytes(24).toString('hex');
const dir = '.wrangler/rebuild-state/v3/d1/miniflare-D1DatabaseObject';
const files = (await readdir(dir)).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
assert.equal(files.length, 1);
const d1 = new DatabaseSync(`${dir}/${files[0]}`); d1.exec('PRAGMA busy_timeout=5000');
const db = await mysql.createConnection({ host: '127.0.0.1', user: process.env.OBI_MYSQL_LOCAL_USER || 'root', password: process.env.OBI_MYSQL_LOCAL_PASSWORD || '', database: 'obi_local_primary' });
const post = (route, caller = origin) => fetch(`${proxy}/api/account/${route}`, { method: 'POST', headers: { origin: caller, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
try {
  const preflight = await fetch(`${proxy}/api/account/register`, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
  const foreign = await post('register', 'http://example.invalid');
  assert.equal(foreign.headers.get('access-control-allow-origin'), null);
  assert.equal(foreign.status, 403);
  const registration = await post('register');
  assert.equal(registration.status, 200);
  assert.equal(registration.headers.get('access-control-allow-origin'), origin);
  assert.equal((await registration.json()).account.email, email);
  const [rows] = await db.execute('SELECT a.id,o.status FROM obi_accounts a JOIN obi_sync_outbox o ON o.account_id=a.id WHERE a.email=?', [email]);
  assert.equal(rows.length, 1); assert.equal(rows[0].status, 'synced');
  assert.equal(d1.prepare('SELECT id FROM obi_accounts WHERE email=?').get(email).id, rows[0].id);
  const login = await post('login');
  assert.equal(login.status, 200); assert.equal((await login.json()).account.email, email);
  console.log('Five Server origin: CORS, untrusted-origin rejection, MySQL-first registration, D1 sync and login passed.');
} finally {
  const [rows] = await db.execute('SELECT id FROM obi_accounts WHERE email=?', [email]);
  for (const row of rows) {
    d1.prepare('DELETE FROM obi_account_sessions WHERE account_id=?').run(row.id);
    d1.prepare('DELETE FROM obi_accounts WHERE id=? AND email=?').run(row.id, email);
    await db.execute('DELETE FROM obi_sync_outbox WHERE account_id=?', [row.id]);
    await db.execute('DELETE FROM obi_accounts WHERE id=? AND email=?', [row.id, email]);
  }
  await db.end(); d1.close();
}
