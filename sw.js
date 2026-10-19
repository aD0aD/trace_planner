/* Cache application assets only: map availability still depends on online tile providers. */
const CACHE='trace-planner-v3-20261019-sidebar-1';
const ASSETS=['./','index.html','Trace_planner.html','route-core.js','project-memory.js','planner.js','sidebar.js','planner.css','dem-core.js','dem-worker.js','terrain-layer.js','vendor/geotiff.js','vendor/leaflet.js','vendor/leaflet.css','vendor/jszip.min.js','assets/logo.png','vendor/images/layers.png','vendor/images/layers-2x.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('trace-planner-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||event.request.method!=='GET')return;
  // Network first for app updates; cached assets make subsequent offline visits possible.
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(event.request,copy)));}return response;}).catch(()=>caches.match(event.request)));
});
