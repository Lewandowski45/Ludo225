const C='ludo225-v41';
const CORE=['./','index.html','manifest.json','icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png','img/didib.webp','img/elown.webp','img/himra.webp','img/suspect95.webp','sfx/himra-out.mp3','sfx/himra-cap.mp3','sfx/himra-abri.mp3','sfx/himra-fin.mp3','sfx/didib-out.mp3','sfx/didib-cap.mp3','sfx/didib-abri.mp3','sfx/didib-fin.mp3','sfx/suspect95-out.mp3','sfx/suspect95-cap.mp3','sfx/suspect95-abri.mp3','sfx/suspect95-fin.mp3','sfx/elown-out.mp3','sfx/elown-cap.mp3','sfx/elown-abri.mp3','sfx/elown-fin.mp3','https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>Promise.all(CORE.map(u=>c.add(new Request(u,{mode:u.startsWith('http')?'no-cors':'same-origin'})).catch(()=>{})))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);
  if(u.hostname.endsWith('supabase.co')||u.protocol==='wss:')return;
  if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put('index.html',cp));return r;}).catch(()=>caches.match('index.html')));return;}
  e.respondWith(caches.match(e.request).then(h=>h||fetch(e.request).then(r=>{if(r.ok||r.type==='opaque'){const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));}return r;}).catch(()=>h)));});
