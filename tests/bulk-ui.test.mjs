import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
class Element { constructor(){this.hidden=true;this.textContent='';this.value='';this.events={};this.disabled=false;} addEventListener(n,f){this.events[n]=f;} select(){} }
function setup(script, {host='readobiism.com',port='',search='',routes={}}={}) {
 const elements=new Map(), storage=new Map(), session=new Map(), calls=[], redirects=[]; const $=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};
 const location={hostname:host,port,search,pathname:'/bulk-confirmation.html',assign:url=>redirects.push(url)}, history={replaceState:(_a,_b,url)=>{location.pathname=url;location.search='';}};
 const api=async(path,options={})=>{calls.push({path,options});return (routes[path]||(()=>Response.json({error:'Unavailable'},{status:503})))();};
 const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},sessionStorage={getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v)};
 const ctx={window:{OBI_API:{fetch:api}},document:{getElementById:$},location,history,localStorage,sessionStorage,crypto:webcrypto,TextEncoder,URL,URLSearchParams,Response,navigator:{clipboard:{writeText:async()=>{}}}};
 vm.runInNewContext(readFileSync(new URL('../'+script,import.meta.url),'utf8'),ctx); return {$,calls,redirects,session,location};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const access=()=>Response.json({authenticated:true,email:'reader@example.test',email_verified:true});
test('recipient submits a production code without putting the code in the URL',async()=>{const t=setup('assets/js/custom/bulk-redeem.js',{routes:{'/api/account/access':access,'/api/bulk/claim':()=>Response.json({session_id:'obi_'+'a'.repeat(32)})}});await settle();t.$('code').value='OBI-BULK-'+'A'.repeat(48);await t.$('bulk-form').events.submit({preventDefault(){}});assert.equal(t.calls.at(-1).path,'/api/bulk/claim');assert.ok(t.redirects[0].startsWith('reader.html?session_id=obi_'));assert.ok(!t.redirects[0].includes('OBI-BULK'));});
test('local 32-character test codes keep the existing endpoint',async()=>{const t=setup('assets/js/custom/bulk-redeem.js',{host:'127.0.0.1',port:'5514',routes:{'/api/account/access':access,'/api/bulk/local/redeem':()=>Response.json({session_id:'obi_'+'b'.repeat(32)})}});await settle();t.$('code').value='OBI-BULK-'+'A'.repeat(32);await t.$('bulk-form').events.submit({preventDefault(){}});assert.equal(t.calls.at(-1).path,'/api/bulk/local/redeem');});
test('confirmation removes provider parameters and requests the order for the signed-in buyer',async()=>{const id='bprod_'+'a'.repeat(32);const t=setup('assets/js/custom/bulk-confirmation.js',{search:'?order='+id+'&session_id=example',routes:{'/api/account/access':access,'/api/bulk/verify':()=>Response.json({status:'paid',quantity:20,code:'OBI-BULK-'+'A'.repeat(48)})}});await settle();await settle();assert.equal(t.location.search,'');assert.equal(t.session.get('obi-ism.pending-bulk-order'),id);assert.equal(t.$('code-panel').hidden,false);assert.equal(t.calls.at(-1).path,'/api/bulk/verify');});
test('buyer cannot be redirected to an untrusted checkout URL',async()=>{const t=setup('assets/js/custom/bulk-buy.js',{routes:{'/api/account/access':access,'/api/bulk':()=>Response.json({checkout_url:'https://example.test/steal'})}});await settle();t.$('quantity').value='20';t.$('gateway').value='stripe';await t.$('bulk-form').events.submit({preventDefault(){}});assert.equal(t.redirects.length,0);assert.match(t.$('message').textContent,/could not be verified/i);});
test('buyer reports a service error without falsely asking for sign-in',async()=>{const t=setup('assets/js/custom/bulk-buy.js');await settle();assert.match(t.$('auth-state').textContent,/cannot reach/i);assert.equal(t.$('sign-in').hidden,true);});
test('local preview displays pricing controls without enabling checkout',async()=>{const t=setup('assets/js/custom/bulk-buy.js',{host:'127.0.0.1',port:'5514',search:'?preview=1'});await settle();assert.equal(t.$('bulk-form').hidden,false);assert.equal(t.$('submit').disabled,true);assert.equal(t.calls.length,0);});
