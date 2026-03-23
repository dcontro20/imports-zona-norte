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

const LoadingSpinner = () => (
  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 60 }}>
    <span style={{ color: "#a855f7", fontSize: 16 }}>Cargando...</span>
  </div>
);

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
];

export default function App() {
  const USERS = [
    { name: "Diego", password: "Poncharelo20!", color: "#a855f7", icon: "💜" },
    { name: "Gustavo", password: "Gus2026!", color: "#00b894", icon: "💙" },
  ];

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const u = sessionStorage.getItem("vapestock_user");
      return u ? JSON.parse(u) : null;
    } catch { return null; }
  });
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState(false);

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

  if (!currentUser) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', -apple-system, sans-serif" }}>
        <div style={{ background: "#12122a", border: "1px solid #2a2a4a", borderRadius: 16, padding: "40px 32px", width: "100%", maxWidth: 360, textAlign: "center" }}>
          <span style={{ fontSize: 48 }}>💨</span>
          <h1 style={{ fontSize: 22, fontWeight: 800, background: "linear-gradient(135deg, #a855f7, #6c5ce7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: "12px 0 6px" }}>IMPORTS ZONA NORTE</h1>
          <p style={{ color: "#6666aa", fontSize: 13, marginBottom: 24 }}>Sistema de Gestión</p>
          <input
            type="password"
            value={loginPass}
            onChange={e => setLoginPass(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="Contraseña"
            style={{
              width: "100%", padding: "14px 18px", background: "#0d0d1a",
              border: `1px solid ${loginError ? "#e74c3c" : "#2a2a4a"}`,
              borderRadius: 10, color: "#e0e0ff", fontSize: 16, outline: "none",
              marginBottom: 14, textAlign: "center", boxSizing: "border-box",
              transition: "border-color 0.3s"
            }}
            autoFocus
          />
          <button onClick={handleLogin} style={{
            width: "100%", padding: "14px", background: "linear-gradient(135deg, #a855f7, #6c5ce7)",
            border: "none", borderRadius: 10, color: "#fff", fontSize: 16, fontWeight: 700,
            cursor: "pointer"
          }}>Entrar</button>
          {loginError && <p style={{ color: "#e74c3c", fontSize: 13, marginTop: 10 }}>Contraseña incorrecta</p>}
        </div>
      </div>
    );
  }

  const [page, setPage] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [showGlobalResults, setShowGlobalResults] = useState(false);

  const [products, setProducts] = useState(() => {
    // Always use latest catalog - version check
    const CATALOG_VERSION = "20260315b";
    const savedVersion = loadData("catalog_version", "");
    if (savedVersion !== CATALOG_VERSION) {
      saveData("catalog_version", CATALOG_VERSION);
      saveData("products", DEFAULT_PRODUCTS);
      return DEFAULT_PRODUCTS;
    }
    return loadData("products", DEFAULT_PRODUCTS);
  });
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
    // Refresh every 10 minutes
    const interval = setInterval(fetchBlue, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Save to localStorage + Firestore, but skip Firestore write if data came FROM Firestore
  const smartSave = useCallback((key, data) => {
    try { localStorage.setItem(`vapestock_${key}`, JSON.stringify(data)); } catch {}
    if (fromFirestore.current[key]) {
      fromFirestore.current[key] = false;
      return; // Don't write back to Firestore
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

  // Firebase real-time sync - subscribe to changes from other devices
  const fromFirestore = useRef({});
  
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
        try { localStorage.setItem(`vapestock_${key}`, JSON.stringify(data)); } catch {}
        fromFirestore.current[key] = true;
        setter(data);
      });
    });
    
    const unsubRate = subscribeToFirestore("exchangeRate", (data) => {
      if (typeof data === "number") {
        try { localStorage.setItem("vapestock_exchangeRate", JSON.stringify(data)); } catch {}
        fromFirestore.current["exchangeRate"] = true;
        setExchangeRate(data);
      }
    });
    
    return () => { unsubscribers.forEach(u => u()); unsubRate(); };
  }, []);

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

  const renderPage = () => {
    switch (page) {
      case "dashboard": return <Dashboard products={products} sales={sales} purchases={purchases} expenses={expenses} withdrawals={withdrawals} exchangeRate={exchangeRate} />;
      case "products": return <Products products={products} setProducts={setProducts} exchangeRate={exchangeRate} logStock={logStock} logPrice={logPrice} currentUser={currentUser} />;
      case "sales": return <Sales sales={sales} setSales={setSales} products={products} setProducts={setProducts} logStock={logStock} exchangeRate={exchangeRate} currentUser={currentUser} />;
      case "purchases": return <Purchases purchases={purchases} setPurchases={setPurchases} products={products} setProducts={setProducts} exchangeRate={exchangeRate} logStock={logStock} currentUser={currentUser} />;
      case "clients": return <Clients clients={clients} setClients={setClients} sales={sales} products={products} />;
      case "expenses": return <Expenses expenses={expenses} setExpenses={setExpenses} currentUser={currentUser} />;
      case "withdrawals": return <Withdrawals withdrawals={withdrawals} setWithdrawals={setWithdrawals} products={products} setProducts={setProducts} logStock={logStock} currentUser={currentUser} />;
      case "cash": return <CashBox sales={sales} purchases={purchases} expenses={expenses} withdrawals={withdrawals} cashMovements={cashMovements} setCashMovements={setCashMovements} exchangeRate={exchangeRate} setExchangeRate={setExchangeRate} currentUser={currentUser} />;
      case "whatsapp": return <WhatsAppMessage products={products} exchangeRate={exchangeRate} />;
      case "stocklog": return <StockLog stockLog={stockLog} setStockLog={setStockLog} products={products} />;
      case "pricelog": return <PriceLog priceLog={priceLog} products={products} setProducts={setProducts} logPrice={logPrice} exchangeRate={exchangeRate} />;
      case "partners": return <Partners partnerWithdrawals={partnerWithdrawals} setPartnerWithdrawals={setPartnerWithdrawals} sales={sales} purchases={purchases} expenses={expenses} withdrawals={withdrawals} exchangeRate={exchangeRate} currentUser={currentUser} />;
      case "closures": return <MonthlyClosures monthlyClosures={monthlyClosures} setMonthlyClosures={setMonthlyClosures} sales={sales} purchases={purchases} expenses={expenses} withdrawals={withdrawals} products={products} exchangeRate={exchangeRate} />;
      case "export": return <ExportData products={products} sales={sales} purchases={purchases} expenses={expenses} withdrawals={withdrawals} cashMovements={cashMovements} stockLog={stockLog} exchangeRate={exchangeRate} />;
      case "reports": return <Reports products={products} sales={sales} purchases={purchases} expenses={expenses} withdrawals={withdrawals} exchangeRate={exchangeRate} />;
      default: return null;
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#0d0d1a", fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
      color: "#c0c0e0"
    }}>
      {/* Top bar */}
      <div style={{
        background: "#12122a", borderBottom: "1px solid #2a2a4a", padding: "12px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setMenuOpen(!menuOpen)} style={{
            background: "none", border: "none", color: "#a855f7", fontSize: 22, cursor: "pointer",
            display: "none", ...(window.innerWidth < 768 ? { display: "block" } : {})
          }}>☰</button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 24 }}>💨</span>
            <span style={{
              fontSize: 20, fontWeight: 800, background: "linear-gradient(135deg, #a855f7, #6c5ce7)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
            }}>IMPORTS ZONA NORTE</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Global Search */}
          <div style={{ position: "relative" }}>
            <input value={globalSearch} onChange={e => { setGlobalSearch(e.target.value); setShowGlobalResults(true); }}
              onFocus={() => setShowGlobalResults(true)}
              placeholder="🔍 Buscar en todo..."
              style={{ padding: "8px 14px", background: "#0d0d1a", border: "1px solid #2a2a4a", borderRadius: 10, color: "#e0e0ff", fontSize: 13, width: 200, outline: "none" }} />
            {showGlobalResults && globalResults.length > 0 && (
              <div style={{
                position: "absolute", top: "100%", right: 0, marginTop: 6, background: "#1a1a2e",
                border: "1px solid #2a2a4a", borderRadius: 12, width: 350, maxHeight: 400, overflowY: "auto",
                boxShadow: "0 16px 40px rgba(0,0,0,0.5)", zIndex: 200
              }}>
                {globalResults.map((r, i) => (
                  <div key={i} onClick={() => { setPage(r.page); setGlobalSearch(""); setShowGlobalResults(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer",
                      borderBottom: i < globalResults.length - 1 ? "1px solid #1a1a30" : "none" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#1f1f3a"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <span style={{ fontSize: 18 }}>{r.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#e0e0ff", fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                      <div style={{ color: "#6666aa", fontSize: 11 }}>{r.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {showGlobalResults && globalSearch.length >= 2 && globalResults.length === 0 && (
              <div style={{
                position: "absolute", top: "100%", right: 0, marginTop: 6, background: "#1a1a2e",
                border: "1px solid #2a2a4a", borderRadius: 12, width: 250, padding: "16px",
                boxShadow: "0 16px 40px rgba(0,0,0,0.5)", zIndex: 200, textAlign: "center", color: "#555", fontSize: 13
              }}>Sin resultados</div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#6666aa" }}>
            {rateAutoLoaded && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#00b894", display: "inline-block" }} />}
            Blue: <span style={{ color: "#00b894", fontWeight: 700 }}>${exchangeRate}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: `${currentUser.color}15`, border: `1px solid ${currentUser.color}33`, borderRadius: 10, padding: "5px 12px" }}>
            <span style={{ fontSize: 14 }}>{currentUser.icon}</span>
            <span style={{ color: currentUser.color, fontSize: 13, fontWeight: 700 }}>{currentUser.name}</span>
            <button onClick={handleLogout} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 12, marginLeft: 4 }} title="Cerrar sesión">✕</button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex" }}>
        {/* Sidebar */}
        <nav style={{
          width: 220, minHeight: "calc(100vh - 52px)", background: "#12122a", borderRight: "1px solid #2a2a4a",
          padding: "12px 0", flexShrink: 0,
          ...(window.innerWidth < 768 ? {
            position: "fixed", top: 52, left: menuOpen ? 0 : -240, zIndex: 99,
            transition: "left 0.3s", boxShadow: menuOpen ? "4px 0 20px rgba(0,0,0,0.5)" : "none"
          } : {})
        }}>
          {NAV_ITEMS.map(item => (
            <button key={item.key} onClick={() => { setPage(item.key); setMenuOpen(false); }} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "12px 20px",
              background: page === item.key ? "#1a1a3a" : "transparent",
              border: "none", borderLeft: page === item.key ? "3px solid #a855f7" : "3px solid transparent",
              color: page === item.key ? "#e0e0ff" : "#6666aa", cursor: "pointer",
              fontSize: 14, fontWeight: page === item.key ? 700 : 500, textAlign: "left",
              transition: "all 0.2s"
            }}>
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main style={{ flex: 1, padding: "24px", maxWidth: 1100 }} onClick={() => setShowGlobalResults(false)}>
          <Suspense fallback={<LoadingSpinner />}>
            {renderPage()}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
