const CACHE_NAME = "biz-love-v1";
const CORE = [
  "./",
  "./index.html",
  "./app.js",
  "./dates.json",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./sw.js",
  "./music/love.mp3"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchAndCache = fetch(event.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(event.request, copy)).catch(()=>{});
        return res;
      }).catch(() => cached);

      return cached || fetchAndCache;
    })
  );
});
