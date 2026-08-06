import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense, Component, Fragment } from "react";
import { uid, formatMoney, formatDate } from "./helpers.js";
import { migrateToWholesaleModel } from "./wholesaleMigration.js";
import { ingestarLote } from "./lib/discovery/discoveryImport.js";
import { useSettings } from "./useSettings.js";
import { saveSettings, loadSettings } from "./settings.js";
import { scheduleDailyNotifications, cancelScheduled, hasPermission } from "./lib/notifications.js";
import { useFirebaseSync } from "./useFirebaseSync.js";
import { AppContext } from "./AppContext.js";
import { loginWithEmail, logout, onAuthChange, getUserProfile, updatePresence, subscribePresence, deleteDiscoveryResult, createDiscoveryJob, deleteDiscoveryJob } from "./firebase.js";
import { isPresenceActive, formatRelative } from "./collaboration.js";
import { LogoMark, LogoFull } from "./components/Logo.jsx";

// Responsive hook — used by UI.jsx, Dashboard.jsx, PriceLog.jsx and others
// useResponsive — breakpoints reactivos a cambios de viewport.
//
// PWA iOS: cuando la app vuelve de background, "resize" NO se dispara si
// el viewport no cambió, pero window.innerWidth puede devolver un valor
// stale durante los primeros frames. Por eso también escuchamos:
//   - pageshow: dispara al volver de bfcache / al reabrir PWA
//   - visibilitychange: dispara al cambiar a foreground
//   - focus: dispara al ganar foco la ventana
//   - orientationchange: rotar el iPad
// Usamos el max entre window.innerWidth y documentElement.clientWidth para
// obtener la medida más confiable (innerWidth puede ser 0 brevemente).
export const useResponsive = () => {
  const readDimensions = () => {
    if (typeof window === "undefined") {
      return { isMobile: false, isTablet: false, isDesktop: true };
    }
    const innerW = window.innerWidth || 0;
    const clientW = document.documentElement?.clientWidth || 0;
    const width = Math.max(innerW, clientW);
    // Si por algún motivo la medida es 0 (PWA recién resumida), asumimos
    // desktop por defecto para no quedar pegados en mobile layout
    if (width <= 0) return { isMobile: false, isTablet: false, isDesktop: true };
    return {
      isMobile: width < 768,
      isTablet: width >= 768 && width <= 1024,
      isDesktop: width > 1024,
    };
  };

  const [dimensions, setDimensions] = useState(readDimensions);

  useEffect(() => {
    let rafId = null;
    const recompute = () => {
      // requestAnimationFrame para asegurar que el viewport ya está estable
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const next = readDimensions();
        setDimensions(prev => {
          if (prev.isMobile === next.isMobile
              && prev.isTablet === next.isTablet
              && prev.isDesktop === next.isDesktop) return prev;
          return next;
        });
      });
    };
    const onVisibility = () => { if (!document.hidden) recompute(); };

    window.addEventListener("resize", recompute);
    window.addEventListener("orientationchange", recompute);
    window.addEventListener("pageshow", recompute);
    window.addEventListener("focus", recompute);
    document.addEventListener("visibilitychange", onVisibility);

    // Re-medir una vez más después de mount por si la medición inicial salió mal
    recompute();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", recompute);
      window.removeEventListener("orientationchange", recompute);
      window.removeEventListener("pageshow", recompute);
      window.removeEventListener("focus", recompute);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return dimensions;
};

// Lazy load all page components
const Dashboard = lazy(() => import("./components/Dashboard.jsx").then(m => ({ default: m.Dashboard })));
const Products = lazy(() => import("./components/Products.jsx").then(m => ({ default: m.Products })));
const Sales = lazy(() => import("./components/Sales.jsx").then(m => ({ default: m.Sales })));
const Clients = lazy(() => import("./components/Clients.jsx").then(m => ({ default: m.Clients })));
const Kioscos = lazy(() => import("./components/Kioscos.jsx").then(m => ({ default: m.Kioscos })));
const WholesaleOrder = lazy(() => import("./components/WholesaleOrder.jsx").then(m => ({ default: m.WholesaleOrder })));
const PriceListScreen = lazy(() => import("./components/wholesale/PriceListScreen.jsx").then(m => ({ default: m.PriceListScreen })));
// Mini CRM de Prospect Intelligence: Prospectos absorbe Pipeline (pestaña
// Embudo) y ProspectMap (pestaña Zonas) — ambos se importan estáticos adentro.
const Prospectos = lazy(() => import("./components/Prospectos.jsx").then(m => ({ default: m.Prospectos })));
const Routes = lazy(() => import("./components/Routes.jsx").then(m => ({ default: m.Routes })));
const CuentasCorrientes = lazy(() => import("./components/CuentasCorrientes.jsx").then(m => ({ default: m.CuentasCorrientes })));
const DashboardMayorista = lazy(() => import("./components/DashboardMayorista.jsx").then(m => ({ default: m.DashboardMayorista })));
const Expenses = lazy(() => import("./components/Expenses.jsx").then(m => ({ default: m.Expenses })));
const Withdrawals = lazy(() => import("./components/Withdrawals.jsx").then(m => ({ default: m.Withdrawals })));
const CashBox = lazy(() => import("./components/CashBox.jsx").then(m => ({ default: m.CashBox })));
const ExportData = lazy(() => import("./components/Export.jsx").then(m => ({ default: m.ExportData })));
const PriceLog = lazy(() => import("./components/PriceLog.jsx").then(m => ({ default: m.PriceLog })));
const StockLog = lazy(() => import("./components/StockLog.jsx").then(m => ({ default: m.StockLog })));
const AuditLog = lazy(() => import("./components/AuditLog.jsx").then(m => ({ default: m.AuditLog })));
const Offers = lazy(() => import("./components/Offers.jsx").then(m => ({ default: m.Offers })));
const ExchangeMonitor = lazy(() => import("./components/ExchangeMonitor.jsx").then(m => ({ default: m.ExchangeMonitor })));
const Trash = lazy(() => import("./components/Trash.jsx").then(m => ({ default: m.Trash })));
const SettingsModal = lazy(() => import("./components/SettingsModal.jsx").then(m => ({ default: m.SettingsModal })));
const QuickSale = lazy(() => import("./components/QuickSale.jsx").then(m => ({ default: m.QuickSale })));
const QuickWithdrawal = lazy(() => import("./components/QuickWithdrawal.jsx").then(m => ({ default: m.QuickWithdrawal })));
const CommandPalette = lazy(() => import("./components/CommandPalette.jsx").then(m => ({ default: m.CommandPalette })));
const OnboardingTour = lazy(() => import("./components/OnboardingTour.jsx").then(m => ({ default: m.OnboardingTour })));
const Procurement = lazy(() => import("./components/Procurement.jsx").then(m => ({ default: m.Procurement })));
const Analisis = lazy(() => import("./components/Analisis.jsx").then(m => ({ default: m.Analisis })));

const LoadingSpinner = () => (
  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "40px 16px" }}>
    <span style={{ color: "#1E2B4A", fontSize: 15, fontWeight: 500 }}>Cargando...</span>
  </div>
);

// Detecta errores que indican que el código cacheado quedó desactualizado
// (PWA con SW viejo que apunta a chunks JS que ya no existen en el servidor).
function isStaleChunkError(error) {
  if (!error) return false;
  const msg = String(error.message || error.toString() || "");
  return /importing a module script failed/i.test(msg)
      || /failed to fetch dynamically imported module/i.test(msg)
      || /loading chunk \d+ failed/i.test(msg)
      || /loading css chunk \d+ failed/i.test(msg);
}

// Limpia todo el cache de la app y el SW, después fuerza un reload.
// Esto resuelve el caso "Importing a module script failed" cuando el HTML
// cacheado apunta a chunks que ya no existen tras un deploy nuevo.
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
  } catch (e) {
    console.warn("[recover] limpiando cache:", e);
  }
  // Reload con timestamp para evitar caches HTTP intermedios
  const sep = window.location.href.includes("?") ? "&" : "?";
  window.location.href = window.location.href.split("?")[0].split("#")[0] + sep + "_t=" + Date.now();
}

// ErrorBoundary — prevents a crash in one component from killing the entire app
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, recovering: false };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info.componentStack);
    // Si es error de chunks desactualizados, intentar auto-recovery una vez
    if (isStaleChunkError(error) && !sessionStorage.getItem("izn_auto_recovered")) {
      sessionStorage.setItem("izn_auto_recovered", "1");
      this.setState({ recovering: true });
      hardReloadAppCache();
    }
  }
  render() {
    if (this.state.hasError) {
      const stale = isStaleChunkError(this.state.error);
      if (this.state.recovering) {
        return (
          <div style={{ padding: "32px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔄</div>
            <h2 style={{ color: "#1E2B4A", marginBottom: 8 }}>Actualizando…</h2>
            <p style={{ color: "#6B7794", fontSize: 14 }}>Cargando la versión más reciente.</p>
          </div>
        );
      }
      return (
        <div style={{ padding: "32px 16px", textAlign: "center", maxWidth: 480, margin: "0 auto" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ color: "#1E2B4A", marginBottom: 8 }}>
            {stale ? "Hay una versión nueva" : "Algo salió mal"}
          </h2>
          <p style={{ color: "#6B7794", fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
            {stale
              ? "La app se actualizó. Hacé clic en Actualizar para cargar la versión nueva (limpia caché)."
              : (this.state.error?.message || "Error inesperado")}
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            {stale ? (
              <button onClick={hardReloadAppCache} style={{
                padding: "12px 24px", background: "#1E2B4A", color: "#fff", border: "none",
                borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", minHeight: 44,
              }}>🔄 Actualizar app</button>
            ) : (
              <>
                <button onClick={() => this.setState({ hasError: false, error: null })} style={{
                  padding: "12px 24px", background: "#1E2B4A", color: "#fff", border: "none",
                  borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", minHeight: 44,
                }}>Reintentar</button>
                <button onClick={hardReloadAppCache} style={{
                  padding: "12px 24px", background: "transparent", color: "#1E2B4A",
                  border: "1px solid #E5DAC2",
                  borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", minHeight: 44,
                }}>🔄 Limpiar caché</button>
              </>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================
// MAIN APP
// ============================================
// Diego es único usuario — ya no hay flags por rol.
// `group` clasifica cada item para reordenar por modo de negocio (mayorista/
// minorista). Las pantallas mayoristas (Kioscos, Pipeline, Mapa, Pedido, Rutas)
// se agregan en fases siguientes con group:"mayorista" y suben solas arriba.
const NAV_ITEMS = [
  // Mayorista (pivote a kioscos)
  { key: "dashMayorista", label: "Panel mayorista", icon: "📊", group: "mayorista" },
  { key: "kioscos", label: "Kioscos", icon: "🏪", group: "mayorista" },
  { key: "wholesaleOrder", label: "Pedido mayorista", icon: "🧾", group: "mayorista" },
  { key: "priceList", label: "Lista de precios", icon: "🏷️", group: "mayorista" },
  // Mini CRM de Prospect Intelligence (spec docs/PROSPECT_CRM_SPEC.md):
  // UNA sola puerta — absorbe los ex-ítems "Pipeline" y "Prospección"
  // (sus keys viven como alias de deep-link en renderPage).
  { key: "prospectos", label: "Prospectos", icon: "🎯", group: "mayorista" },
  { key: "routes", label: "Rutas", icon: "🚚", group: "mayorista" },
  { key: "cuentasCorrientes", label: "Cuentas corrientes", icon: "💳", group: "mayorista" },
  // Ver / decidir
  { key: "dashboard", label: "Dashboard", icon: "📊", group: "minorista" },
  { key: "analisis", label: "Análisis", icon: "📈", group: "shared" },
  // Operación diaria
  { key: "sales", label: "Ventas", icon: "🛒", group: "minorista" },
  { key: "procurement", label: "Compras", icon: "🚚", group: "shared" },
  { key: "products", label: "Stock", icon: "📦", group: "shared" },
  { key: "cash", label: "Caja", icon: "💰", group: "shared" },
  { key: "offers", label: "Mensajes", icon: "📲", group: "minorista" },
  { key: "clients", label: "Clientes", icon: "👥", group: "minorista" },
  // Gestión
  { key: "expenses", label: "Gastos", icon: "💸", group: "shared" },
  { key: "withdrawals", label: "Mermas", icon: "📉", group: "shared" },
  // Registros / utilidades
  { key: "pricelog", label: "Precios", icon: "💲", group: "shared" },
  { key: "stocklog", label: "Historial", icon: "📋", group: "shared" },
  { key: "exchange", label: "Cotizaciones", icon: "💱", group: "shared" },
  { key: "export", label: "Exportar", icon: "📥", group: "shared" },
  { key: "audit", label: "Auditoría", icon: "🔍", group: "shared" },
  { key: "trash", label: "Papelera", icon: "🗑️", group: "shared" },
];

// Pantalla de inicio de cada modo. Son dos paneles DISTINTOS a propósito
// (Dashboard = minorista, Panel mayorista = B2B) — no se unifican.
const MODE_HOME = { mayorista: "dashMayorista", minorista: "dashboard" };

// Filtra la navegación según el modo (Tanda F.1: separar, no reordenar).
// Se ven SOLO las pantallas del modo activo + las compartidas (abajo, tras
// un divisor, idénticas en ambos modos). La separación es de NAVEGACIÓN
// nada más: renderPage sigue renderizando cualquier pantalla, así ⌘K,
// alertas y deep-links del otro modo abren igual (los datos son uno solo).
function navItemsForMode(items, mode) {
  const m = mode === "mayorista" ? "mayorista" : "minorista";
  return [
    ...items.filter(it => it.group === m),
    ...items.filter(it => it.group === "shared"),
  ];
}

// Dónde queda parado el usuario tras cambiar de modo: pantalla exclusiva del
// otro modo → home del modo nuevo. Compartidas y pantallas fuera del nav
// (legacy / deep-link) se quedan donde están.
function pageAfterModeSwitch(page, mode) {
  const m = mode === "mayorista" ? "mayorista" : "minorista";
  const item = NAV_ITEMS.find(it => it.key === page);
  if (item && item.group !== "shared" && item.group !== m) return MODE_HOME[m];
  return page;
}

export default function App() {
  const { isMobile, isTablet } = useResponsive();

  // ---- Firebase Auth state ----
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthChange((firebaseUser) => {
      setCurrentUser(firebaseUser ? getUserProfile(firebaseUser) : null);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // ---- UI state ----
  // Arranca en el home del modo activo (Panel mayorista o Dashboard).
  const [page, setPage] = useState(() => MODE_HOME[loadSettings().businessMode] || MODE_HOME.minorista);
  const [presenceList, setPresenceList] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [showGlobalResults, setShowGlobalResults] = useState(false);
  const [quickSaleOpen, setQuickSaleOpen] = useState(false);
  const [quickMermaOpen, setQuickMermaOpen] = useState(false);
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  // Mostrar tour la primera vez (después del login + después que el sync inicial cargue)
  useEffect(() => {
    if (!currentUser) return;
    import("./components/OnboardingTour.jsx").then(({ shouldShowOnboarding }) => {
      if (shouldShowOnboarding()) setOnboardingOpen(true);
    });
  }, [currentUser]);

  // Notificaciones diarias. Estrategia en capas:
  //   1. Push REMOTAS (FCM): si el setup está completo (VAPID key pegada),
  //      registra/refresca el token del dispositivo y sincroniza horarios
  //      a Firestore. El server manda — llegan con la app CERRADA.
  //   2. Locales como FALLBACK: si el push remoto no está configurado o
  //      falla el registro, programa timers locales para el día actual.
  // Re-corre cuando cambian toggle/horarios, y a medianoche (día nuevo).
  const settings = useSettings();
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    let midnightTimer = null;

    const noonTime = settings.notificationNoonTime || "12:00";
    const eveningTime = settings.notificationEveningTime || "18:30";

    const scheduleLocal = () => {
      scheduleDailyNotifications({ slotNoonTime: noonTime, slotEveningTime: eveningTime });
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 30, 0);
      midnightTimer = setTimeout(scheduleLocal, tomorrow.getTime() - now.getTime());
    };

    (async () => {
      const push = await import("./lib/push.js");
      const everHadPush = push.isPushConfigured() || push.getStoredPushToken();

      if (!settings.notificationsEnabled || !hasPermission()) {
        cancelScheduled();
        // Avisar al server que no mande más (solo si alguna vez hubo push)
        if (everHadPush) {
          push.syncPushConfig({ enabled: false, noonTime, eveningTime }).catch(() => {});
        }
        return;
      }

      // Intentar push remoto primero
      let remoteOk = false;
      if (push.isPushConfigured()) {
        try {
          remoteOk = (await push.enablePush()).ok;
        } catch {}
      }
      if (everHadPush) {
        push.syncPushConfig({ enabled: remoteOk, noonTime, eveningTime }).catch(() => {});
      }
      if (cancelled) return;

      if (remoteOk) {
        // El server se encarga — no duplicar con timers locales
        cancelScheduled();
      } else {
        scheduleLocal();
      }
    })();

    return () => {
      cancelled = true;
      if (midnightTimer) clearTimeout(midnightTimer);
      cancelScheduled();
    };
  }, [
    currentUser,
    settings.notificationsEnabled,
    settings.notificationNoonTime,
    settings.notificationEveningTime,
  ]);

  // Escucha mensajes del SW (notificationclick → "NAVIGATE")
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
    const onMessage = (event) => {
      if (event.data?.type === "NAVIGATE" && event.data?.page) {
        setPage(event.data.page);
        setMenuOpen(false);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  // También chequeo ?page=offers en la URL al cargar (cuando la notificación
  // abre la app desde frío). El SW no puede mandar mensajes a una ventana
  // que recién está cargando.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const pageParam = params.get("page");
    if (pageParam && ["dashboard", "sales", "procurement", "products", "cash", "offers", "clients", "expenses", "withdrawals", "analisis", "pricelog", "stocklog", "exchange", "export", "audit", "trash"].includes(pageParam)) {
      setPage(pageParam);
    }
  }, []);

  // ---- Presencia en tiempo real (colaboración 2 socios) ----
  // Escribe un heartbeat (qué página miro) cada 45s y al cambiar de página,
  // y se suscribe para saber si el otro socio está activo.
  useEffect(() => {
    if (!currentUser?.uid) return;
    const pageLabel = (NAV_ITEMS.find(n => n.key === page)?.label) || page;
    const beat = () => updatePresence(currentUser.uid, { name: currentUser.name, icon: currentUser.icon, page: pageLabel });
    beat();
    const id = setInterval(beat, 45000);
    const onHide = () => { if (!document.hidden) beat(); };
    document.addEventListener("visibilitychange", onHide);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onHide); };
  }, [currentUser, page]);

  useEffect(() => {
    if (!currentUser?.uid) return;
    const unsub = subscribePresence(setPresenceList);
    return unsub;
  }, [currentUser]);

  // El "otro socio" activo (no yo, heartbeat reciente). Se recalcula con el reloj.
  const [presenceClock, setPresenceClock] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setPresenceClock(Date.now()), 20000);
    return () => clearInterval(id);
  }, []);
  const partnerOnline = useMemo(() => {
    if (!currentUser?.uid) return null;
    return presenceList.find(p => p.uid !== currentUser.uid && isPresenceActive(p.lastSeen, presenceClock)) || null;
  }, [presenceList, currentUser, presenceClock]);

  // Atajo global CMD+K / Ctrl+K para abrir command palette
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(open => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Safety net: si saveToFirestore falla, mostramos toast rojo al usuario.
  // El evento "izn:write-error" lo dispara firebase.js cuando un write fracasa
  // tras retry. Esto previene "pérdida silenciosa" — Diego ve inmediatamente
  // que algo no se guardó y puede reintentar.
  const [writeErrorToast, setWriteErrorToast] = useState(null);
  useEffect(() => {
    const handler = (e) => {
      const detail = e.detail || {};
      setWriteErrorToast({
        key: detail.key || "datos",
        message: detail.error || "Error desconocido",
        time: detail.time || new Date().toISOString(),
      });
      // Auto-hide después de 10s para no quedar pegado
      setTimeout(() => setWriteErrorToast(null), 10000);
    };
    window.addEventListener("izn:write-error", handler);
    return () => window.removeEventListener("izn:write-error", handler);
  }, []);

  // Toast de cuota localStorage llena (S14 — bug B6).
  // El sistema sigue funcionando porque Firestore es la fuente de verdad,
  // pero el caché local ya no se actualiza. Guía al usuario a exportar
  // backup y limpiar para evitar pérdida si pierde conexión.
  const [storageQuotaToast, setStorageQuotaToast] = useState(false);
  useEffect(() => {
    const handler = () => {
      setStorageQuotaToast(true);
      setTimeout(() => setStorageQuotaToast(false), 30000);
    };
    window.addEventListener("izn:storage-quota-error", handler);
    return () => window.removeEventListener("izn:storage-quota-error", handler);
  }, []);

  // Toast de concurrent edit (S14.2 — pestañas/dispositivos del mismo usuario)
  // Avisa que el dato puede haber sido sobrescrito por el otro socio.
  const [concurrentEditToast, setConcurrentEditToast] = useState(null);
  useEffect(() => {
    const handler = (e) => {
      setConcurrentEditToast({ key: e.detail?.key || "datos", at: e.detail?.at });
      setTimeout(() => setConcurrentEditToast(null), 8000);
    };
    window.addEventListener("izn:concurrent-edit", handler);
    return () => window.removeEventListener("izn:concurrent-edit", handler);
  }, []);

  // Body scroll lock cuando sidebar mobile está abierto
  useEffect(() => {
    if (isMobile && menuOpen) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = original; };
    }
  }, [isMobile, menuOpen]);

  // Si el viewport sale de mobile (ej: PWA en iPad volviendo de background),
  // cerramos el menú overlay automáticamente — ya no aplica.
  useEffect(() => {
    if (!isMobile && menuOpen) {
      setMenuOpen(false);
    }
  }, [isMobile, menuOpen]);

  // ---- All data + sync from custom hook ----
  const sync = useFirebaseSync();
  const {
    products, setProducts, sales, setSales, purchases, setPurchases,
    clients, setClients, expenses, setExpenses, withdrawals, setWithdrawals,
    cashMovements, setCashMovements, stockLog, setStockLog, priceLog, setPriceLog,
    monthlyClosures, setMonthlyClosures, partnerWithdrawals, setPartnerWithdrawals,
    exchangeRate, setExchangeRate, auditLog,
    coupons, setCoupons,
    bundles, setBundles,
    supplierProfiles, setSupplierProfiles,
    supplierAliases, setSupplierAliases,
    supplierLists, setSupplierLists,
    prospects, setProspects, visits, setVisits, routes, setRoutes,
    discoverySuppressed, setDiscoverySuppressed, discoveryResults, discoveryJobs,
    syncStatus, backupStatus, logStock, logPrice,
  } = sync;

  // ---- Audit log helper (needs currentUser) ----
  const logAudit = useCallback((action, entityType, entityId, description, details = {}) => {
    sync.setAuditLog(prev => [{
      id: uid(), timestamp: new Date().toISOString(),
      user: currentUser?.name || "Sistema",
      action, entityType, entityId, description, details
    }, ...prev].slice(0, 2000));
  }, [currentUser]); // eslint-disable-line

  // ---- Global search ----
  const globalResults = useMemo(() => {
    if (!globalSearch || globalSearch.length < 2) return [];
    const q = globalSearch.toLowerCase();
    const results = [];

    products.filter(p => !p.isDeleted && `${p.brand} ${p.model} ${p.flavor}`.toLowerCase().includes(q)).slice(0, 5)
      .forEach(p => results.push({ type: "product", icon: "📦", label: `${p.brand} ${p.model} - ${p.flavor}`, sub: `Stock: ${p.stock} · ${p.puffs}p`, page: "products" }));

    sales.filter(s => !s.isDeleted).filter(s => {
      const items = (s.items || []).map(i => { const p = products.find(pr => pr.id === i.productId); return p ? `${p.brand} ${p.model} ${p.flavor}` : ""; }).join(" ");
      return items.toLowerCase().includes(q) || (s.clientName || "").toLowerCase().includes(q);
    }).slice(0, 5).forEach(s => results.push({ type: "sale", icon: "🛒", label: `Venta ${s.clientName || ""}`, sub: `${formatDate(s.date)} · ${formatMoney(s.total, s.currency)}`, page: "sales" }));

    (clients || []).filter(c => `${c.name} ${c.phone} ${c.instagram}`.toLowerCase().includes(q)).slice(0, 3)
      .forEach(c => results.push({ type: "client", icon: "👥", label: c.name, sub: c.phone || c.instagram || "", page: "clients" }));

    purchases.filter(p => !p.isDeleted && (p.supplier || "").toLowerCase().includes(q)).slice(0, 3)
      .forEach(p => results.push({ type: "purchase", icon: "🚚", label: `Pedido - ${p.supplier}`, sub: `${formatDate(p.date)} · ${p.status}`, page: "procurement" }));

    expenses.filter(e => !e.isDeleted && `${e.category} ${e.description}`.toLowerCase().includes(q)).slice(0, 3)
      .forEach(e => results.push({ type: "expense", icon: "💸", label: `${e.category}`, sub: `${formatDate(e.date)} · ${formatMoney(e.amountARS)}`, page: "expenses" }));

    return results;
  }, [globalSearch, products, sales, clients, purchases, expenses]);

  // ---- Filtered data (excluding soft-deleted) ----
  const activeProducts = useMemo(() => products.filter(p => !p.isDeleted), [products]);
  const activeSales = useMemo(() => sales.filter(s => !s.isDeleted), [sales]);
  const activePurchases = useMemo(() => purchases.filter(p => !p.isDeleted), [purchases]);
  const activeExpenses = useMemo(() => expenses.filter(e => !e.isDeleted), [expenses]);
  const activeWithdrawals = useMemo(() => withdrawals.filter(w => !w.isDeleted), [withdrawals]);
  const activeCashMovements = useMemo(() => cashMovements.filter(m => !m.isDeleted), [cashMovements]);
  const activePartnerWithdrawals = useMemo(() => partnerWithdrawals.filter(w => !w.isDeleted), [partnerWithdrawals]);
  // Mayorista (pivote a kioscos)
  const activeProspects = useMemo(() => (prospects || []).filter(p => !p.isDeleted), [prospects]);
  const activeVisits = useMemo(() => (visits || []).filter(v => !v.isDeleted), [visits]);
  const activeRoutes = useMemo(() => (routes || []).filter(r => !r.isDeleted), [routes]);

  // ---- Migración al modelo mayorista (una vez, idempotente) ----
  // Corre cuando Firestore terminó el initial load (syncStatus "online").
  // Setea type/saleType/fulfillmentStatus en data previa. Sólo escribe si
  // realmente había algo que migrar (evita writes innecesarios).
  const wholesaleMigrationDone = useRef(false);
  useEffect(() => {
    if (syncStatus !== "online" || wholesaleMigrationDone.current) return;
    wholesaleMigrationDone.current = true;
    const { clients: migClients, sales: migSales, didChange, changed } = migrateToWholesaleModel(clients, sales);
    if (didChange) {
      if (changed.clients > 0) setClients(migClients);
      if (changed.sales > 0) setSales(migSales);
      console.log(`[migrate] modelo mayorista: ${changed.clients} clientes, ${changed.sales} ventas`);
    }
  }, [syncStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Auto-ingesta del discovery (ciclo v2 F2 — spec §5) ----
  // "Los descubiertos entran solos": el staging que escribe el worker se
  // ingiere ACÁ (nivel app, no en la pantalla) para que entren aunque Diego
  // esté en otro módulo. Nacen en `por_analizar` — nada se contacta sin
  // análisis humano, que es el compromiso que reemplazó al viejo modal.
  // Corre solo con Firestore online: en modo offline las escrituras están
  // bloqueadas y consumir el staging perdería los descubiertos.
  const ingeridos = useRef(new Set());
  useEffect(() => {
    if (syncStatus !== "online" || !discoveryResults.length) return;
    const pendientes = discoveryResults.filter(d => d && !ingeridos.current.has(d.id));
    if (!pendientes.length) return;

    pendientes.forEach(d => ingeridos.current.add(d.id));
    const { altas, resumenes } = ingestarLote({
      resultados: pendientes, prospects, clients,
      suprimidos: discoverySuppressed, at: new Date().toISOString(), nuevoId: uid,
    });
    if (altas.length) {
      // Filtro por id contra lo vivo: la ingesta es idempotente (mismo
      // descubrimiento = mismo id determinístico), así dos clientes abiertos
      // o un re-envío del worker no duplican.
      setProspects(prev => {
        const vistos = new Set(prev.map(p => p?.id));
        const nuevos = altas.filter(n => !vistos.has(n.id));
        return nuevos.length ? [...nuevos, ...prev] : prev;
      });
    }
    for (const r of resumenes) {
      logAudit("import", "prospect", r.resultado.id,
        `Descubrimiento "${r.resultado.termino}" (${r.resultado.zona}): ${r.altas.length} entraron para analizar` +
        (r.duplicados ? ` · ${r.duplicados} duplicados` : "") +
        (r.suprimidos ? ` · ${r.suprimidos} descartados antes` : ""));
      deleteDiscoveryResult(r.resultado.id);
    }
  }, [discoveryResults, syncStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Context value (for components that want to use context instead of props) ----
  const ctxValue = useMemo(() => ({
    currentUser, exchangeRate, logAudit, logStock, logPrice,
  }), [currentUser, exchangeRate, logAudit, logStock, logPrice]);

  // ---- Nav según modo de negocio ----
  // Tiene que vivir ANTES de los returns condicionales de loading/login:
  // un hook después de un early return rompe las Rules of Hooks (el orden
  // de hooks cambia entre renders y React tira "Rendered more hooks").
  const visibleNavItems = useMemo(() => navItemsForMode(NAV_ITEMS, settings.businessMode), [settings.businessMode]);

  // Al cambiar de modo: si la pantalla actual es del otro mundo, redirigir
  // al home del modo nuevo. setPage funcional para no depender de `page`.
  useEffect(() => {
    setPage(prev => pageAfterModeSwitch(prev, settings.businessMode));
  }, [settings.businessMode]);

  // ---- Login with Firebase Auth ----
  const handleLogin = async () => {
    setLoginError("");
    if (!loginEmail || !loginPass) { setLoginError("Ingresá email y contraseña"); return; }
    try {
      await loginWithEmail(loginEmail.trim(), loginPass);
      // onAuthChange will set currentUser automatically
    } catch (err) {
      const msgs = {
        "auth/user-not-found": "Email no registrado",
        "auth/wrong-password": "Contraseña incorrecta",
        "auth/invalid-email": "Email inválido",
        "auth/too-many-requests": "Demasiados intentos. Esperá un momento.",
        "auth/invalid-credential": "Email o contraseña incorrectos",
      };
      setLoginError(msgs[err.code] || "Error de autenticación");
    }
  };

  const handleLogout = async () => {
    try { await logout(); } catch {}
    // Seguridad: borrar del dispositivo toda la data cacheada del negocio
    // (clientes con PII, finanzas, caja) para que no quede accesible tras
    // cerrar sesión en un dispositivo compartido/robado.
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith("vapestock_") || k.startsWith("izn:") || k.startsWith("izn_"))
        .forEach(k => localStorage.removeItem(k));
      sessionStorage.clear();
    } catch {}
    try {
      const { clearFirestoreCache } = await import("./firebase.js");
      await clearFirestoreCache();
    } catch {}
    // Recargar para arrancar de cero, sin datos en memoria ni en cache.
    try { window.location.reload(); } catch {}
  };

  // ---- Loading screen ----
  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#F8F2E7", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", animation: "fadeIn 0.4s ease" }}>
          <LogoMark size={72} bgColor="#F8F2E7" />
          <p style={{ color: "#3A4868", fontSize: 14, fontWeight: 600, marginTop: 16, letterSpacing: 0.3 }}>Cargando...</p>
        </div>
      </div>
    );
  }

  // ---- Login screen ----
  if (!currentUser) {
    return (
      <div style={{
        minHeight: "100vh", background: "#F8F2E7", display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Inter', -apple-system, sans-serif", padding: "20px",
        backgroundImage: "radial-gradient(circle at 20% 30%, rgba(30,43,74,0.04) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(30,43,74,0.04) 0%, transparent 50%)",
      }}>
        <div style={{
          background: "#FFFFFF", border: "1px solid #E5DAC2", borderRadius: 20,
          padding: "40px 32px", width: "100%", maxWidth: 380, textAlign: "center",
          boxShadow: "0 12px 40px rgba(30, 43, 74, 0.10), 0 1px 3px rgba(30, 43, 74, 0.06)",
        }}>
          <div style={{ marginBottom: 24 }}>
            <LogoFull size={48} orientation="stacked" />
          </div>
          <p style={{
            color: "#6B7794", fontSize: 12, marginBottom: 28,
            textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700,
          }}>Sistema de Gestión</p>
          <input
            type="email"
            value={loginEmail}
            onChange={e => setLoginEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && document.getElementById("login-pass")?.focus()}
            placeholder="Email"
            style={{
              width: "100%", padding: "14px 18px", background: "#F8F2E7",
              border: `1px solid ${loginError ? "#B83232" : "#E5DAC2"}`,
              borderRadius: 12, color: "#1E2B4A", fontSize: 16, outline: "none",
              marginBottom: 10, boxSizing: "border-box", fontFamily: "inherit",
              transition: "border-color 0.2s, box-shadow 0.2s",
            }}
            onFocus={e => e.target.style.borderColor = "#1E2B4A"}
            onBlur={e => e.target.style.borderColor = loginError ? "#B83232" : "#E5DAC2"}
            autoFocus
          />
          <input
            id="login-pass"
            type="password"
            value={loginPass}
            onChange={e => setLoginPass(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="Contraseña"
            style={{
              width: "100%", padding: "14px 18px", background: "#F8F2E7",
              border: `1px solid ${loginError ? "#B83232" : "#E5DAC2"}`,
              borderRadius: 12, color: "#1E2B4A", fontSize: 16, outline: "none",
              marginBottom: 18, boxSizing: "border-box", fontFamily: "inherit",
              transition: "border-color 0.2s",
            }}
            onFocus={e => e.target.style.borderColor = "#1E2B4A"}
            onBlur={e => e.target.style.borderColor = loginError ? "#B83232" : "#E5DAC2"}
          />
          <button onClick={handleLogin} style={{
            width: "100%", padding: "14px", background: "#1E2B4A",
            border: "none", borderRadius: 12, color: "#F8F2E7",
            fontSize: 15, fontWeight: 700, letterSpacing: 0.5,
            cursor: "pointer", fontFamily: "inherit",
            transition: "background 0.15s, transform 0.05s",
          }}
            onMouseDown={e => e.currentTarget.style.transform = "scale(0.98)"}
            onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
            onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
          >Entrar</button>
          {loginError && <p style={{ color: "#B83232", fontSize: 13, marginTop: 12, fontWeight: 500 }}>{loginError}</p>}
        </div>
      </div>
    );
  }

  // Diego es único usuario — todas las páginas son accesibles.
  const isOwnerUser = true;
  const effectivePage = page;

  const renderPage = () => {
    switch (effectivePage) {
      case "dashboard": return <Dashboard products={activeProducts} sales={activeSales} purchases={activePurchases} expenses={activeExpenses} withdrawals={activeWithdrawals} clients={clients} cashMovements={activeCashMovements} partnerWithdrawals={activePartnerWithdrawals} auditLog={auditLog} backupStatus={backupStatus} onNavigate={setPage} />;
      case "products": return <Products products={products} setProducts={setProducts} priceLog={priceLog} sales={activeSales} />;
      case "sales": return <Sales sales={sales} setSales={setSales} products={products} setProducts={setProducts} logStock={logStock} exchangeRate={exchangeRate} currentUser={currentUser} logAudit={logAudit} clients={clients} setClients={setClients} cashMovements={cashMovements} setCashMovements={setCashMovements} monthlyClosures={monthlyClosures} coupons={coupons} setCoupons={setCoupons} auditLog={auditLog} />;
      case "procurement": return <Procurement products={products} setProducts={setProducts} purchases={purchases} setPurchases={setPurchases} sales={activeSales} exchangeRate={exchangeRate} logStock={logStock} currentUser={currentUser} logAudit={logAudit} monthlyClosures={monthlyClosures} supplierProfiles={supplierProfiles} setSupplierProfiles={setSupplierProfiles} supplierAliases={supplierAliases} setSupplierAliases={setSupplierAliases} supplierLists={supplierLists} setSupplierLists={setSupplierLists} />;
      case "clients": return <Clients clients={clients} setClients={setClients} sales={activeSales} products={activeProducts} withdrawals={activeWithdrawals} />;
      case "kioscos": return <Kioscos clients={clients} setClients={setClients} sales={activeSales} products={activeProducts} />;
      case "wholesaleOrder": return <WholesaleOrder clients={clients} products={products} setProducts={setProducts} sales={activeSales} setSales={setSales} logStock={logStock} />;
      case "priceList": return <PriceListScreen products={activeProducts} />;
      case "prospectos":
      // Alias de deep-links/⌘K (ex-pantallas absorbidas por el módulo):
      case "pipeline":
      case "prospectMap": {
        const tabInicial = effectivePage === "pipeline" ? "embudo"
          : effectivePage === "prospectMap" ? "zonas" : "hoy";
        return <Prospectos tabInicial={tabInicial} prospects={prospects} setProspects={setProspects} clients={clients} setClients={setClients} visits={visits} setVisits={setVisits} products={activeProducts} sales={activeSales} auditLog={auditLog} discoverySuppressed={discoverySuppressed} setDiscoverySuppressed={setDiscoverySuppressed} discoveryJobs={discoveryJobs} onCreateDiscoveryJob={createDiscoveryJob} onCancelDiscoveryJob={deleteDiscoveryJob} />;
      }
      case "routes": return <Routes routes={routes} setRoutes={setRoutes} clients={clients} sales={activeSales} setSales={setSales} />;
      case "cuentasCorrientes": return <CuentasCorrientes clients={clients} sales={activeSales} setSales={setSales} />;
      case "dashMayorista": return <DashboardMayorista clients={clients} sales={activeSales} products={activeProducts} prospects={activeProspects} />;
      case "expenses": return <Expenses expenses={expenses} setExpenses={setExpenses} currentUser={currentUser} exchangeRate={exchangeRate} logAudit={logAudit} monthlyClosures={monthlyClosures} />;
      case "withdrawals": return <Withdrawals withdrawals={withdrawals} setWithdrawals={setWithdrawals} products={products} setProducts={setProducts} sales={activeSales} clients={clients} monthlyClosures={monthlyClosures} logStock={logStock} exchangeRate={exchangeRate} currentUser={currentUser} logAudit={logAudit} />;
      case "cash": return <CashBox sales={sales} purchases={purchases} expenses={expenses} withdrawals={withdrawals} cashMovements={cashMovements} setCashMovements={setCashMovements} exchangeRate={exchangeRate} setExchangeRate={setExchangeRate} currentUser={currentUser} logAudit={logAudit} />;
      // Legacy: ?page=whatsapp ahora redirige al hub "Mensajes" con la tab Mensaje rápido
      case "whatsapp": return <Offers products={activeProducts} sales={activeSales} clients={clients} exchangeRate={exchangeRate} logAudit={logAudit} currentUser={currentUser} auditLog={auditLog} initialTab="quick" />;
      case "stocklog": return <StockLog stockLog={stockLog} setStockLog={setStockLog} products={activeProducts} />;
      case "pricelog": return <PriceLog priceLog={priceLog} products={activeProducts} setProducts={setProducts} logPrice={logPrice} exchangeRate={exchangeRate} />;
      case "analisis": return <Analisis products={activeProducts} sales={activeSales} purchases={activePurchases} expenses={activeExpenses} withdrawals={activeWithdrawals} clients={clients} cashMovements={activeCashMovements} priceLog={priceLog} partnerWithdrawals={partnerWithdrawals} setPartnerWithdrawals={setPartnerWithdrawals} monthlyClosures={monthlyClosures} setMonthlyClosures={setMonthlyClosures} exchangeRate={exchangeRate} currentUser={currentUser} logAudit={logAudit} />;
      case "export": return <ExportData
        products={activeProducts} sales={activeSales} purchases={activePurchases} expenses={activeExpenses}
        withdrawals={activeWithdrawals} cashMovements={activeCashMovements} stockLog={stockLog}
        priceLog={priceLog} clients={clients} partnerWithdrawals={partnerWithdrawals}
        monthlyClosures={monthlyClosures} exchangeRate={exchangeRate}
        prospects={prospects} visits={visits} routes={routes} discoverySuppressed={discoverySuppressed} auditLog={auditLog}
        setProspects={setProspects} setVisits={setVisits} setRoutes={setRoutes} setDiscoverySuppressed={setDiscoverySuppressed} setAuditLog={sync.setAuditLog}
        setProducts={setProducts} setSales={setSales} setPurchases={setPurchases} setExpenses={setExpenses}
        setWithdrawals={setWithdrawals} setCashMovements={setCashMovements} setClients={setClients}
        setPartnerWithdrawals={setPartnerWithdrawals} setMonthlyClosures={setMonthlyClosures}
        setStockLog={setStockLog} setPriceLog={setPriceLog}
        logAudit={logAudit} currentUser={currentUser}
      />;
      case "exchange": return <ExchangeMonitor exchangeRate={exchangeRate} setExchangeRate={setExchangeRate} />;
      case "audit": return <AuditLog auditLog={auditLog} products={products} />;
      case "offers": return <Offers products={activeProducts} sales={activeSales} clients={clients} exchangeRate={exchangeRate} logAudit={logAudit} currentUser={currentUser} auditLog={auditLog} />;
      case "trash": return <Trash products={products} setProducts={setProducts} sales={sales} setSales={setSales} purchases={purchases} setPurchases={setPurchases} expenses={expenses} setExpenses={setExpenses} cashMovements={cashMovements} setCashMovements={setCashMovements} partnerWithdrawals={partnerWithdrawals} setPartnerWithdrawals={setPartnerWithdrawals} clients={clients} setClients={setClients} coupons={coupons} setCoupons={setCoupons} prospects={prospects} setProspects={setProspects} visits={visits} setVisits={setVisits} routes={routes} setRoutes={setRoutes} logAudit={logAudit} currentUser={currentUser} />;
      default: return null;
    }
  };

  return (
    <AppContext.Provider value={ctxValue}>
      <div style={{
        minHeight: "100vh", background: "#F8F2E7", fontFamily: "'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
        color: "#1E2B4A",
        // Padding-top para compensar el header fixed. Igual a la altura del
        // header (52px contenido) + safe-area-inset-top (notch en iPhone).
        paddingTop: "calc(52px + env(safe-area-inset-top))",
      }}>
        {/* Top bar — con logo brand. FIXED en vez de sticky porque sticky
           se rompe en iOS PWA cuando body tiene overflow:hidden (al abrir
           el menú mobile). Fixed garantiza que siempre esté visible arriba. */}
        <div style={{
          background: "#FFFFFF", borderBottom: "1px solid #E5DAC2",
          paddingTop: "max(10px, env(safe-area-inset-top))",
          paddingBottom: isMobile ? "10px" : "12px",
          // safe-area-inset lateral para que el contenido no quede bajo el
          // notch en iPhone landscape. El body tiene padding lateral, pero
          // el header al ser fixed sale del flujo, entonces se lo aplicamos
          // directamente.
          paddingLeft: `max(${isMobile ? 14 : 24}px, env(safe-area-inset-left))`,
          paddingRight: `max(${isMobile ? 14 : 24}px, env(safe-area-inset-right))`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
          boxShadow: "0 2px 8px rgba(30, 43, 74, 0.04)",
          gap: 8,
        }}>
          {/* Cluster izquierdo. En mobile va SOLO el isotipo (LogoMark, sin
              texto): el LogoFull con whiteSpace:nowrap desbordaba su caja
              cuando el cluster derecho lo aplastaba y el toggle se pintaba
              encima (bug topbar 2026-07-17). Presupuesto mobile total del
              topbar: ☰(40) + logo(30) + toggle(~110) + sync(~22) ≈ 220px. */}
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 14, minWidth: 0, flex: "0 1 auto" }}>
            <button onClick={() => setMenuOpen(!menuOpen)} aria-label="Abrir menú" style={{
              background: "none", border: "none", color: "#1E2B4A", fontSize: 22, cursor: "pointer",
              display: isMobile ? "flex" : "none", flexShrink: 0,
              width: 44, height: 44, padding: 0, borderRadius: 8,
              alignItems: "center", justifyContent: "center",
            }}>☰</button>
            {isMobile
              ? <LogoMark size={30} bgColor="#FFFFFF" style={{ flexShrink: 0 }} />
              : <LogoFull size={34} />}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 12 }}>
            {/* Global Search — hidden on mobile to save space */}
            {!isMobile && (
              <div style={{ position: "relative" }}>
                <input value={globalSearch} onChange={e => { setGlobalSearch(e.target.value); setShowGlobalResults(true); }}
                  onFocus={() => setShowGlobalResults(true)}
                  placeholder="Buscar..."
                  aria-label="Búsqueda global de productos, ventas y clientes"
                  style={{ padding: "7px 14px 7px 32px", background: "#F8F2E7", border: "1px solid #E5DAC2", borderRadius: 8, color: "#1E2B4A", fontSize: 13, width: 180, outline: "none" }} />
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#9AA2B3", pointerEvents: "none" }}>🔍</span>
                {showGlobalResults && globalResults.length > 0 && (
                  <div style={{
                    position: "absolute", top: "100%", right: 0, marginTop: 6, background: "#FFFFFF",
                    border: "1px solid #E5DAC2", borderRadius: 12, width: 350, maxHeight: 400, overflowY: "auto",
                    boxShadow: "0 12px 32px rgba(0,0,0,0.1)", zIndex: 200
                  }}>
                    {globalResults.map((r, i) => (
                      <div key={i} onClick={() => { setPage(r.page); setGlobalSearch(""); setShowGlobalResults(false); }}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer",
                          borderBottom: i < globalResults.length - 1 ? "1px solid #E5DAC2" : "none" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#F8F2E7"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <span style={{ fontSize: 18 }}>{r.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: "#1E2B4A", fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                          <div style={{ color: "#9AA2B3", fontSize: 11 }}>{r.sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {showGlobalResults && globalSearch.length >= 2 && globalResults.length === 0 && (
                  <div style={{
                    position: "absolute", top: "100%", right: 0, marginTop: 6, background: "#FFFFFF",
                    border: "1px solid #E5DAC2", borderRadius: 12, width: 250, padding: "16px",
                    boxShadow: "0 12px 32px rgba(0,0,0,0.1)", zIndex: 200, textAlign: "center", color: "#9AA2B3", fontSize: 13
                  }}>Sin resultados</div>
                )}
              </div>
            )}
            {/* Selector de modo de negocio (mayorista / minorista) */}
            <div style={{ display: "flex", background: "#EFE5CE", borderRadius: 8, padding: 2, flexShrink: 0 }}>
              {[
                { m: "mayorista", label: isMobile ? "May" : "Mayorista", icon: "🏪" },
                { m: "minorista", label: isMobile ? "Min" : "Minorista", icon: "🛒" },
              ].map(({ m, label, icon }) => {
                const active = (settings.businessMode || "mayorista") === m;
                return (
                  <button key={m}
                    onClick={() => { if (!active) saveSettings({ ...settings, businessMode: m }); }}
                    title={`Modo ${m}`}
                    style={{
                      border: "none", cursor: "pointer", borderRadius: 6,
                      padding: isMobile ? "4px 7px" : "4px 10px", fontSize: 12, fontWeight: 700,
                      background: active ? "#FFFFFF" : "transparent",
                      color: active ? "#1E2B4A" : "#6B7794",
                      boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                      display: "flex", alignItems: "center", gap: 4,
                    }}>
                    <span>{icon}</span>{label}
                  </button>
                );
              })}
            </div>
            {/* Sync status badge — solo dot en mobile */}
            <div style={{
              display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600,
              padding: isMobile ? "4px 8px" : "4px 10px",
              borderRadius: 20, flexShrink: 0,
              background: syncStatus === "online" ? "#DDEDEA" : syncStatus === "error" ? "#FBE4E4" : syncStatus === "offline" ? "#FBE4E4" : "#FDECC8",
              color: syncStatus === "online" ? "#0F7B6C" : syncStatus === "error" ? "#E03E3E" : syncStatus === "offline" ? "#E03E3E" : "#CB912F",
              border: `1px solid ${syncStatus === "online" ? "#B6D4CC" : syncStatus === "error" ? "#F1B8B6" : syncStatus === "offline" ? "#F1B8B6" : "#F2D59A"}`,
              cursor: syncStatus === "error" ? "pointer" : "default",
            }} onClick={() => syncStatus === "error" && window.location.reload()} title={
              syncStatus === "online" ? "Conectado" :
              syncStatus === "offline" ? "Sin conexión" :
              syncStatus === "syncing" ? "Sincronizando..." :
              "Error · click para reintentar"
            }>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: syncStatus === "online" ? "#0F7B6C" : syncStatus === "error" || syncStatus === "offline" ? "#E03E3E" : "#CB912F", display: "inline-block", flexShrink: 0 }} />
              {!isMobile && (<>
                {syncStatus === "online" && "Online"}
                {syncStatus === "offline" && "Offline"}
                {syncStatus === "syncing" && "Sync..."}
                {syncStatus === "error" && "Error"}
              </>)}
            </div>
            {/* Dolar Blue — hidden on mobile to save space */}
            {!isMobile && (
              <div style={{ fontSize: 13, color: "#6B7794", fontWeight: 500 }}>
                Blue: <span style={{ color: "#1E2B4A", fontWeight: 700 }}>${exchangeRate}</span>
              </div>
            )}
            {/* ⚙️ / presencia / usuario: en mobile viven en el menú ☰ (el
                topbar no tiene presupuesto de ancho para ellos en 375px). */}
            {!isMobile && (
            <button onClick={() => setSettingsOpen(true)} aria-label="Configuración"
              style={{
                background: "transparent", border: "1px solid #E5DAC2",
                borderRadius: 8, padding: "5px 10px",
                cursor: "pointer", color: "#6B7794", fontSize: 14,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, fontFamily: "inherit",
              }}>⚙️</button>
            )}
            {/* Presencia del otro socio (colaboración) */}
            {!isMobile && partnerOnline && (
              <div title={`${partnerOnline.name} activo · ${partnerOnline.page || ""} · ${formatRelative(partnerOnline.lastSeen, presenceClock)}`}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  background: "#E8F5E9", border: "1px solid #B6E0BC", borderRadius: 999,
                  padding: isMobile ? "4px 8px" : "5px 10px", flexShrink: 0,
                }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E", display: "inline-block", boxShadow: "0 0 0 2px #C7EBCC" }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "#15803D", whiteSpace: "nowrap" }}>
                  {partnerOnline.icon || "👤"} {partnerOnline.name}{!isMobile && partnerOnline.page ? ` · ${partnerOnline.page}` : ""}
                </span>
              </div>
            )}
            {/* User badge */}
            {!isMobile && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "#F8F2E7", border: "1px solid #E5DAC2", borderRadius: 8,
              padding: "5px 12px",
              flexShrink: 0,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: currentUser.color, display: "inline-block", flexShrink: 0 }} />
              <span style={{
                color: "#1E2B4A", fontSize: 13, fontWeight: 600,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                minWidth: 0,
              }}>{currentUser.name}</span>
              <button onClick={handleLogout} aria-label="Cerrar sesión" style={{
                background: "none", border: "none", color: "#9AA2B3", cursor: "pointer",
                fontSize: 14, marginLeft: 2, padding: 0,
                width: 24, height: 24, borderRadius: 4,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>✕</button>
            </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex" }}>
          {/* Sidebar */}
          <nav style={{
            width: isMobile ? 260 : isTablet ? 184 : 220,
            minHeight: "calc(100vh - 52px - env(safe-area-inset-top))",
            background: "#FFFFFF", borderRight: "1px solid #E5DAC2",
            padding: "12px 0", flexShrink: 0,
            ...(isMobile ? {
              position: "fixed",
              top: "calc(52px + env(safe-area-inset-top))",
              bottom: 0,
              left: menuOpen ? 0 : -280,
              zIndex: 99,
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              transition: "left 0.28s ease",
              boxShadow: menuOpen ? "4px 0 24px rgba(15,15,15,0.12)" : "none",
              paddingBottom: "env(safe-area-inset-bottom)",
            } : {})
          }}>
            {/* Mobile: la presencia del socio vive acá (en el topbar no entra).
                Muestra MÁS info que el chip: nombre + pantalla + hace cuánto. */}
            {isMobile && partnerOnline && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8, margin: "0 12px 10px",
                padding: "10px 12px", background: "#E8F5E9", border: "1px solid #B6E0BC",
                borderRadius: 10, minHeight: 44,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E", flexShrink: 0, boxShadow: "0 0 0 2px #C7EBCC" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#15803D", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {partnerOnline.icon || "👤"} {partnerOnline.name}{partnerOnline.page ? ` · ${partnerOnline.page}` : ""} · {formatRelative(partnerOnline.lastSeen, presenceClock)}
                </span>
              </div>
            )}
            {visibleNavItems.map((item, idx) => (
              <Fragment key={item.key}>
              {/* Divisor entre el grupo del modo y las compartidas */}
              {idx > 0 && item.group === "shared" && visibleNavItems[idx - 1].group !== "shared" && (
                <div style={{ height: 1, background: "#EFE5CE", margin: "10px 16px 10px 20px" }} />
              )}
              <button onClick={() => { setPage(item.key); setMenuOpen(false); }} style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%",
                padding: isMobile ? "13px 20px" : "10px 20px",
                minHeight: isMobile ? 48 : 40,
                background: page === item.key ? "#E8EBF2" : "transparent",
                border: "none", borderLeft: page === item.key ? "3px solid #1E2B4A" : "3px solid transparent",
                color: page === item.key ? "#1E2B4A" : "#6B7794", cursor: "pointer",
                fontSize: isMobile ? 14 : 13, fontWeight: page === item.key ? 700 : 500, textAlign: "left",
                transition: "all 0.2s", fontFamily: "inherit",
                WebkitTapHighlightColor: "rgba(30,43,74,0.08)",
              }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
              </button>
              </Fragment>
            ))}
            {/* Mobile: usuario + Ajustes + salir viven acá (mudados del
                topbar, que no tiene presupuesto de ancho en 375px). */}
            {isMobile && (
              <div style={{ borderTop: "1px solid #EFE5CE", marginTop: 10, paddingTop: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 20px", minHeight: 44 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: currentUser.color, flexShrink: 0 }} />
                  <span style={{ color: "#1E2B4A", fontSize: 14, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser.name}</span>
                </div>
                <button onClick={() => { setSettingsOpen(true); setMenuOpen(false); }} style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%",
                  padding: "13px 20px", minHeight: 48,
                  background: "transparent", border: "none", borderLeft: "3px solid transparent",
                  color: "#6B7794", cursor: "pointer", fontSize: 14, fontWeight: 500,
                  textAlign: "left", fontFamily: "inherit",
                }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>⚙️</span>
                  <span>Ajustes</span>
                </button>
                <button onClick={handleLogout} style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%",
                  padding: "13px 20px", minHeight: 48,
                  background: "transparent", border: "none", borderLeft: "3px solid transparent",
                  color: "#B83232", cursor: "pointer", fontSize: 14, fontWeight: 500,
                  textAlign: "left", fontFamily: "inherit",
                }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>✕</span>
                  <span>Cerrar sesión</span>
                </button>
              </div>
            )}
          </nav>

          {/* Content */}
          <main style={{
            flex: 1,
            padding: isMobile ? "14px" : isTablet ? "18px" : "24px",
            paddingBottom: isMobile ? "max(120px, env(safe-area-inset-bottom))" : (isTablet ? "18px" : "24px"),
            maxWidth: isTablet ? "100%" : 1100, minWidth: 0,
          }} onClick={() => setShowGlobalResults(false)}>
            {syncStatus === "offline" && (
              <div style={{ background: "#FBE4E4", border: "1px solid #F1B8B6", borderRadius: 10, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#E03E3E" }}>
                <span>⚠️</span>
                <span>Sin conexión a Firebase. Estás viendo datos de caché. Los cambios que hagas <b>no se guardarán</b> hasta que se restablezca la conexión.</span>
              </div>
            )}
            <ErrorBoundary>
              <Suspense fallback={<LoadingSpinner />}>
                {renderPage()}
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>

        {/* Mobile menu overlay */}
        {isMobile && menuOpen && (
          <div onClick={() => setMenuOpen(false)} style={{
            position: "fixed", inset: 0,
            top: "calc(52px + env(safe-area-inset-top))",
            background: "rgba(0,0,0,0.2)", zIndex: 98
          }} />
        )}

        {/* FAB con menú expandible: venta rápida + consumo propio.
            Visible en todos los dispositivos. Tap en la burbuja abre el menú
            con DOS botones reales (antes la pastilla "Venta rápida" era
            decorativa con pointerEvents:none y tocaba volver a tocar el FAB
            — nadie entendía eso, parecía roto). */}
        {!quickSaleOpen && !quickMermaOpen && (
          <>
            {/* Backdrop click-out cuando el menú está abierto */}
            {fabMenuOpen && (
              <div onClick={() => setFabMenuOpen(false)} style={{
                position: "fixed", inset: 0, background: "rgba(15,15,15,0.18)", zIndex: 89,
              }} />
            )}

            {/* Opción 1: Venta rápida (botón real, clickeable) */}
            {fabMenuOpen && (
              <button onClick={() => { setFabMenuOpen(false); setQuickSaleOpen(true); }}
                aria-label="Venta rápida"
                style={{
                  position: "fixed",
                  bottom: "calc(max(20px, env(safe-area-inset-bottom)) + 144px)",
                  right: 20,
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "12px 18px 12px 16px",
                  minHeight: 48,
                  borderRadius: 999,
                  background: "linear-gradient(135deg, #0F7B6C 0%, #0a5f54 100%)",
                  border: "none", color: "#fff",
                  fontSize: 15, fontWeight: 700, cursor: "pointer",
                  zIndex: 91,
                  boxShadow: "0 6px 18px rgba(15,123,108,0.45), 0 2px 6px rgba(15,15,15,0.12)",
                  fontFamily: "inherit",
                  animation: "fabPop 0.18s ease-out",
                }}>
                <span style={{ fontSize: 20 }}>🛒</span> Venta rápida
              </button>
            )}

            {/* Opción 2: Consumo propio (botón real, clickeable) */}
            {fabMenuOpen && (
              <button onClick={() => { setFabMenuOpen(false); setQuickMermaOpen(true); }}
                aria-label="Anotar consumo propio"
                style={{
                  position: "fixed",
                  bottom: "calc(max(20px, env(safe-area-inset-bottom)) + 84px)",
                  right: 20,
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "12px 18px 12px 16px",
                  minHeight: 48,
                  borderRadius: 999,
                  background: "linear-gradient(135deg, #e17055 0%, #d35400 100%)",
                  border: "none", color: "#fff",
                  fontSize: 15, fontWeight: 700, cursor: "pointer",
                  zIndex: 91,
                  boxShadow: "0 6px 18px rgba(225,112,85,0.45), 0 2px 6px rgba(15,15,15,0.12)",
                  fontFamily: "inherit",
                  animation: "fabPop 0.22s ease-out",
                }}>
                <span style={{ fontSize: 20 }}>📉</span> Anoté un consumo
              </button>
            )}

            {/* FAB principal: abre/cierra el menú (nada más) */}
            <button onClick={() => setFabMenuOpen(o => !o)}
              aria-label={fabMenuOpen ? "Cerrar acciones rápidas" : "Acciones rápidas"}
              style={{
                position: "fixed",
                bottom: "max(16px, env(safe-area-inset-bottom))",
                right: 16,
                // Mobile: 52px alcanza como target y tapa menos los montos
                // alineados a la derecha (P&L) — bug FAB 2026-07-17.
                width: isMobile ? 52 : 60, height: isMobile ? 52 : 60,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #1E2B4A 0%, #3A4868 100%)",
                border: "none", color: "#fff",
                fontSize: isMobile ? 22 : 26, cursor: "pointer",
                zIndex: 92,
                boxShadow: "0 8px 24px rgba(30,43,74,0.45), 0 2px 8px rgba(15,15,15,0.12)",
                display: "flex", alignItems: "center", justifyContent: "center",
                transform: fabMenuOpen ? "rotate(45deg)" : "rotate(0)",
                transition: "transform 0.18s ease-out",
              }}>{fabMenuOpen ? "+" : "🛒"}</button>
          </>
        )}
        <style>{`@keyframes fabPop { from { opacity: 0; transform: translateY(10px) scale(0.92); } to { opacity: 1; transform: none; } }`}</style>

        {/* Command Palette — ⌘K para abrir desde cualquier lado */}
        <Suspense fallback={null}>
          {paletteOpen && (
            <CommandPalette
              open={paletteOpen}
              onClose={() => setPaletteOpen(false)}
              onNavigate={(page) => { setPage(page); setMenuOpen(false); }}
              onAction={(action) => {
                if (action === "quickSale") setQuickSaleOpen(true);
                else if (action === "quickWithdrawal") setQuickMermaOpen(true);
                else if (action === "settings") setSettingsOpen(true);
              }}
            />
          )}
        </Suspense>

        {/* Onboarding tour — primera vez después del login */}
        <Suspense fallback={null}>
          {onboardingOpen && (
            <OnboardingTour open={onboardingOpen} onClose={() => setOnboardingOpen(false)} />
          )}
        </Suspense>

        {/* Quick Sale Modal */}
        <Suspense fallback={null}>
          <QuickSale
            open={quickSaleOpen}
            onClose={() => setQuickSaleOpen(false)}
            products={products}
            setProducts={setProducts}
            sales={sales}
            setSales={setSales}
            logStock={logStock}
            exchangeRate={exchangeRate}
            currentUser={currentUser}
            logAudit={logAudit}
          />
        </Suspense>

        {/* Quick Withdrawal Modal */}
        <Suspense fallback={null}>
          <QuickWithdrawal
            open={quickMermaOpen}
            onClose={() => setQuickMermaOpen(false)}
            withdrawals={withdrawals}
            setWithdrawals={setWithdrawals}
            products={products}
            setProducts={setProducts}
            exchangeRate={exchangeRate}
            currentUser={currentUser}
            logStock={logStock}
            logAudit={logAudit}
          />
        </Suspense>
      </div>

      {/* Toast de error de escritura — safety net para que ningún write
          fallido pase desapercibido. Lo dispara firebase.js cuando setDoc
          falla tras retry. */}
      {/* Settings modal — owner only, montado lazy */}
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </Suspense>
      )}

      {writeErrorToast && (
        <div style={{
          position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)",
          zIndex: 2000, maxWidth: "92vw",
          background: "#E03E3E", color: "#FFFFFF",
          padding: "12px 18px", borderRadius: 10,
          boxShadow: "0 8px 24px rgba(224,62,62,0.35)",
          fontSize: 13, fontWeight: 600, fontFamily: "inherit",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>No se pudo guardar "{writeErrorToast.key}"</div>
            <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2 }}>
              {writeErrorToast.message} · Reintentá o refrescá la página.
            </div>
          </div>
          <button onClick={() => setWriteErrorToast(null)} style={{
            background: "transparent", border: "none", color: "#FFFFFF",
            fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1,
          }}>×</button>
        </div>
      )}

      {storageQuotaToast && (
        <div style={{
          position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)",
          zIndex: 2001, maxWidth: "92vw",
          background: "#CB912F", color: "#FFFFFF",
          padding: "12px 18px", borderRadius: 10,
          boxShadow: "0 8px 24px rgba(203,145,47,0.35)",
          fontSize: 13, fontWeight: 600, fontFamily: "inherit",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>📦</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>Almacenamiento local lleno</div>
            <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2 }}>
              Tu navegador rechazó guardar caché. Tus datos siguen seguros en la nube.
              Para evitar problemas, exportá un backup y limpiá el caché del navegador.
            </div>
          </div>
          <button onClick={() => setStorageQuotaToast(false)} style={{
            background: "transparent", border: "none", color: "#FFFFFF",
            fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1,
          }}>×</button>
        </div>
      )}

      {concurrentEditToast && (
        <div style={{
          position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)",
          zIndex: 2002, maxWidth: "92vw",
          background: "#1E2B4A", color: "#FFFFFF",
          padding: "12px 18px", borderRadius: 10,
          boxShadow: "0 8px 24px rgba(30,43,74,0.35)",
          fontSize: 13, fontWeight: 600, fontFamily: "inherit",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>👥</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>Edición simultánea detectada</div>
            <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2 }}>
              El otro socio modificó "{concurrentEditToast.key}" al mismo tiempo. Verificá
              que tu cambio haya quedado guardado.
            </div>
          </div>
          <button onClick={() => setConcurrentEditToast(null)} style={{
            background: "transparent", border: "none", color: "#FFFFFF",
            fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1,
          }}>×</button>
        </div>
      )}
    </AppContext.Provider>
  );
}
