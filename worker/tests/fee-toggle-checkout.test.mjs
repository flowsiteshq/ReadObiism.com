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


test('fee disabled for checkout remains valid when re-enabled before payment verification',async()=>{
 const {setFeatureFlag}=await import('../api/src/feature-flags.js');const db=database(),env={OBI_DB:db,PAYSTACK_SECRET_KEY:'sk_test_fixture'};
 const reg=await worker.fetch(new Request('https://readobiism.com/api/account/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'fee@example.test',password:'sample-password-123'})}),env);const token=(await reg.json()).token;
 await setFeatureFlag(env,'paystack_processing_charge',false,'admin@example.test');let initialized;const old=globalThis.fetch;
 globalThis.fetch=async(url,opts)=>{if(String(url).includes('/initialize')){initialized=JSON.parse(opts.body);return Response.json({status:true,data:{authorization_url:'https://checkout.paystack.com/test'}})};return Response.json({status:true,data:{id:111,status:'success',reference:initialized.reference,currency:'NGN',amount:initialized.amount,customer:{email:'fee@example.test'},metadata:initialized.metadata}})};
 try{
  const checkout=await worker.fetch(new Request('https://readobiism.com/api/checkout',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({email:'fee@example.test',device_token:'b'.repeat(48),currency:'NGN',quoted_total_minor:699500})}),env);
  assert.equal(checkout.status,200,await checkout.clone().text());assert.equal(initialized.amount,699500);assert.equal(initialized.metadata.processing_fee_minor,'0');
  await setFeatureFlag(env,'paystack_processing_charge',true,'admin@example.test');
  const claim=await worker.fetch(new Request('https://readobiism.com/api/reader/claim',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session_id:initialized.reference,device_token:'b'.repeat(48)})}),env);
  assert.equal(claim.status,200,await claim.clone().text());assert.equal(db.raw.prepare('SELECT amount_cents FROM purchases').get().amount_cents,699500);
 }finally{globalThis.fetch=old}
});
test('bulk checkout uses the current fee toggle and preserves pending order total',async()=>{
 const {setFeatureFlag}=await import('../api/src/feature-flags.js');const {createBulkOrderCheckout,verifyBulkOrderPayment}=await import('../api/src/bulk-orders.js');
 const db=database(),env={OBI_DB:db,PAYSTACK_SECRET_KEY:'sk_test_fixture',BULK_CODE_ENCRYPTION_KEY:'c7'.repeat(32)},old=globalThis.fetch;let initialized;
 await setFeatureFlag(env,'paystack_processing_charge',false,'admin@example.test');
 globalThis.fetch=async(url,opts)=>{if(String(url).includes('/initialize')){initialized=JSON.parse(opts.body);return Response.json({status:true,data:{authorization_url:'https://checkout.paystack.com/test',reference:initialized.reference}})};return Response.json({status:true,data:{status:'success',domain:'test',reference:initialized.reference,currency:'NGN',amount:initialized.amount,customer:{email:'buyer@example.test'},metadata:initialized.metadata}})};
 try{const r=await createBulkOrderCheckout(env,'buyer@example.test',2,'paystack',null,'admin@example.test',{quotedTotalMinor:1399000});assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(initialized.amount,1399000);await setFeatureFlag(env,'paystack_processing_charge',true,'admin@example.test');const verified=await verifyBulkOrderPayment(env,r.body.order_id);assert.equal(verified.status,200,JSON.stringify(verified.body));assert.equal(verified.body.status,'paid');}finally{globalThis.fetch=old}
});

test('local Paystack bulk test respects disabled charge including discounts',async()=>{
 const {setFeatureFlag}=await import('../api/src/feature-flags.js');const {startBulkPaystackTest}=await import('../api/src/bulk-local.js');
 const db=database(),env={OBI_DB:db,PAYSTACK_SECRET_KEY:'sk_test_fixture',OBI_BULK_LOCAL_CODE_SECRET:'a'.repeat(64)},old=globalThis.fetch;let initialized;
 await setFeatureFlag(env,'paystack_processing_charge',false,'admin@example.test');
 globalThis.fetch=async(url,opts)=>{initialized=JSON.parse(opts.body);return Response.json({status:true,data:{authorization_url:'https://checkout.paystack.com/test',reference:initialized.reference}})};
 try{const r=await startBulkPaystackTest(env,'admin@example.test','buyer@example.test',2,{percentage:10,note:'Approved',confirmed:true});assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(initialized.amount,1259100);}finally{globalThis.fetch=old}
});
