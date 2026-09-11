// Service worker untuk Absensi Karyawan PWA
// Naikkan versi ini (v1 -> v2 -> ...) tiap kali update index.html biar cache lama dibuang otomatis
const CACHE_NAME = 'absensi-cache-v41';

const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './kreatif.html',
  './produksi.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Data absensi/leaderboard dari Apps Script HARUS selalu fresh, jangan pernah di-cache.
  if (url.includes('script.google.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // App shell & aset statis: NETWORK-FIRST (bukan cache-first lagi).
  // Sebelumnya cache-first bikin update kode gak langsung kepake — HP/app
  // selalu pakai versi lama yang tersimpan dulu, baru ambil yang baru
  // belakangan (kadang gak sempet kepake sama sekali sebelum halaman keburu
  // tampil). Buat app yang sesering ini diupdate, itu kebalik dari yang
  // dibutuhin. Sekarang: coba ambil dari server dulu tiap kali; cache cuma
  // jadi cadangan kalau internetnya mati (biar offline tetap jalan).
  event.respondWith(
    fetch(event.request).then((response) => {
      if (event.request.method === 'GET' && response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
