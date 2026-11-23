import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const root=new URL('../../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
test('journal and analytics pages include the full admin shell and current navigation',async()=>{
 for(const [file,active] of [['admin/blog.html','blog'],['admin/analytics.html','analytics']]){
  const html=await read(file);
  assert.match(html,/<aside class="sidebar" id="navigation"/);
  assert.match(html,new RegExp('class="nav-link active" aria-current="page" href="/admin/'+active+'\\.html"'));
  assert.match(html,/href="\/admin\/#readers"/);
  assert.match(html,/class="menu-button"/);
  assert.match(html,/id="sign-out"/);
  assert.match(html,/class="[^"]*auth-pending"/);
  assert.doesNotMatch(html,/← Admin dashboard<\/a><\/header>/);
 }
 const analytics=await read('admin/analytics.html');
 assert.match(analytics,/<details class="daily-breakdown">/);
 assert.match(analytics,/id="analytics-days"/);
});
function element(){return {events:{},attrs:{},hidden:false,inert:false,textContent:'',addEventListener(type,fn){this.events[type]=fn},setAttribute(key,value){this.attrs[key]=value},getAttribute(key){return this.attrs[key]},focus(){this.focused=true},querySelector(){return this.child||(this.child=element())}}}
function fixture(response,mobileInitially=false){
 const ids=new Map();const get=id=>{if(!ids.has(id))ids.set(id,element());return ids.get(id)};
 const classes=new Set(['auth-pending']);
 const classList={add:(...names)=>names.forEach(n=>classes.add(n)),remove:(...names)=>names.forEach(n=>classes.delete(n)),contains:n=>classes.has(n),toggle(n){if(classes.has(n)){classes.delete(n);return false}classes.add(n);return true}};
 const menu=element(),backdrop=element(),close=element(),events={};
 const document={body:{classList},getElementById:get,querySelector(selector){return selector==='.menu-button'?menu:selector==='.sidebar-backdrop'?backdrop:close},addEventListener(type,fn){events[type]=fn}};
 const media={matches:mobileInitially,addEventListener(type,fn){this.change=fn}};
 const location={protocol:'https:',hostname:'readobiism.com',replace(path){this.redirect=path}};
 const window={OBI_API:{fetch:async(path,options)=>{if(path==='/api/admin/session')return response;if(path==='/api/admin/logout')return {ok:true};throw Error('Unexpected request')}}};
 return {document,media,location,window,get,menu,backdrop,close,classes,events};
}
test('admin shell authenticates and supports desktop and mobile sidebar controls',async()=>{
 const script=await read('assets/js/custom/admin-subpage-shell-20261123.js');
 const f=fixture({ok:true,status:200,json:async()=>({authenticated:true})});
 vm.runInNewContext(script,{...f,matchMedia:()=>f.media});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.classes.has('auth-pending'),false);
 assert.equal(f.menu.attrs['aria-expanded'],'true');
 f.menu.events.click();assert.equal(f.menu.attrs['aria-expanded'],'false');assert.equal(f.get('navigation').inert,true);
 f.menu.events.click();assert.equal(f.menu.attrs['aria-expanded'],'true');
 f.media.matches=true;f.media.change();assert.equal(f.menu.attrs['aria-expanded'],'false');
 f.menu.events.click();assert.equal(f.classes.has('menu-open'),true);
 f.events.keydown({key:'Escape'});assert.equal(f.classes.has('menu-open'),false);assert.equal(f.menu.focused,true);
 await f.get('sign-out').events.click();assert.equal(f.location.redirect,'/admin/login.html');
});
test('admin shell redirects anonymous sessions and offers retry on network failure',async()=>{
 const script=await read('assets/js/custom/admin-subpage-shell-20261123.js');
 const anonymous=fixture({ok:false,status:401});
 vm.runInNewContext(script,{...anonymous,matchMedia:()=>anonymous.media});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(anonymous.location.redirect,'/admin/login.html');assert.equal(anonymous.classes.has('auth-pending'),true);
 const offline=fixture(null);offline.window.OBI_API.fetch=async()=>{throw Error('offline')};
 vm.runInNewContext(script,{...offline,matchMedia:()=>offline.media});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(offline.get('auth-feedback').hidden,false);assert.equal(offline.classes.has('auth-pending'),true);
});