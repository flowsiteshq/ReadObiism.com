import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('editor automatically uploads a selected image and sends the scheduled time in UTC',async()=>{
 const source=await readFile(new URL('../../assets/js/custom/blog-admin-scheduling-20261120.js',import.meta.url),'utf8'),elements=new Map(),calls=[];
 function element(id){if(!elements.has(id))elements.set(id,{id,value:'',files:[],events:{},hidden:false,dataset:{},textContent:'',innerHTML:'',disabled:false,addEventListener(type,fn){this.events[type]=fn},removeAttribute(){},setAttribute(){},querySelectorAll(){return []},reset(){},focus(){}});return elements.get(id)}
 const document={getElementById:element,querySelectorAll:()=>[]};
 const post={id:'blog_aaaaaaaaaaaaaaaaaaaaaaaa',slug:'story',title:'Story',excerpt:'Summary',body:'Text',author:'OBI-ISM',status:'scheduled',published_at:'2034-05-06T12:00:00.000Z',updated_at:'2034-01-01T00:00:00.000Z',image_url:'https://readobiism.com/api/blog/image/img_a'};
 const fetch=async(path,options={})=>{const body=options.body?JSON.parse(options.body):null;if(body)calls.push(body);const result=body?.action==='upload-image'?{url:post.image_url}:body?{id:post.id,status:body.status}:{items:[post]};return {ok:true,status:200,json:async()=>result}};
 const win={OBI_API:{fetch},scrollTo(){}};class Reader{readAsDataURL(){this.result='data:image/png;base64,AAA';this.onload()}}
 const URLStub={createObjectURL:()=> 'blob:test',revokeObjectURL(){}};
 vm.runInNewContext(source,{window:win,document,location:{},Intl,Date,Number,String,Boolean,Object,JSON,URL:URLStub,FileReader:Reader,console});
 await new Promise(resolve=>setImmediate(resolve));
 const file={type:'image/png',size:100};element('post-upload').files=[file];element('post-upload').events.change();
 element('post-title').value='Story';element('post-slug').value='story';element('post-excerpt').value='Summary';element('post-body').value='Text';element('post-author').value='OBI-ISM';element('post-schedule').value='2034-05-06T12:00';
 await element('blog-form').events.submit({preventDefault(){},submitter:{value:'scheduled'}});
 assert.equal(calls[0].action,'upload-image');assert.equal(calls[1].status,'scheduled');assert.equal(calls[1].image_url,post.image_url);assert.equal(calls[1].scheduled_at,new Date('2034-05-06T12:00').toISOString());
 assert.match(element('blog-notice').textContent,/scheduled/i);
});