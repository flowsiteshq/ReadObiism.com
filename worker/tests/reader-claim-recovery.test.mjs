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

test('a paid Paystack reader claim is recovered when the webhook is delayed', async () => {
  const db = database();
  const env = { OBI_DB: db, PAYSTACK_SECRET_KEY: 'sk_test_fixture' };
  const reference = 'obi_' + 'a'.repeat(16);
  const deviceToken = 'b'.repeat(48);
  const deviceHash = await hashDeviceToken(deviceToken);
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/transaction\/verify\//);
    return Response.json({
      status: true,
      data: {
        id: 123,
        status: 'success',
        reference,
        currency: 'NGN',
        amount: 699500,
        customer: { email: 'buyer@example.test' },
        metadata: {
          product_sku: 'obi_ism_complete_edition',
          device_hash: deviceHash,
          price_minor: '699500',
        },
      },
    });
  };
  try {
    const response = await worker.fetch(new Request('https://readobiism.com/api/reader/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: reference, device_token: deviceToken }),
    }), env);
    assert.equal(response.status, 200, await response.clone().text());
    assert.deepEqual(await response.json(), { access: true, deviceBound: true });
    assert.equal(db.raw.prepare('SELECT count(*) n FROM purchases WHERE checkout_session_id=?').get(reference).n, 1);
    assert.equal(db.raw.prepare('SELECT count(*) n FROM reader_devices WHERE checkout_session_id=?').get(reference).n, 1);
  } finally {
    globalThis.fetch = original;
  }
});
