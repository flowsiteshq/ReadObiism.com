(() => {
 const container=document.getElementById('blog-list')||document.getElementById('landing-blog-list');
 if(!container)return;
 const landing=container.id==='landing-blog-list', section=document.getElementById('landing-blog'), prev=document.getElementById('blog-prev'), next=document.getElementById('blog-next');let page=1;
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function load(){container.innerHTML='<p class="blog-message">Loading stories…</p>';try{
  const response=await window.OBI_API.fetch('/api/blog/posts?limit='+(landing?3:9)+'&page='+page,{cache:'no-store'});if(!response.ok)throw new Error('Stories are temporarily unavailable. Please try again later.');
  const data=await response.json();if(landing&&!data.items.length){section.hidden=true;return}if(section)section.hidden=false;
  container.innerHTML=data.items.map(p=>{const path='/api/blog/post/'+encodeURIComponent(p.slug),img=p.image_url?'<img src="'+escape(p.image_url)+'" alt="" loading="lazy">':'<div class="blog-card-placeholder" aria-hidden="true"></div>';return '<article class="blog-card">'+img+'<div class="blog-card-content"><p class="blog-meta">'+escape(p.author)+' · '+escape((p.published_at||'').slice(0,10))+'</p><h3><a href="'+path+'">'+escape(p.title)+'</a></h3><p>'+escape(p.excerpt)+'</p><a class="blog-read" href="'+path+'">READ STORY →</a></div></article>'}).join('')||'<p class="blog-message">No stories have been published yet. Please check back soon.</p>';
  if(prev)prev.disabled=page===1;if(next)next.disabled=!data.hasMore;
 }catch(e){container.innerHTML='<p class="blog-message"></p>';container.firstChild.textContent=e.message;if(section)section.hidden=false;if(prev)prev.disabled=true;if(next)next.disabled=true}}
 if(prev)prev.onclick=()=>{if(page>1){page--;load()}};if(next)next.onclick=()=>{page++;load()};load();
})();