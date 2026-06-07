import { useState, useMemo, useEffect } from "react";
import { formatMoney, formatDate, safeRate } from "../helpers.js";
import { calcTotalRevenue, calcTotalRevenueUSD } from "../calcs.js";
import { buildProductSalesStats } from "../productIntelligence.js";
import { BRAND_COLORS, isGarantia } from "../constants.js";
import { useResponsive } from "../App.jsx";
import { useAppContext } from "../AppContext.js";
import { useSettings } from "../useSettings.js";
import { T, pickAvatarColor } from "../theme.js";
import { generateDashboardAlerts } from "../lib/dashboardAlerts.js";
import { getActionOfTheDay } from "../lib/dashboardAction.js";
import { calcMonthGoalProgress } from "../lib/dashboardGoal.js";

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
export const Dashboard = ({ products, sales, purchases, expenses, withdrawals, clients = [], cashMovements, onNavigate }) => {
  const { exchangeRate } = useAppContext();
  const settings = useSettings();
  const { isMobile, isTablet } = useResponsive();
  const [period, setPeriod] = useState("month"); // today | week | month
  const [reorderModal, setReorderModal] = useState(false);
  const [reorderQty, setReorderQty] = useState({}); // productId -> qty sugerida/editada
  const [copyToast, setCopyToast] = useState("");
  const [trendingProduct, setTrendingProduct] = useState(null); // producto seleccionado para ver histórico 30d

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
  const rateSafe = safeRate(exchangeRate);
  const monthExpensesUSD = rateSafe > 0 ? monthExpensesARS / rateSafe : 0;
  const netProfitUSD = monthRevenueUSD - monthCOGS - monthExpensesUSD;
  const marginPct = monthRevenueUSD > 0 ? Math.round((netProfitUSD / monthRevenueUSD) * 100) : 0;

  // ---- stock ----
  const totalStock = products.reduce((s, p) => s + (p.stock || 0), 0);
  const stockValueUSD = products.reduce((s, p) => s + (p.stock || 0) * (p.priceUSD || 0), 0);
  const lowStock = products.filter(p => p.stock > 0 && p.stock <= settings.lowStockThreshold);
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

  // ---- channel breakdown (period-based) ----
  // Cada canal tiene color fijo + se calcula % del total + ticket promedio (proxy de conversión)
  const channelStats = useMemo(() => {
    const CHANNEL_COLORS = {
      "WhatsApp": "#25D366",
      "Instagram": "#E1306C",
      "Delivery": "#F59E0B",
      "Presencial": "#6366f1",
      "Sin canal": "#94A3B8",
    };
    const map = {};
    periodSales.forEach(s => {
      const ch = s.channel || "Sin canal";
      if (!map[ch]) map[ch] = { count: 0, units: 0, revenueARS: 0 };
      map[ch].count += 1;
      map[ch].units += (s.items || []).reduce((a, i) => a + (i.qty || 1), 0);
      const totalARS = s.currency === "USD" ? (s.total || 0) * exchangeRate : (s.total || 0);
      map[ch].revenueARS += totalARS;
    });
    const totalCount = Object.values(map).reduce((a, b) => a + b.count, 0);
    return Object.entries(map)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([ch, v]) => ({
        label: ch,
        color: CHANNEL_COLORS[ch] || T.purple,
        count: v.count,
        units: v.units,
        pct: totalCount > 0 ? (v.count / totalCount) * 100 : 0,
        avgTicket: v.count > 0 ? v.revenueARS / v.count : 0,
      }));
  }, [periodSales, exchangeRate]);

  // ---- runway: días de liquidez al ritmo actual de gastos ----
  // Liquidez ≈ saldos iniciales ARS + ingresos ARS - egresos ARS - costos ARS de los últimos 90d.
  // Burn diario = (gastos último mes) / 30. Runway = liquidez / burn.
  const runway = useMemo(() => {
    const ninetyAgo = new Date(now.getTime() - 90 * msPerDay).toISOString();
    const recentSales = sales.filter(s => !s.isDeleted && s.date >= ninetyAgo);
    const recentExpenses = expenses.filter(e => !e.isDeleted && e.date >= ninetyAgo);
    const recentPurchases = (purchases || []).filter(p => !p.isDeleted && p.date >= ninetyAgo && p.status === "verificado");
    const initialARS = 273646.62 + 120000;
    const salesARS = recentSales.reduce((s, sale) => {
      const totalARS = sale.currency === "USD" ? (sale.total || 0) * exchangeRate : (sale.total || 0);
      return s + totalARS;
    }, 0);
    const expensesARS = recentExpenses.reduce((s, e) => s + (e.amountARS || 0), 0);
    const purchasesARS = recentPurchases.reduce((s, p) => s + (p.totalUSDT || 0) * exchangeRate, 0);
    const liquidityARSGross = initialARS + salesARS - expensesARS - purchasesARS;

    // S14.7 — créditos pendientes a clientes son PASIVO real, no cash disponible.
    // Si Diego le dio $5000 de vuelto-crédito a un cliente, esos $5000 los DEBE
    // entregar (en próxima compra o devolución). La liquidez real es lo que tengo
    // MENOS lo que les debo a clientes.
    const clientCreditOwed = (clients || [])
      .filter(c => !c.isDeleted && (c.balance || 0) > 0)
      .reduce((s, c) => s + (c.balance || 0), 0);
    const liquidityARS = liquidityARSGross - clientCreditOwed;

    const monthlyBurn = monthExpenses.reduce((s, e) => s + (e.amountARS || 0), 0);
    const dailyBurn = monthlyBurn / 30;
    const days = dailyBurn > 0 ? liquidityARS / dailyBurn : Infinity;
    return { liquidityARS, liquidityARSGross, clientCreditOwed, dailyBurn, days };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, expenses, purchases, monthExpenses, exchangeRate, clients]);

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
    const rate = safeRate(exchangeRate);
    (withdrawals || []).filter(w => !w.isDeleted).slice(-10).forEach(w => {
      const prod = productsById[w.productId];
      const costUSD = Number(w.costRealUSD || w.costEstimateUSD || 0);
      items.push({
        type: "withdrawal", date: w.date, id: w.id,
        title: `${w.withdrawType || "Merma"} · ${w.person || ""}`,
        detail: prod ? `${w.qty}× ${prod.brand} ${prod.model}` : `${w.qty} uds`,
        amount: costUSD * rate, sign: "−", color: T.amber, icon: "📉", by: w.createdBy,
      });
    });
    return items.sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 10);
  }, [sales, expenses, withdrawals, productsById, exchangeRate]);

  // ---- alerts ----
  // Reemplaza la lógica anterior (~270 líneas) por la lib pura testeada
  // src/lib/dashboardAlerts.js que ya filtra el catálogo fantasma y agrupa
  // por urgencia (urgent / week / opportunity), cada una con acción concreta.
  const alertsGrouped = useMemo(
    () => generateDashboardAlerts({
      products, sales, purchases, clients, settings, exchangeRate, now,
    }),
    [products, sales, purchases, clients, settings, exchangeRate, now]
  );

  // Acción del día — la próxima jugada concreta para vender más
  const actionOfDay = useMemo(
    () => getActionOfTheDay({ sales, clients, products, exchangeRate, now }),
    [sales, clients, products, exchangeRate, now]
  );

  // Meta del mes — progreso vs objetivo configurado
  const monthGoal = useMemo(
    () => calcMonthGoalProgress(sales, settings.monthlyRevenueGoalARS, exchangeRate, now),
    [sales, settings.monthlyRevenueGoalARS, exchangeRate, now]
  );


  // ---- mermas & descuentos ----
  const mermasQty = monthWithdrawals.reduce((s, w) => s + (w.qty || 0), 0);
  // Usar costRealUSD (datos nuevos) con fallback a costEstimateUSD (datos legacy).
  // Antes solo leía costEstimateUSD y mostraba $0 para mermas nuevas correctamente
  // cargadas tras el rework de Mermas.
  const mermasUSD = monthWithdrawals.reduce((s, w) => s + Number(w.costRealUSD || w.costEstimateUSD || 0), 0);
  // Desglose: consumo personal (propio) vs común (garantías + canjes + regalos)
  const mermasConsumoPersonalUSD = monthWithdrawals
    .filter(w => w.withdrawType === "Consumo propio")
    .reduce((s, w) => s + Number(w.costRealUSD || w.costEstimateUSD || 0), 0);
  const mermasComunesUSD = mermasUSD - mermasConsumoPersonalUSD;
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

      {/* ===== ACCIÓN DEL DÍA (la próxima jugada concreta) ===== */}
      {actionOfDay && (
        <ActionOfDayCard action={actionOfDay} onNavigate={onNavigate} isMobile={isMobile} />
      )}

      {/* ===== META DEL MES (si está configurada) ===== */}
      {monthGoal && (
        <MonthGoalCard goal={monthGoal} isMobile={isMobile} />
      )}

      {/* ===== ALERTAS AGRUPADAS POR URGENCIA ===== */}
      {alertsGrouped.totalCount > 0 && (
        <AlertsSection groups={alertsGrouped} onNavigate={onNavigate} isMobile={isMobile} />
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
        gridTemplateColumns: isMobile ? "1fr 1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
        gap: isMobile ? 10 : 14, marginBottom: 20,
      }}>
        <MiniKpi label="Gastos del mes" value={formatMoney(monthExpensesARS)} sub={`${monthExpenses.length} registros`} accent={T.red} />
        <MiniKpi
          label="Mermas"
          value={`${mermasQty} uds`}
          sub={
            mermasConsumoPersonalUSD > 0 && mermasComunesUSD > 0
              ? `${formatMoney(mermasUSD, "USD")} · Propio ${formatMoney(mermasConsumoPersonalUSD, "USD")} · Común ${formatMoney(mermasComunesUSD, "USD")}`
              : formatMoney(mermasUSD, "USD")
          }
          accent={T.amber}
        />
        <MiniKpi label="Descuentos" value={formatMoney(discountsARS)} sub={`${monthSales.filter(s => (s.discountAmount || 0) > 0).length} ventas`} accent={T.purple} />
        <MiniKpi label="Clientes activos" value={new Set(monthSales.map(s => s.clientId).filter(Boolean)).size} sub={`de ${clients.length}`} accent={T.blue} />
      </div>

      {/* ===== MAIN GRID ===== */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: 16, marginBottom: 16,
      }}>
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
                  <div
                    key={p.id}
                    onClick={() => setTrendingProduct(p)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === "Enter") setTrendingProduct(p); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                      borderBottom: i < topProducts.length - 1 ? `1px solid ${T.borderSoft}` : "none",
                      cursor: "pointer", borderRadius: 6,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = T.surface2; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                  >
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
            <SectionLabel icon="⚠️" color={lowStock.length > 0 || outOfStock.length > 0 ? T.red : T.textMuted}>
              Stock bajo {(lowStock.length + outOfStock.length) > 0 && `(${lowStock.length + outOfStock.length})`}
            </SectionLabel>
            {(lowStock.length + outOfStock.length) > 0 && (
              <button onClick={() => {
                // Smart reorder: velocidad × (leadTime + safetyStock) - stock actual.
                // leadTime 30d (importación Paraguay), safety 7d, mínimo 5 uds.
                // Si el producto vende mucho recientemente (últimos 7d > 50% del último mes),
                // se aplica multiplicador 1.3x para anticipar tendencia ascendente.
                const LEAD_TIME = 30, SAFETY = 7;
                const thirtyAgo = new Date(now.getTime() - 30 * msPerDay).toISOString();
                const sevenAgoIso = new Date(now.getTime() - 7 * msPerDay).toISOString();
                const recentItems = {};
                const lastWeekItems = {};
                sales.filter(s => !s.isDeleted && s.date >= thirtyAgo).forEach(s =>
                  (s.items || []).forEach(i => {
                    recentItems[i.productId] = (recentItems[i.productId] || 0) + (i.qty || 1);
                    if (s.date >= sevenAgoIso) {
                      lastWeekItems[i.productId] = (lastWeekItems[i.productId] || 0) + (i.qty || 1);
                    }
                  })
                );
                const defaults = {};
                [...outOfStock, ...lowStock].forEach(p => {
                  const monthlyQty = recentItems[p.id] || 0;
                  const weeklyQty = lastWeekItems[p.id] || 0;
                  const velocity = monthlyQty / 30; // uds/día
                  const trending = monthlyQty > 0 && (weeklyQty / monthlyQty) > 0.5; // último 7d > 50% del mes
                  const trendMultiplier = trending ? 1.3 : 1;
                  const target = Math.ceil(velocity * (LEAD_TIME + SAFETY) * trendMultiplier);
                  const needed = target - (p.stock || 0);
                  defaults[p.id] = Math.max(5, needed);
                });
                setReorderQty(defaults);
                setReorderModal(true);
              }} style={{
                padding: "5px 10px", minHeight: 32,
                border: `1px solid ${T.greenBorder}`, borderRadius: 6,
                background: T.greenBg, color: T.green, fontSize: 11, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
              }}>📲 Avisar proveedor</button>
            )}
          </div>
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

      {/* ===== CHANNEL + RUNWAY ===== */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: 16, marginBottom: 16,
      }}>
        {/* Ventas por canal */}
        <PCard>
          <SectionLabel icon="📡">Ventas por canal · {periodLabel}</SectionLabel>
          {channelStats.length === 0 ? (
            <p style={{ color: T.textMuted, fontSize: 13, padding: "12px 0" }}>Sin ventas este período</p>
          ) : (
            <div>
              {channelStats.map(ch => (
                <div key={ch.label} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: ch.color, flexShrink: 0 }} />
                    <span style={{ color: T.text, fontSize: 13, fontWeight: 600, flex: 1 }}>{ch.label}</span>
                    <span style={{ color: T.text, fontSize: 13, fontWeight: 700, fontFamily: T.fontDisplay }}>
                      {ch.pct.toFixed(0)}%
                    </span>
                  </div>
                  <div style={{ height: 6, background: T.surface2, borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
                    <div style={{ width: `${ch.pct}%`, height: "100%", background: ch.color, transition: "width .3s" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.textMuted }}>
                    <span>{ch.count} venta{ch.count !== 1 ? "s" : ""} · {ch.units} uds</span>
                    <span>Ticket prom. {formatMoney(ch.avgTicket)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PCard>

        {/* Runway / liquidez */}
        <PCard>
          <SectionLabel icon="⛽">Runway · liquidez estimada</SectionLabel>
          {runway.dailyBurn === 0 ? (
            <div style={{ padding: "12px 0" }}>
              <p style={{ color: T.textMuted, fontSize: 13, margin: 0 }}>Sin gastos registrados este mes — no se puede proyectar runway.</p>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                <span style={{
                  fontSize: 32, fontWeight: 800, fontFamily: T.fontDisplay,
                  color: runway.days < 30 ? T.red : runway.days < 60 ? T.amber : T.green,
                }}>
                  {runway.days === Infinity ? "∞" : Math.floor(runway.days)}
                </span>
                <span style={{ fontSize: 13, color: T.textMuted }}>días al ritmo actual</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                <div>
                  <div style={{ color: T.textMuted, marginBottom: 2 }}>Liquidez disponible</div>
                  <div style={{ color: T.text, fontWeight: 700, fontFamily: T.fontDisplay }}>
                    {formatMoney(runway.liquidityARS)}
                  </div>
                  {runway.clientCreditOwed > 0 && (
                    <div style={{ color: T.textMuted, fontSize: 10, marginTop: 2 }}>
                      Bruto {formatMoney(runway.liquidityARSGross)} − {formatMoney(runway.clientCreditOwed)} debido a clientes
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ color: T.textMuted, marginBottom: 2 }}>Burn diario</div>
                  <div style={{ color: T.text, fontWeight: 700, fontFamily: T.fontDisplay }}>
                    {formatMoney(runway.dailyBurn)}
                  </div>
                </div>
              </div>
              {runway.days < 30 && runway.days !== Infinity && (
                <div style={{
                  marginTop: 10, padding: "8px 10px", background: T.redBg, border: `1px solid ${T.redBorder}`,
                  borderRadius: 6, fontSize: 11, color: T.red, fontWeight: 600,
                }}>
                  ⚠️ Runway crítico — revisar gastos o acelerar ventas
                </div>
              )}
              <div style={{ marginTop: 8, fontSize: 10, color: T.textMuted, lineHeight: 1.4 }}>
                Estimación basada en saldos iniciales + flujo último 90d. Burn = gastos del mes / 30.
              </div>
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

      {/* Modal: avisar proveedor */}
      {reorderModal && (
        <ReorderModal
          products={[...outOfStock, ...lowStock]}
          qtyMap={reorderQty}
          setQtyMap={setReorderQty}
          onClose={() => setReorderModal(false)}
          onCopied={(msg) => {
            setCopyToast(msg);
            setTimeout(() => setCopyToast(""), 2000);
          }}
        />
      )}

      {trendingProduct && (
        <TrendingProductModal
          product={trendingProduct}
          sales={sales}
          onClose={() => setTrendingProduct(null)}
        />
      )}

      {/* Toast de confirmación */}
      {copyToast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: T.text, color: T.bg, padding: "12px 20px", borderRadius: 10,
          fontSize: 13, fontWeight: 600, zIndex: 1001,
          boxShadow: "0 6px 20px rgba(0,0,0,0.2)",
        }}>{copyToast}</div>
      )}
    </div>
  );
};

// ============================================
// ReorderModal — compone el mensaje para el proveedor
// ============================================
// ============================================
// TrendingProductModal — histórico 30d de un producto
// ============================================
const TrendingProductModal = ({ product, sales, onClose }) => {
  const dailyData = useMemo(() => {
    const now = new Date();
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      days.push({ date: d, qty: 0, revenue: 0 });
    }
    sales.forEach(s => {
      if (s.isDeleted) return;
      const sd = new Date(s.date);
      sd.setHours(0, 0, 0, 0);
      const idx = days.findIndex(d => d.date.getTime() === sd.getTime());
      if (idx === -1) return;
      (s.items || []).forEach(it => {
        if (it.productId === product.id) {
          days[idx].qty += (it.qty || 1);
          days[idx].revenue += (it.price || 0) * (it.qty || 1);
        }
      });
    });
    return days;
  }, [sales, product.id]);

  const totalQty = dailyData.reduce((a, d) => a + d.qty, 0);
  const totalRevenue = dailyData.reduce((a, d) => a + d.revenue, 0);
  const peakDay = dailyData.reduce((max, d) => d.qty > max.qty ? d : max, dailyData[0]);
  const avgPerDay = totalQty / 30;
  const daysWithSales = dailyData.filter(d => d.qty > 0).length;
  const maxQty = Math.max(1, ...dailyData.map(d => d.qty));

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,18,28,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.surface, border: `1px solid ${T.borderSoft}`, borderRadius: 12,
          padding: 24, maxWidth: 540, width: "100%", maxHeight: "92vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>
              Histórico 30 días
            </div>
            <h3 style={{ margin: "4px 0 2px", fontSize: 18, fontWeight: 700, color: T.text }}>{product.name}</h3>
            {product.flavor && <div style={{ fontSize: 13, color: T.textMuted }}>{product.flavor}</div>}
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "none", color: T.textMuted,
            fontSize: 22, cursor: "pointer", padding: 0, lineHeight: 1,
          }} aria-label="Cerrar">×</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile || isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 8, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 2 }}>Total uds</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay }}>{totalQty}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 2 }}>Promedio/día</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay }}>{avgPerDay.toFixed(1)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 2 }}>Días con venta</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay }}>{daysWithSales}/30</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 2 }}>Pico</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay }}>{peakDay.qty}</div>
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 600, marginBottom: 6 }}>Ventas diarias</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 80, padding: "8px 0", borderBottom: `1px solid ${T.borderSoft}` }}>
            {dailyData.map((d, i) => (
              <div
                key={i}
                title={`${d.date.toLocaleDateString("es-AR", { day: "numeric", month: "short" })}: ${d.qty} uds`}
                style={{
                  flex: 1,
                  height: `${(d.qty / maxQty) * 100}%`,
                  minHeight: d.qty > 0 ? 2 : 1,
                  background: d.qty > 0 ? T.primary : T.borderSoft,
                  borderRadius: "2px 2px 0 0",
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.textMuted, marginTop: 4 }}>
            <span>{dailyData[0]?.date.toLocaleDateString("es-AR", { day: "numeric", month: "short" })}</span>
            <span>Hoy</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 12 }}>
          <div style={{ background: T.surface2, padding: 10, borderRadius: 8 }}>
            <div style={{ color: T.textMuted, marginBottom: 2 }}>Ingresos 30d</div>
            <div style={{ color: T.text, fontWeight: 700, fontFamily: T.fontDisplay }}>{formatMoney(totalRevenue)}</div>
          </div>
          <div style={{ background: T.surface2, padding: 10, borderRadius: 8 }}>
            <div style={{ color: T.textMuted, marginBottom: 2 }}>Stock actual</div>
            <div style={{
              color: (product.stock || 0) === 0 ? T.red : (product.stock || 0) <= 3 ? T.amber : T.text,
              fontWeight: 700, fontFamily: T.fontDisplay,
            }}>
              {product.stock || 0} uds {avgPerDay > 0 && product.stock > 0 && `· ${Math.floor(product.stock / avgPerDay)} días`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ReorderModal = ({ products, qtyMap, setQtyMap, onClose, onCopied }) => {
  const { isMobile, isTablet } = useResponsive();

  // Agrupar por marca para el mensaje
  const byBrand = useMemo(() => {
    const m = {};
    products.forEach(p => {
      if (!m[p.brand]) m[p.brand] = [];
      const qty = Number(qtyMap[p.id] || 0);
      if (qty > 0) m[p.brand].push({ ...p, qty });
    });
    return m;
  }, [products, qtyMap]);

  const totalUnits = Object.values(byBrand).flat().reduce((s, p) => s + p.qty, 0);

  const message = useMemo(() => {
    const lines = ["¡Hola! Necesito reponer estos vapes:", ""];
    Object.entries(byBrand).sort((a, b) => a[0].localeCompare(b[0])).forEach(([brand, items]) => {
      if (items.length === 0) return;
      lines.push(brand.toUpperCase());
      items.forEach(p => {
        lines.push(`- ${p.qty}× ${p.model}${p.flavor ? ` - ${p.flavor}` : ""}`);
      });
      lines.push("");
    });
    lines.push(`Total: ${totalUnits} unidades. Gracias!`);
    return lines.join("\n");
  }, [byBrand, totalUnits]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      onCopied("✓ Mensaje copiado al portapapeles");
    } catch {
      onCopied("No se pudo copiar. Copialo manualmente.");
    }
  };

  const handleWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener");
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(15,15,15,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 16, paddingTop: "env(safe-area-inset-top, 16px)",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.bg, borderRadius: 16, padding: isMobile ? 20 : 28,
        maxWidth: 560, width: "100%", maxHeight: "92vh", overflowY: "auto",
        boxShadow: "0 20px 60px rgba(15,15,15,0.25)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: T.text }}>📲 Avisar al proveedor</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: T.textMuted, lineHeight: 1 }}>×</button>
        </div>

        <p style={{ fontSize: 13, color: T.textMuted, margin: "0 0 14px" }}>
          Ajustá las cantidades si hace falta. La sugerencia es 2 semanas de stock basadas en ventas recientes.
        </p>

        <div style={{ marginBottom: 16, maxHeight: 280, overflowY: "auto", border: `1px solid ${T.borderSoft}`, borderRadius: 10 }}>
          {products.map(p => (
            <div key={p.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
              borderBottom: `1px solid ${T.borderSoft}`,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: T.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.brand} {p.model}
                </div>
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                  {p.flavor} · stock actual: {p.stock || 0}
                </div>
              </div>
              <input
                type="number" min="0" value={qtyMap[p.id] || 0}
                onChange={e => setQtyMap({ ...qtyMap, [p.id]: Math.max(0, Number(e.target.value) || 0) })}
                style={{
                  width: 64, padding: "8px 10px", minHeight: 40,
                  border: `1px solid ${T.borderSoft}`, borderRadius: 8,
                  fontSize: 14, fontWeight: 700, textAlign: "center",
                  background: T.surface2, color: T.text, outline: "none", fontFamily: "inherit",
                }} />
            </div>
          ))}
        </div>

        {/* Preview del mensaje */}
        <div style={{
          background: "#EEF8EE", border: "1px solid #c8e6c9", borderRadius: 10,
          padding: "12px 14px", marginBottom: 14,
          fontSize: 12, color: "#2E7D32", fontFamily: "ui-monospace, monospace",
          whiteSpace: "pre-wrap", maxHeight: 200, overflowY: "auto",
        }}>{message}</div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button onClick={onClose} style={{
            padding: "10px 16px", minHeight: 42, border: `1px solid ${T.borderSoft}`,
            borderRadius: 8, background: T.surface2, color: T.text,
            fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>Cancelar</button>
          <button onClick={handleCopy} style={{
            padding: "10px 16px", minHeight: 42, border: "none",
            borderRadius: 8, background: T.primary, color: "#FFFFFF",
            fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>📋 Copiar mensaje</button>
          <button onClick={handleWhatsApp} style={{
            padding: "10px 16px", minHeight: 42, border: "none",
            borderRadius: 8, background: "#25D366", color: "#FFFFFF",
            fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>📲 Abrir WhatsApp</button>
        </div>
      </div>
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


// =========================================================================
// ACCIÓN DEL DÍA — card prominente arriba con la próxima jugada
// =========================================================================
function ActionOfDayCard({ action, onNavigate, isMobile }) {
  const handleClick = () => {
    if (onNavigate && action.action?.page) onNavigate(action.action.page);
  };
  return (
    <button
      onClick={handleClick}
      disabled={!action.action?.page || !onNavigate}
      style={{
        width: "100%", marginBottom: 14,
        background: "linear-gradient(135deg, #1E2B4A 0%, #2D3D63 100%)",
        color: "#F8F2E7", border: "none",
        borderRadius: 14, padding: isMobile ? 14 : 16,
        cursor: action.action?.page && onNavigate ? "pointer" : "default",
        fontFamily: "inherit", textAlign: "left",
        boxShadow: "0 4px 12px rgba(30,43,74,0.18)",
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
      }}
    >
      <div style={{
        fontSize: 32, lineHeight: 1, flexShrink: 0,
        background: "rgba(248,242,231,0.10)", padding: "10px 12px", borderRadius: 12,
      }}>{action.icon}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, opacity: 0.75,
          textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2,
        }}>🎯 Hoy te conviene</div>
        <div style={{ fontSize: isMobile ? 15 : 17, fontWeight: 800, lineHeight: 1.25 }}>{action.title}</div>
        {action.subtitle && (
          <div style={{ fontSize: 12, opacity: 0.82, marginTop: 4, lineHeight: 1.4 }}>{action.subtitle}</div>
        )}
      </div>
      {action.action?.label && (
        <div style={{
          padding: "10px 16px", flexShrink: 0,
          background: "#F8F2E7", color: "#1E2B4A",
          borderRadius: 8, fontSize: 13, fontWeight: 800,
          whiteSpace: "nowrap",
        }}>{action.action.label} →</div>
      )}
    </button>
  );
}

// =========================================================================
// META DEL MES — barra de progreso vs objetivo configurado
// =========================================================================
function MonthGoalCard({ goal, isMobile }) {
  const pct = Math.min(100, goal.pct);
  const onTrack = goal.onTrack;
  const barColor = onTrack ? T.green : T.amber;
  const statusText = onTrack
    ? `🟢 Vas bien — ${Math.round(goal.pct)}% de la meta`
    : `🟡 Atrasado vs ritmo esperado (${Math.round(goal.pct)}%)`;

  return (
    <div style={{
      background: T.card, border: `1px solid ${T.borderSoft}`,
      borderRadius: 14, padding: isMobile ? 14 : 16, marginBottom: 14,
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        gap: 8, marginBottom: 10, flexWrap: "wrap",
      }}>
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, color: T.textMuted,
            textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2,
          }}>🎯 Meta del mes</div>
          <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 800, color: T.text }}>
            {formatMoney(goal.revenueARS)} <span style={{ color: T.textMuted, fontSize: 14, fontWeight: 600 }}>de {formatMoney(goal.goalARS)}</span>
          </div>
        </div>
        <div style={{
          padding: "5px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
          background: onTrack ? T.greenBg : T.amberBg,
          color: onTrack ? T.green : T.amber,
          border: `1px solid ${onTrack ? T.greenBorder : T.amberBorder}`,
        }}>{statusText}</div>
      </div>
      {/* Barra */}
      <div style={{
        position: "relative", height: 10, background: T.surface2,
        borderRadius: 5, overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: `${pct}%`, background: barColor,
          transition: "width 0.3s ease",
        }} />
        {/* Marca del "esperado a esta altura" */}
        {goal.expectedByNowARS > 0 && goal.goalARS > 0 && (
          <div style={{
            position: "absolute", top: -2, bottom: -2,
            left: `${Math.min(100, (goal.expectedByNowARS / goal.goalARS) * 100)}%`,
            width: 2, background: T.text, opacity: 0.4,
          }} title="Esperado a esta altura del mes" />
        )}
      </div>
      <div style={{
        display: "flex", justifyContent: "space-between", marginTop: 8,
        fontSize: 11, color: T.textMuted, flexWrap: "wrap", gap: 4,
      }}>
        <span>Promedio diario: <strong style={{ color: T.text }}>{formatMoney(goal.dailyAvg)}</strong></span>
        {goal.daysRemaining > 0 && goal.dailyNeeded > goal.dailyAvg && (
          <span>Para llegar: <strong style={{ color: T.text }}>{formatMoney(goal.dailyNeeded)}/día</strong> · {goal.daysRemaining}d restantes</span>
        )}
        {goal.daysRemaining > 0 && goal.dailyNeeded <= goal.dailyAvg && (
          <span>Mantené el ritmo · {goal.daysRemaining}d restantes</span>
        )}
      </div>
    </div>
  );
}

// =========================================================================
// SECCIÓN DE ALERTAS — 3 buckets (urgent / week / opportunity) con CTA
// =========================================================================
const BUCKET_META = {
  urgent: { label: "Urgente", emoji: "🔴", borderColor: "#FBE4E4", bg: "#FFF8F8", titleColor: "#B83232" },
  week: { label: "Esta semana", emoji: "🟡", borderColor: "#FDECC8", bg: "#FFFCF5", titleColor: "#CB912F" },
  opportunity: { label: "Oportunidad", emoji: "🔵", borderColor: "#DAE8F5", bg: "#F7FAFC", titleColor: "#2383E2" },
};

function AlertsSection({ groups, onNavigate, isMobile }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
      {["urgent", "week", "opportunity"].map(bucket => {
        const items = groups[bucket];
        if (!items || items.length === 0) return null;
        const meta = BUCKET_META[bucket];
        return (
          <div key={bucket} style={{
            background: meta.bg, border: `1px solid ${meta.borderColor}`,
            borderRadius: 12, overflow: "hidden",
          }}>
            <div style={{
              padding: "8px 14px", display: "flex", alignItems: "center", gap: 8,
              borderBottom: `1px solid ${meta.borderColor}`, background: "rgba(255,255,255,0.5)",
            }}>
              <span>{meta.emoji}</span>
              <span style={{
                fontSize: 11, fontWeight: 800, color: meta.titleColor,
                textTransform: "uppercase", letterSpacing: 0.5,
              }}>{meta.label}</span>
              <span style={{
                fontSize: 11, color: T.textMuted, marginLeft: "auto",
              }}>{items.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {items.map((a, i) => (
                <AlertRow key={`${bucket}-${i}`} alert={a} onNavigate={onNavigate} isMobile={isMobile} isLast={i === items.length - 1} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AlertRow({ alert, onNavigate, isMobile, isLast }) {
  const handleClick = () => {
    if (onNavigate && alert.action?.page) onNavigate(alert.action.page);
  };
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 14px",
      borderTop: isLast ? "none" : "1px solid rgba(0,0,0,0.04)",
      flexWrap: "wrap",
    }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{alert.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.3 }}>
          {alert.title}
        </div>
        {alert.detail && (
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2, lineHeight: 1.3 }}>
            {alert.detail}
          </div>
        )}
      </div>
      {alert.action?.label && onNavigate && (
        <button onClick={handleClick} style={{
          flexShrink: 0, padding: "6px 12px", minHeight: isMobile ? 36 : 32,
          background: T.text, color: T.card, border: "none",
          borderRadius: 8, fontSize: 12, fontWeight: 700,
          cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
        }}>{alert.action.label}</button>
      )}
    </div>
  );
}
