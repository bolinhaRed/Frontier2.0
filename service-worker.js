// Service Worker: guarda tudo em cache para jogar offline.
// Muda a versão sempre que publicares alterações, para os jogadores receberem a nova versão.
const CACHE = 'frontier-v0.2.0';
const FILES = [
  './',
  './assets/atlas/atlas.json',
  './assets/atlas/deadlands.webp',
  './assets/atlas/drylands.webp',
  './assets/atlas/greenlands.webp',
  './assets/atlas/icelands.webp',
  './assets/atlas/sandlands.webp',
  './assets/atlas/sketch.webp',
  './assets/atlas/vignette-desert.webp',
  './assets/atlas/vignette-forest.webp',
  './assets/atlas/vignette-mountain.webp',
  './assets/atlas/vignette-tundra.webp',
  './assets/fonts/alegreya-latin-400-italic.woff2',
  './assets/fonts/alegreya-latin-400-normal.woff2',
  './assets/fonts/alegreya-latin-600-normal.woff2',
  './assets/fonts/alegreya-latin-700-normal.woff2',
  './assets/fonts/im-fell-english-sc-latin-400-normal.woff2',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/ui/credit_cmartins_ccby.png',
  './css/interface.css',
  './css/map.css',
  './css/style.css',
  './index.html',
  './js/assets.js',
  './js/audio.js',
  './js/data.js',
  './js/discoveries.js',
  './js/events.js',
  './js/exploration.js',
  './js/game.js',
  './js/hex-coordinates.js',
  './js/main.js',
  './js/map-engine.js',
  './js/map-generator.js',
  './js/modes.js',
  './js/resources.js',
  './js/rng.js',
  './js/save-system.js',
  './js/ui.js',
  './manifest.json',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok && new URL(e.request.url).origin === location.origin) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match('./index.html'))));
});
