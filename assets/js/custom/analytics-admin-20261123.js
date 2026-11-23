(() => {
 const $=id=>document.getElementById(id);let chart;
 function cell(row,value){const td=document.createElement('td');td.textContent=String(value);row.append(td)}
 function empty(tbody,colspan,text){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=colspan;td.textContent=text;tr.append(td);tbody.append(tr)}
 const number=value=>Number.isFinite(Number(value))?Number(value):0;
 const label=value=>value==='landing'?'Landing page':value==='journal'?'Journal listing':value==='bulk'?'Bulk orders':value==='sign_in'?'Sign in':value.startsWith('article:')?'Article: '+value.slice(8).replace(/-/g,' '):value;
 function render(data){
  const eventMap=new Map((data.days||[]).map(row=>[row.day+'|'+row.event,number(row.total)]));
  const visitorMap=new Map((data.visitors||[]).map(row=>[row.day,number(row.total)]));
  const days=Array.from({length:30},(_,i)=>{const d=new Date(data.today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-29+i);return d.toISOString().slice(0,10)});
  const count=(day,event)=>eventMap.get(day+'|'+event)||0;
  $('metric-visitors').textContent=visitorMap.get(data.today)||0;
  $('metric-views').textContent=count(data.today,'page_view');
  $('metric-attempts').textContent=count(data.today,'checkout_attempt');
  $('metric-opened').textContent=count(data.today,'checkout_opened');
  const table=$('analytics-days');table.replaceChildren();
  days.slice().reverse().forEach(day=>{const tr=document.createElement('tr');[day,visitorMap.get(day)||0,count(day,'page_view'),count(day,'checkout_attempt'),count(day,'checkout_opened')].forEach(v=>cell(tr,v));table.append(tr)});
  if(window.Chart){chart?.destroy();chart=new window.Chart($('analytics-chart'),{type:'line',data:{labels:days,datasets:[{label:'Browsers',data:days.map(d=>visitorMap.get(d)||0),borderColor:'#b58b2a',backgroundColor:'#b58b2a',tension:.25},{label:'Page views',data:days.map(d=>count(d,'page_view')),borderColor:'#274b70',backgroundColor:'#274b70',tension:.25},{label:'Attempts',data:days.map(d=>count(d,'checkout_attempt')),borderColor:'#9e6546',backgroundColor:'#9e6546',tension:.25},{label:'Handoffs',data:days.map(d=>count(d,'checkout_opened')),borderColor:'#348269',backgroundColor:'#348269',tension:.25}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{y:{beginAtZero:true,ticks:{precision:0}},x:{ticks:{maxTicksLimit:6}}}}})}
  const pages=$('analytics-pages');pages.replaceChildren();const rows=(data.breakdown||[]).filter(row=>row.event==='page_view');if(!rows.length)empty(pages,2,'No page views recorded yet.');rows.forEach(item=>{const tr=document.createElement('tr');cell(tr,label(item.page));cell(tr,number(item.total));pages.append(tr)});
  const gateways=$('analytics-gateways');gateways.replaceChildren();const groups=new Map();(data.gateways||[]).forEach(row=>{const key=row.currency+' / '+row.mode;const values=groups.get(key)||{attempts:0,opened:0};if(row.event==='checkout_attempt')values.attempts+=number(row.total);if(row.event==='checkout_opened')values.opened+=number(row.total);groups.set(key,values)});if(!groups.size)empty(gateways,3,'No checkout activity recorded yet.');groups.forEach((v,key)=>{const tr=document.createElement('tr');cell(tr,key);cell(tr,v.attempts);cell(tr,v.opened);gateways.append(tr)});
 }
 async function load(){const error=$('analytics-error'),refresh=$('analytics-refresh');error.hidden=true;refresh.disabled=true;try{const response=await window.OBI_API.fetch('/api/admin/analytics',{cache:'no-store'});if(response.status===401){location.replace('/admin/login.html');return}const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load analytics.');render(data)}catch(e){error.textContent=e.message||'Could not load analytics.';error.hidden=false}finally{refresh.disabled=false}}
 $('analytics-refresh').addEventListener('click',load);void load();
})();