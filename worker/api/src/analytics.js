const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const events=new Set(['page_view','checkout_attempt','checkout_opened']);
const pages=new Set(['landing','journal','article','bulk','sign_in']);
const currencies=new Set(['NGN','USD','none']);
const modes=new Set(['self','gift','bulk','none']);
const initialized=new WeakSet();
let lastTrimDay="";
async function ensure(db){
 if(initialized.has(db))return;
 await db.prepare("CREATE TABLE IF NOT EXISTS analytics_counts (day TEXT NOT NULL,event TEXT NOT NULL,page TEXT NOT NULL,currency TEXT NOT NULL,mode TEXT NOT NULL,total INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,event,page,currency,mode))").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS analytics_visitors (day TEXT NOT NULL,visitor TEXT NOT NULL,PRIMARY KEY(day,visitor))").run();
 initialized.add(db);
}
const lagosDay=(date=new Date())=>new Date(date.getTime()+3600000).toISOString().slice(0,10);
export async function recordAnalytics(request,env){
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Origin not allowed'},403);
 if(!(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return json({error:'Invalid request'},400);
 if(Number(request.headers.get('content-length')||0)>1024)return json({error:'Request too large'},413);
 const raw=await request.text();if(raw.length>1024)return json({error:'Request too large'},413);
 let data;try{data=JSON.parse(raw)}catch{return json({error:'Invalid request'},400)}
 if(!data||!events.has(data.event)||!(pages.has(data.page)||(typeof data.page==='string'&&data.page.length<=130&&/^article:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.page)))||!currencies.has(data.currency)||!modes.has(data.mode)||!/^[a-f0-9]{32}$/.test(data.visitor||''))return json({error:'Invalid event'},400);
 if(request.headers.get('sec-gpc')==='1'||request.headers.get('dnt')==='1'||request.cf?.botManagement?.verifiedBot||/bot|crawler|spider|headlesschrome/i.test(request.headers.get('user-agent')||''))return new Response(null,{status:204});
 const db=env.OBI_DB;await ensure(db);const day=lagosDay();
 await db.prepare('INSERT INTO analytics_counts(day,event,page,currency,mode,total) VALUES (?,?,?,?,?,1) ON CONFLICT(day,event,page,currency,mode) DO UPDATE SET total=total+1').bind(day,data.event,data.page,data.currency,data.mode).run();
 if(data.event==='page_view')await db.prepare('INSERT OR IGNORE INTO analytics_visitors(day,visitor) VALUES (?,?)').bind(day,data.visitor).run();
 if(lastTrimDay!==day){try{const cutoff=lagosDay(new Date(Date.now()-90*86400000));await db.prepare('DELETE FROM analytics_counts WHERE day<=?').bind(cutoff).run();await db.prepare('DELETE FROM analytics_visitors WHERE day<=?').bind(cutoff).run();lastTrimDay=day}catch{}}
 return new Response(null,{status:204,headers:{'cache-control':'no-store'}});
}
export async function analyticsSummary(env){
 const db=env.OBI_DB;await ensure(db);const today=lagosDay(),start=lagosDay(new Date(Date.now()-29*86400000));
 const totals=await db.prepare("SELECT day,event,SUM(total) AS total FROM analytics_counts WHERE day>=? AND day<=? GROUP BY day,event ORDER BY day").bind(start,today).all();
 const visitors=await db.prepare('SELECT day,COUNT(*) AS total FROM analytics_visitors WHERE day>=? AND day<=? GROUP BY day ORDER BY day').bind(start,today).all();
 const breakdown=await db.prepare("SELECT page,event,SUM(total) AS total FROM analytics_counts WHERE day>=? AND day<=? GROUP BY page,event ORDER BY total DESC").bind(start,today).all();
 const gateways=await db.prepare("SELECT currency,mode,event,SUM(total) AS total FROM analytics_counts WHERE day>=? AND day<=? AND event IN ('checkout_attempt','checkout_opened') GROUP BY currency,mode,event ORDER BY total DESC").bind(start,today).all();
 return json({today,start,days:totals.results,visitors:visitors.results,breakdown:breakdown.results,gateways:gateways.results,timezone:'Africa/Lagos',retentionDays:90});
}