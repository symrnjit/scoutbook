// Scoutbook service worker
// - App shell & libraries: cached on install, served cache-first (page itself network-first so updates arrive)
// - Map tiles: cache-first, capped, so areas you've viewed work offline
// - Data APIs (place info, weather, Wikipedia): network-first, falling back to the last cached answer
const VERSION = 'scoutbook-v2';
const SHELL = `${VERSION}-shell`, TILES = `${VERSION}-tiles`, DATA = `${VERSION}-data`;
const SHELL_FILES = [
  './', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdn.jsdelivr.net/npm/suncalc@1.9.0/suncalc.js',
];
const TILE_HOSTS = ['tile.openstreetmap.org', 'server.arcgisonline.com', 'tile.opentopomap.org'];
const DATA_HOSTS = ['nominatim.openstreetmap.org', 'api.open-meteo.com', 'en.wikipedia.org', 'upload.wikimedia.org'];
const LIMITS = { [TILES]: 600, [DATA]: 150 };

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => Promise.all(SHELL_FILES.map(u =>
    c.add(new Request(u, { mode: u.startsWith('http') ? 'no-cors' : 'same-origin' })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trim(name) {
  const c = await caches.open(name), keys = await c.keys(), max = LIMITS[name];
  if (max && keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map(k => c.delete(k)));
}
async function cacheFirst(req, name) {
  const hit = await caches.match(req); if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') { const c = await caches.open(name); c.put(req, res.clone()).then(() => trim(name)); }
  return res;
}
async function networkFirst(req, name) {
  try {
    const res = await fetch(req);
    if (res.ok) { const c = await caches.open(name); c.put(req, res.clone()).then(() => trim(name)); }
    return res;
  } catch (err) {
    const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    if (req.mode === 'navigate') { const shell = await caches.match('./index.html'); if (shell) return shell; }
    throw err;
  }
}

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' || (url.origin === location.origin && /\/(index\.html)?$/.test(url.pathname))) return e.respondWith(networkFirst(req, SHELL));
  if (url.origin === location.origin || SHELL_FILES.includes(req.url)) return e.respondWith(cacheFirst(req, SHELL));
  if (TILE_HOSTS.some(h => url.hostname.endsWith(h))) return e.respondWith(cacheFirst(req, TILES));
  if (DATA_HOSTS.some(h => url.hostname.endsWith(h))) return e.respondWith(networkFirst(req, DATA));
});
