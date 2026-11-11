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


test('local discounted bulk checkout adds fee after the discount',async()=>{
 const {startBulkPaystackTest}=await import('../api/src/bulk-local.js');
 const db=database(),env={OBI_DB:db,PAYSTACK_SECRET_KEY:'sk_test_fixture',OBI_BULK_LOCAL_CODE_SECRET:'a'.repeat(64)},original=globalThis.fetch;let sent;
 globalThis.fetch=async(url,opts)=>{sent=JSON.parse(opts.body);return Response.json({status:true,data:{authorization_url:'https://checkout.paystack.com/test',reference:sent.reference}})};
 try{const r=await startBulkPaystackTest(env,'admin@example.test','buyer@example.test',2,{percentage:10,note:'Approved',confirmed:true});assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(sent.amount,1287987);assert.equal(db.raw.prepare('SELECT amount_kobo FROM bulk_local_payments').get().amount_kobo,1287987);}finally{globalThis.fetch=original;}
});
