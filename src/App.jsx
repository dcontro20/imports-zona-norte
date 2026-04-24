import { useState, useEffect, useMemo, useCallback, lazy, Suspense, Component } from "react";
import { uid, formatMoney, formatDate } from "./helpers.js";
import { useFirebaseSync } from "./useFirebaseSync.js";
import { AppContext } from "./AppContext.js";
import { loginWithEmail, logout, onAuthChange, getUserProfile } from "./firebase.js";

// Responsive hook — used by UI.jsx, Dashboard.jsx, PriceLog.jsx and others
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
const AuditLog = lazy(() => import("./components/AuditLog.jsx").then(m => ({ default: m.AuditLog })));
const ExchangeMonitor = lazy(() => import("./components/ExchangeMonitor.jsx").then(m => ({ default: m.ExchangeMonitor })));
const Trash = lazy(() => import("./components/Trash.jsx").then(m => ({ default: m.Trash })));
const QuickSale = lazy(() => import("./components/QuickSale.jsx").then(m => ({ default: m.QuickSale })));
const QuickWithdrawal = lazy(() => import("./components/QuickWithdrawal.jsx").then(m => ({ default: m.QuickWithdrawal })));

const LoadingSpinner = () => (
  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "40px 16px" }}>
    <span style={{ color: "#5E6AD2", fontSize: 15, fontWeight: 500 }}>Cargando...</span>
  </div>
);

// ErrorBoundary — prevents a crash in one component from killing the entire app
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "32px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ color: "#37352F", marginBottom: 8 }}>Algo salió mal</h2>
          <p style={{ color: "#8C8A82", fontSize: 14, marginBottom: 20 }}>{this.state.error?.message || "Error inesperado"}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })} style={{
            padding: "10px 24px", background: "#5E6AD2", color: "#fff", border: "none",
            borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer"
          }}>Reintentar</button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  { key: "audit", label: "Auditoría", icon: "🔍" },
  { key: "trash", label: "Papelera", icon: "🗑️" },
];

export default function App() {
  const { isMobile } = useResponsive();

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
  const [page, setPage] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [showGlobalResults, setShowGlobalResults] = useState(false);
  const [quickSaleOpen, setQuickSaleOpen] = useState(false);
  const [quickMermaOpen, setQuickMermaOpen] = useState(false);
  const [fabMenuOpen, setFabMenuOpen] = useState(false);

  // Body scroll lock cuando sidebar mobile está abierto
  useEffect(() => {
    if (isMobile && menuOpen) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = original; };
    }
  }, [isMobile, menuOpen]);

  // ---- All data + sync from custom hook ----
  const sync = useFirebaseSync();
  const {
    products, setProducts, sales, setSales, purchases, setPurchases,
    clients, setClients, expenses, setExpenses, withdrawals, setWithdrawals,
    cashMovements, setCashMovements, stockLog, setStockLog, priceLog,
    monthlyClosures, setMonthlyClosures, partnerWithdrawals, setPartnerWithdrawals,
    exchangeRate, setExchangeRate, auditLog,
    syncStatus, logStock, logPrice,
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
      .forEach(p => results.push({ type: "purchase", icon: "🚚", label: `Pedido - ${p.supplier}`, sub: `${formatDate(p.date)} · ${p.status}`, page: "purchases" }));

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

  // ---- Context value (for components that want to use context instead of props) ----
  const ctxValue = useMemo(() => ({
    currentUser, exchangeRate, logAudit, logStock, logPrice,
  }), [currentUser, exchangeRate, logAudit, logStock, logPrice]);

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
    await logout();
    // onAuthChange will set currentUser to null
  };

  // ---- Loading screen ----
  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#FAFAF9", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <span style={{ fontSize: 48 }}>💨</span>
          <p style={{ color: "#5E6AD2", fontSize: 15, fontWeight: 500, marginTop: 12 }}>Cargando...</p>
        </div>
      </div>
    );
  }

  // ---- Login screen ----
  if (!currentUser) {
    return (
      <div style={{ minHeight: "100vh", background: "#FAFAF9", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Open Sans', 'Inter', -apple-system, sans-serif" }}>
        <div style={{ background: "#FFFFFF", border: "1px solid #E8E7E3", borderRadius: 16, padding: "40px 32px", width: "100%", maxWidth: 360, textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
          <span style={{ fontSize: 48 }}>💨</span>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#37352F", margin: "12px 0 6px", fontFamily: "'Poppins', sans-serif" }}>IMPORTS ZONA NORTE</h1>
          <p style={{ color: "#B1AFA7", fontSize: 13, marginBottom: 24 }}>Sistema de Gestión</p>
          <input
            type="email"
            value={loginEmail}
            onChange={e => setLoginEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && document.getElementById("login-pass")?.focus()}
            placeholder="Email"
            style={{
              width: "100%", padding: "14px 18px", background: "#FAFAF9",
              border: `1px solid ${loginError ? "#E03E3E" : "#E8E7E3"}`,
              borderRadius: 10, color: "#37352F", fontSize: 16, outline: "none",
              marginBottom: 10, boxSizing: "border-box",
              transition: "border-color 0.3s"
            }}
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
              width: "100%", padding: "14px 18px", background: "#FAFAF9",
              border: `1px solid ${loginError ? "#E03E3E" : "#E8E7E3"}`,
              borderRadius: 10, color: "#37352F", fontSize: 16, outline: "none",
              marginBottom: 14, boxSizing: "border-box",
              transition: "border-color 0.3s"
            }}
          />
          <button onClick={handleLogin} style={{
            width: "100%", padding: "14px", background: "#5E6AD2",
            border: "none", borderRadius: 10, color: "#fff", fontSize: 16, fontWeight: 700,
            cursor: "pointer"
          }}>Entrar</button>
          {loginError && <p style={{ color: "#E03E3E", fontSize: 13, marginTop: 10 }}>{loginError}</p>}
        </div>
      </div>
    );
  }

  const renderPage = () => {
    switch (page) {
      case "dashboard": return <Dashboard products={activeProducts} sales={activeSales} purchases={activePurchases} expenses={activeExpenses} withdrawals={activeWithdrawals} exchangeRate={exchangeRate} />;
      case "products": return <Products products={products} setProducts={setProducts} exchangeRate={exchangeRate} logStock={logStock} logPrice={logPrice} currentUser={currentUser} logAudit={logAudit} />;
      case "sales": return <Sales sales={sales} setSales={setSales} products={products} setProducts={setProducts} logStock={logStock} exchangeRate={exchangeRate} currentUser={currentUser} logAudit={logAudit} clients={clients} setClients={setClients} cashMovements={cashMovements} setCashMovements={setCashMovements} />;
      case "purchases": return <Purchases purchases={purchases} setPurchases={setPurchases} products={products} setProducts={setProducts} exchangeRate={exchangeRate} logStock={logStock} currentUser={currentUser} logAudit={logAudit} />;
      case "clients": return <Clients clients={clients} setClients={setClients} sales={activeSales} products={activeProducts} withdrawals={activeWithdrawals} />;
      case "expenses": return <Expenses expenses={expenses} setExpenses={setExpenses} currentUser={currentUser} exchangeRate={exchangeRate} logAudit={logAudit} />;
      case "withdrawals": return <Withdrawals withdrawals={withdrawals} setWithdrawals={setWithdrawals} products={products} setProducts={setProducts} sales={activeSales} clients={clients} logStock={logStock} exchangeRate={exchangeRate} currentUser={currentUser} logAudit={logAudit} />;
      case "cash": return <CashBox sales={sales} purchases={purchases} expenses={expenses} withdrawals={withdrawals} cashMovements={cashMovements} setCashMovements={setCashMovements} exchangeRate={exchangeRate} setExchangeRate={setExchangeRate} currentUser={currentUser} logAudit={logAudit} />;
      case "whatsapp": return <WhatsAppMessage products={activeProducts} exchangeRate={exchangeRate} />;
      case "stocklog": return <StockLog stockLog={stockLog} setStockLog={setStockLog} products={activeProducts} />;
      case "pricelog": return <PriceLog priceLog={priceLog} products={activeProducts} setProducts={setProducts} logPrice={logPrice} exchangeRate={exchangeRate} />;
      case "partners": return <Partners partnerWithdrawals={partnerWithdrawals} setPartnerWithdrawals={setPartnerWithdrawals} sales={activeSales} purchases={activePurchases} expenses={activeExpenses} withdrawals={activeWithdrawals} exchangeRate={exchangeRate} currentUser={currentUser} logAudit={logAudit} />;
      case "closures": return <MonthlyClosures monthlyClosures={monthlyClosures} setMonthlyClosures={setMonthlyClosures} sales={activeSales} purchases={activePurchases} expenses={activeExpenses} withdrawals={activeWithdrawals} products={activeProducts} exchangeRate={exchangeRate} logAudit={logAudit} />;
      case "export": return <ExportData products={activeProducts} sales={activeSales} purchases={activePurchases} expenses={activeExpenses} withdrawals={activeWithdrawals} cashMovements={activeCashMovements} stockLog={stockLog} exchangeRate={exchangeRate} />;
      case "reports": return <Reports products={activeProducts} sales={activeSales} purchases={activePurchases} expenses={activeExpenses} withdrawals={activeWithdrawals} exchangeRate={exchangeRate} />;
      case "exchange": return <ExchangeMonitor exchangeRate={exchangeRate} setExchangeRate={setExchangeRate} />;
      case "audit": return <AuditLog auditLog={auditLog} products={products} />;
      case "trash": return <Trash products={products} setProducts={setProducts} sales={sales} setSales={setSales} purchases={purchases} setPurchases={setPurchases} expenses={expenses} setExpenses={setExpenses} cashMovements={cashMovements} setCashMovements={setCashMovements} partnerWithdrawals={partnerWithdrawals} setPartnerWithdrawals={setPartnerWithdrawals} clients={clients} setClients={setClients} logAudit={logAudit} currentUser={currentUser} />;
      default: return null;
    }
  };

  return (
    <AppContext.Provider value={ctxValue}>
      <div style={{
        minHeight: "100vh", background: "#FAFAF9", fontFamily: "'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
        color: "#37352F"
      }}>
        {/* Top bar */}
        <div style={{
          background: "#FFFFFF", borderBottom: "1px solid #E8E7E3",
          padding: isMobile ? "10px 14px" : "10px 20px",
          paddingTop: "max(10px, env(safe-area-inset-top))",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "sticky", top: 0, zIndex: 100,
          boxShadow: "0 1px 3px rgba(15,15,15,0.04)",
          gap: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 12, minWidth: 0, flex: "0 1 auto" }}>
            <button onClick={() => setMenuOpen(!menuOpen)} aria-label="Abrir menú" style={{
              background: "none", border: "none", color: "#5E6AD2", fontSize: 24, cursor: "pointer",
              display: isMobile ? "flex" : "none", flexShrink: 0,
              width: 40, height: 40, padding: 0, borderRadius: 8,
              alignItems: "center", justifyContent: "center",
            }}>☰</button>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: isMobile ? 20 : 22, flexShrink: 0 }}>💨</span>
              <span style={{
                fontSize: isMobile ? 13 : 18, fontWeight: 800, color: "#37352F", letterSpacing: "-0.3px",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{isMobile ? "IMPORTS ZN" : "IMPORTS ZONA NORTE"}</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 12 }}>
            {/* Global Search — hidden on mobile to save space */}
            {!isMobile && (
              <div style={{ position: "relative" }}>
                <input value={globalSearch} onChange={e => { setGlobalSearch(e.target.value); setShowGlobalResults(true); }}
                  onFocus={() => setShowGlobalResults(true)}
                  placeholder="Buscar..."
                  style={{ padding: "7px 14px 7px 32px", background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 8, color: "#37352F", fontSize: 13, width: 180, outline: "none" }} />
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#B1AFA7", pointerEvents: "none" }}>🔍</span>
                {showGlobalResults && globalResults.length > 0 && (
                  <div style={{
                    position: "absolute", top: "100%", right: 0, marginTop: 6, background: "#FFFFFF",
                    border: "1px solid #E8E7E3", borderRadius: 12, width: 350, maxHeight: 400, overflowY: "auto",
                    boxShadow: "0 12px 32px rgba(0,0,0,0.1)", zIndex: 200
                  }}>
                    {globalResults.map((r, i) => (
                      <div key={i} onClick={() => { setPage(r.page); setGlobalSearch(""); setShowGlobalResults(false); }}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer",
                          borderBottom: i < globalResults.length - 1 ? "1px solid #E8E7E3" : "none" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#FAFAF9"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <span style={{ fontSize: 18 }}>{r.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: "#37352F", fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                          <div style={{ color: "#B1AFA7", fontSize: 11 }}>{r.sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {showGlobalResults && globalSearch.length >= 2 && globalResults.length === 0 && (
                  <div style={{
                    position: "absolute", top: "100%", right: 0, marginTop: 6, background: "#FFFFFF",
                    border: "1px solid #E8E7E3", borderRadius: 12, width: 250, padding: "16px",
                    boxShadow: "0 12px 32px rgba(0,0,0,0.1)", zIndex: 200, textAlign: "center", color: "#B1AFA7", fontSize: 13
                  }}>Sin resultados</div>
                )}
              </div>
            )}
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
              <div style={{ fontSize: 13, color: "#8C8A82", fontWeight: 500 }}>
                Blue: <span style={{ color: "#37352F", fontWeight: 700 }}>${exchangeRate}</span>
              </div>
            )}
            {/* User badge */}
            <div style={{
              display: "flex", alignItems: "center", gap: isMobile ? 4 : 6,
              background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 8,
              padding: isMobile ? "5px 8px" : "5px 12px",
              flexShrink: 0, maxWidth: isMobile ? 110 : "none",
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: currentUser.color, display: "inline-block", flexShrink: 0 }} />
              <span style={{
                color: "#37352F", fontSize: 13, fontWeight: 600,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                minWidth: 0,
              }}>{currentUser.name}</span>
              <button onClick={handleLogout} aria-label="Cerrar sesión" style={{
                background: "none", border: "none", color: "#B1AFA7", cursor: "pointer",
                fontSize: 14, marginLeft: 2, padding: 0,
                width: 24, height: 24, borderRadius: 4,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>✕</button>
            </div>
          </div>
        </div>

        <div style={{ display: "flex" }}>
          {/* Sidebar */}
          <nav style={{
            width: isMobile ? 260 : 220,
            minHeight: "calc(100vh - 52px)",
            background: "#FFFFFF", borderRight: "1px solid #E8E7E3",
            padding: "12px 0", flexShrink: 0,
            ...(isMobile ? {
              position: "fixed", top: 52, bottom: 0,
              left: menuOpen ? 0 : -280,
              zIndex: 99,
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              transition: "left 0.28s ease",
              boxShadow: menuOpen ? "4px 0 24px rgba(15,15,15,0.12)" : "none",
              paddingBottom: "env(safe-area-inset-bottom)",
            } : {})
          }}>
            {NAV_ITEMS.map(item => (
              <button key={item.key} onClick={() => { setPage(item.key); setMenuOpen(false); }} style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%",
                padding: isMobile ? "13px 20px" : "10px 20px",
                minHeight: isMobile ? 48 : 40,
                background: page === item.key ? "#EEF0FC" : "transparent",
                border: "none", borderLeft: page === item.key ? "3px solid #5E6AD2" : "3px solid transparent",
                color: page === item.key ? "#37352F" : "#8C8A82", cursor: "pointer",
                fontSize: isMobile ? 14 : 13, fontWeight: page === item.key ? 700 : 500, textAlign: "left",
                transition: "all 0.2s", fontFamily: "inherit",
                WebkitTapHighlightColor: "rgba(94,106,210,0.08)",
              }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
              </button>
            ))}
          </nav>

          {/* Content */}
          <main style={{
            flex: 1,
            padding: isMobile ? "14px" : "24px",
            paddingBottom: isMobile ? "max(90px, env(safe-area-inset-bottom))" : "24px",
            maxWidth: 1100, minWidth: 0,
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
            position: "fixed", inset: 0, top: 52, background: "rgba(0,0,0,0.2)", zIndex: 98
          }} />
        )}

        {/* Mobile FAB con menú expandible: venta rápida + consumo propio */}
        {isMobile && !quickSaleOpen && !quickMermaOpen && (
          <>
            {/* Backdrop click-out cuando el menú está abierto */}
            {fabMenuOpen && (
              <div onClick={() => setFabMenuOpen(false)} style={{
                position: "fixed", inset: 0, background: "rgba(15,15,15,0.18)", zIndex: 89,
              }} />
            )}

            {/* FAB secundario: Consumo propio (solo cuando menú abierto) */}
            {fabMenuOpen && (
              <button onClick={() => { setFabMenuOpen(false); setQuickMermaOpen(true); }}
                aria-label="Anotar consumo propio"
                style={{
                  position: "fixed",
                  bottom: "calc(max(20px, env(safe-area-inset-bottom)) + 76px)",
                  right: 24,
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 16px 10px 14px",
                  borderRadius: 999,
                  background: "linear-gradient(135deg, #e17055 0%, #d35400 100%)",
                  border: "none", color: "#fff",
                  fontSize: 14, fontWeight: 700, cursor: "pointer",
                  zIndex: 91,
                  boxShadow: "0 6px 18px rgba(225,112,85,0.45), 0 2px 6px rgba(15,15,15,0.12)",
                  fontFamily: "inherit",
                  animation: "fabPop 0.18s ease-out",
                }}>
                <span style={{ fontSize: 20 }}>📉</span> Anoté un consumo
              </button>
            )}

            {/* FAB principal: toggle menú */}
            <button onClick={() => {
              if (fabMenuOpen) { setFabMenuOpen(false); setQuickSaleOpen(true); }
              else setFabMenuOpen(true);
            }}
              aria-label={fabMenuOpen ? "Venta rápida" : "Acciones rápidas"}
              style={{
                position: "fixed",
                bottom: "max(20px, env(safe-area-inset-bottom))",
                right: 20,
                width: 60, height: 60,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #5E6AD2 0%, #6366f1 100%)",
                border: "none", color: "#fff",
                fontSize: 26, cursor: "pointer",
                zIndex: 92,
                boxShadow: "0 8px 24px rgba(94,106,210,0.45), 0 2px 8px rgba(15,15,15,0.12)",
                display: "flex", alignItems: "center", justifyContent: "center",
                transform: fabMenuOpen ? "rotate(45deg)" : "rotate(0)",
                transition: "transform 0.18s ease-out",
              }}>{fabMenuOpen ? "+" : "🛒"}</button>

            {/* Hint text al lado del FAB principal cuando menú abierto */}
            {fabMenuOpen && (
              <div style={{
                position: "fixed",
                bottom: "max(20px, env(safe-area-inset-bottom))",
                right: 92,
                height: 60,
                display: "flex", alignItems: "center",
                fontSize: 13, fontWeight: 600, color: "#fff",
                background: "linear-gradient(135deg, #5E6AD2 0%, #6366f1 100%)",
                padding: "0 14px", borderRadius: 999,
                zIndex: 91,
                boxShadow: "0 6px 18px rgba(94,106,210,0.45), 0 2px 6px rgba(15,15,15,0.12)",
                pointerEvents: "none",
              }}>🛒 Venta rápida</div>
            )}
          </>
        )}
        <style>{`@keyframes fabPop { from { opacity: 0; transform: translateY(10px) scale(0.92); } to { opacity: 1; transform: none; } }`}</style>

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
            cashMovements={cashMovements}
            setCashMovements={setCashMovements}
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
    </AppContext.Provider>
  );
}
