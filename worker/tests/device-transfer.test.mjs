import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../dashboard-worker.js';
import { hashDeviceToken } from '../api/src/security.js';

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

async function passwordHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  const base64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return { hash: base64(bits), salt: base64(salt) };
}

async function seed(env) {
  const db = env.OBI_DB;
  const { hash, salt } = await passwordHash('correct horse battery staple');
  const sessionToken = 'session-token-for-transfer-test';
  const sessionHash = await hashDeviceToken(sessionToken);
  const oldDeviceToken = 'old-device-token-1234567890';
  const oldDeviceHash = await hashDeviceToken(oldDeviceToken);
  const now = new Date().toISOString();
  const sessionId = 'cs_test_' + 'a'.repeat(24);
  db.raw.exec(`CREATE TABLE IF NOT EXISTS obi_accounts (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, email_verified INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, last_signed_in TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS obi_account_sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS purchases (checkout_session_id TEXT PRIMARY KEY, payment_intent_id TEXT, purchaser_email TEXT, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, product_sku TEXT NOT NULL, status TEXT NOT NULL, granted_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reader_devices (checkout_session_id TEXT PRIMARY KEY, device_hash TEXT NOT NULL, claimed_at TEXT NOT NULL, metadata_json TEXT);
    CREATE TABLE IF NOT EXISTS feature_flags (key TEXT PRIMARY KEY, enabled INTEGER NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT);`);
  db.raw.prepare("INSERT OR REPLACE INTO feature_flags (key,enabled,updated_at,updated_by) VALUES ('device_transfer',1,?,?)").run(now, 'test');
  db.raw.prepare('INSERT INTO obi_accounts (id,email,password_hash,password_salt,email_verified,created_at,last_signed_in) VALUES (?,?,?,?,1,?,?)')
    .run('acct_transfer', 'reader@example.test', hash, salt, now, now);
  db.raw.prepare('INSERT INTO obi_account_sessions (token_hash,account_id,created_at,expires_at) VALUES (?,?,?,?)')
    .run(sessionHash, 'acct_transfer', now, new Date(Date.now() + 86400000).toISOString());
  db.raw.prepare('INSERT INTO purchases (checkout_session_id,payment_intent_id,purchaser_email,amount_cents,currency,product_sku,status,granted_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(sessionId, null, 'reader@example.test', 699500, 'NGN', 'obi_ism_complete_edition', 'active', now);
  db.raw.prepare('INSERT INTO reader_devices (checkout_session_id,device_hash,claimed_at) VALUES (?,?,?)')
    .run(sessionId, oldDeviceHash, now);
  return { sessionToken, sessionId, oldDeviceToken };
}

test('device transfer requires the account password and sends a code', async () => {
  const db = database();
  const env = { OBI_DB: db, RESEND_API_KEY: 're_fixture', ACCOUNT_FROM_EMAIL: 'OBI-ISM <no-reply@example.test>' };
  const seeded = await seed(env);
  const original = globalThis.fetch;
  let sentEmail = null;
  globalThis.fetch = async (url, init) => {
    sentEmail = JSON.parse(init.body);
    return Response.json({ id: 'email_test' });
  };
  try {
    const wrong = await worker.fetch(new Request('https://readobiism.com/api/reader/transfer/start', {
      method: 'POST',
      headers: { origin: 'https://readobiism.com', 'content-type': 'application/json', authorization: `Bearer ${seeded.sessionToken}` },
      body: JSON.stringify({ session_id: seeded.sessionId, device_token: 'new-device-token-1234567890', password: 'wrong password' }),
    }), env);
    assert.equal(wrong.status, 401);
    assert.equal(db.raw.prepare('SELECT count(*) n FROM device_transfer_challenges').get().n, 0);

    const response = await worker.fetch(new Request('https://readobiism.com/api/reader/transfer/start', {
      method: 'POST',
      headers: { origin: 'https://readobiism.com', 'content-type': 'application/json', authorization: `Bearer ${seeded.sessionToken}` },
      body: JSON.stringify({ session_id: seeded.sessionId, device_token: 'new-device-token-1234567890', password: 'correct horse battery staple' }),
    }), env);
    assert.equal(response.status, 200, await response.clone().text());
    assert.match((await response.json()).challengeId, /^transfer_/);
    assert.equal(db.raw.prepare('SELECT count(*) n FROM device_transfer_challenges').get().n, 1);
    assert.equal(sentEmail.subject, 'Confirm your OBI-ISM device move');
    assert.match(sentEmail.html, /OBI-ISM/);
    assert.match(sentEmail.html, /Confirm your new device/);
    assert.match(sentEmail.text, /expires in 10 minutes/i);
  } finally {
    globalThis.fetch = original;
  }
});
