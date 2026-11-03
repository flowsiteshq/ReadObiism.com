import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dashboard-worker.js';
function fixture(count=0) {
  const calls=[];
  const db={ exec:async()=>{}, prepare(sql){return { bind(...args){return { first:async()=>sql.includes('JOIN obi_account_sessions')?{id:'account-test',email:'reader@example.test'}:sql.includes('count(*)')?{count}:null,all:async()=>({results:sql.includes('PRAGMA table_info')?[{name:'email_verified'},{name:'metadata_json'},{name:'old_device_hash'},{name:'new_device_hash'}]:[]}),run:async()=>{calls.push({sql,args});return {meta:{changes:1}};} };} };} };
  return { db,calls };
}
const req=(url='https://readobiism.com/api/account/verify/request') => new Request(url,{method:'POST',headers:{authorization:'Bearer local-fixture'}});
test('unconfigured email fails before issuing a challenge',async()=>{const {db,calls}=fixture();const r=await worker.fetch(req(),{OBI_DB:db});assert.equal(r.status,503);assert.equal(calls.filter((call)=>call.sql.includes('INSERT INTO account_verification_challenges')).length,0);});
test('verification requests are limited per account',async()=>{const {db,calls}=fixture(5);const r=await worker.fetch(req(),{OBI_DB:db,RESEND_API_KEY:'re_fixture',ACCOUNT_FROM_EMAIL:'test@example.test'});assert.equal(r.status,429);assert.equal(calls.filter((call)=>call.sql.includes('INSERT INTO account_verification_challenges')).length,0);});
test('failed email delivery invalidates the code and reports failure',async()=>{const {db,calls}=fixture();const original=globalThis.fetch;globalThis.fetch=async()=>new Response('',{status:500});try {const r=await worker.fetch(req(),{OBI_DB:db,RESEND_API_KEY:'re_fixture',ACCOUNT_FROM_EMAIL:'test@example.test'});assert.equal(r.status,503);assert.ok(calls.some(x=>x.sql.includes('SET consumed_at')));}finally{globalThis.fetch=original;}});
test('successful email delivery reports success without returning the code',async()=>{const {db}=fixture();const original=globalThis.fetch;globalThis.fetch=async()=>new Response('',{status:200});try {const r=await worker.fetch(req(),{OBI_DB:db,RESEND_API_KEY:'re_fixture',ACCOUNT_FROM_EMAIL:'test@example.test'});assert.equal(r.status,200);assert.equal((await r.json()).testCode,undefined);}finally{globalThis.fetch=original;}});
test('local test code remains limited to explicit loopback mode',async()=>{const {db}=fixture();const r=await worker.fetch(req('http://127.0.0.1:8799/api/account/verify/request'),{OBI_DB:db,OBI_LOCAL_TRANSFER_TEST:'1'});assert.equal(r.status,200);assert.match((await r.json()).testCode,/^\d{8}$/);});
