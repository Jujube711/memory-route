const CACHE = 'memory-route-v7';
const SHELL = ['./', './index.html', './manager.html', './config.js?v=7', './cloud-sync.js?v=7', './manifest.webmanifest', './assets/app-icon.svg', './assets/app-icon-192.png', './assets/app-icon-512.png', './assets/app-icon-maskable-512.png', './assets/apple-touch-icon.png', './assets/supabase.min.js?v=7'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  if (event.request.mode === 'navigate' || /(?:index|manager)\.html$|config\.js$|cloud-sync\.js$/.test(url.pathname)) {
    event.respondWith(fetch(event.request).then(response => { const copy=response.clone(); caches.open(CACHE).then(cache=>cache.put(event.request,copy)); return response; }).catch(() => caches.match(event.request).then(hit => hit || caches.match('./index.html'))));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(response => { const copy=response.clone(); caches.open(CACHE).then(cache=>cache.put(event.request,copy)); return response; })));
});
