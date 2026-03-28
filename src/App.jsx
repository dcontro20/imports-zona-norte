import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from "react";
import { saveToFirestore, subscribeToFirestore } from "./firebase.js";
import { DEFAULT_PRODUCTS } from "./constants.js";
import { loadData, uid, formatMoney, formatDate } from "./helpers.js";

// Lazy load all page components
const Dashboard = lazy(() => import("./components/Dashboard.jsx").then(m => ({ default: m.Dashboard })));
const Products = lazy(() => import("./components/Products.jsx").then(m => ({ default: m.Products })));
const Sales = lazy(() => import("./components/Sales.jsx").then(m => ({ default: m.Sales })));
const Purchases = lazy(() => import("./components/Purchases.jsx").then(m => ({ default: m.Purchases })));
const Clients = lazy(() => import("./components/Clients.jsx").then(m => ({ default: m.Clients })));
const Expenses = lazy(() => import("./components/Expenses.jsx").then(m => ({ default: m.Expenses })));
const Withdrawals = lazy(() => import("./components/Withdrawals.jsx").then(m => ({ default: m.Withdrawals })));
const CashBox = lazy(() => import("./components/CashBox.jsx").then(m => ({ default: m.CashBox })));
const Reports = lazy(() => import("./components/Reports.jsx").then(m => ({ default: m.Reports })));
const WhatsAppMessage = lazy(() => import("./components/WhatsApp.jsx").then(m => ({ default: m.WhatsAppMessage })));
const Partners = lazy(() => import("./components/Partners.jsx").then(m => ({ default: m.Partners })));
const MonthlyClosures = lazy(() => import("./components/Closures.jsx").then(m => ({ default: m.MonthlyClosures })));
const ExportData = lazy(() => import("./components/Export.jsx").then(m => ({ default: m.ExportData })));
const PriceLog = lazy(() => import("./components/PriceLog.jsx").then(m => ({ default: m.PriceLog })));
const StockLog = lazy(() => import("./components/StockLog.jsx").then(m => ({ default: m.StockLog })));
const ExchangeMonitor = lazy(() => import("./components/ExchangeMonitor.jsx").then(m => ({ default: m.ExchangeMonitor })));

const LoadingSpinner = () => (
  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 60 }}>
    <span style={{ color: "#6366f1", fontSize: 15, fontWeight: 500 }}>Cargando...</span>
  </div>
);

// ============================================
// RESPONSIVE HOOK
// ============================================
export const useResponsive = () => {
  const [dimensions, setDimensions] = useState({
    isMobile: typeof window !== "undefined" ? window.innerWidth < 768 : false,
    isTablet: typeof window !== "undefined" ? window.innerWidth >= 768 && window.innerWidth <= 1024 : false,
    isDesktop: typeof window !== "undefined" ? window.innerWidth > 1024 : true,
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      setDimensions({
        isMobile: width < 768,
        isTablet: width >= 768 && width <= 1024,
        isDesktop: width > 1024,
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return dimensions;
};

// ============================================
// MAIN APP
// ============================================
const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: "📊" },
  { key: "products", label: "Stock", icon: "📦" },
  { key: "sales", label: "Ventas", icon: "🛒" },
  { key: "purchases", label: "Compras", icon: "🚚" },
  { key: "clients", label: "Clientes", icon: "👥" },
  { key: "expenses", label: "Gastos", icon: "💸" },
  { key: "withdrawals", label: "Mermas", icon: "📉" },
  { key: "cash", label: "Caja", icon: "💰" },
  { key: "whatsapp", label: "WhatsApp", icon: "📲" },
  { key: "stocklog", label: "Historial", icon: "📋" },
  { key: "pricelog", label: "Precios", icon: "💲" },
  { key: "partners", label: "Socios", icon: "🤝" },
  { key: "closures", label: "Cierres", icon: "📅" },
  { key: "export", label: "Exportar", icon: "📥" },
  { key: "reports", label: "Reportes", icon: "📈" },
  { key: "exchange", label: "Cotizaciones", icon: "💱" },
];

export default function App() {
  const { isMobile, isTablet, isDesktop } = useResponsive();

  const USERS = [
    { name: "Diego", password: "Poncharelo20!", color: "#6366f1", icon: "💜" },
    { name: "Gustavo", password: "Gus2026!", color: "#10b981", icon: "💙" },
  ];

  // ---- ALL HOOKS MUST BE DECLARED BEFORE ANY CONDITIONAL RETURN ----
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const u = sessionStorage.getItem("vapestock_user");
      return u ? JSON.parse(u) : null;
    } catch { return null; }
  });
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [showGlobalResults, setShowGlobalResults] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  const [products, setProducts] = useState(() => loadData("products", DEFAULT_PRODUCTS));
  const [sales, setSales] = useState(() => loadData("sales", []));
  const [purchases, setPurchases] = useState(() => loadData("purchases", []));
  const [clients, setClients] = useState(() => loadData("clients", []));
  const [expenses, setExpenses] = useState(() => loadData("expenses", []));
  const [withdrawals, setWithdrawals] = useState(() => loadData("withdrawals", []));
  const [cashMovements, setCashMovements] = useState(() => loadData("cashMovements", []));
  const [stockLog, setStockLog] = useState(() => loadData("stockLog", []));
  const [priceLog, setPriceLog] = useState(() => loadData("priceLog", []));
  const [monthlyClosures, setMonthlyClosures] = useState(() => loadData("monthlyClosures", []));
  const [partnerWithdrawals, setPartnerWithdrawals] = useState(() => loadData("partnerWithdrawals", []));
  const [exchangeRate, setExchangeRate] = useState(() => loadData("exchangeRate", 1415));
  const [rateAutoLoaded, setRateAutoLoaded] = useState(false);

  // Auto-fetch dolar blue venta from dolarapi.com
  useEffect(() => {
    const fetchBlue = async () => {
      try {
        const res = await fetch("https://dolarapi.com/v1/dolares/blue");
        const data = await res.json();
        if (data && data.venta) {
          setExchangeRate(data.venta);
          setRateAutoLoaded(true);
        }
      } catch (e) {
        console.log("No se pudo obtener cotización automática, usando valor manual");
      }
    };
    fetchBlue();
    const interval = setInterval(fetchBlue, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // ---- FIREBASE SYNC SYSTEM ----
  // Track whether a state update came from Firestore (to avoid writing it back)
  const fromFirestore = useRef({});
  // Track whether initial Firestore load is done per key
  const initialLoadDone = useRef({});
  // CRITICAL: Block ALL writes to Firestore until initial load completes
  // Unlike before, this is NEVER set to true by a timeout — only by actual Firebase data
  const firestoreReady = useRef(false);
  // Track sync status for UI indicator
  const [syncStatus, setSyncStatus] = useState("syncing"); // "syncing" | "online" | "offline"

  // Subscribe to Firestore real-time updates (runs once on mount)
  useEffect(() => {
    const keys = [
      { key: "products", setter: setProducts },
      { key: "sales", setter: setSales },
      { key: "purchases", setter: setPurchases },
      { key: "clients", setter: setClients },
      { key: "expenses", setter: setExpenses },
      { key: "withdrawals", setter: setWithdrawals },
      { key: "cashMovements", setter: setCashMovements },
      { key: "stockLog", setter: setStockLog },
      { key: "priceLog", setter: setPriceLog },
      { key: "monthlyClosures", setter: setMonthlyClosures },
      { key: "partnerWithdrawals", setter: setPartnerWithdrawals },
    ];

    const unsubscribers = keys.map(({ key, setter }) => {
      return subscribeToFirestore(key, (data) => {
        // Always accept Firestore data — it's the source of truth
        try { localStorage.setItem(`vapestock_${key}`, JSON.stringify(data)); } catch {}
        fromFirestore.current[key] = true;
        setter(data);
        initialLoadDone.current[key] = true;
        // Check if all initial loads are done
        if (keys.every(k => initialLoadDone.current[k.key])) {
          setDataReady(true);
          setSyncStatus("online");
          // Allow writes to Firestore only AFTER we received all data
          // Small delay to let React finish processing all state updates
          setTimeout(() => { firestoreReady.current = true; }, 2000);
        }
      });
    });

    const unsubRate = subscribeToFirestore("exchangeRate", (data) => {
      if (typeof data === "number") {
        try { localStorage.setItem("vapestock_exchangeRate", JSON.stringify(data)); } catch {}
        fromFirestore.current["exchangeRate"] = true;
        setExchangeRate(data);
      }
    });

    // If Firestore takes too long, show localStorage data for READING ONLY
    // CRITICAL FIX: Do NOT set firestoreReady=true on timeout!
    // This prevents stale localStorage data from overwriting Firebase
    const timeout = setTimeout(() => {
      if (!firestoreReady.current) {
        setDataReady(true); // Let user see cached data (read-only effectively)
        setSyncStatus("offline");
        console.warn("[SYNC] Firebase no respondió en 8s. Datos visibles son de caché. Escrituras bloqueadas hasta sincronizar.");
      }
    }, 8000);

    return () => { unsubscribers.forEach(u => u()); unsubRate(); clearTimeout(timeout); };
  }, []);

  // Save to localStorage + Firestore when state changes locally
  const smartSave = useCallback((key, data) => {
    try { localStorage.setItem(`vapestock_${key}`, JSON.stringify(data)); } catch {}
    // NEVER write to Firestore if initial load hasn't completed
    if (!firestoreReady.current) return;
    // Don't write back data that came FROM Firestore
    if (fromFirestore.current[key]) {
      fromFirestore.current[key] = false;
      return;
    }
    saveToFirestore(key, data);
  }, []);

  useEffect(() => smartSave("products", products), [products]);
  useEffect(() => smartSave("sales", sales), [sales]);
  useEffect(() => smartSave("purchases", purchases), [purchases]);
  useEffect(() => smartSave("clients", clients), [clients]);
  useEffect(() => smartSave("expenses", expenses), [expenses]);
  useEffect(() => smartSave("withdrawals", withdrawals), [withdrawals]);
  useEffect(() => smartSave("cashMovements", cashMovements), [cashMovements]);
  useEffect(() => smartSave("stockLog", stockLog), [stockLog]);
  useEffect(() => smartSave("priceLog", priceLog), [priceLog]);
  useEffect(() => smartSave("monthlyClosures", monthlyClosures), [monthlyClosures]);
  useEffect(() => smartSave("partnerWithdrawals", partnerWithdrawals), [partnerWithdrawals]);
  useEffect(() => smartSave("exchangeRate", exchangeRate), [exchangeRate]);

  // Stock log helper
  const logStock = useCallback((entries) => {
    const logs = (Array.isArray(entries) ? entries : [entries]).map(e => ({
      id: uid(), date: e.date || new Date().toISOString(), productId: e.productId,
      type: e.type, qty: e.qty, reason: e.reason || "", refId: e.refId || ""
    }));
    setStockLog(prev => [...logs, ...prev]);
  }, []);

  // Global search
  const globalResults = useMemo(() => {
    if (!globalSearch || globalSearch.length < 2) return [];
    const q = globalSearch.toLowerCase();
    const results = [];

    // Search products
    products.filter(p => `${p.brand} ${p.model} ${p.flavor}`.toLowerCase().includes(q)).slice(0, 5)
      .forEach(p => results.push({ type: "product", icon: "📦", label: `${p.brand} ${p.model} - ${p.flavor}`, sub: `Stock: ${p.stock} · ${p.puffs}p`, page: "products" }));

    // Search sales
    sales.filter(s => {
      const items = (s.items || []).map(i => { const p = products.find(pr => pr.id === i.productId); return p ? `${p.brand} ${p.model} ${p.flavor}` : ""; }).join(" ");
      return items.toLowerCase().includes(q) || (s.clientName || "").toLowerCase().includes(q);
    }).slice(0, 5).forEach(s => results.push({ type: "sale", icon: "🛒", label: `Venta ${s.clientName || ""}`, sub: `${formatDate(s.date)} · ${formatMoney(s.total, s.currency)}`, page: "sales" }));

    // Search clients
    (clients || []).filter(c => `${c.name} ${c.phone} ${c.instagram}`.toLowerCase().includes(q)).slice(0, 3)
      .forEach(c => results.push({ type: "client", icon: "👥", label: c.name, sub: c.phone || c.instagram || "", page: "clients" }));

    // Search purchases
    purchases.filter(p => (p.supplier || "").toLowerCase().includes(q)).slice(0, 3)
      .forEach(p => results.push({ type: "purchase", icon: "🚚", label: `Pedido - ${p.supplier}`, sub: `${formatDate(p.date)} · ${p.status}`, page: "purchases" }));

    // Search expenses
    expenses.filter(e => `${e.category} ${e.description}`.toLowerCase().includes(q)).slice(0, 3)
      .forEach(e => results.push({ type: "expense", icon: "💸", label: `${e.category}`, sub: `${formatDate(e.date)} · ${formatMoney(e.amountARS)}`, page: "expenses" }));

    return results;
  }, [globalSearch, products, sales, clients, purchases, expenses]);

  // Price log helper
  const logPrice = useCallback((productId, oldPrice, newPrice, field) => {
    if (oldPrice === newPrice) return;
    setPriceLog(prev => [{ id: uid(), date: new Date().toISOString(), productId, field, oldPrice, newPrice }, ...prev]);
  }, []);

  // ---- LOGIN HANDLERS ----
  const handleLogin = () => {
    const user = USERS.find(u => u.password === loginPass);
    if (user) {
      setCurrentUser(user);
      try { sessionStorage.setItem("vapestock_user", JSON.stringify(user)); } catch {}
      setLoginError(false);
    } else {
      setLoginError(true);
      setTimeout(() => setLoginError(false), 2000);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    try { sessionStorage.removeItem("vapestock_user"); } catch {}
  };

  // ---- LOGIN SCREEN (shown when no user is authenticated) ----
  if (!currentUser) {
    return (
      <div style={{ minHeight: "100vh", background: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', 'Segoe UI', -apple-system, sans-serif" }}>
        <div style={{ background: "#fff", border: "1px solid #e2e4e9", borderRadius: 16, padding: isMobile ? "32px 24px" : "40px 32px", width: "100%", maxWidth: 360, textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
          <span style={{ fontSize: 48 }}>💨</span>
          <h1 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: "#1a1a2e", margin: "12px 0 6px" }}>IMPORTS ZONA NORTE</h1>
          <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 24 }}>Sistema de Gestión</p>
          <input
            type="password"
            value={loginPass}
            onChange={e => setLoginPass(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="Contraseña"
            style={{
              width: "100%", padding: "14px 18px", background: "#f7f8fa",
              border: `1px solid ${loginError ? "#ef4444" : "#e2e4e9"}`,
              borderRadius: 10, color: "#1a1a2e", fontSize: 16, outline: "none",
              marginBottom: 14, textAlign: "center", boxSizing: "border-box",
              transition: "border-color 0.3s"
            }}
            autoFocus
          />
          <button onClick={handleLogin} style={{
            width: "100%", padding: "14px", background: "#6366f1",
            border: "none", borderRadius: 10, color: "#fff", fontSize: 16, fontWeight: 700,
            cursor: "pointer"
          }}>Entrar</button>
          {loginError && <p style={{ color: "#ef4444", fontSize: 13, marginTop: 10 }}>Contraseña incorrecta</p>}
        </div>
      </div>
    );
  }

  const renderPage = () => {
    switch (page) {
      case "dashboard": return <Dashboard products={products} sales={sales} purchases={purchases} expenses={expenses} withdrawals={withdrawals} exchangeRate={exchangeRate} />;
      case "products": return <Products products={products} setProducts={setProducts} exchangeRate={exchangeRate} logStock={logStock} logPrice={logPrice} currentUser={currentUser} />;
      case "sales": return <Sales sales={sales} setSales={setSales} products={products} setProducts={setProducts} clients={clients} setClients={setClients} cashMovements={cashMovements} setCashMovements={setCashMovements} logStock={logStock} exchangeRate={exchangeRate} currentUser={currentUser} />;
      case "purchases": return <Purchases purchases={purchases} setPurchases={setPurchases} products={products} setProducts={setProducts} exchangeRate={exchangeRate} logStock={logStock} currentUser={currentUser} />;
      case "clients": return <Clients clients={clients} setClients={setClients} sales={sales} products={products} />;
      case "expenses": return <Expenses expenses={expenses} setExpenses={setExpenses} currentUser={currentUser} exchangeRate={exchangeRate} />;
      case "withdrawals": return <Withdrawals withdrawals={withdrawals} setWithdrawals={setWithdrawals} products={products} setProducts={setProducts} logStock={logStock} currentUser={currentUser} />;
      case "cash": return <CashBox sales={sales} purchases={purchases} expenses={expenses} withdrawals={withdrawals} cashMovements={cashMovements} setCashMovements={setCashMovements} exchangeRate={exchangeRate} setExchangeRate={setExchangeRate} currentUser={currentUser} />;
      case "whatsapp": return <WhatsAppMessage products={products} exchangeRate={exchangeRate} />;
      case "stocklog": return <StockLog stockLog={stockLog} setStockLog={setStockLog} products={products} />;
      case "pricelog": return <PriceLog priceLog={priceLog} products={products} setProducts={setProducts} logPrice={logPrice} exchangeRate={exchangeRate} />;
      case "partners": return <Partners partnerWithdrawals={partnerWithdrawals} setPartnerWithdrawals={setPartnerWithdrawals} sales={sales} purchases={purchases} expenses={expenses} withdrawals={withdrawals} exchangeRate={exchangeRate} currentUser={currentUser} />;
      case "closures": return <MonthlyClosures monthlyClosures={monthlyClosures} setMonthlyClosures={setMonthlyClosures} sales={sales} purchases={purchases} expenses={expenses} withdrawals={withdrawals} products={products} exchangeRate={exchangeRate} />;
      case "export": return <ExportData products={products} sales={sales} purchases={purchases} expenses={expenses} withdrawals={withdrawals} cashMovements={cashMovements} stockLog={stockLog} exchangeRate={exchangeRate} />;
      case "reports": return <Reports products={products} sales={sales} purchases={purchases} expenses={expenses} withdrawals={withdrawals} exchangeRate={exchangeRate} />;
      case "exchange": return <ExchangeMonitor exchangeRate={exchangeRate} />;
      default: return null;
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#e5e7eb", fontFamily: "'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
      color: "#1a1a2e"
    }}>
      {/* Top bar */}
      <div style={{
        background: "#fff", borderBottom: "1px solid #e2e4e9", padding: isMobile ? "8px 12px" : "10px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12 }}>
          <button onClick={() => setMenuOpen(!menuOpen)} style={{
            background: "none", border: "none", color: "#6366f1", fontSize: 20, cursor: "pointer",
            display: isMobile ? "block" : "none"
          }}>☰</button>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 20 }}>💨</span>
            <span style={{ fontSize: isMobile ? 13 : 16, fontWeight: 800, color: "#1a1a2e", letterSpacing: "-0.3px", display: isMobile ? "none" : "block" }}>IMPORTS ZONA NORTE</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {/* Global Search - hidden on mobile */}
          <div style={{ position: "relative", display: isMobile ? "none" : "block" }}>
            <input value={globalSearch} onChange={e => { setGlobalSearch(e.target.value); setShowGlobalResults(true); }}
              onFocus={() => setShowGlobalResults(true)}
              placeholder="Buscar..."
              style={{ padding: "7px 14px 7px 32px", background: "#f7f8fa", border: "1px solid #e2e4e9", borderRadius: 8, color: "#1a1a2e", fontSize: 13, width: 180, outline: "none" }} />
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#9ca3af", pointerEvents: "none" }}>🔍</span>
            {showGlobalResults && globalResults.length > 0 && (
              <div style={{
                position: "absolute", top: "100%", right: 0, marginTop: 6, background: "#fff",
                border: "1px solid #e2e4e9", borderRadius: 12, width: 350, maxHeight: 400, overflowY: "auto",
                boxShadow: "0 12px 32px rgba(0,0,0,0.1)", zIndex: 200
              }}>
                {globalResults.map((r, i) => (
                  <div key={i} onClick={() => { setPage(r.page); setGlobalSearch(""); setShowGlobalResults(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer",
                      borderBottom: i < globalResults.length - 1 ? "1px solid #f0f1f5" : "none" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f7f8fa"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <span style={{ fontSize: 18 }}>{r.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#1a1a2e", fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                      <div style={{ color: "#9ca3af", fontSize: 11 }}>{r.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {showGlobalResults && globalSearch.length >= 2 && globalResults.length === 0 && (
              <div style={{
                position: "absolute", top: "100%", right: 0, marginTop: 6, background: "#fff",
                border: "1px solid #e2e4e9", borderRadius: 12, width: 250, padding: "16px",
                boxShadow: "0 12px 32px rgba(0,0,0,0.1)", zIndex: 200, textAlign: "center", color: "#9ca3af", fontSize: 13
              }}>Sin resultados</div>
            )}
          </div>
          {/* Sync status badge */}
          <div style={{
            display: "flex", alignItems: "center", gap: 5, fontSize: isMobile ? 10 : 11, fontWeight: 600,
            padding: isMobile ? "3px 8px" : "4px 10px", borderRadius: 20,
            background: syncStatus === "online" ? "#ecfdf5" : syncStatus === "offline" ? "#fef2f2" : "#fffbeb",
            color: syncStatus === "online" ? "#059669" : syncStatus === "offline" ? "#dc2626" : "#d97706",
            border: `1px solid ${syncStatus === "online" ? "#a7f3d0" : syncStatus === "offline" ? "#fecaca" : "#fde68a"}`
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: syncStatus === "online" ? "#059669" : syncStatus === "offline" ? "#dc2626" : "#d97706", display: "inline-block" }} />
            {syncStatus === "online" && "Online"}
            {syncStatus === "offline" && "Offline"}
            {syncStatus === "syncing" && "Sync..."}
          </div>
          {/* Dolar Blue */}
          <div style={{ fontSize: isMobile ? 11 : 13, color: "#6b7280", fontWeight: 500, whiteSpace: "nowrap" }}>
            Blue: <span style={{ color: "#1a1a2e", fontWeight: 700 }}>${exchangeRate}</span>
          </div>
          {/* User badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, background: "#f7f8fa", border: "1px solid #e2e4e9", borderRadius: 8, padding: isMobile ? "4px 8px" : "5px 12px" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: currentUser.color, display: "inline-block" }} />
            <span style={{ color: "#1a1a2e", fontSize: isMobile ? 11 : 13, fontWeight: 600 }}>{currentUser.name}</span>
            <button onClick={handleLogout} style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 11, marginLeft: 2 }} title="Cerrar sesión">✕</button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex" }}>
        {/* Sidebar backdrop overlay on mobile */}
        {isMobile && menuOpen && (
          <div
            style={{
              position: "fixed", top: isMobile ? 52 : 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.3)",
              zIndex: 98, cursor: "pointer"
            }}
            onClick={() => setMenuOpen(false)}
          />
        )}

        {/* Sidebar */}
        <nav style={{
          width: 220, minHeight: `calc(100vh - ${isMobile ? 44 : 52}px)`, background: "#fff", borderRight: "1px solid #e2e4e9",
          padding: "12px 0", flexShrink: 0,
          ...(isMobile ? {
            position: "fixed", top: 52, left: menuOpen ? 0 : -240, zIndex: 99,
            transition: "left 0.3s", boxShadow: menuOpen ? "4px 0 20px rgba(0,0,0,0.08)" : "none", width: 220
          } : {})
        }}>
          {NAV_ITEMS.map(item => (
            <button key={item.key} onClick={() => { setPage(item.key); setMenuOpen(false); }} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 20px",
              background: page === item.key ? "#f0f0ff" : "transparent",
              border: "none", borderLeft: page === item.key ? "3px solid #6366f1" : "3px solid transparent",
              color: page === item.key ? "#1a1a2e" : "#6b7280", cursor: "pointer",
              fontSize: 13, fontWeight: page === item.key ? 700 : 500, textAlign: "left",
              transition: "all 0.2s"
            }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main style={{ flex: 1, padding: isMobile ? "14px" : "24px", maxWidth: isMobile ? "none" : 1100 }} onClick={() => setShowGlobalResults(false)}>
          {syncStatus === "offline" && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: isMobile ? "8px 12px" : "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8, fontSize: isMobile ? 12 : 13, color: "#dc2626" }}>
              <span>⚠️</span>
              <span>Sin conexión a Firebase. Estás viendo datos de caché. Los cambios que hagas <b>no se guardarán</b> hasta que se restablezca la conexión.</span>
            </div>
          )}
          <Suspense fallback={<LoadingSpinner />}>
            {renderPage()}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
