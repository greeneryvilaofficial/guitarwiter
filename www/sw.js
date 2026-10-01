// Service worker Guitarwiter: menyimpan file inti di cache supaya keyboard tetap bisa dimuat
// tanpa internet (WebView keyboard sering dibuka saat jaringan tidak aktif).

// Naikkan nomor versi setiap index.html berubah, supaya cache lama tidak nyangkut.
const CACHE_NAME = 'genjreng-ketik-cache-v12';
const CORE_ASSETS = ['index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Satu per satu + abaikan galat: cache.addAll() gagal TOTAL kalau satu aset saja hilang (404).
      Promise.all(CORE_ASSETS.map((url) => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Cache dulu, jaringan kalau tidak ada; saat offline minimal index.html tetap terbuka.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then(
      (cached) => cached || fetch(event.request).catch(() => caches.match('index.html'))
    )
  );
});
