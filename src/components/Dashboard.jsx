import { useState, useMemo } from "react";
import { formatMoney, formatDate } from "../helpers.js";
import { calcTotalRevenue, calcTotalRevenueUSD } from "../calcs.js";
import { BRAND_COLORS } from "../constants.js";
import { useResponsive } from "../App.jsx";

// ---- Design tokens ----
const F = "'Rubik', 'Inter', sans-serif";
const C = {
  bg: "#0F172A", card: "#1E293B", cardHover: "#253347", border: "#334155",
  text: "#F8FAFC", textSub: "#94A3B8", textMuted: "#64748B",
  green: "#22C55E", greenBg: "#22C55E18", red: "#EF4444", redBg: "#EF444418",
  blue: "#3B82F6", blueBg: "#3B82F618", amber: "#F59E0B", amberBg: "#F59E0B18",
  purple: "#8B5CF6", purpleBg: "#8B5CF618", cyan: "#06B6D4",
  gradBlue: "linear-gradient(135deg, #3B82F6, #6366f1)",
  gradGreen: "linear-gradient(135deg, #059669, #22C55E)",
  gradRed: "linear-gradient(135deg, #DC2626, #EF4444)",
};

// ---- Trend indicator ----
const Trend = ({ current, previous, suffix = "" }) => {
  if (!previous || previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  const up = pct >= 0;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: up ? C.green : C.red, marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 2 }}>
      <svg width="10" height="10" viewBox="0 0 10 10" style={{ transform: up ? "none" : "rotate(180deg)" }}>
        <path d="M5 1 L9 6 L1 6 Z" fill="currentColor" />
      </svg>
      {Math.abs(pct)}%{suffix}
    </span>
  );
};

// ---- Sparkline (SVG mini chart) ----
const Sparkline = ({ data, color = C.green, height = 32, width = 100 }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`).join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(data.length - 1) / (data.length - 1) * width} cy={height - ((data[data.length - 1] - min) / range) * (height - 4) - 2} r="3" fill={color} />
    </svg>
  );
};

// ---- Mini donut chart ----
const MiniDonut = ({ segments, size = 80 }) => {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  let offset = 0;
  const r = 30, circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 80 80">
      {segments.map((seg, i) => {
        const pct = seg.value / total;
        const dash = pct * circ;
        const gap = circ - dash;
        const rot = offset * 360 - 90;
        offset += pct;
        return <circle key={i} cx="40" cy="40" r={r} fill="none" stroke={seg.color} strokeWidth="8" strokeDasharray={`${dash} ${gap}`} transform={`rotate(${rot} 40 40)`} />;
      })}
      <text x="40" y="44" textAnchor="middle" fill={C.text} fontSize="14" fontWeight="700" fontFamily={F}>{total}</text>
    </svg>
  );
};

// ---- Dark Card ----
const DCard = ({ children, style, glow }) => (
  <div style={{
    background: C.card, borderRadius: 16, padding: "18px 20px", border: `1px solid ${C.border}`,
    transition: "box-shadow 0.2s, transform 0.2s",
    ...(glow ? { boxShadow: `0 0 20px ${glow}30` } : {}),
    ...style,
  }}>{children}</div>
);

// ---- Section label ----
const SLabel = ({ children, icon }) => (
  <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14, fontFamily: F, display: "flex", alignItems: "center", gap: 6 }}>
    {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
    {children}
  </div>
);

// ============================================
// DASHBOARD v3 — Dark Professional
// ============================================
export const Dashboard = ({ products, sales, purchases, expenses, withdrawals, exchangeRate, clients, cashMovements }) => {
  const { isMobile } = useResponsive();
  const now = new Date();
  const today = now.toDateString();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  // ---- Date helpers ----
  const isToday = (d) => new Date(d).toDateString() === today;
  const isYesterday = (d) => {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    return new Date(d).toDateString() === y.toDateString();
  };
  const isThisMonth = (d) => { const dt = new Date(d); return dt.getMonth() === thisMonth && dt.getFullYear() === thisYear; };
  const isLastMonth = (d) => {
    const dt = new Date(d);
    const lm = thisMonth === 0 ? 11 : thisMonth - 1;
    const ly = thisMonth === 0 ? thisYear - 1 : thisYear;
    return dt.getMonth() === lm && dt.getFullYear() === ly;
  };

  // ---- Period data ----
  const todaySales = sales.filter(s => isToday(s.date));
  const yesterdaySales = sales.filter(s => isYesterday(s.date));
  const monthSales = sales.filter(s => isThisMonth(s.date));
  const lastMonthSales = sales.filter(s => isLastMonth(s.date));
  const monthExpenses = expenses.filter(e => isThisMonth(e.date));
  const monthPurchases = purchases.filter(p => isThisMonth(p.date));
  const monthWithdrawals = (withdrawals || []).filter(w => isThisMonth(w.date));

  // ---- Revenue ----
  const todayRevenue = calcTotalRevenue(todaySales, exchangeRate);
  const yesterdayRevenue = calcTotalRevenue(yesterdaySales, exchangeRate);
  const monthRevenue = calcTotalRevenue(monthSales, exchangeRate);
  const lastMonthRevenue = calcTotalRevenue(lastMonthSales, exchangeRate);
  const monthRevenueUSD = calcTotalRevenueUSD(monthSales, exchangeRate);

  // ---- Costs & Profit ----
  const monthCOGS = monthSales.reduce((sum, s) => sum + (s.items || []).reduce((is, item) => {
    const prod = products.find(p => p.id === item.productId);
    if (!prod) return is;
    const cost = prod.costUSDT > 0 ? (prod.costUSDT * 1.01 * 1.05) + 0.40 : (prod.priceUSD || 0) * 0.52;
    return is + cost * item.qty;
  }, 0), 0);
  const monthExpensesARS = monthExpenses.reduce((s, e) => s + (e.amountARS || 0), 0);
  const netProfitUSD = monthRevenueUSD - monthCOGS - (monthExpensesARS / exchangeRate);
  const marginPct = monthRevenueUSD > 0 ? Math.round((netProfitUSD / monthRevenueUSD) * 100) : 0;

  // ---- Stock ----
  const totalStock = products.reduce((s, p) => s + (p.stock || 0), 0);
  const stockValueUSD = products.reduce((s, p) => s + (p.stock || 0) * (p.priceUSD || 0), 0);
  const lowStock = products.filter(p => p.stock > 0 && p.stock <= 3);
  const outOfStock = products.filter(p => (p.stock || 0) <= 0);
  const totalUnitsMonth = monthSales.reduce((s, sale) => s + (sale.items || []).reduce((is, i) => is + i.qty, 0), 0);
  const totalUnitsToday = todaySales.reduce((s, sale) => s + (sale.items || []).reduce((is, i) => is + i.qty, 0), 0);

  // ---- Sparkline: last 7 days revenue ----
  const last7Days = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const ds = d.toDateString();
      const dayRevenue = sales.filter(s => new Date(s.date).toDateString() === ds).reduce((sum, s) => sum + (s.total || 0), 0);
      days.push(dayRevenue);
    }
    return days;
  }, [sales, now]);

  // ---- Brand distribution for donut ----
  const brandDonut = useMemo(() => {
    const brands = {};
    monthSales.forEach(s => (s.items || []).forEach(item => {
      const prod = products.find(p => p.id === item.productId);
      if (prod) brands[prod.brand] = (brands[prod.brand] || 0) + item.qty;
    }));
    return Object.entries(brands).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([brand, qty]) => ({
      label: brand, value: qty, color: BRAND_COLORS[brand] || C.purple,
    }));
  }, [monthSales, products]);

  // ---- Top products ----
  const topProducts = useMemo(() => {
    const counts = {};
    monthSales.forEach(s => (s.items || []).forEach(item => {
      counts[item.productId] = (counts[item.productId] || 0) + item.qty;
    }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([pid, qty]) => {
      const prod = products.find(p => p.id === pid);
      return { name: prod ? `${prod.brand} ${prod.model} - ${prod.flavor}` : "?", brand: prod?.brand, qty };
    });
  }, [monthSales, products]);

  // ---- Socios ----
  const diegoSales = monthSales.filter(s => s.createdBy === "Diego");
  const gustavoSales = monthSales.filter(s => s.createdBy === "Gustavo");
  const diegoRevenue = calcTotalRevenue(diegoSales, exchangeRate);
  const gustavoRevenue = calcTotalRevenue(gustavoSales, exchangeRate);

  // ---- Recent sales ----
  const recentSales = [...sales].filter(s => !s.isDeleted).sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5);

  // ---- Alerts ----
  const alerts = useMemo(() => {
    const list = [];
    if (outOfStock.length > 0) list.push({ t: "danger", msg: `${outOfStock.length} producto${outOfStock.length > 1 ? "s" : ""} agotado${outOfStock.length > 1 ? "s" : ""}`, detail: outOfStock.slice(0, 3).map(p => `${p.brand} ${p.model}`).join(", ") });
    if (lowStock.length > 0) list.push({ t: "warning", msg: `${lowStock.length} con stock bajo (≤3)`, detail: lowStock.slice(0, 3).map(p => `${p.brand} ${p.model} (${p.stock})`).join(", ") });

    // Products running out in ≤7 days
    const sevenAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
    const weekItems = {};
    sales.filter(s => s.date >= sevenAgo).forEach(s => (s.items || []).forEach(i => { weekItems[i.productId] = (weekItems[i.productId] || 0) + (i.qty || 1); }));
    const willRunOut = products.filter(p => p.stock > 0 && p.stock <= 10 && weekItems[p.id] > 0 && p.stock / (weekItems[p.id] / 7) <= 7);
    if (willRunOut.length > 0) list.push({ t: "warning", msg: `${willRunOut.length} se agota${willRunOut.length > 1 ? "n" : ""} en ≤7 días`, detail: willRunOut.slice(0, 3).map(p => `${p.brand} ${p.model} (~${Math.round(p.stock / (weekItems[p.id] / 7))}d)`).join(", ") });

    // Stale products (not sold in 30 days but have stock)
    const thirtyAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
    const recentItems = {};
    sales.filter(s => s.date >= thirtyAgo).forEach(s => (s.items || []).forEach(i => { recentItems[i.productId] = (recentItems[i.productId] || 0) + (i.qty || 1); }));
    const stale = products.filter(p => p.stock > 0 && !recentItems[p.id]);
    if (stale.length > 0) list.push({ t: "info", msg: `${stale.length} sin vender hace 30+ días`, detail: stale.slice(0, 3).map(p => `${p.brand} ${p.model} (${p.stock})`).join(", ") });

    // Client debt
    const debtors = (clients || []).filter(c => (c.balance || 0) < 0);
    if (debtors.length > 0) list.push({ t: "info", msg: `${debtors.length} cliente${debtors.length > 1 ? "s" : ""} con deuda`, detail: `Total: ${formatMoney(debtors.reduce((s, c) => s + Math.abs(c.balance), 0))}` });

    return list;
  }, [outOfStock, lowStock, products, sales, clients, now]);

  const alertColor = { danger: { bg: "#EF444415", border: "#EF444440", dot: C.red }, warning: { bg: "#F59E0B15", border: "#F59E0B40", dot: C.amber }, info: { bg: "#3B82F615", border: "#3B82F640", dot: C.blue } };

  // ---- Mermas & Descuentos ----
  const mermasQty = monthWithdrawals.reduce((s, w) => s + w.qty, 0);
  const mermasUSD = monthWithdrawals.reduce((s, w) => s + (w.costEstimateUSD || 0), 0);
  const discountsARS = monthSales.reduce((s, sale) => s + (sale.discountAmount || 0), 0);

  return (
    <div style={{ background: C.bg, margin: "-24px", padding: isMobile ? "16px" : "24px", minHeight: "100vh" }}>

      {/* ===== HEADER ===== */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: C.text, margin: 0, fontSize: isMobile ? 22 : 28, fontWeight: 800, fontFamily: F, letterSpacing: "-0.5px" }}>
            Panel de Control
          </h2>
          <p style={{ color: C.textMuted, margin: "4px 0 0", fontSize: 13, fontFamily: F }}>
            {now.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
            <span style={{ color: C.green, fontWeight: 700, marginLeft: 8 }}>Blue ${exchangeRate}</span>
          </p>
        </div>
      </div>

      {/* ===== ALERTS ===== */}
      {alerts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {(showAllAlerts ? alerts : alerts.slice(0, 3)).map((a, i) => {
            const ac = alertColor[a.t];
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: ac.bg, border: `1px solid ${ac.border}`, borderRadius: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: ac.dot, flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 12, color: C.textSub }}>
                  <b style={{ color: ac.dot }}>{a.msg}</b>
                  <span style={{ marginLeft: 6, opacity: 0.7 }}>{a.detail}</span>
                </div>
              </div>
            );
          })}
          {alerts.length > 3 && (
            <button onClick={() => setShowAllAlerts(!showAllAlerts)} style={{ background: "none", border: "none", color: C.blue, fontSize: 12, cursor: "pointer", fontWeight: 600, fontFamily: F, textAlign: "left", padding: "4px 0" }}>
              {showAllAlerts ? "Ver menos" : `+${alerts.length - 3} alertas más`}
            </button>
          )}
        </div>
      )}

      {/* ===== KPI HERO ROW ===== */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: isMobile ? 10 : 14, marginBottom: 14 }}>
        {/* Ventas hoy */}
        <DCard glow={C.blue}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, fontFamily: F }}>Ventas hoy</div>
              <div style={{ fontSize: isMobile ? 28 : 36, fontWeight: 800, color: C.text, fontFamily: F, lineHeight: 1, marginTop: 6 }}>{todaySales.length}</div>
              <div style={{ fontSize: 12, color: C.textSub, marginTop: 4 }}>
                {formatMoney(todayRevenue)} · {totalUnitsToday} uds
                <Trend current={todaySales.length} previous={yesterdaySales.length} suffix=" vs ayer" />
              </div>
            </div>
            <Sparkline data={last7Days} color={C.blue} height={36} width={isMobile ? 60 : 80} />
          </div>
        </DCard>

        {/* Ventas del mes */}
        <DCard glow={C.purple}>
          <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, fontFamily: F }}>Ventas del mes</div>
          <div style={{ fontSize: isMobile ? 28 : 36, fontWeight: 800, color: C.text, fontFamily: F, lineHeight: 1, marginTop: 6 }}>{monthSales.length}</div>
          <div style={{ fontSize: 12, color: C.textSub, marginTop: 4 }}>
            {formatMoney(monthRevenue)} · {totalUnitsMonth} uds
            <Trend current={monthSales.length} previous={lastMonthSales.length} suffix=" vs anterior" />
          </div>
        </DCard>

        {/* Ganancia neta */}
        <DCard glow={netProfitUSD >= 0 ? C.green : C.red} style={isMobile ? { gridColumn: "1 / -1" } : {}}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, fontFamily: F }}>Ganancia neta</div>
              <div style={{ fontSize: isMobile ? 28 : 36, fontWeight: 800, color: netProfitUSD >= 0 ? C.green : C.red, fontFamily: F, lineHeight: 1, marginTop: 6 }}>
                {formatMoney(netProfitUSD, "USD")}
              </div>
              <div style={{ fontSize: 12, color: C.textSub, marginTop: 4 }}>
                {formatMoney(netProfitUSD * exchangeRate)} · Margen: {marginPct}%
              </div>
            </div>
            <div style={{ padding: "6px 12px", borderRadius: 8, background: netProfitUSD >= 0 ? C.greenBg : C.redBg, color: netProfitUSD >= 0 ? C.green : C.red, fontSize: 13, fontWeight: 700, fontFamily: F }}>
              {marginPct}%
            </div>
          </div>
        </DCard>
      </div>

      {/* ===== KPI ROW 2 ===== */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 10 : 14, marginBottom: 20 }}>
        <DCard>
          <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, fontFamily: F }}>Stock</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.amber, fontFamily: F, marginTop: 4 }}>{totalStock}</div>
          <div style={{ fontSize: 11, color: C.textSub }}>{formatMoney(stockValueUSD, "USD")} · {lowStock.length} bajo</div>
        </DCard>
        <DCard>
          <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, fontFamily: F }}>Gastos</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.red, fontFamily: F, marginTop: 4 }}>{formatMoney(monthExpensesARS)}</div>
          <div style={{ fontSize: 11, color: C.textSub }}>{monthExpenses.length} registros</div>
        </DCard>
        <DCard>
          <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, fontFamily: F }}>Mermas</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.amber, fontFamily: F, marginTop: 4 }}>{mermasQty} uds</div>
          <div style={{ fontSize: 11, color: C.textSub }}>{formatMoney(mermasUSD, "USD")} perdido</div>
        </DCard>
        <DCard>
          <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, fontFamily: F }}>Descuentos</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.purple, fontFamily: F, marginTop: 4 }}>{formatMoney(discountsARS)}</div>
          <div style={{ fontSize: 11, color: C.textSub }}>{monthSales.filter(s => (s.discountAmount || 0) > 0).length} ventas</div>
        </DCard>
      </div>

      {/* ===== MAIN GRID ===== */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 14 }}>

        {/* Ventas por socio */}
        <DCard>
          <SLabel icon="👥">Ventas por socio</SLabel>
          <div style={{ display: "flex", gap: 12 }}>
            {[
              { name: "Diego", count: diegoSales.length, rev: diegoRevenue, color: "#818CF8", bg: "#818CF815" },
              { name: "Gustavo", count: gustavoSales.length, rev: gustavoRevenue, color: C.green, bg: C.greenBg },
            ].map(s => (
              <div key={s.name} style={{ flex: 1, textAlign: "center", padding: "14px 8px", background: s.bg, borderRadius: 12, border: `1px solid ${s.color}30` }}>
                <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, fontFamily: F }}>{s.name.toUpperCase()}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: s.color, fontFamily: F, margin: "4px 0" }}>{s.count}</div>
                <div style={{ fontSize: 11, color: C.textSub }}>{formatMoney(s.rev)}</div>
              </div>
            ))}
          </div>
        </DCard>

        {/* Distribución por marca (donut) */}
        <DCard>
          <SLabel icon="📊">Ventas por marca</SLabel>
          {brandDonut.length === 0 ? <p style={{ color: C.textMuted, fontSize: 13 }}>Sin ventas</p> : (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <MiniDonut segments={brandDonut} size={isMobile ? 70 : 80} />
              <div style={{ flex: 1 }}>
                {brandDonut.map((seg, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
                    <span style={{ color: C.textSub, fontSize: 12, flex: 1 }}>{seg.label}</span>
                    <span style={{ color: C.text, fontSize: 12, fontWeight: 700 }}>{seg.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DCard>

        {/* Top productos */}
        <DCard>
          <SLabel icon="🏆">Más vendidos del mes</SLabel>
          {topProducts.length === 0 ? <p style={{ color: C.textMuted, fontSize: 13 }}>Sin ventas</p> :
            topProducts.map((p, i) => {
              const medals = ["#FFD700", "#C0C0C0", "#CD7F32"];
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < topProducts.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: 8, background: medals[i] || C.border,
                    color: i < 3 ? "#000" : C.textSub, fontSize: 11, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>{i + 1}</span>
                  <span style={{ color: C.textSub, fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  <span style={{ color: BRAND_COLORS[p.brand] || C.blue, fontSize: 13, fontWeight: 700, fontFamily: F }}>{p.qty}</span>
                </div>
              );
            })}
        </DCard>

        {/* Stock bajo */}
        <DCard>
          <SLabel icon="⚠️">
            <span style={{ color: lowStock.length > 0 ? C.red : C.green }}>Stock bajo (≤3)</span>
          </SLabel>
          {lowStock.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.greenBg, border: `1px solid ${C.green}40`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px" }}>
                <svg width="16" height="16" viewBox="0 0 16 16"><path d="M6.5 12L2 7.5 3.5 6 6.5 9 12.5 3 14 4.5Z" fill={C.green}/></svg>
              </div>
              <p style={{ color: C.green, fontSize: 13, fontWeight: 600 }}>Todo OK</p>
            </div>
          ) :
            lowStock.slice(0, 8).map((p, i) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: i < Math.min(lowStock.length, 8) - 1 ? `1px solid ${C.border}` : "none" }}>
                <span style={{ color: C.textSub, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 8 }}>{p.brand} {p.model} - {p.flavor}</span>
                <span style={{
                  background: p.stock <= 1 ? C.red : C.amber, color: "#000",
                  fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, flexShrink: 0,
                }}>{p.stock}</span>
              </div>
            ))
          }
        </DCard>
      </div>

      {/* ===== BOTTOM: Recent sales ===== */}
      <DCard>
        <SLabel icon="🕐">Últimas ventas</SLabel>
        {recentSales.length === 0 ? <p style={{ color: C.textMuted, fontSize: 13 }}>Sin ventas registradas</p> :
          recentSales.map((s, i) => {
            const itemCount = (s.items || []).reduce((sum, it) => sum + it.qty, 0);
            const itemNames = (s.items || []).map(it => it.name || "").filter(Boolean).join(", ").slice(0, 45);
            return (
              <div key={s.id || i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < recentSales.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{s.clientName || "Sin nombre"}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                      background: s.createdBy === "Diego" ? "#818CF820" : C.greenBg,
                      color: s.createdBy === "Diego" ? "#818CF8" : C.green,
                    }}>{s.createdBy || "?"}</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {formatDate(s.date)} · {itemCount} uds · {itemNames}
                  </div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.green, fontFamily: F, flexShrink: 0, marginLeft: 12 }}>
                  {formatMoney(s.total, s.currency || "ARS")}
                </div>
              </div>
            );
          })}
      </DCard>
    </div>
  );
};
