// Service Worker para Imports Zona Norte
// Estrategia: network-first para HTML/navigate, stale-while-revalidate para assets,
// cache-first como fallback offline. Firebase tiene su propia persistencia via
// IndexedDB, así que las lecturas/escrituras a Firestore siguen funcionando sin
// intervención del SW.
//
// El CACHE_VERSION se debe bumpear en cada cambio grande que requiera invalidación.

const CACHE_VERSION = "izn-v10";
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
    ).then(() => self.clients.claim())
  );
});

// Permite que el cliente fuerce al SW nuevo a tomar control inmediatamente.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
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

// Detecta si la request es a un chunk JS/CSS hasheado de Vite (assets/*.js).
// Estos chunks tienen hash en el nombre, entonces si pedimos un hash específico
// y no existe en network, NO debemos servir uno viejo del cache — eso causa
// "Importing a module script failed" si el chunk cambió tras un deploy.
const isHashedAsset = (url) => {
  return url.pathname.startsWith("/assets/") && /\-[A-Za-z0-9_-]{6,}\.(js|css|mjs)$/.test(url.pathname);
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (shouldBypass(url.href)) return;

  // Navegación HTML: network-first, fallback a cache solo si network falla.
  // Nunca cacheamos HTML obsoleto de forma persistente.
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

  if (url.origin !== location.origin) return;

  // Assets hasheados (chunks Vite): network-first con fallback a cache solo si
  // network está caída. Si network responde 404 (chunk borrado en deploy), NO
  // servir el viejo del cache — dejarlo fallar para que el cliente detecte
  // "Importing a module script failed" y dispare el auto-recovery.
  if (isHashedAsset(url)) {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then(c => c.put(request, copy));
            return res;
          }
          // 404 u otro error HTTP → no cachear, no fallback, dejar pasar el error
          return res;
        })
        .catch(() => caches.match(request).then(r => r || Response.error()))
    );
    return;
  }

  // Otros assets de origen propio (imágenes, fonts, etc.): stale-while-revalidate
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
});
