import { useState, useMemo } from "react";
import { formatMoney, formatDate } from "../helpers.js";
import { calcTotalRevenue, calcTotalRevenueUSD } from "../calcs.js";
import { BRAND_COLORS, isGarantia } from "../constants.js";
import { useResponsive } from "../App.jsx";
import { T, pickAvatarColor } from "../theme.js";

// ---------- helpers ----------
const resolveItemName = (item, productsById) => {
  if (item.name) return item.name;
  if (item.productName) return item.productName;
  const p = item.productId ? productsById[item.productId] : null;
  if (p) return `${p.brand} ${p.model} - ${p.flavor}`;
  return "Producto eliminado";
};

const msPerDay = 86400000;
const dayKey = (d) => new Date(d).toDateString();

// ---------- trend indicator ----------
const Trend = ({ current, previous, suffix = "" }) => {
  if (!previous || previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return null;
  const up = pct >= 0;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: up ? T.green : T.red, display: "inline-flex", alignItems: "center", gap: 3 }}>
      <svg width="8" height="8" viewBox="0 0 8 8" style={{ transform: up ? "none" : "rotate(180deg)" }}>
        <path d="M4 1 L7 5 L1 5 Z" fill="currentColor" />
      </svg>
      {Math.abs(pct)}%{suffix}
    </span>
  );
};

// ---------- sparkline with area ----------
const Sparkline = ({ data, width = 100, height = 32, color = T.primary }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const n = data.length;
  const points = data.map((v, i) => {
    const x = (i / (n - 1)) * (width - 4) + 2;
    const y = height - 4 - ((v - min) / range) * (height - 8);
    return [x, y];
  });
  const path = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  const area = `${path} L${points[n - 1][0]},${height} L${points[0][0]},${height} Z`;
  const gradId = `spark-${Math.random().toString(36).slice(2)}`;
  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[n - 1][0]} cy={points[n - 1][1]} r="3" fill={T.card} stroke={color} strokeWidth="2" />
    </svg>
  );
};

// ---------- donut ----------
const Donut = ({ segments, size = 80 }) => {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  let offset = 0;
  const r = 30;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 80 80">
      <circle cx="40" cy="40" r={r} fill="none" stroke={T.borderSoft} strokeWidth="8" />
      {segments.map((seg, i) => {
        const pct = seg.value / total;
        const dash = pct * circ;
        const gap = circ - dash;
        const rot = offset * 360 - 90;
        offset += pct;
        return (
          <circle key={i} cx="40" cy="40" r={r} fill="none"
            stroke={seg.color} strokeWidth="8"
            strokeDasharray={`${dash} ${gap}`}
            transform={`rotate(${rot} 40 40)`}
            strokeLinecap="butt" />
        );
      })}
      <text x="40" y="38" textAnchor="middle" fill={T.text} fontSize="16" fontWeight="800" fontFamily={T.fontDisplay}>{total}</text>
      <text x="40" y="50" textAnchor="middle" fill={T.textMuted} fontSize="9" fontWeight="600">uds</text>
    </svg>
  );
};

// ---------- card primitive ----------
const PCard = ({ children, style, padding = 20 }) => (
  <div style={{
    background: T.card, borderRadius: T.radiusLg, padding,
    border: `1px solid ${T.borderSoft}`, boxShadow: T.shadowXs,
    ...style,
  }}>{children}</div>
);

const SectionLabel = ({ children, icon, color = T.textMuted, right }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color, textTransform: "uppercase", letterSpacing: 0.7 }}>
      {icon && <span style={{ fontSize: 13 }}>{icon}</span>}
      {children}
    </div>
    {right}
  </div>
);

// ============================================
// DASHBOARD — Light Notion/Linear aesthetic
// ============================================
export const Dashboard = ({ products, sales, purchases, expenses, withdrawals, exchangeRate, clients = [], cashMovements }) => {
  const { isMobile } = useResponsive();
  const [period, setPeriod] = useState("month"); // today | week | month
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  const now = new Date();
  const todayStr = now.toDateString();

  // ---- products lookup for item name resolution ----
  const productsById = useMemo(() => {
    const m = {};
    (products || []).forEach(p => { m[p.id] = p; });
    return m;
  }, [products]);

  // ---- date helpers ----
  const isToday = (d) => dayKey(d) === todayStr;
  const isYesterday = (d) => {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    return dayKey(d) === dayKey(y);
  };
  const isThisMonth = (d) => { const dt = new Date(d); return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear(); };
  const isLastMonth = (d) => {
    const dt = new Date(d);
    const lm = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const ly = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    return dt.getMonth() === lm && dt.getFullYear() === ly;
  };
  const daysAgo = (d, days) => new Date(d) >= new Date(now.getTime() - days * msPerDay);

  // ---- period filters ----
  const periodSales = useMemo(() => {
    if (period === "today") return sales.filter(s => isToday(s.date));
    if (period === "week") return sales.filter(s => daysAgo(s.date, 7));
    return sales.filter(s => isThisMonth(s.date));
  }, [sales, period]);

  const comparisonSales = useMemo(() => {
    if (period === "today") return sales.filter(s => isYesterday(s.date));
    if (period === "week") return sales.filter(s => { const d = new Date(s.date); return d >= new Date(now.getTime() - 14 * msPerDay) && d < new Date(now.getTime() - 7 * msPerDay); });
    return sales.filter(s => isLastMonth(s.date));
  }, [sales, period]);

  const periodLabel = { today: "Hoy", week: "Esta semana", month: "Este mes" }[period];
  const comparisonLabel = { today: "vs ayer", week: "vs semana anterior", month: "vs mes anterior" }[period];

  // ---- period data ----
  const todaySales = sales.filter(s => isToday(s.date));
  const monthSales = sales.filter(s => isThisMonth(s.date));
  const monthExpenses = expenses.filter(e => isThisMonth(e.date));
  const monthWithdrawals = (withdrawals || []).filter(w => isThisMonth(w.date));

  const periodRevenue = calcTotalRevenue(periodSales, exchangeRate);
  const comparisonRevenue = calcTotalRevenue(comparisonSales, exchangeRate);
  const periodUnits = periodSales.reduce((s, sale) => s + (sale.items || []).reduce((a, i) => a + (i.qty || 1), 0), 0);
  const monthRevenueUSD = calcTotalRevenueUSD(monthSales, exchangeRate);

  // ---- costs / profit (always month-based) ----
  const monthCOGS = monthSales.reduce((sum, s) => sum + (s.items || []).reduce((is, item) => {
    const prod = productsById[item.productId];
    if (!prod) return is;
    const cost = prod.costUSDT > 0 ? (prod.costUSDT * 1.01 * 1.05) + 0.40 : (prod.priceUSD || 0) * 0.52;
    return is + cost * (item.qty || 1);
  }, 0), 0);
  const monthExpensesARS = monthExpenses.reduce((s, e) => s + (e.amountARS || 0), 0);
  const netProfitUSD = monthRevenueUSD - monthCOGS - (monthExpensesARS / exchangeRate);
  const marginPct = monthRevenueUSD > 0 ? Math.round((netProfitUSD / monthRevenueUSD) * 100) : 0;

  // ---- stock ----
  const totalStock = products.reduce((s, p) => s + (p.stock || 0), 0);
  const stockValueUSD = products.reduce((s, p) => s + (p.stock || 0) * (p.priceUSD || 0), 0);
  const lowStock = products.filter(p => p.stock > 0 && p.stock <= 3);
  const outOfStock = products.filter(p => (p.stock || 0) <= 0);

  // ---- sparkline: last 14 days revenue ----
  const sparklineData = useMemo(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const ds = dayKey(d);
      const dayRevenue = sales.filter(s => !s.isDeleted && dayKey(s.date) === ds).reduce((sum, s) => sum + (s.total || 0), 0);
      days.push(dayRevenue);
    }
    return days;
  }, [sales]);

  // ---- brand distribution ----
  const brandDonut = useMemo(() => {
    const brands = {};
    monthSales.forEach(s => (s.items || []).forEach(item => {
      const prod = productsById[item.productId];
      if (prod) brands[prod.brand] = (brands[prod.brand] || 0) + (item.qty || 1);
    }));
    return Object.entries(brands).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([brand, qty]) => ({
      label: brand, value: qty, color: BRAND_COLORS[brand] || T.purple,
    }));
  }, [monthSales, productsById]);

  // ---- top products ----
  const topProducts = useMemo(() => {
    const counts = {};
    monthSales.forEach(s => (s.items || []).forEach(item => {
      counts[item.productId] = (counts[item.productId] || 0) + (item.qty || 1);
    }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([pid, qty]) => {
      const prod = productsById[pid];
      return {
        id: pid,
        name: prod ? `${prod.brand} ${prod.model}` : "Producto eliminado",
        flavor: prod?.flavor || "",
        brand: prod?.brand,
        qty,
        stock: prod?.stock || 0,
      };
    });
  }, [monthSales, productsById]);

  // ---- socios ----
  const diegoSales = monthSales.filter(s => s.createdBy === "Diego");
  const gustavoSales = monthSales.filter(s => s.createdBy === "Gustavo");
  const diegoRevenue = calcTotalRevenue(diegoSales, exchangeRate);
  const gustavoRevenue = calcTotalRevenue(gustavoSales, exchangeRate);

  // ---- activity feed (sales + expenses + withdrawals, merged and sorted) ----
  const activityFeed = useMemo(() => {
    const items = [];
    sales.filter(s => !s.isDeleted).slice(-20).forEach(s => {
      items.push({
        type: "sale", date: s.date, id: s.id,
        title: s.clientName || "Cliente sin nombre",
        detail: (s.items || []).map(i => `${i.qty || 1}× ${resolveItemName(i, productsById)}`).join(" · "),
        amount: s.total, sign: "+", color: T.green, icon: "🛒", by: s.createdBy,
      });
    });
    expenses.filter(e => !e.isDeleted).slice(-20).forEach(e => {
      items.push({
        type: "expense", date: e.date, id: e.id,
        title: e.category || "Gasto",
        detail: e.description || "",
        amount: e.amountARS || e.amountUSD, sign: "−", color: T.red, icon: "💸", by: e.createdBy,
      });
    });
    (withdrawals || []).filter(w => !w.isDeleted).slice(-10).forEach(w => {
      const prod = productsById[w.productId];
      items.push({
        type: "withdrawal", date: w.date, id: w.id,
        title: `${w.withdrawType || "Merma"} · ${w.person || ""}`,
        detail: prod ? `${w.qty}× ${prod.brand} ${prod.model}` : `${w.qty} uds`,
        amount: w.costEstimateUSD * exchangeRate, sign: "−", color: T.amber, icon: "📉", by: w.createdBy,
      });
    });
    return items.sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 10);
  }, [sales, expenses, withdrawals, productsById, exchangeRate]);

  // ---- alerts ----
  const alerts = useMemo(() => {
    const list = [];
    if (outOfStock.length > 0) list.push({
      t: "danger", msg: `${outOfStock.length} agotado${outOfStock.length > 1 ? "s" : ""}`,
      detail: outOfStock.slice(0, 3).map(p => `${p.brand} ${p.model}`).join(", "),
    });
    if (lowStock.length > 0) list.push({
      t: "warning", msg: `${lowStock.length} con stock bajo (≤3)`,
      detail: lowStock.slice(0, 3).map(p => `${p.brand} ${p.model} (${p.stock})`).join(", "),
    });

    const sevenAgo = new Date(now.getTime() - 7 * msPerDay).toISOString();
    const weekItems = {};
    sales.filter(s => !s.isDeleted && s.date >= sevenAgo).forEach(s => (s.items || []).forEach(i => { weekItems[i.productId] = (weekItems[i.productId] || 0) + (i.qty || 1); }));
    const willRunOut = products.filter(p => p.stock > 0 && p.stock <= 10 && weekItems[p.id] > 0 && p.stock / (weekItems[p.id] / 7) <= 7);
    if (willRunOut.length > 0) list.push({
      t: "warning",
      msg: `${willRunOut.length} se agota${willRunOut.length > 1 ? "n" : ""} en ≤7 días`,
      detail: willRunOut.slice(0, 3).map(p => `${p.brand} ${p.model}`).join(", "),
    });

    const thirtyAgo = new Date(now.getTime() - 30 * msPerDay).toISOString();
    const recentItems = {};
    sales.filter(s => !s.isDeleted && s.date >= thirtyAgo).forEach(s => (s.items || []).forEach(i => { recentItems[i.productId] = (recentItems[i.productId] || 0) + (i.qty || 1); }));
    const stale = products.filter(p => p.stock > 0 && !recentItems[p.id]);
    if (stale.length > 0) list.push({
      t: "info", msg: `${stale.length} sin vender hace 30+ días`,
      detail: stale.slice(0, 3).map(p => `${p.brand} ${p.model}`).join(", "),
    });

    const debtors = clients.filter(c => (c.balance || 0) < 0);
    if (debtors.length > 0) list.push({
      t: "warning", msg: `${debtors.length} cliente${debtors.length > 1 ? "s" : ""} con deuda`,
      detail: `Total: ${formatMoney(debtors.reduce((s, c) => s + Math.abs(c.balance), 0))}`,
    });

    // === MERMAS ===
    const wActive = (withdrawals || []).filter(w => !w.isDeleted);
    const wCost = (w) => Number(w.costRealUSD || w.costEstimateUSD) || 0;

    // 8.1 Consumo personal del mes vs promedio últimos 3 meses
    const consumoUSDInMonth = (monthOffset) => {
      const target = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
      return wActive
        .filter(w => w.withdrawType === "Consumo propio")
        .filter(w => {
          const d = new Date(w.date);
          return d.getMonth() === target.getMonth() && d.getFullYear() === target.getFullYear();
        });
    };
    const currentConsumo = consumoUSDInMonth(0);
    const currentTotal = currentConsumo.reduce((s, w) => s + wCost(w), 0);
    const prev3 = [1, 2, 3].map(i => consumoUSDInMonth(i).reduce((s, w) => s + wCost(w), 0));
    const avgPrev3 = prev3.reduce((s, x) => s + x, 0) / 3;
    if (avgPrev3 > 0 && currentTotal > avgPrev3 * 1.5) {
      const diegoUSD = currentConsumo.filter(w => w.person === "Diego").reduce((s, w) => s + wCost(w), 0);
      const gusUSD = currentConsumo.filter(w => w.person === "Gustavo").reduce((s, w) => s + wCost(w), 0);
      list.push({
        t: "warning",
        msg: "Consumo propio inusualmente alto este mes",
        detail: `Diego ${formatMoney(diegoUSD, "USD")} · Gustavo ${formatMoney(gusUSD, "USD")} (prom. anterior ${formatMoney(avgPrev3, "USD")})`,
      });
    }

    // 8.2 Reclamables a proveedor — info para próximo pedido
    const reclamables = wActive.filter(w => w.reclamableProveedor);
    if (reclamables.length > 0) {
      const reclamablesUSD = reclamables.reduce((s, w) => s + wCost(w), 0);
      const reclamablesQty = reclamables.reduce((s, w) => s + (w.qty || 0), 0);
      list.push({
        t: "info",
        msg: `${formatMoney(reclamablesUSD, "USD")} en garantías reclamables al proveedor`,
        detail: `${reclamablesQty} uds — recordá contemplarlo en el próximo pedido`,
      });
    }

    // 8.3 Modelo con alta tasa de falla este mes
    // Para cada modelo único: count de garantías del mes / ventas del mes del mismo modelo
    // Si tasa > 3% Y count >= 2: alerta roja
    const garantiasMes = wActive.filter(w => isGarantia(w.withdrawType) && isThisMonth(w.date));
    if (garantiasMes.length > 0) {
      // Contar garantías por modelo (usando failedProductId si existe, sino productId)
      const garantiasByModel = {}; // modelKey -> { count, productName }
      garantiasMes.forEach(w => {
        const pid = w.failedProductId || w.productId;
        const p = productsById[pid];
        if (!p) return;
        const key = `${p.brand}|${p.model}`;
        if (!garantiasByModel[key]) garantiasByModel[key] = { count: 0, qty: 0, name: `${p.brand} ${p.model}` };
        garantiasByModel[key].count += 1;
        garantiasByModel[key].qty += (w.qty || 0);
      });
      // Contar ventas del mes por modelo
      const ventasByModel = {};
      sales.filter(s => !s.isDeleted && isThisMonth(s.date)).forEach(s => {
        (s.items || []).forEach(i => {
          const p = productsById[i.productId];
          if (!p) return;
          const key = `${p.brand}|${p.model}`;
          ventasByModel[key] = (ventasByModel[key] || 0) + (i.qty || 1);
        });
      });
      // Detectar modelos problemáticos
      const problemModels = [];
      Object.keys(garantiasByModel).forEach(key => {
        const g = garantiasByModel[key];
        const ventas = ventasByModel[key] || 0;
        if (g.count >= 2 && ventas > 0) {
          const rate = g.count / ventas;
          if (rate > 0.03) {
            problemModels.push({ name: g.name, count: g.count, ventas, rate });
          }
        }
      });
      if (problemModels.length > 0) {
        const top = problemModels.sort((a, b) => b.rate - a.rate).slice(0, 2);
        list.push({
          t: "danger",
          msg: `${problemModels.length} modelo${problemModels.length > 1 ? "s" : ""} con alta tasa de falla este mes`,
          detail: top.map(m => `${m.name}: ${m.count} cambios sobre ${m.ventas} ventas (${(m.rate * 100).toFixed(1)}%)`).join(" · "),
        });
      }
    }

    // 8.4 Cambios por daño de envío Paraguay (>= 3 este mes)
    const dañoEnvio = garantiasMes.filter(w => w.failureReason === "Daño de envío Paraguay");
    if (dañoEnvio.length >= 3) {
      const qty = dañoEnvio.reduce((s, w) => s + (w.qty || 0), 0);
      const usd = dañoEnvio.reduce((s, w) => s + wCost(w), 0);
      list.push({
        t: "warning",
        msg: `${dañoEnvio.length} cambios por daño de envío este mes`,
        detail: `${qty} uds · ${formatMoney(usd, "USD")} — revisar embalaje con proveedor`,
      });
    }

    return list;
  }, [outOfStock, lowStock, products, productsById, sales, clients, withdrawals]);

  const alertStyles = {
    danger: { bg: T.redBg, border: T.redBorder, dot: T.red },
    warning: { bg: T.amberBg, border: T.amberBorder, dot: T.amber },
    info: { bg: T.blueBg, border: T.blueBorder, dot: T.blue },
  };

  // ---- mermas & descuentos ----
  const mermasQty = monthWithdrawals.reduce((s, w) => s + (w.qty || 0), 0);
  const mermasUSD = monthWithdrawals.reduce((s, w) => s + (w.costEstimateUSD || 0), 0);
  const discountsARS = monthSales.reduce((s, sale) => s + (sale.discountAmount || 0), 0);

  return (
    <div style={{ fontFamily: T.font }}>
      {/* ===== HEADER ===== */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: isMobile ? 26 : 32, fontWeight: 800, color: T.text, margin: 0, letterSpacing: "-0.02em", fontFamily: T.fontDisplay }}>
            Dashboard
          </h1>
          <p style={{ color: T.textMuted, fontSize: 14, margin: "6px 0 0", textTransform: "capitalize" }}>
            {now.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
            <span style={{ marginLeft: 10, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.green }} />
              Blue <strong style={{ color: T.text, fontWeight: 700 }}>${exchangeRate}</strong>
            </span>
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* ===== ALERTS ===== */}
      {alerts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
          {(showAllAlerts ? alerts : alerts.slice(0, 3)).map((a, i) => {
            const st = alertStyles[a.t];
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px", background: st.bg,
                border: `1px solid ${st.border}`, borderRadius: 10,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot, flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 13, color: T.text, lineHeight: 1.4 }}>
                  <b style={{ color: st.dot, fontWeight: 600 }}>{a.msg}</b>
                  {a.detail && <span style={{ marginLeft: 8, color: T.textSub, fontSize: 12 }}>· {a.detail}</span>}
                </div>
              </div>
            );
          })}
          {alerts.length > 3 && (
            <button onClick={() => setShowAllAlerts(!showAllAlerts)} style={{
              background: "none", border: "none", color: T.primary, fontSize: 12,
              cursor: "pointer", fontWeight: 600, fontFamily: "inherit",
              textAlign: "left", padding: "4px 2px", width: "fit-content",
            }}>
              {showAllAlerts ? "Ver menos" : `+${alerts.length - 3} alertas más`}
            </button>
          )}
        </div>
      )}

      {/* ===== HERO KPIs ===== */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
        gap: isMobile ? 12 : 16, marginBottom: 16,
      }}>
        <HeroKpi
          label={`Ventas · ${periodLabel}`}
          value={periodSales.length}
          sub={`${formatMoney(periodRevenue)} · ${periodUnits} uds`}
          trend={<Trend current={periodSales.length} previous={comparisonSales.length} suffix={` ${comparisonLabel}`} />}
          accent={T.primary}
          chart={<Sparkline data={sparklineData} color={T.primary} width={100} height={36} />}
        />
        <HeroKpi
          label="Ganancia del mes"
          value={formatMoney(netProfitUSD, "USD")}
          sub={`${formatMoney(netProfitUSD * exchangeRate)} · Margen ${marginPct}%`}
          accent={netProfitUSD >= 0 ? T.green : T.red}
          badge={marginPct > 0 ? `+${marginPct}%` : `${marginPct}%`}
          badgeColor={netProfitUSD >= 0 ? T.green : T.red}
        />
        <HeroKpi
          label="Stock total"
          value={totalStock}
          sub={`${formatMoney(stockValueUSD, "USD")} valorizado · ${lowStock.length} bajo`}
          accent={T.amber}
          warn={outOfStock.length > 0 ? `${outOfStock.length} agotados` : null}
        />
      </div>

      {/* ===== SECONDARY KPIs ===== */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
        gap: isMobile ? 10 : 14, marginBottom: 20,
      }}>
        <MiniKpi label="Gastos del mes" value={formatMoney(monthExpensesARS)} sub={`${monthExpenses.length} registros`} accent={T.red} />
        <MiniKpi label="Mermas" value={`${mermasQty} uds`} sub={formatMoney(mermasUSD, "USD")} accent={T.amber} />
        <MiniKpi label="Descuentos" value={formatMoney(discountsARS)} sub={`${monthSales.filter(s => (s.discountAmount || 0) > 0).length} ventas`} accent={T.purple} />
        <MiniKpi label="Clientes activos" value={new Set(monthSales.map(s => s.clientId).filter(Boolean)).size} sub={`de ${clients.length}`} accent={T.blue} />
      </div>

      {/* ===== MAIN GRID ===== */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: 16, marginBottom: 16,
      }}>
        {/* Socios */}
        <PCard>
          <SectionLabel icon="🤝">Socios del mes</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { name: "Diego", count: diegoSales.length, rev: diegoRevenue, accent: T.primary },
              { name: "Gustavo", count: gustavoSales.length, rev: gustavoRevenue, accent: T.green },
            ].map(s => (
              <div key={s.name} style={{
                padding: "16px 12px", borderRadius: 12,
                background: `${s.accent}10`, border: `1px solid ${s.accent}30`,
                textAlign: "center",
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.name}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: s.accent, fontFamily: T.fontDisplay, letterSpacing: "-0.02em", marginTop: 4 }}>
                  {s.count}
                </div>
                <div style={{ fontSize: 12, color: T.textSub, marginTop: 2 }}>{formatMoney(s.rev)}</div>
              </div>
            ))}
          </div>
        </PCard>

        {/* Brand donut */}
        <PCard>
          <SectionLabel icon="📊">Ventas por marca</SectionLabel>
          {brandDonut.length === 0 ? (
            <p style={{ color: T.textMuted, fontSize: 13, padding: "12px 0" }}>Sin ventas este mes</p>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <Donut segments={brandDonut} size={isMobile ? 80 : 92} />
              <div style={{ flex: 1 }}>
                {brandDonut.map((seg, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
                    <span style={{ color: T.textSub, fontSize: 12, flex: 1 }}>{seg.label}</span>
                    <span style={{ color: T.text, fontSize: 12, fontWeight: 700, fontFamily: T.fontDisplay }}>{seg.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </PCard>

        {/* Top products */}
        <PCard>
          <SectionLabel icon="🏆">Más vendidos del mes</SectionLabel>
          {topProducts.length === 0 ? (
            <p style={{ color: T.textMuted, fontSize: 13, padding: "12px 0" }}>Sin ventas este mes</p>
          ) : (
            <div>
              {topProducts.map((p, i) => {
                const medals = [T.amber, "#C0C0C0", "#CD7F32"];
                return (
                  <div key={p.id} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                    borderBottom: i < topProducts.length - 1 ? `1px solid ${T.borderSoft}` : "none",
                  }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: 6,
                      background: i < 3 ? medals[i] : T.surface2,
                      color: i < 3 ? "#fff" : T.textMuted,
                      fontSize: 11, fontWeight: 800, fontFamily: T.fontDisplay,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: T.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 11, color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.flavor} {p.stock !== undefined && <span style={{ marginLeft: 4 }}>· {p.stock} en stock</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 800, color: BRAND_COLORS[p.brand] || T.primary, fontFamily: T.fontDisplay, flexShrink: 0 }}>
                      {p.qty}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </PCard>

        {/* Low stock */}
        <PCard>
          <SectionLabel icon="⚠️" color={lowStock.length > 0 ? T.red : T.textMuted}>
            Stock bajo {lowStock.length > 0 && `(${lowStock.length})`}
          </SectionLabel>
          {lowStock.length === 0 ? (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: T.greenBg, border: `1px solid ${T.greenBorder}`,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                marginBottom: 8,
              }}>
                <svg width="16" height="16" viewBox="0 0 16 16"><path d="M6.5 12L2 7.5 3.5 6 6.5 9 12.5 3 14 4.5Z" fill={T.green} /></svg>
              </div>
              <p style={{ color: T.green, fontSize: 13, fontWeight: 600, margin: 0 }}>Todo OK</p>
            </div>
          ) : (
            <div>
              {lowStock.slice(0, 6).map((p, i) => (
                <div key={p.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "6px 0", borderBottom: i < Math.min(lowStock.length, 6) - 1 ? `1px solid ${T.borderSoft}` : "none",
                  gap: 8,
                }}>
                  <span style={{ color: T.textSub, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {p.brand} {p.model} · {p.flavor}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                    background: p.stock <= 1 ? T.redBg : T.amberBg,
                    color: p.stock <= 1 ? T.red : T.amber,
                    flexShrink: 0,
                  }}>{p.stock} uds</span>
                </div>
              ))}
              {lowStock.length > 6 && (
                <div style={{ fontSize: 11, color: T.textMuted, textAlign: "center", paddingTop: 8 }}>
                  +{lowStock.length - 6} más
                </div>
              )}
            </div>
          )}
        </PCard>
      </div>

      {/* ===== ACTIVITY FEED ===== */}
      <PCard>
        <SectionLabel icon="🕐">Actividad reciente</SectionLabel>
        {activityFeed.length === 0 ? (
          <p style={{ color: T.textMuted, fontSize: 13, padding: "12px 0" }}>Sin actividad registrada</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {activityFeed.map((a, i) => {
              const { bg, fg } = a.type === "sale" ? pickAvatarColor(a.title) : { bg: `${a.color}15`, fg: a.color };
              return (
                <div key={a.id || i} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 0",
                  borderBottom: i < activityFeed.length - 1 ? `1px solid ${T.borderSoft}` : "none",
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: bg, color: fg,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, flexShrink: 0, fontWeight: 700,
                  }}>
                    {a.type === "sale" ? (a.title.charAt(0).toUpperCase() || "?") : a.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>{a.title}</span>
                      {a.by && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                          background: a.by === "Diego" ? T.primarySoft : T.greenBg,
                          color: a.by === "Diego" ? T.primary : T.green,
                        }}>{a.by}</span>
                      )}
                    </div>
                    {a.detail && (
                      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {formatDate(a.date)} · {a.detail}
                      </div>
                    )}
                  </div>
                  {a.amount != null && (
                    <div style={{
                      fontSize: 14, fontWeight: 700, color: a.color, fontFamily: T.fontDisplay,
                      flexShrink: 0, whiteSpace: "nowrap",
                    }}>
                      {a.sign}{formatMoney(Math.abs(a.amount))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </PCard>
    </div>
  );
};

// ---------- period selector ----------
const PeriodSelector = ({ value, onChange }) => (
  <div style={{ display: "inline-flex", background: T.surface2, borderRadius: 10, padding: 3, border: `1px solid ${T.borderSoft}` }}>
    {[
      { key: "today", label: "Hoy" },
      { key: "week", label: "Semana" },
      { key: "month", label: "Mes" },
    ].map(o => (
      <button key={o.key} onClick={() => onChange(o.key)} style={{
        padding: "6px 14px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none",
        background: value === o.key ? T.card : "transparent",
        color: value === o.key ? T.text : T.textSub,
        boxShadow: value === o.key ? T.shadowXs : "none",
        cursor: "pointer", fontFamily: "inherit", transition: "all .15s",
      }}>{o.label}</button>
    ))}
  </div>
);

// ---------- hero KPI ----------
const HeroKpi = ({ label, value, sub, trend, chart, accent, badge, badgeColor, warn }) => (
  <PCard padding={18}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.7 }}>{label}</span>
        </div>
        <div style={{
          fontSize: 30, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay,
          lineHeight: 1, letterSpacing: "-0.02em",
        }}>{value}</div>
        <div style={{ fontSize: 12, color: T.textSub, marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>{sub}</span>
          {trend}
        </div>
        {warn && (
          <div style={{
            marginTop: 8, display: "inline-block", padding: "2px 8px", borderRadius: 6,
            background: T.redBg, color: T.red, fontSize: 11, fontWeight: 600,
          }}>{warn}</div>
        )}
      </div>
      {chart}
      {badge && (
        <div style={{
          padding: "5px 10px", borderRadius: 8,
          background: `${badgeColor}18`, color: badgeColor,
          fontSize: 13, fontWeight: 800, fontFamily: T.fontDisplay, flexShrink: 0,
        }}>{badge}</div>
      )}
    </div>
  </PCard>
);

// ---------- mini KPI ----------
const MiniKpi = ({ label, value, sub, accent }) => (
  <PCard padding={14}>
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</span>
    </div>
    <div style={{
      fontSize: 20, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay,
      lineHeight: 1, letterSpacing: "-0.02em",
    }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>{sub}</div>}
  </PCard>
);
