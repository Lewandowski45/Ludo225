const C='ludo225-v80';
const M='ludo225-music',D='ludo225-data'; /* morceaux d'accueil gardés d'une version à l'autre */
const CORE=['./','index.html','manifest.json','icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png','img/didib.webp','img/elown.webp','img/himra.webp','img/suspect95.webp','img/signature.webp','sfx/himra-out.mp3','sfx/himra-cap.mp3','sfx/himra-abri.mp3','sfx/himra-fin.mp3','sfx/didib-out.mp3','sfx/didib-cap.mp3','sfx/didib-abri.mp3','sfx/didib-fin.mp3','sfx/suspect95-out.mp3','sfx/suspect95-cap.mp3','sfx/suspect95-abri.mp3','sfx/suspect95-fin.mp3','sfx/elown-out.mp3','sfx/elown-cap.mp3','sfx/elown-abri.mp3','sfx/elown-fin.mp3','https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>Promise.all(CORE.map(u=>c.add(new Request(u,{mode:u.startsWith('http')?'no-cors':'same-origin'})).catch(()=>{})))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C&&x!==M&&x!==D).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
/* Réponse partielle (206) à partir du cache : certains lecteurs audio Android l'exigent */
async function ranged(req,res){const m=/bytes=(\d*)-(\d*)/.exec(req.headers.get('range')||'');if(!m)return res;
  const b=await res.arrayBuffer(),n=b.byteLength,s=m[1]?+m[1]:Math.max(0,n-(+m[2]||0)),e=m[1]&&m[2]?Math.min(+m[2],n-1):n-1;
  if(s>=n)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${n}`}});
  return new Response(b.slice(s,e+1),{status:206,headers:{'Content-Type':res.headers.get('Content-Type')||'audio/mpeg','Content-Range':`bytes ${s}-${e}/${n}`,'Content-Length':String(e-s+1),'Accept-Ranges':'bytes'}});}
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);
  if(u.hostname.endsWith('supabase.co')||u.protocol==='wss:')return;
  /* morceaux d'accueil : depuis le téléphone s'ils sont déjà gardés, sinon streaming par le réseau */
  if(u.origin===location.origin&&u.pathname.includes('/music/')){e.respondWith(caches.match(e.request.url).then(h=>h?ranged(e.request,h):fetch(e.request)).catch(()=>fetch(e.request)));return;}
  if(e.request.mode==='navigate'&&!/^\/(index\.html)?$/.test(u.pathname))return; /* autres pages (ex. /android) : réseau direct */
  if(u.pathname.startsWith('/dl/'))return;
  if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put('index.html',cp));return r;}).catch(()=>caches.match('index.html')));return;}
  if(e.request.headers.has('range')){e.respondWith(caches.match(e.request.url).then(h=>h?ranged(e.request,h):fetch(e.request)));return;}
  e.respondWith(caches.match(e.request).then(h=>h||fetch(e.request).then(r=>{if(r.ok&&r.status===200||r.type==='opaque'){const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));}return r;}).catch(()=>h)));});
