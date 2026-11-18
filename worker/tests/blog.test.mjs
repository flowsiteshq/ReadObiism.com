import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../dashboard-worker.js';
import { renderBody } from '../api/src/blog.js';
function database(){const raw=new DatabaseSync(':memory:');return {exec:async sql=>raw.exec(sql),prepare(sql){const q={args:[],bind(...args){q.args=args;return q},first:async()=>raw.prepare(sql).get(...q.args)||null,all:async()=>({results:raw.prepare(sql).all(...q.args)}),run:async()=>({meta:{changes:Number(raw.prepare(sql).run(...q.args).changes)}})};return q}}}
const req=(path,init={})=>new Request('https://readobiism.com'+path,init);
const data={title:'A story of character',slug:'story-of-character',excerpt:'Ideas for a better society.',body:'## Leadership\n\n**Character** matters.\n\n<script>alert(1)</script>',author:'OBI-ISM',image_url:'https://readobiism.com/readobiism-meta.jpeg',status:'draft'};
test('only admins publish, drafts stay private and article metadata is rendered for crawlers',async()=>{
 const env={OBI_DB:database(),OBI_ADMIN_EMAIL:'admin@example.test',OBI_ADMIN_PASSWORD:'a'.repeat(32)};
 const anon=await worker.fetch(req('/api/admin/blog'),env);assert.equal(anon.status,401);
 const login=await worker.fetch(req('/api/admin/login',{method:'POST',headers:{origin:'https://readobiism.com','content-type':'application/json'},body:JSON.stringify({email:env.OBI_ADMIN_EMAIL,password:env.OBI_ADMIN_PASSWORD})}),env);assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const save=(body,origin='https://readobiism.com')=>worker.fetch(req('/api/admin/blog',{method:'POST',headers:{origin,'content-type':'application/json',cookie},body:JSON.stringify(body)}),env);
 assert.equal((await save(data,'https://evil.test')).status,403);
 const png='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64');
 const upload=await save({action:'upload-image',data:png});assert.equal(upload.status,200);const image=await upload.json();assert.match(image.url,/\/api\/blog\/image\/img_/);
 const imageResponse=await worker.fetch(new Request(image.url),env);assert.equal(imageResponse.status,200);assert.equal(imageResponse.headers.get('content-type'),'image/png');assert.equal((await imageResponse.arrayBuffer()).byteLength,12);
 assert.equal((await save({action:'upload-image',data:'data:image/png;base64,'+Buffer.from('not-a-real-image').toString('base64')})).status,400);
 const saved=await save(data);assert.equal(saved.status,200);const item=await saved.json();
 assert.equal((await worker.fetch(req('/api/blog/post/story-of-character'),env)).status,404);
 assert.equal((await (await worker.fetch(req('/api/blog/posts'),env)).json()).items.length,0);
 assert.equal((await save({...data,id:item.id,status:'published'})).status,200);
 const post=await worker.fetch(req('/api/blog/post/story-of-character'),env);assert.equal(post.status,200);const html=await post.text();
 assert.match(html,/og:title.*A story of character/);assert.match(html,/og:image.*readobiism-meta/);assert.match(html,/<strong>Character<\/strong>/);assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
 assert.equal((await (await worker.fetch(req('/api/blog/posts'),env)).json()).items.length,1);
 assert.match(await (await worker.fetch(req('/api/blog/sitemap.xml'),env)).text(),/story-of-character/);
 assert.equal((await save({...data,id:item.id,slug:'new-name',status:'published'})).status,400);
 assert.equal((await save({...data,id:item.id,status:'draft'})).status,200);
 assert.equal((await worker.fetch(req('/api/blog/post/story-of-character'),env)).status,404);
});
test('existing HTML articles render paragraphs and lists while stripping unsafe markup',()=>{
 const body='<h2>Character</h2><p>OBI&ndash;ISM and <strong>trust</strong>.</p><ul><li>Honesty</li><li>Service</li></ul><ol><li>First</li><li>Second</li></ol><p><a href="javascript:alert(1)" onclick="alert(1)">Unsafe</a> <a href="https://readobiism.com/">Safe</a></p><script>alert(1)</script><img src=x onerror=alert(1)>';
 const result=renderBody(body);
 assert.match(result,/<h2>Character<\/h2>/);
 assert.match(result,/<p>OBI&ndash;ISM and <strong>trust<\/strong>\.<\/p>/);
 assert.match(result,/<ul><li>Honesty<\/li><li>Service<\/li><\/ul>/);
 assert.match(result,/<ol><li>First<\/li><li>Second<\/li><\/ol>/);
 assert.match(result,/<a>Unsafe<\/a>/);
 assert.match(result,/<a href="https:\/\/readobiism.com\/" rel="noopener noreferrer">Safe<\/a>/);
 assert.doesNotMatch(result,/javascript:|onclick|onerror|<script|<img/i);
});
test('markdown ordered lists remain formatted',()=>{
 assert.equal(renderBody('1. First\n2. Second'),'<ol><li>First</li><li>Second</li></ol>');
});