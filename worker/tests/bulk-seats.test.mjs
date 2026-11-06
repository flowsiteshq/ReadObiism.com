import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ensureBulkOrders, ensureBulkSeats, seatsForOrder, assignBulkSeat, revokeBulkSeat, claimBulkSeat } from '../api/src/bulk-orders.js';

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

const orderId = 'bprod_' + 'a'.repeat(32);

async function seed(env) {
  await ensureBulkOrders(env);
  env.OBI_DB.raw.exec(`CREATE TABLE IF NOT EXISTS purchases (checkout_session_id TEXT PRIMARY KEY,payment_intent_id TEXT,purchaser_email TEXT,reader_name TEXT,amount_cents INTEGER NOT NULL,currency TEXT NOT NULL,product_sku TEXT NOT NULL,status TEXT NOT NULL,granted_at TEXT NOT NULL,expires_at TEXT,edition_no INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS reader_devices (checkout_session_id TEXT PRIMARY KEY,device_hash TEXT NOT NULL,claimed_at TEXT NOT NULL,metadata_json TEXT);`);
  const now = new Date().toISOString();
  env.OBI_DB.raw.prepare(`INSERT INTO bulk_orders
    (id,code_hash,code_last4,buyer_email,quantity,currency,unit_amount_minor,total_minor,provider,status,created_at,paid_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,'paid',?,?,?)`)
    .run(orderId, 'code-hash', 'XXXX', 'buyer@example.test', 3, 'NGN', 700000, 2100000, 'paystack', now, now, now);
}

test('per-seat links generate, assign, claim, revoke and reassign', async () => {
  const db = database();
  const env = { OBI_DB: db, BULK_CODE_ENCRYPTION_KEY: 'c7'.repeat(32), OBI_PUBLIC_APP_URL: 'https://readobiism.com' };
  await seed(env);
  const order = await db.prepare('SELECT * FROM bulk_orders WHERE id=?').bind(orderId).first();
  await ensureBulkSeats(env, order);
  assert.equal(db.raw.prepare('SELECT count(*) n FROM bulk_seats WHERE order_id=?').get(orderId).n, 3);

  const seats = await seatsForOrder(env, orderId);
  assert.equal(seats.seats.length, 3);
  assert.match(seats.seats[0].link, /^https:\/\/readobiism\.com\/bulk-redeem\?seat=seat_/);

  const assigned = await assignBulkSeat(env, orderId, 1, { label: 'Chile', email: 'chile@example.test' }, 'buyer@example.test');
  assert.equal(assigned.status, 200);
  assert.equal(assigned.body.seat.recipient_email, 'chile@example.test');

  const token = new URL(seats.seats[0].link).searchParams.get('seat');
  const wrong = await claimBulkSeat(env, { id: 'acct_wrong', email: 'wrong@example.test' }, token, 'device-hash');
  assert.equal(wrong.status, 403);

  const claimed = await claimBulkSeat(env, { id: 'acct_chile', email: 'chile@example.test' }, token, 'device-hash');
  assert.equal(claimed.status, 200);
  assert.match(claimed.body.session_id, /^obi_/);
  assert.equal(db.raw.prepare('SELECT status FROM purchases WHERE checkout_session_id=?').get(claimed.body.session_id).status, 'active');

  const retry = await claimBulkSeat(env, { id: 'acct_chile', email: 'chile@example.test' }, token, 'device-hash');
  assert.equal(retry.status, 200);
  assert.equal(retry.body.alreadyClaimed, true);

  const other = await claimBulkSeat(env, { id: 'acct_other', email: 'other@example.test' }, token, 'device-hash');
  assert.equal(other.status, 409);

  const revoked = await revokeBulkSeat(env, orderId, 1, 'buyer@example.test');
  assert.equal(revoked.status, 200);
  assert.equal(db.raw.prepare('SELECT status FROM purchases WHERE checkout_session_id=?').get(claimed.body.session_id).status, 'revoked');

  const blocked = await claimBulkSeat(env, { id: 'acct_other', email: 'other@example.test' }, token, 'device-hash');
  assert.equal(blocked.status, 409);

  const reassigned = await assignBulkSeat(env, orderId, 1, { label: 'New Reader', email: 'new@example.test' }, 'buyer@example.test');
  assert.equal(reassigned.status, 200);
  assert.equal(reassigned.body.seat.status, 'available');

  const reclaimed = await claimBulkSeat(env, { id: 'acct_new', email: 'new@example.test' }, token, 'device-hash-2');
  assert.equal(reclaimed.status, 200);
  assert.notEqual(reclaimed.body.session_id, claimed.body.session_id);
});
