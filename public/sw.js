const CACHE = "igor-servis-shell-v2";
const APP_SHELL = ["/Igor-servis/", "/Igor-servis/index.html", "/Igor-servis/manifest.webmanifest", "/Igor-servis/favicon.svg"];

function cacheableStaticRequest(request, url) {
  if (url.origin !== self.location.origin) return false;
  if (!url.pathname.startsWith("/Igor-servis/")) return false;
  return (
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "image" ||
    request.destination === "font" ||
    url.pathname === "/Igor-servis/manifest.webmanifest" ||
    url.pathname === "/Igor-servis/favicon.svg"
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put("/Igor-servis/index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match("/Igor-servis/index.html")),
    );
    return;
  }

  if (!cacheableStaticRequest(request, url)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
