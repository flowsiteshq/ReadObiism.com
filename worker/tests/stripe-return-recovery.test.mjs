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


test('Stripe return recovers paid edition only for original browser when webhook is delayed', async () => {
 const db=database(),env={OBI_DB:db,OBI_STRIPE_SECRET_KEY:'sk_test_fixture'}, id='cs_test_'+ 'a'.repeat(24),token='d'.repeat(48),hash=await hashDeviceToken(token),orig=globalThis.fetch;
 let session={id,status:'complete',payment_status:'paid',currency:'usd',amount_total:995,payment_intent:'pi_test',customer_email:'buyer@example.test',metadata:{product_sku:'obi_ism_complete_edition',price_minor:'995',device_hash:hash}};
 globalThis.fetch=async(url,opts)=>{assert.match(String(url),/api\.stripe\.com\/v1\/checkout\/sessions/);return Response.json(session)};
 const claim=(t)=>worker.fetch(new Request('https://readobiism.com/api/reader/claim',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session_id:id,device_token:t})}),env);
 try {
  let wrong=await claim('x'.repeat(48)); assert.equal(wrong.status,404,await wrong.clone().text());
  session={...session,payment_status:'unpaid'};let unpaid=await claim(token);assert.equal(unpaid.status,404,await unpaid.clone().text());
  session={...session,payment_status:'paid',amount_total:1};let amount=await claim(token);assert.equal(amount.status,404,await amount.clone().text());
  assert.equal(db.raw.prepare('SELECT count(*) n FROM purchases').get().n,0);
  session={...session,amount_subtotal:995,amount_total:1059,total_details:{amount_tax:64,amount_discount:0,amount_shipping:0}};let paid=await claim(token);assert.equal(paid.status,200,await paid.clone().text());assert.equal((await paid.json()).access,true);
  assert.equal(db.raw.prepare('SELECT count(*) n FROM purchases').get().n,1);
  assert.equal(db.raw.prepare('SELECT amount_cents FROM purchases').get().amount_cents,1059);
  let repeat=await claim(token);assert.equal(repeat.status,200,await repeat.clone().text());assert.equal(db.raw.prepare('SELECT count(*) n FROM purchases').get().n,1);
 } finally {globalThis.fetch=orig}
});

test('Stripe checkout rejects unexplained tax, discount, or mismatched subtotal',async()=>{
 const {hasExpectedBookPayment}=await import('../dashboard-worker.js');
 const base={id:'cs_test_aaaaaaaaaaaaaaaa',payment_status:'paid',currency:'usd',amount_subtotal:995,amount_total:1059,metadata:{product_sku:'obi_ism_complete_edition',price_minor:'995',device_hash:'a'.repeat(64)},total_details:{amount_tax:64,amount_discount:0,amount_shipping:0}};
 assert.equal(hasExpectedBookPayment(base),true);
 for (const change of [{amount_subtotal:1},{amount_total:1060},{total_details:{amount_tax:64,amount_discount:1,amount_shipping:0}},{total_details:{amount_tax:64,amount_discount:0,amount_shipping:1}}]) assert.equal(hasExpectedBookPayment({...base,...change}),false);
});
