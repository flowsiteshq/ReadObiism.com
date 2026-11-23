import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const root=new URL('../../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
function storage(){const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)}}
test('sign-in checkout return accepts only article paths',async()=>{
 const source=await read('assets/js/custom/obi-api-checkout-20261119.js'),sessionStorage=storage(),localStorage=storage();
 const context={window:{},location:{protocol:'https:',hostname:'readobiism.com',port:''},sessionStorage,localStorage,fetch(){}};
 vm.runInNewContext(source,context);
 assert.equal(context.window.OBI_API.checkoutDestination(),'/?checkout=continue#edition');
 sessionStorage.setItem('obi-ism.checkout-return','/api/blog/post/example-story');
 assert.equal(context.window.OBI_API.checkoutDestination(),'/api/blog/post/example-story?checkout=continue#edition');
 for(const bad of ['//evil.test','/api/blog/post/../admin','/api/blog/post/example?next=https://evil.test']){sessionStorage.setItem('obi-ism.checkout-return',bad);assert.equal(context.window.OBI_API.checkoutDestination(),'/?checkout=continue#edition')}
});
test('article checkout starts without hero controls and returns to article after sign-in',async()=>{
 const source=await read('assets/js/custom/landing-analytics-20261123.js'),sessionStorage=storage(),localStorage=storage(),elements=new Map();
 function element(id){if(!elements.has(id))elements.set(id,{id,value:'',hidden:false,disabled:false,textContent:'',innerHTML:'',events:{},setAttribute(){},addEventListener(type,fn){this.events[type]=fn},focus(){},scrollIntoView(){},replaceChildren(){},append(){}});return elements.get(id)}
 const missing=new Set(['hero-video','motion-control','preface-nav-link','account-link','edition-link','hero-book-link','signed-in-note','hero-price']);
 const document={getElementById:id=>missing.has(id)?null:element(id),querySelector:()=>null,createElement:()=>element('created')};
 const fetch=async path=>{if(path.startsWith('/api/paystack/quote'))return {ok:true,json:async()=>({total_minor:699500,subtotal_minor:699500,fee_minor:0,unit_minor:699500})};if(path==='/api/pricing')return {ok:true,json:async()=>({})};if(path==='/api/features')return {ok:true,json:async()=>({features:{single_purchase:true,gift_purchase:true}})};return {ok:false,status:401,json:async()=>({})}};
 const location={search:'',pathname:'/api/blog/post/example-story',hostname:'readobiism.com',port:'',assign:value=>{location.assigned=value}};
 const window={matchMedia:()=>({matches:false}),OBI_API:{fetch},OBI_ANALYTICS:{track(){throw new Error('analytics unavailable')}},confirm:()=>false};const context={window,document,location,navigator:{},sessionStorage,localStorage,crypto:{getRandomValues:bytes=>bytes},URLSearchParams,Intl,Number,Boolean,String,JSON,console};
 vm.runInNewContext(source,context);await new Promise(resolve=>setImmediate(resolve));element('purchase-email').value='reader@example.com';await element('buy-edition').events.click();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(location.assigned,'/login?next=checkout');assert.equal(sessionStorage.getItem('obi-ism.checkout-return'),'/api/blog/post/example-story');assert.equal(JSON.parse(sessionStorage.getItem('obi-ism.checkout-draft')).email,'reader@example.com');
});
test('article purchase uses existing Paystack and Stripe checkout paths',async()=>{
 const source=await read('assets/js/custom/landing-analytics-20261123.js');
 for(const currency of ['NGN','USD']){
  const sessionStorage=storage(),localStorage=storage(),elements=new Map(),requests=[];
  function element(id){if(!elements.has(id))elements.set(id,{value:'',hidden:false,disabled:false,textContent:'',innerHTML:'',events:{},setAttribute(){},addEventListener(type,fn){this.events[type]=fn},focus(){},scrollIntoView(){},replaceChildren(){},append(){}});return elements.get(id)}
  const absent=new Set(['hero-video','motion-control','preface-nav-link','account-link','edition-link','hero-book-link','signed-in-note','hero-price']);
  const document={getElementById:id=>absent.has(id)?null:element(id),querySelector:()=>null,createElement:()=>element('created')};
  const fetch=async(path,options={})=>{if(path.startsWith('/api/paystack/quote'))return {ok:true,json:async()=>({total_minor:719993,subtotal_minor:699500,fee_minor:20493,unit_minor:699500})};if(path==='/api/pricing')return {ok:true,json:async()=>({})};if(path==='/api/features')return {ok:true,json:async()=>({features:{single_purchase:true,gift_purchase:true}})};if(path==='/api/account/access')return {ok:true,status:200,json:async()=>({authenticated:true,email:'reader@example.com'})};if(path==='/api/checkout'){requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({url:'https://checkout.example.test/',sessionId:'obi_abcdefghijklmnop'})}};throw new Error('Unexpected endpoint '+path)};
  const location={search:'',pathname:'/api/blog/post/example-story',hostname:'readobiism.com',port:'',assign:value=>{location.assigned=value}};
  const window={matchMedia:()=>({matches:false}),OBI_API:{fetch},OBI_ANALYTICS:{track(){throw new Error('analytics unavailable')}},confirm:()=>false};
  vm.runInNewContext(source,{window,document,location,navigator:{},sessionStorage,localStorage,crypto:{getRandomValues:bytes=>bytes},URLSearchParams,Intl,Number,Boolean,String,JSON,console});
  await new Promise(resolve=>setImmediate(resolve));element('purchase-email').value='reader@example.com';
  if(currency==='USD')element('currency-usd').events.click();
  await element('buy-edition').events.click();await new Promise(resolve=>setImmediate(resolve));
  if(currency==='NGN'){assert.equal(requests.length,0);assert.equal(element('purchase-warning').hidden,false);element('purchase-warning-confirm').events.click();await new Promise(resolve=>setImmediate(resolve))}
  assert.equal(requests.length,1);assert.equal(requests[0].currency,currency);assert.equal(requests[0].email,'reader@example.com');
  if(currency==='NGN')assert.equal(requests[0].quoted_total_minor,719993);else assert.equal(requests[0].quoted_total_minor,undefined);
  assert.equal(location.assigned,'https://checkout.example.test/');
 }
});