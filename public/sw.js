// Service Worker para Imports Zona Norte
// Estrategia: network-first para HTML/navigate, stale-while-revalidate para assets,
// cache-first como fallback offline. Firebase tiene su propia persistencia via
// IndexedDB, así que las lecturas/escrituras a Firestore siguen funcionando sin
// intervención del SW.
//
// El CACHE_VERSION se debe bumpear en cada cambio grande que requiera invalidación.

const CACHE_VERSION = "izn-v8";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// App shell mínimo que queremos disponible offline al abrir la app.
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// No interceptamos requests a Firebase/Firestore/Googleapis — dejamos que el SDK
// maneje su propia cola offline.
const shouldBypass = (url) => {
  return (
    url.includes("firestore.googleapis.com") ||
    url.includes("firebase") ||
    url.includes("googleapis.com") ||
    url.includes("gstatic.com") ||
    url.includes("fonts.googleapis.com") ||
    url.includes("dolarapi.com") ||
    url.includes("criptoya.com")
  );
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (shouldBypass(url.href)) return;

  // Navegación HTML: network-first, fallback a cache
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then(r => r || caches.match("/")))
    );
    return;
  }

  // Assets (JS/CSS/imágenes): stale-while-revalidate
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(request).then(cached => {
        const fetchPromise = fetch(request).then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then(c => c.put(request, copy));
          }
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});
