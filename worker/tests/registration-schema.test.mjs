import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../dashboard-worker.js';
function database(legacy) {
 const raw=new DatabaseSync(':memory:');
 if(legacy) raw.exec('CREATE TABLE obi_accounts (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at TEXT NOT NULL, last_signed_in TEXT NOT NULL)');
 return {raw,exec:async(sql)=>raw.exec(sql),prepare(sql){let values=[];return {bind(...args){values=args;return this;},first:async()=>raw.prepare(sql).get(...values)||null,all:async()=>({results:raw.prepare(sql).all(...values)}),run:async()=>({meta:{changes:Number(raw.prepare(sql).run(...values).changes)}}),get sql(){return sql},get values(){return values}}},batch:async(stmts)=>{raw.exec('BEGIN');try{const result=stmts.map(s=>({meta:{changes:Number(raw.prepare(s.sql).run(...s.values).changes)}}));raw.exec('COMMIT');return result}catch(e){raw.exec('ROLLBACK');throw e}}};
}
for(const legacy of [true,false]) test(`registration works with ${legacy?'existing legacy':'new'} account schema`,async()=>{
 const db=database(legacy),env={OBI_DB:db};const request=new Request('https://readobiism.com/api/account/register',{method:'POST',headers:{'content-type':'application/json',origin:'https://readobiism.com','cf-connecting-ip':'127.0.0.1'},body:JSON.stringify({email:'registration@example.test',password:'example-password-123'})});const response=await worker.fetch(request,env);assert.equal(response.status,200,await response.clone().text());const data=await response.json();assert.equal(data.account.email,'registration@example.test');assert.equal(db.raw.prepare('SELECT count(*) n FROM obi_accounts').get().n,1);assert.equal(db.raw.prepare('SELECT count(*) n FROM obi_account_sessions').get().n,1);
});
