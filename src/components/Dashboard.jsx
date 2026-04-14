import { useState, useMemo } from "react";
import { formatMoney, formatDate } from "../helpers.js";
import { calcTotalRevenue, calcTotalRevenueUSD } from "../calcs.js";
import { Card, Badge } from "./UI.jsx";
import { BRAND_COLORS } from "../constants.js";
import { useResponsive } from "../App.jsx";

// Heading font
const hFont = "'Poppins', 'Inter', sans-serif";

// Compact KPI card
const KPI = ({ label, value, sub, color = "#6366f1", bg }) => (
  <div style={{
    background: bg || "#fff", borderRadius: 14, padding: "18px 20px",
    border: bg ? "none" : "1px solid #e2e4e9", position: "relative", overflow: "hidden",
    transition: "box-shadow 0.2s",
  }}>
    <div style={{ fontSize: 11, color: bg ? "rgba(255,255,255,0.7)" : "#6b7280", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, fontFamily: hFont, marginBottom: 8 }}>{label}</div>
    <div style={{ fontSize: 28, fontWeight: 800, color: bg ? "#fff" : color, lineHeight: 1, fontFamily: hFont }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: bg ? "rgba(255,255,255,0.75)" : "#9ca3af", marginTop: 6 }}>{sub}</div>}
  </div>
);

// Progress bar
const ProgressBar = ({ value, max, color = "#6366f1", height = 6 }) => (
  <div style={{ flex: 1, height, background: "#edf0f2", borderRadius: height / 2, overflow: "hidden" }}>
    <div style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%`, height: "100%", background: color, borderRadius: height / 2, transition: "width 0.6s ease" }} />
  </div>
);

// Section title
const SectionTitle = ({ children }) => (
  <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14, fontFamily: hFont }}>{children}</div>
);

// -- DASHBOARD --
export const Dashboard = ({ products, sales, purchases, expenses, withdrawals, exchangeRate, clients, cashMovements }) => {
  const { isMobile } = useResponsive();
  const now = new Date();
  const today = now.toDateString();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const [period, setPeriod] = useState("month");
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  // ---- Date filters ----
  const isToday = (d) => new Date(d).toDateString() === today;
  const isThisWeek = (d) => {
    const date = new Date(d);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    return date >= startOfWeek && date <= now;
  };
  const isThisMonth = (d) => {
    const date = new Date(d);
    return date.getMonth() === thisMonth && date.getFullYear() === thisYear;
  };
  const filterByPeriod = (arr, dateField = "date") => {
    if (period === "today") return arr.filter(x => isToday(x[dateField]));
    if (period === "week") return arr.filter(x => isThisWeek(x[dateField]));
    return arr.filter(x => isThisMonth(x[dateField]));
  };

  // ---- Core metrics ----
  const periodSales = filterByPeriod(sales);
  const periodExpenses = filterByPeriod(expenses);
  const periodPurchases = filterByPeriod(purchases);
  const periodWithdrawals = filterByPeriod(withdrawals || []);

  const revenueARS = calcTotalRevenue(periodSales, exchangeRate);
  const revenueUSD = calcTotalRevenueUSD(periodSales, exchangeRate);

  const cogsUSD = periodSales.reduce((sum, s) => sum + (s.items || []).reduce((isum, item) => {
    const prod = products.find(p => p.id === item.productId);
    if (!prod) return isum;
    const costUSDT = prod.costUSDT || 0;
    const realCost = costUSDT > 0 ? (costUSDT * 1.01 * 1.05) + 0.40 : (prod.priceUSD || 0) * 0.52;
    return isum + realCost * item.qty;
  }, 0), 0);

  const expensesARS = periodExpenses.reduce((sum, e) => sum + (e.amountARS || 0), 0);
  const purchasesUSDT = periodPurchases.reduce((sum, p) => sum + (p.totalUSDT || 0), 0);
  const netProfitUSD = revenueUSD - cogsUSD - (expensesARS / exchangeRate);

  const totalStock = products.reduce((sum, p) => sum + (p.stock || 0), 0);
  const stockValueUSD = products.reduce((sum, p) => sum + (p.stock || 0) * (p.priceUSD || 0), 0);
  const lowStock = products.filter(p => p.stock > 0 && p.stock <= 3);
  const outOfStock = products.filter(p => (p.stock || 0) <= 0);
  const totalUnits = periodSales.reduce((s, sale) => s + (sale.items || []).reduce((is, i) => is + i.qty, 0), 0);

  const totalMermas = periodWithdrawals.reduce((s, w) => s + w.qty, 0);
  const mermasValueUSD = periodWithdrawals.reduce((s, w) => s + (w.costEstimateUSD || 0), 0);
  const totalDiscounts = periodSales.reduce((s, sale) => s + (sale.discountAmount || 0), 0);

  const daysInPeriod = period === "today" ? 1 : period === "week" ? 7 : now.getDate();
  const avgSalesPerDay = periodSales.length > 0 ? (periodSales.length / daysInPeriod).toFixed(1) : "0";

  const diegoSales = periodSales.filter(s => s.createdBy === "Diego");
  const gustavoSales = periodSales.filter(s => s.createdBy === "Gustavo");

  // ---- Rankings ----
  const topProducts = useMemo(() => {
    const counts = {};
    periodSales.forEach(s => (s.items || []).forEach(item => {
      counts[item.productId] = (counts[item.productId] || 0) + item.qty;
    }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([pid, qty]) => {
      const prod = products.find(p => p.id === pid);
      return { name: prod ? `${prod.brand} ${prod.model} - ${prod.flavor}` : "?", brand: prod?.brand, qty };
    });
  }, [periodSales, products]);

  const salesByBrand = useMemo(() => {
    const brands = {};
    periodSales.forEach(s => (s.items || []).forEach(item => {
      const prod = products.find(p => p.id === item.productId);
      if (!prod) return;
      if (!brands[prod.brand]) brands[prod.brand] = { qty: 0, revenue: 0 };
      brands[prod.brand].qty += item.qty;
      brands[prod.brand].revenue += (item.priceUSD || prod.priceUSD || 0) * item.qty;
    }));
    return Object.entries(brands).sort((a, b) => b[1].qty - a[1].qty);
  }, [periodSales, products]);

  const salesByMethod = useMemo(() => {
    const methods = {};
    periodSales.forEach(s => {
      (s.payments || []).forEach(pay => {
        const m = pay.method || s.paymentMethod || "Otro";
        if (!methods[m]) methods[m] = { count: 0, totalARS: 0 };
        methods[m].count++;
        const amt = Number(pay.amount) || 0;
        methods[m].totalARS += (s.currency === "USD" || s.currency === "USDT") ? amt * (s.exchangeRate || exchangeRate) : amt;
      });
      if (!(s.payments || []).length) {
        const m = s.paymentMethod || "Otro";
        if (!methods[m]) methods[m] = { count: 0, totalARS: 0 };
        methods[m].count++;
        methods[m].totalARS += (s.currency === "USD" || s.currency === "USDT") ? s.total * (s.exchangeRate || exchangeRate) : s.total;
      }
    });
    return Object.entries(methods).sort((a, b) => b[1].totalARS - a[1].totalARS);
  }, [periodSales, exchangeRate]);

  const recentSales = [...sales].filter(s => !s.isDeleted).sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5);

  // ===== SMART ALERTS =====
  const alerts = useMemo(() => {
    const list = [];
    if (outOfStock.length > 0) list.push({ type: "danger", title: `${outOfStock.length} agotado${outOfStock.length > 1 ? "s" : ""}`, detail: outOfStock.slice(0, 3).map(p => `${p.brand} ${p.model} - ${p.flavor}`).join(", ") + (outOfStock.length > 3 ? ` +${outOfStock.length - 3}` : "") });
    if (lowStock.length > 0) list.push({ type: "warning", title: `${lowStock.length} stock bajo (≤3)`, detail: lowStock.slice(0, 3).map(p => `${p.brand} ${p.model} (${p.stock})`).join(", ") });
    const debtors = (clients || []).filter(c => (c.balance || 0) < 0);
    if (debtors.length > 0) list.push({ type: "info", title: `${debtors.length} con deuda`, detail: `Total: ${formatMoney(debtors.reduce((s, c) => s + Math.abs(c.balance), 0))}` });
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
    const recentItems = {};
    sales.filter(s => s.date >= thirtyDaysAgo).forEach(s => (s.items || []).forEach(i => { recentItems[i.productId] = (recentItems[i.productId] || 0) + (i.qty || 1); }));
    const popularOut = outOfStock.filter(p => (recentItems[p.id] || 0) >= 3);
    if (popularOut.length > 0) list.push({ type: "danger", title: `${popularOut.length} popular${popularOut.length > 1 ? "es" : ""} agotado${popularOut.length > 1 ? "s" : ""}`, detail: popularOut.slice(0, 3).map(p => `${p.brand} ${p.model} (${recentItems[p.id]}/mes)`).join(", ") });
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
    const weekItems = {};
    sales.filter(s => s.date >= sevenDaysAgo).forEach(s => (s.items || []).forEach(i => { weekItems[i.productId] = (weekItems[i.productId] || 0) + (i.qty || 1); }));
    const willRunOut = products.filter(p => p.stock > 0 && p.stock <= 10 && weekItems[p.id] > 0 && p.stock / (weekItems[p.id] / 7) <= 7);
    if (willRunOut.length > 0) list.push({ type: "warning", title: `${willRunOut.length} se agota${willRunOut.length > 1 ? "n" : ""} pronto`, detail: willRunOut.slice(0, 3).map(p => `${p.brand} ${p.model} (~${Math.round(p.stock / (weekItems[p.id] / 7))}d)`).join(", ") });
    return list;
  }, [outOfStock, lowStock, clients, sales, products, now]);

  const periodLabels = { today: "Hoy", week: "Semana", month: "Mes" };
  const alertStyles = { danger: { bg: "#fef2f2", border: "#fecaca", dot: "#dc2626" }, warning: { bg: "#fffbeb", border: "#fed7aa", dot: "#f59e0b" }, info: { bg: "#eff6ff", border: "#bfdbfe", dot: "#3b82f6" } };
  const methodColors = { "Mercado Pago": "#6366f1", "Lemon": "#f59e0b", "USD Cash": "#06b6d4", "USDT": "#10b981", "Pesos Cash": "#f97316" };

  return (
    <div>
      {/* ===== HEADER ===== */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: "#1a1a2e", margin: 0, fontSize: isMobile ? 22 : 26, fontWeight: 800, fontFamily: hFont, letterSpacing: "-0.5px" }}>Panel de Control</h2>
          <p style={{ color: "#9ca3af", margin: "4px 0 0", fontSize: 13 }}>
            {new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })} · Blue: <b style={{ color: "#1a1a2e" }}>${exchangeRate}</b>
          </p>
        </div>
        <div style={{ display: "flex", gap: 3, background: "#f0f1f5", borderRadius: 10, padding: 3 }}>
          {(["today", "week", "month"]).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: "7px 16px", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: period === p ? "#fff" : "transparent", color: period === p ? "#6366f1" : "#6b7280",
              boxShadow: period === p ? "0 1px 4px rgba(0,0,0,0.06)" : "none", transition: "all 0.15s",
              fontFamily: hFont,
            }}>{periodLabels[p]}</button>
          ))}
        </div>
      </div>

      {/* ===== ALERTS (compact) ===== */}
      {alerts.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {(showAllAlerts ? alerts : alerts.slice(0, 3)).map((a, i) => {
            const s = alertStyles[a.type];
            return (
              <div key={i} style={{ flex: "1 1 auto", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, minWidth: isMobile ? "100%" : 250 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
                <div style={{ fontSize: 12 }}>
                  <b style={{ color: s.dot }}>{a.title}</b>
                  <span style={{ color: "#6b7280", marginLeft: 4 }}>{a.detail}</span>
                </div>
              </div>
            );
          })}
          {alerts.length > 3 && (
            <button onClick={() => setShowAllAlerts(!showAllAlerts)} style={{ background: "none", border: "none", color: "#6366f1", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
              {showAllAlerts ? "Menos" : `+${alerts.length - 3}`}
            </button>
          )}
        </div>
      )}

      {/* ===== KPI ROW 1 — Hero metrics ===== */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 10 : 14, marginBottom: 14 }}>
        <KPI label="Ventas" value={periodSales.length} sub={`${totalUnits} uds · ${formatMoney(revenueARS)}`} color="#6366f1" bg="linear-gradient(135deg, #6366f1, #818cf8)" />
        <KPI label="Ganancia neta" value={formatMoney(netProfitUSD, "USD")} sub={formatMoney(netProfitUSD * exchangeRate)} color="#059669" bg={netProfitUSD >= 0 ? "linear-gradient(135deg, #059669, #34d399)" : "linear-gradient(135deg, #dc2626, #f87171)"} />
        <KPI label="Stock" value={totalStock} sub={`Valor: ${formatMoney(stockValueUSD, "USD")}`} color="#f59e0b" />
        <KPI label="Velocidad" value={`${avgSalesPerDay}/día`} sub={`${(totalUnits / daysInPeriod).toFixed(1)} uds/día`} color="#6366f1" />
      </div>

      {/* ===== KPI ROW 2 — Financial breakdown ===== */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 10 : 14, marginBottom: 20 }}>
        <KPI label="Gastos" value={formatMoney(expensesARS)} color="#dc2626" />
        <KPI label="Compras" value={formatMoney(purchasesUSDT, "USDT")} color="#e17055" />
        <KPI label="Mermas" value={`${totalMermas} uds`} sub={formatMoney(mermasValueUSD, "USD")} color="#f59e0b" />
        <KPI label="Descuentos" value={formatMoney(totalDiscounts)} color="#8b5cf6" />
      </div>

      {/* ===== BENTO GRID — Main content ===== */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 14 }}>

        {/* Ventas por socio */}
        <Card>
          <SectionTitle>Ventas por socio</SectionTitle>
          <div style={{ display: "flex", gap: 12 }}>
            {[
              { name: "Diego", count: diegoSales.length, color: "#6366f1", bg: "#f5f3ff" },
              { name: "Gustavo", count: gustavoSales.length, color: "#059669", bg: "#ecfdf5" },
            ].map(s => (
              <div key={s.name} style={{ flex: 1, textAlign: "center", padding: "14px 0", background: s.bg, borderRadius: 12 }}>
                <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, marginBottom: 4, fontFamily: hFont }}>{s.name.toUpperCase()}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: s.color, fontFamily: hFont }}>{s.count}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>ventas</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Métodos de pago */}
        <Card>
          <SectionTitle>Métodos de pago</SectionTitle>
          {salesByMethod.length === 0 ? <p style={{ color: "#9ca3af", fontSize: 13 }}>Sin ventas</p> :
            salesByMethod.map(([method, data]) => {
              const maxVal = salesByMethod[0]?.[1]?.totalARS || 1;
              return (
                <div key={method} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: "#4b5563", width: 90, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{method}</span>
                  <ProgressBar value={data.totalARS} max={maxVal} color={methodColors[method] || "#a855f7"} />
                  <span style={{ fontSize: 12, color: "#1a1a2e", minWidth: 65, textAlign: "right", fontWeight: 700 }}>{formatMoney(data.totalARS)}</span>
                </div>
              );
            })}
        </Card>

        {/* Top productos */}
        <Card>
          <SectionTitle>Más vendidos</SectionTitle>
          {topProducts.length === 0 ? <p style={{ color: "#9ca3af", fontSize: 13 }}>Sin ventas aún</p> :
            topProducts.map((p, i) => {
              const medal = i === 0 ? { bg: "#fbbf24", text: "1" } : i === 1 ? { bg: "#9ca3af", text: "2" } : i === 2 ? { bg: "#cd7f32", text: "3" } : { bg: "#e5e7eb", text: String(i + 1) };
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < topProducts.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                  <span style={{ width: 22, height: 22, borderRadius: 6, background: medal.bg, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{medal.text}</span>
                  <span style={{ color: "#4b5563", fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  <Badge color={BRAND_COLORS[p.brand] || "#6366f1"}>{p.qty}</Badge>
                </div>
              );
            })}
        </Card>

        {/* Ventas por marca */}
        <Card>
          <SectionTitle>Ventas por marca</SectionTitle>
          {salesByBrand.length === 0 ? <p style={{ color: "#9ca3af", fontSize: 13 }}>Sin ventas</p> :
            salesByBrand.map(([brand, data]) => {
              const maxQty = salesByBrand[0]?.[1]?.qty || 1;
              return (
                <div key={brand} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: "#4b5563", width: 75, fontWeight: 600 }}>{brand}</span>
                  <ProgressBar value={data.qty} max={maxQty} color={BRAND_COLORS[brand] || "#a855f7"} height={8} />
                  <span style={{ fontSize: 12, color: "#1a1a2e", minWidth: 30, textAlign: "right", fontWeight: 700 }}>{data.qty}</span>
                  <span style={{ fontSize: 11, color: "#059669", minWidth: 50, textAlign: "right", fontWeight: 600 }}>{formatMoney(data.revenue, "USD")}</span>
                </div>
              );
            })}
        </Card>
      </div>

      {/* ===== BOTTOM ROW ===== */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap: 14 }}>
        {/* Últimas ventas */}
        <Card>
          <SectionTitle>Últimas ventas</SectionTitle>
          {recentSales.length === 0 ? <p style={{ color: "#9ca3af", fontSize: 13 }}>Sin ventas</p> :
            recentSales.map((s, i) => {
              const itemCount = (s.items || []).reduce((sum, it) => sum + it.qty, 0);
              return (
                <div key={s.id || i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: i < recentSales.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                  <div>
                    <div style={{ fontSize: 13, color: "#1a1a2e", fontWeight: 600 }}>{s.clientName || "Sin nombre"}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>{formatDate(s.date)} · {itemCount} uds · {(s.items || []).map(i => i.name || "").filter(Boolean).join(", ").slice(0, 40)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#059669", fontFamily: hFont }}>{formatMoney(s.total, s.currency || "ARS")}</div>
                    <Badge color={s.createdBy === "Diego" ? "#6366f1" : "#059669"}>{s.createdBy || "?"}</Badge>
                  </div>
                </div>
              );
            })}
        </Card>

        {/* Stock bajo */}
        <Card>
          <SectionTitle>
            <span style={{ color: lowStock.length > 0 ? "#dc2626" : "#059669" }}>Stock bajo (≤3)</span>
          </SectionTitle>
          {lowStock.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#ecfdf5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px", fontSize: 20 }}>✓</div>
              <p style={{ color: "#059669", fontSize: 13, fontWeight: 600 }}>Todo bien</p>
            </div>
          ) :
            lowStock.slice(0, 10).map((p, i) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: i < Math.min(lowStock.length, 10) - 1 ? "1px solid #f3f4f6" : "none" }}>
                <span style={{ color: "#4b5563", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 8 }}>{p.brand} {p.model} - {p.flavor}</span>
                <span style={{
                  background: p.stock <= 1 ? "#dc2626" : "#f59e0b", color: "#fff",
                  fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, flexShrink: 0,
                }}>{p.stock}</span>
              </div>
            ))
          }
          {lowStock.length > 10 && <p style={{ color: "#9ca3af", fontSize: 11, marginTop: 6, textAlign: "center" }}>+{lowStock.length - 10} más</p>}
        </Card>
      </div>
    </div>
  );
};
