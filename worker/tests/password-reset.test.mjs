import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../dashboard-worker.js';
import { hashDeviceToken } from '../api/src/security.js';
import { createPassword } from '../api/src/passwords.js';

function database() {
  const raw = new DatabaseSync(':memory:');
  const db = {
    exec: async (sql) => raw.exec(sql),
    prepare(sql) {
      const api = {
        sql,
        args: [],
        bind(...args) { api.args = args; return api; },
        first: async () => raw.prepare(sql).get(...api.args) || null,
        all: async () => ({ results: raw.prepare(sql).all(...api.args) }),
        run: async () => ({ meta: { changes: Number(raw.prepare(sql).run(...api.args).changes) } }),
      };
      return api;
    },
    batch: async (statements) => {
      raw.exec('BEGIN');
      try {
        const result = statements.map((statement) => ({
          meta: { changes: Number(raw.prepare(statement.sql).run(...statement.args).changes) },
        }));
        raw.exec('COMMIT');
        return result;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
    raw,
  };
  return db;
}

const jsonReq = (url, body, init = {}) => new Request(url, {
  ...init,
  method: init.method || 'POST',
  headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  body: JSON.stringify(body),
});

async function seedAccount(db, { email = 'reader@example.test', password = 'correct horse battery staple', verified = 1 } = {}) {
  const { hash, salt } = await createPassword(password);
  const now = new Date().toISOString();
  db.raw.exec(`CREATE TABLE IF NOT EXISTS obi_accounts (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, email_verified INTEGER NOT NULL DEFAULT 0, phone TEXT, phone_verified INTEGER NOT NULL DEFAULT 0, google_sub TEXT, auth_provider TEXT NOT NULL DEFAULT 'password', created_at TEXT NOT NULL, last_signed_in TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS obi_account_sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS account_password_resets (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, code_hash TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed_at TEXT);
  CREATE TABLE IF NOT EXISTS purchases (checkout_session_id TEXT PRIMARY KEY, payment_intent_id TEXT, purchaser_email TEXT, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, product_sku TEXT NOT NULL, status TEXT NOT NULL, granted_at TEXT NOT NULL, expires_at TEXT, edition_no INTEGER NOT NULL DEFAULT 1);`);
  const id = 'acct_' + email.replace(/[^a-z0-9]/gi, '').slice(0, 16);
  db.raw.prepare('INSERT OR REPLACE INTO obi_accounts (id,email,password_hash,password_salt,email_verified,auth_provider,created_at,last_signed_in) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, email, hash, salt, verified, 'password', now, now);
  return { id, email, password };
}

async function addSession(db, accountId, token) {
  const now = new Date();
  await db.prepare('INSERT INTO obi_account_sessions (token_hash,account_id,created_at,expires_at) VALUES (?,?,?,?)')
    .bind(await hashDeviceToken(token), accountId, now.toISOString(), new Date(now.getTime() + 2592000000).toISOString())
    .run();
}

function addActivePurchase(db, email, sessionId = 'obi_' + 'a'.repeat(32)) {
  const now = new Date();
  db.raw.prepare('INSERT OR REPLACE INTO purchases (checkout_session_id,payment_intent_id,purchaser_email,amount_cents,currency,product_sku,status,granted_at,expires_at,edition_no) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(sessionId, null, email, 699500, 'NGN', 'obi_ism_complete_edition', 'active', now.toISOString(), new Date(now.getTime() + 365 * 86400000).toISOString(), 1);
  return sessionId;
}

test('forgot password does not enumerate unknown accounts', async () => {
  const db = database();
  const env = { OBI_DB: db };
  const res = await worker.fetch(jsonReq('http://127.0.0.1:8799/api/account/password/forgot', { email: 'missing@example.test' }), env);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.message, /if an account exists/i);
  assert.equal(body.testCode, undefined);
});

test('forgot and reset password work in local test mode, revoke sessions, and sign in', async () => {
  const db = database();
  const env = { OBI_DB: db, OBI_LOCAL_TRANSFER_TEST: '1' };
  const account = await seedAccount(db, { email: 'reader@example.test', password: 'old-password-123' });
  const purchaseSession = addActivePurchase(db, account.email);
  await addSession(db, account.id, 'old-session-a');
  await addSession(db, account.id, 'old-session-b');

  const forgot = await worker.fetch(jsonReq('http://127.0.0.1:8799/api/account/password/forgot', { email: account.email }), env);
  assert.equal(forgot.status, 200, await forgot.clone().text());
  const forgotBody = await forgot.json();
  assert.match(forgotBody.testCode || '', /^\d{8}$/);

  const reset = await worker.fetch(jsonReq('http://127.0.0.1:8799/api/account/password/reset', {
    email: account.email,
    code: forgotBody.testCode,
    password: 'new-password-456',
  }), env);
  assert.equal(reset.status, 200, await reset.clone().text());
  const resetBody = await reset.json();
  assert.equal(resetBody.ok, true);
  assert.equal(resetBody.access, true);
  assert.equal(resetBody.sessionId, purchaseSession);
  assert.ok(resetBody.token, 'local/browser auth should receive bearer token');

  const oldCount = db.raw.prepare('SELECT count(*) n FROM obi_account_sessions WHERE token_hash IN (?,?)')
    .get(await hashDeviceToken('old-session-a'), await hashDeviceToken('old-session-b')).n;
  assert.equal(oldCount, 0, 'all previous sessions must be revoked');

  const loginOld = await worker.fetch(jsonReq('https://readobiism.com/api/account/login', { email: account.email, password: 'old-password-123' }, { headers: { origin: 'https://readobiism.com' } }), env);
  assert.equal(loginOld.status, 401);
  const loginNew = await worker.fetch(jsonReq('https://readobiism.com/api/account/login', { email: account.email, password: 'new-password-456' }, { headers: { origin: 'https://readobiism.com' } }), env);
  assert.equal(loginNew.status, 200, await loginNew.clone().text());
});

test('password reset rejects invalid code and does not reveal account existence', async () => {
  const db = database();
  const env = { OBI_DB: db, OBI_LOCAL_TRANSFER_TEST: '1' };
  const account = await seedAccount(db, { email: 'reader@example.test', password: 'old-password-123' });
  await worker.fetch(jsonReq('http://127.0.0.1:8799/api/account/password/forgot', { email: account.email }), env);
  const bad = await worker.fetch(jsonReq('http://127.0.0.1:8799/api/account/password/reset', {
    email: account.email,
    code: '00000000',
    password: 'new-password-456',
  }), env);
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, 'Invalid or expired reset code.');

  const unknown = await worker.fetch(jsonReq('http://127.0.0.1:8799/api/account/password/reset', {
    email: 'nobody@example.test',
    code: '12345678',
    password: 'new-password-456',
  }), env);
  assert.equal(unknown.status, 400);
  assert.equal((await unknown.json()).error, 'Invalid or expired reset code.');
});

test('change password requires current password and revokes other sessions', async () => {
  const db = database();
  const env = { OBI_DB: db };
  const account = await seedAccount(db, { email: 'reader@example.test', password: 'old-password-123' });
  await addSession(db, account.id, 'current-session');
  await addSession(db, account.id, 'other-session');

  const wrong = await worker.fetch(jsonReq('https://readobiism.com/api/account/password/change', {
    current_password: 'wrong-password',
    new_password: 'new-password-456',
  }, { headers: { origin: 'https://readobiism.com', authorization: 'Bearer current-session' } }), env);
  assert.equal(wrong.status, 401);

  const ok = await worker.fetch(jsonReq('https://readobiism.com/api/account/password/change', {
    current_password: 'old-password-123',
    new_password: 'new-password-456',
  }, { headers: { origin: 'https://readobiism.com', authorization: 'Bearer current-session' } }), env);
  assert.equal(ok.status, 200, await ok.clone().text());
  assert.equal(db.raw.prepare('SELECT count(*) n FROM obi_account_sessions WHERE token_hash=?').get(await hashDeviceToken('current-session')).n, 1);
  assert.equal(db.raw.prepare('SELECT count(*) n FROM obi_account_sessions WHERE token_hash=?').get(await hashDeviceToken('other-session')).n, 0);
});

test('admin can send reset email or create temporary password', async () => {
  const db = database();
  const adminPassword = 'AdminPassword1234567890!!secure';
  const adminEmail = 'admin@example.test';
  const env = { OBI_DB: db, RESEND_API_KEY: 're_test', ACCOUNT_FROM_EMAIL: 'OBI <no-reply@example.test>', OBI_ADMIN_EMAIL: adminEmail, OBI_ADMIN_PASSWORD: adminPassword };
  const account = await seedAccount(db, { email: 'reader@example.test', password: 'old-password-123' });
  await addSession(db, account.id, 'reader-session');
  // create admin session directly to avoid coupling to admin login config behavior in this test
  db.raw.exec('CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY, admin_email TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)');
  const adminToken = 'a'.repeat(64);
  const now = new Date();
  db.raw.prepare('INSERT INTO admin_sessions (token_hash,admin_email,created_at,expires_at) VALUES (?,?,?,?)')
    .run(await hashDeviceToken(adminToken), adminEmail, now.toISOString(), new Date(now.getTime() + 3600000).toISOString());
  const cookie = `obi_admin_session=${adminToken}`;

  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
    if (String(url).includes('api.resend.com')) return Response.json({ id: 'email_123' });
    return originalFetch(url, init);
  };
  try {
    const emailReset = await worker.fetch(jsonReq('https://readobiism.com/api/admin/readers/password-reset', { account_id: account.id, mode: 'email' }, { headers: { origin: 'https://readobiism.com', cookie } }), env);
    assert.equal(emailReset.status, 200, await emailReset.clone().text());
    assert.ok(calls.some((c) => c.url.includes('api.resend.com') && c.body?.subject?.includes('Reset')), 'reset email should be sent');

    const temp = await worker.fetch(jsonReq('https://readobiism.com/api/admin/readers/password-reset', { account_id: account.id, mode: 'temporary' }, { headers: { origin: 'https://readobiism.com', cookie } }), env);
    assert.equal(temp.status, 200, await temp.clone().text());
    const tempBody = await temp.json();
    assert.ok(tempBody.temporary_password, 'temporary password must be returned once');
    assert.equal(db.raw.prepare('SELECT count(*) n FROM obi_account_sessions WHERE account_id=?').get(account.id).n, 0, 'temporary reset must revoke sessions');

    const loginTemp = await worker.fetch(jsonReq('https://readobiism.com/api/account/login', { email: account.email, password: tempBody.temporary_password }, { headers: { origin: 'https://readobiism.com' } }), env);
    assert.equal(loginTemp.status, 200, await loginTemp.clone().text());
  } finally {
    globalThis.fetch = originalFetch;
  }
});
