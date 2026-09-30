// Service worker sederhana untuk Guitar Witer.
// Fungsinya: menyimpan file inti di cache supaya halaman tetap bisa
// dimuat walau tanpa koneksi internet (penting karena WebView keyboard
// akan sering dibuka tanpa jaringan aktif).

const CACHE_NAME = 'genjreng-ketik-cache-v8'; // dinaikkan supaya index.html baru (sinkron latensi + kick + jalur cepat + komit langsung) tidak nyangkut di cache lama
const CORE_ASSETS = [
  'index.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
];

// Saat pertama kali dipasang: simpan file inti ke cache.
self.addEventListener('install', (event) => {
  event.waitUntil(
    // Satu per satu + tangkap error: cache.addAll() gagal TOTAL kalau satu aset saja
    // hilang/404 (mis. icon belum ada), sehingga service worker tidak pernah terpasang.
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(CORE_ASSETS.map((url) => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

// Saat aktif: bersihkan cache versi lama kalau ada.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Strategi: coba ambil dari cache dulu, kalau tidak ada baru ke jaringan.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).catch(() => {
          // Kalau offline dan tidak ada di cache, minimal index.html tetap bisa dibuka.
          return caches.match('index.html');
        })
      );
    })
  );
});
