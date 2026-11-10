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


test('paid Paystack gift is recovered before redemption when webhook is delayed', async () => {
  const db = database();
  const env = { OBI_DB: db, PAYSTACK_SECRET_KEY: 'sk_test_fixture' };
  const reference = 'obi_' + 'c'.repeat(16);
  const token = 'd'.repeat(48);
  const code = 'OBI-7K2M-P9QX-4HWD';
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({status:true,data:{id:123,status:'success',reference,currency:'NGN',amount:699500,customer:{email:'buyer@example.test'},metadata:{product_sku:'obi_ism_complete_edition',device_hash:await hashDeviceToken('b'.repeat(48)),price_minor:'699500',gift:'1',gift_code:code,recipient_name:'Reader',recipient_email:'recipient@example.test'}}});
  try {
    const status = await worker.fetch(new Request('https://readobiism.com/api/gift?session_id='+reference),env);
    assert.equal(status.status,200,await status.clone().text());
    assert.equal((await status.json()).gift.code,code);
    // Simulate an interruption after the purchase and device were written.
    db.raw.prepare('DELETE FROM gift_orders WHERE checkout_session_id=?').run(reference);
    const recovered = await worker.fetch(new Request('https://readobiism.com/api/gift?session_id='+reference),env);
    assert.equal(recovered.status,200,await recovered.clone().text());
    assert.equal((await recovered.json()).gift.code,code);
    const req = () => new Request('https://readobiism.com/api/gift/redeem',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code,email:'recipient@example.test',device_token:token})});
    const redeemed = await worker.fetch(req(),env);
    assert.equal(redeemed.status,200,await redeemed.clone().text());
    assert.equal((await redeemed.json()).redeemed,true);
    const again = await worker.fetch(req(),env);
    assert.equal(again.status,200,await again.clone().text());
    assert.equal((await again.json()).alreadyRedeemed,true);
  } finally { globalThis.fetch=original; }
});
