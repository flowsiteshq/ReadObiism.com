(() => {
  const noop = Object.freeze({ track() {} });
  if (navigator.globalPrivacyControl || navigator.doNotTrack === '1' || window.doNotTrack === '1' || !window.crypto?.getRandomValues) {
    window.OBI_ANALYTICS = noop; return;
  }
  const path=location.pathname;
  let page='';
  if(path==='/'||path==='/index.html')page='landing';
  else if(/^\/blog(?:\.html)?\/?$/.test(path))page='journal';
  else if(/^\/api\/blog\/post\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path))page='article:'+path.split('/').pop();
  else if(/^\/bulk(?:\.html)?\/?$/.test(path))page='bulk';
  else if(/^\/login(?:\.html)?\/?$/.test(path))page='sign_in';
  if(!page){window.OBI_ANALYTICS=noop;return}
  let memoryDay='',memoryId='';
  function visitor(){
    const day=new Date(Date.now()+3600000).toISOString().slice(0,10);
    if(memoryDay===day&&memoryId)return memoryId;
    try{const record=JSON.parse(localStorage.getItem('obi-ism.analytics-daily')||'null');if(record?.day===day&&/^[a-f0-9]{32}$/.test(record.id)){memoryDay=day;memoryId=record.id;return memoryId}}catch{}
    const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);memoryId=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');memoryDay=day;
    try{localStorage.setItem('obi-ism.analytics-daily',JSON.stringify({day,id:memoryId}))}catch{}
    return memoryId;
  }
  function track(event,details={}){
    if(!['page_view','checkout_attempt','checkout_opened'].includes(event))return;
    const currency=['NGN','USD'].includes(details.currency)?details.currency:'none';
    const mode=['self','gift','bulk'].includes(details.mode)?details.mode:'none';
    const payload=JSON.stringify({event,page,currency,mode,visitor:visitor()});
    try{fetch('/api/metrics/events',{method:'POST',headers:{'content-type':'application/json'},body:payload,credentials:'same-origin',keepalive:true}).catch(()=>{})}catch{}
  }
  window.OBI_ANALYTICS=Object.freeze({track});
  track('page_view');
})();