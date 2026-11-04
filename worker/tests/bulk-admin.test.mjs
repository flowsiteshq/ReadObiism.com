import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../dashboard-worker.js';
import { bulkOrdersSchema } from '../api/src/bulk-orders.js';

function database() {
  const raw = new DatabaseSync(':memory:');
  return {
    raw,
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
  };
}

const request = (path, init = {}) => new Request(`https://readobiism.com${path}`, init);

test('admin can inspect claims and pause, resume or revoke a bulk code', async () => {
  const db = database();
  const env = {
    OBI_DB: db,
    OBI_ADMIN_EMAIL: 'admin@example.test',
    OBI_ADMIN_PASSWORD: 'a'.repeat(32),
  };
  const login = await worker.fetch(request('/api/admin/login', {
    method: 'POST',
    headers: { origin: 'https://readobiism.com', 'content-type': 'application/json' },
    body: JSON.stringify({ email: env.OBI_ADMIN_EMAIL, password: env.OBI_ADMIN_PASSWORD }),
  }), env);
  assert.equal(login.status, 200);
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  assert.match(cookie, /^obi_admin_session=/);

  db.raw.exec(`CREATE TABLE purchases (checkout_session_id TEXT PRIMARY KEY,payment_intent_id TEXT,purchaser_email TEXT,reader_name TEXT,amount_cents INTEGER NOT NULL,currency TEXT NOT NULL,product_sku TEXT NOT NULL,status TEXT NOT NULL,granted_at TEXT NOT NULL);
    CREATE TABLE reader_devices (checkout_session_id TEXT PRIMARY KEY,device_hash TEXT NOT NULL,claimed_at TEXT NOT NULL,metadata_json TEXT);
    CREATE TABLE obi_accounts (id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,email_verified INTEGER NOT NULL DEFAULT 0,phone TEXT,phone_verified INTEGER NOT NULL DEFAULT 0,google_sub TEXT,auth_provider TEXT NOT NULL DEFAULT 'password',created_at TEXT NOT NULL,last_signed_in TEXT NOT NULL);`);
  db.raw.exec(bulkOrdersSchema);
  const orderId = 'bprod_' + 'a'.repeat(32);
  db.raw.prepare(`INSERT INTO bulk_orders (id,code_hash,code_last4,buyer_email,receipt_email,quantity,currency,unit_amount_minor,total_minor,provider,status,created_at,paid_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(orderId, 'placeholder', 'XXXX', 'phone_fixture@phone.obiism.local', 'buyer@example.test', 2, 'NGN', 700000, 1400000, 'paystack', 'paid', '2026-11-04', '2026-11-04', '2026-11-04');
  db.raw.prepare("INSERT INTO obi_accounts (id,email,password_hash,password_salt,created_at,last_signed_in) VALUES (?,?,?,?,?,?)").run('account-1', 'reader@example.test', 'hash', 'salt', '2026-11-04', '2026-11-04');
  db.raw.prepare("INSERT INTO bulk_order_claims (order_id,account_id,checkout_session_id,claimed_at) VALUES (?,?,?,?)").run(orderId, 'account-1', 'obi_aaaaaaaaaaaaaaaa', '2026-11-04');
  db.raw.prepare("INSERT INTO reader_devices (checkout_session_id,device_hash,claimed_at,metadata_json) VALUES (?,?,?,?)").run('obi_aaaaaaaaaaaaaaaa', 'device-hash', '2026-11-04', JSON.stringify({ platform: 'Android', mobile: true, country: 'NG' }));
  db.raw.prepare("INSERT INTO purchases (checkout_session_id,payment_intent_id,purchaser_email,amount_cents,currency,product_sku,status,granted_at) VALUES (?,?,?,?,?,?,?,?)").run('obi_aaaaaaaaaaaaaaaa', 'bulk-order:' + orderId, 'reader@example.test', 0, 'NGN', 'obi-ism-digital-edition', 'active', '2026-11-04');

  const detail = await worker.fetch(request('/api/admin/bulk-order?order_id=' + orderId, { headers: { cookie } }), env);
  assert.equal(detail.status, 200, await detail.clone().text());
  const detailBody = await detail.json();
  assert.equal(detailBody.order.receipt_email, 'buyer@example.test');
  assert.equal(detailBody.order.quantity, 2);
  assert.equal(detailBody.order.remaining, 1);
  assert.equal(detailBody.claims.length, 1);
  assert.equal(detailBody.claims[0].phone, '');
  assert.equal(detailBody.claims[0].device, 'Android · mobile · NG');

  const pause = await worker.fetch(request('/api/admin/bulk-order/action', {
    method: 'POST',
    headers: { origin: 'https://readobiism.com', 'content-type': 'application/json', cookie },
    body: JSON.stringify({ order_id: orderId, action: 'pause' }),
  }), env);
  assert.equal(pause.status, 200, await pause.clone().text());
  assert.equal(db.raw.prepare('SELECT claims_open FROM bulk_orders WHERE id=?').get(orderId).claims_open, 0);
  assert.equal(db.raw.prepare('SELECT status FROM purchases WHERE checkout_session_id=?').get('obi_aaaaaaaaaaaaaaaa').status, 'active');

  const resume = await worker.fetch(request('/api/admin/bulk-order/action', {
    method: 'POST',
    headers: { origin: 'https://readobiism.com', 'content-type': 'application/json', cookie },
    body: JSON.stringify({ order_id: orderId, action: 'resume' }),
  }), env);
  assert.equal(resume.status, 200, await resume.clone().text());
  assert.equal(db.raw.prepare('SELECT claims_open FROM bulk_orders WHERE id=?').get(orderId).claims_open, 1);

  const revoke = await worker.fetch(request('/api/admin/bulk-order/action', {
    method: 'POST',
    headers: { origin: 'https://readobiism.com', 'content-type': 'application/json', cookie },
    body: JSON.stringify({ order_id: orderId, action: 'revoke' }),
  }), env);
  assert.equal(revoke.status, 200, await revoke.clone().text());
  assert.notEqual(db.raw.prepare('SELECT revoked_at FROM bulk_orders WHERE id=?').get(orderId).revoked_at, null);
  assert.equal(db.raw.prepare('SELECT status FROM purchases WHERE checkout_session_id=?').get('obi_aaaaaaaaaaaaaaaa').status, 'revoked');
});
