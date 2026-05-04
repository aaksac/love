const CACHE_NAME = "biz-love-v16";
const CORE = [
  "./",
  "./index.html",
  "./app.js",
  "./dates.json",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./sw.js",
  "./music/song.mp3",
  "./assets/celebration-love-show.png"
];

function isVersionRequest(request){
  const url = new URL(request.url);
  return url.pathname.endsWith("/version.json");
}

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

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING"){
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (isVersionRequest(event.request)){
    event.respondWith(fetch(event.request, { cache:"no-store" }));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchAndCache = fetch(event.request).then((res) => {
        if (!res || res.status !== 200 || res.type === "opaque") return res;
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(event.request, copy)).catch(()=>{});
        return res;
      }).catch(() => cached);

      return cached || fetchAndCache;
    })
  );
});
