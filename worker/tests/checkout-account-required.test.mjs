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


test('guest checkout requires an account for Paystack and Stripe', async () => {
  const db=database(), env={ OBI_DB:db, PAYSTACK_SECRET_KEY:'sk_test_fixture', OBI_STRIPE_SECRET_KEY:'sk_test_fixture' };
  for (const currency of ['NGN','USD']) {
    const res=await worker.fetch(new Request('https://readobiism.com/api/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'buyer@example.test',device_token:'b'.repeat(48),currency})}),env);
    assert.equal(res.status,401,await res.clone().text());
    assert.equal((await res.json()).code,'account_required');
  }
});
