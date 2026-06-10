// src/lib/errorReporter.js
//
// Error tracking lightweight. Captura errores no manejados (window.onerror y
// unhandledrejection), los acumula en localStorage con tope, y opcionalmente
// los envía a un endpoint si está configurado.
//
// No instalo Sentry SDK (300kb) porque para un negocio chico es overkill.
// Esto da el 80% del valor en <2kb.
//
// API:
//   initErrorReporter({ endpoint?, maxStored = 50 })
//   reportError(error, context?)
//   getStoredErrors() — para mostrar en UI
//   clearStoredErrors()

const STORAGE_KEY = "izn_errorLog";
let config = { endpoint: null, maxStored: 50 };

function safeRead() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch { return []; }
}

function safeWrite(arr) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr.slice(-config.maxStored)));
  } catch {/* localStorage full or restricted */}
}

export function getStoredErrors() {
  return safeRead();
}

export function clearStoredErrors() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

// Reporta un error puntual. Lo guarda local y opcionalmente lo envía al endpoint.
export function reportError(error, context = {}) {
  const entry = {
    id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    message: String(error?.message || error || "unknown"),
    stack: error?.stack || null,
    url: typeof window !== "undefined" ? window.location.href : null,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    context,
  };

  // Guardar local
  const existing = safeRead();
  existing.push(entry);
  safeWrite(existing);

  // Enviar al endpoint si está configurado (fire-and-forget)
  if (config.endpoint && typeof fetch !== "undefined") {
    fetch(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
      keepalive: true, // intenta enviarse incluso si la pestaña cierra
    }).catch(() => {/* silent */});
  }

  return entry;
}

// Inicializa los handlers globales. Idempotente.
let initialized = false;
export function initErrorReporter(opts = {}) {
  config = { ...config, ...opts };
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  window.addEventListener("error", (event) => {
    reportError(event.error || event.message, {
      source: "window.error",
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportError(event.reason, { source: "unhandledrejection" });
  });
}

// Stats útiles para mostrar en UI ("últimos 7 días: N errores")
export function errorStats() {
  const errors = safeRead();
  const now = Date.now();
  const last24h = errors.filter(e => now - new Date(e.timestamp).getTime() < 86400000).length;
  const last7d = errors.filter(e => now - new Date(e.timestamp).getTime() < 7 * 86400000).length;

  // Agrupa por message para ver los más frecuentes
  const byMessage = {};
  errors.forEach(e => {
    const key = e.message.slice(0, 100);
    byMessage[key] = (byMessage[key] || 0) + 1;
  });
  const topMessages = Object.entries(byMessage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([msg, count]) => ({ msg, count }));

  return {
    total: errors.length,
    last24h,
    last7d,
    topMessages,
  };
}
