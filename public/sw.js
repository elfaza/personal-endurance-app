const CACHE = "pe-static-v1";
const CORE = [
  "/offline.html",
  "/offline.js",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("pe-static-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname === "/login"
  )
    return;
  if (request.mode === "navigate") {
    // Never store authenticated HTML or API responses in Cache Storage.
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline.html")),
    );
    return;
  }
  if (CORE.includes(url.pathname) || url.pathname.startsWith("/_next/static/"))
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              void caches
                .open(CACHE)
                .then((cache) => cache.put(request, clone));
            }
            return response;
          }),
      ),
    );
});
