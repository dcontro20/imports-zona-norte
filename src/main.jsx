import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { PublicCatalog } from './components/PublicCatalog.jsx'
import { initErrorReporter } from './lib/errorReporter.js'
import { isCatalogURL } from './lib/publicCatalog.js'

// Captura errores globales (window.onerror + unhandledrejection) y los
// almacena en localStorage. Visible en ⚙️ Ajustes → Errores del sistema.
initErrorReporter({ maxStored: 100 })

// Router minimalista: si la URL es /c/<slug>, renderizamos solo el
// catálogo público (sin auth, sin app, sin sidebar). Es una mini-landing
// destinada a clientes que reciben un link compartido.
const root = ReactDOM.createRoot(document.getElementById('root'));
if (isCatalogURL()) {
  root.render(
    <React.StrictMode>
      <PublicCatalog />
    </React.StrictMode>
  );
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

// Helper: limpia cache + SW + reload (mismo que ErrorBoundary)
async function hardReloadAppCache() {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } catch {}
  const sep = window.location.href.includes("?") ? "&" : "?";
  window.location.href = window.location.href.split("?")[0].split("#")[0] + sep + "_t=" + Date.now();
}

// Capturar errores globales de chunks no manejados (no llegan al ErrorBoundary)
window.addEventListener("unhandledrejection", (event) => {
  const msg = String(event.reason?.message || event.reason || "");
  if (/importing a module script failed/i.test(msg)
      || /failed to fetch dynamically imported module/i.test(msg)
      || /loading chunk \d+ failed/i.test(msg)) {
    if (!sessionStorage.getItem("izn_auto_recovered")) {
      sessionStorage.setItem("izn_auto_recovered", "1");
      console.warn("[recover] chunk desactualizado detectado, refrescando…");
      hardReloadAppCache();
    }
  }
});

// Registrar service worker (solo en producción — en dev estorba al HMR)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then(reg => {
      // Cuando hay un SW nuevo esperando activarse, forzarlo a tomar control
      // y recargar. Esto evita que el usuario quede con código viejo.
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            // Hay versión nueva instalada y un SW viejo controlando.
            // Forzar al nuevo a tomar control.
            installing.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
      // Chequear si hay updates al volver a foco / cada 30min
      setInterval(() => { reg.update().catch(() => {}); }, 30 * 60 * 1000);
      window.addEventListener("focus", () => { reg.update().catch(() => {}); });
    }).catch(err => {
      console.warn("[SW] registro falló:", err);
    });

    // Cuando un SW nuevo toma control, recargar la página para usar el código nuevo
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
}
