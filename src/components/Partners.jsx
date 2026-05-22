import { useState, useMemo } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import {
  calcPartnerBalances, calcMonthSummary, calcAccountBalance,
} from "../calcs.js";
import {
  ACCOUNTS, INITIAL_BALANCES, ACCOUNT_METHOD_MAP,
  payMethodToAccountId, normalizeType,
} from "./cash/shared.js";
import { Modal, Card, Btn, Input, Select, Table, Badge } from "./UI.jsx";
import { T } from "../theme.js";
import { useResponsive } from "../App.jsx";

// ============================================================================
// Mi Cartera — perfil financiero de Diego (único dueño 100%)
//
// Reemplaza el módulo "Socios" del split 50/50. Diseñado como dashboard
// personal: patrimonio, composición, rendimiento, ROI, retiros, evolución.
// ============================================================================

const PERIODS = [
  { key: "ytd", label: "Año actual" },
  { key: "12m", label: "Últimos 12 meses" },
  { key: "all", label: "Todo el tiempo" },
];

// Pequeño helper visual para filas de breakdown
const Row = ({ label, value, color = T.text, bold, sub }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, alignItems: "baseline" }}>
    <span style={{ color: T.textSub, fontWeight: bold ? 700 : 500 }}>{label}</span>
    <span style={{ color, fontWeight: bold ? 800 : 600, fontVariantNumeric: "tabular-nums" }}>
      {value}
      {sub && <span style={{ color: T.textMuted, fontSize: 11, fontWeight: 500, marginLeft: 6 }}>{sub}</span>}
    </span>
  </div>
);

// Donut SVG simple para composición de patrimonio
const Donut = ({ segments, size = 120 }) => {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  let offset = 0;
  const radius = size / 2 - 8;
  const c = 2 * Math.PI * radius;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#F0EFEB" strokeWidth="14" />
      {segments.map((seg, i) => {
        const len = (Math.max(0, seg.value) / total) * c;
        const el = (
          <circle key={i}
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={seg.color} strokeWidth="14"
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
        offset += len;
        return el;
      })}
    </svg>
  );
};

export const Partners = ({
  partnerWithdrawals = [], setPartnerWithdrawals,
  sales = [], purchases = [], expenses = [], withdrawals = [],
  products = [], cashMovements = [], clients = [],
  exchangeRate, currentUser, logAudit,
}) => {
  const { isMobile } = useResponsive();
  const [modal, setModal] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [period, setPeriod] = useState("ytd");
  const [form, setForm] = useState({
    person: "Diego",
    amount: "", currency: "ARS", source: "",
    description: "",
    date: new Date().toISOString().slice(0, 10),
    tipoMovimiento: "retiro",
  });

  const SOURCES = ACCOUNTS.map(a => a.label);
  const rate = exchangeRate || 1;

  // ---------- Filtros por período ----------
  const now = new Date();
  const yearStart = `${now.getFullYear()}-01-01`;
  const cutoff12m = (() => {
    const d = new Date(now); d.setMonth(d.getMonth() - 12);
    return d.toISOString().slice(0, 10);
  })();
  const inPeriod = (dateStr) => {
    if (!dateStr) return false;
    const d = (dateStr || "").slice(0, 10);
    if (period === "all") return true;
    if (period === "ytd") return d >= yearStart;
    if (period === "12m") return d >= cutoff12m;
    return true;
  };

  // ---------- Patrimonio total (saldos por cuenta) ----------
  const balanceCtx = {
    sales, purchases, cashMovements,
    initialBalances: INITIAL_BALANCES,
    accountMethodMap: ACCOUNT_METHOD_MAP,
    payMethodToAccountId,
    normalizeType,
  };
  const accountBalances = useMemo(() => {
    return ACCOUNTS.map(a => ({
      ...a,
      balance: calcAccountBalance(a.id, balanceCtx),
    }));
  }, [sales, purchases, cashMovements]);

  const balanceById = Object.fromEntries(accountBalances.map(a => [a.id, a.balance]));

  // Patrimonio en pesos ARS-equivalente
  const cashARS = (balanceById.mpDiego || 0) + (balanceById.lemonPesos || 0) + (balanceById.pesosCash || 0);
  const usdtBal = balanceById.lemonUSDT || 0;
  const usdBal = balanceById.usdCash || 0;
  const cryptoARS = usdtBal * rate;
  const usdCashARS = usdBal * rate;

  // Stock valorizado a costo (lo que pagaste por él) y a precio venta
  const stockAtCost = products.reduce((s, p) => s + (p.stock || 0) * Number(p.costUSDT || 0), 0);
  const stockAtPrice = products.reduce((s, p) => s + (p.stock || 0) * Number(p.priceUSD || 0), 0);
  const stockAtCostARS = stockAtCost * rate;
  const stockAtPriceARS = stockAtPrice * rate;

  const totalAssetsARS = cashARS + cryptoARS + usdCashARS + stockAtCostARS;

  // Composición (donut)
  const composition = [
    { label: "Cash ARS",   value: cashARS,        color: T.primary,   pct: cashARS / totalAssetsARS },
    { label: "USDT/Crypto", value: cryptoARS,      color: T.amber,     pct: cryptoARS / totalAssetsARS },
    { label: "USD cash",   value: usdCashARS,     color: T.green,     pct: usdCashARS / totalAssetsARS },
    { label: "Stock",      value: stockAtCostARS, color: T.purple,    pct: stockAtCostARS / totalAssetsARS },
  ].map(s => ({ ...s, pct: totalAssetsARS > 0 ? (s.value / totalAssetsARS) * 100 : 0 }));

  // ---------- Período: revenue, costs, expenses, ganancia ----------
  const periodSales = sales.filter(s => inPeriod(s.date));
  const periodPurchases = purchases.filter(p => inPeriod(p.date));
  const periodExpenses = expenses.filter(e => inPeriod(e.date));
  const periodWithdrawals = withdrawals.filter(w => inPeriod(w.date));
  const periodPW = (partnerWithdrawals || [])
    .filter(w => !w.isDeleted && !w._historicalArchived && w.person === "Diego" && inPeriod(w.date));

  const balances = calcPartnerBalances(
    periodSales, periodPurchases, periodExpenses,
    periodWithdrawals, partnerWithdrawals, rate
  );
  const {
    revenue, costs, expensesTotal, mermasComunes, netProfitComun,
    consumoDiego, diegoTotal, netProfit, profitRemaining, diegoBalance,
  } = balances;

  // Capital invertido en el período: costos de compras del período + stock actual a costo.
  // (El stock actual ya es capital que está "atado" en mercadería.)
  const capitalInPurchases = periodPurchases.reduce((s, p) => {
    if (p.totalCostARS) return s + Number(p.totalCostARS);
    return s + (Number(p.totalUSDT || 0) * rate) + Number(p.paseroCostARS || 0) + Number(p.envioCostARS || 0);
  }, 0);
  const capitalInvested = capitalInPurchases + stockAtCostARS;
  const roiPct = capitalInvested > 0 ? (netProfit / capitalInvested) * 100 : 0;

  // ---------- Rendimiento mensual (últimos 12 meses) ----------
  const last12Months = useMemo(() => {
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const summary = calcMonthSummary(key, {
        sales, purchases, expenses, withdrawals, products, exchangeRate: rate,
      });
      months.push({
        key,
        label: d.toLocaleDateString("es-AR", { month: "short" }),
        year: d.getFullYear(),
        revenue: summary.totalRevenue,
        profit: summary.netProfitOperativo,
      });
    }
    return months;
  }, [sales, purchases, expenses, withdrawals, products, rate]);

  const maxRev = Math.max(...last12Months.map(m => m.revenue), 1);
  const maxProfit = Math.max(...last12Months.map(m => Math.abs(m.profit)), 1);

  // Patrimonio acumulado (aproximación): suma netProfitOperativo acumulado
  const cumulativeSeries = last12Months.reduce((acc, m, i) => {
    const prev = i > 0 ? acc[i - 1].cumValue : 0;
    acc.push({ ...m, cumValue: prev + m.profit });
    return acc;
  }, []);
  const maxCum = Math.max(...cumulativeSeries.map(m => m.cumValue), 1);
  const minCum = Math.min(...cumulativeSeries.map(m => m.cumValue), 0);

  // ---------- Retiros / Aportes del período ----------
  const retiradoARS = periodPW
    .filter(w => !(w.amount < 0 || w.tipoMovimiento === "aporte"))
    .reduce((s, w) => {
      const amt = Math.abs(w.amount);
      return s + ((w.currency === "USD" || w.currency === "USDT") ? amt * rate : amt);
    }, 0);
  const aportadoARS = periodPW
    .filter(w => w.amount < 0 || w.tipoMovimiento === "aporte")
    .reduce((s, w) => {
      const amt = Math.abs(w.amount);
      return s + ((w.currency === "USD" || w.currency === "USDT") ? amt * rate : amt);
    }, 0);
  const netoRetirado = retiradoARS - aportadoARS;

  // Sugerencia de retiro: 70% del balance disponible (deja 30% como capital trabajando)
  const safeWithdraw = Math.max(0, Math.floor(diegoBalance * 0.7));

  // ---------- Deudas/créditos clientes (info extra de cartera) ----------
  const clientsWithDebt = clients.filter(c => Number(c.balance || 0) < 0);
  const clientsWithCredit = clients.filter(c => Number(c.balance || 0) > 0);
  const totalDebtFromClients = clientsWithDebt.reduce((s, c) => s + Math.abs(c.balance || 0), 0);
  const totalCreditToClients = clientsWithCredit.reduce((s, c) => s + (c.balance || 0), 0);

  // ============================================
  // ACTIONS
  // ============================================
  const save = () => {
    if (!form.amount || !form.person) return;
    const newId = uid();
    const sign = form.tipoMovimiento === "aporte" ? -1 : 1;
    setPartnerWithdrawals(prev => [{
      ...form,
      id: newId,
      amount: Number(form.amount) * sign,
      createdBy: currentUser?.name || "Diego",
    }, ...prev]);
    if (logAudit) logAudit("create", "partnerWithdrawal", newId, `${form.tipoMovimiento === "aporte" ? "Aporte de capital" : "Retiro"}: $${form.amount}`);
    setModal(false);
    setForm({
      person: "Diego", amount: "", currency: "ARS", source: "",
      description: "", date: new Date().toISOString().slice(0, 10), tipoMovimiento: "retiro",
    });
  };

  const deleteW = (id) => {
    if (confirmDel !== id) { setConfirmDel(id); setTimeout(() => setConfirmDel(null), 3000); return; }
    const w = (partnerWithdrawals || []).find(x => x.id === id);
    setPartnerWithdrawals(prev => prev.map(x => x.id === id ? {
      ...x, isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: currentUser?.name || "?",
    } : x));
    if (logAudit && w) logAudit("delete", "partnerWithdrawal", id, `Eliminó retiro: $${w.amount}`);
    setConfirmDel(null);
  };

  const exportYearCsv = () => {
    const year = new Date().getFullYear();
    const rows = (partnerWithdrawals || [])
      .filter(w => !w.isDeleted && w.person === "Diego" && new Date(w.date).getFullYear() === year)
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const header = "fecha,tipo,monto,moneda,source,descripcion";
    const escape = s => `"${String(s || "").replace(/"/g, '""')}"`;
    const csv = [header, ...rows.map(r => [
      r.date,
      r.amount < 0 ? "aporte" : (r.tipoMovimiento || "retiro"),
      Math.abs(r.amount),
      r.currency || "ARS",
      escape(r.source),
      escape(r.description),
    ].join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `IZN_MiCartera_${year}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: T.text, margin: 0, fontSize: 24, fontFamily: T.fontDisplay, letterSpacing: "-0.02em" }}>
            💼 Mi Cartera
          </h2>
          <div style={{ color: T.textSub, fontSize: 13, marginTop: 4 }}>
            Diego — 100% dueño de Imports Zona Norte
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", background: T.surface2, borderRadius: 8, padding: 3, border: `1px solid ${T.border}` }}>
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)} style={{
                padding: "5px 10px", fontSize: 12, fontWeight: 600, border: "none", borderRadius: 6,
                background: period === p.key ? "#FFFFFF" : "transparent",
                color: period === p.key ? T.text : T.textSub,
                boxShadow: period === p.key ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                cursor: "pointer", fontFamily: "inherit",
              }}>{p.label}</button>
            ))}
          </div>
          <Btn onClick={() => setModal(true)}>+ Movimiento</Btn>
        </div>
      </div>

      {/* PATRIMONIO TOTAL — Hero card */}
      <Card style={{
        marginBottom: 14,
        background: `linear-gradient(135deg, ${T.primary}10 0%, #FFFFFF 100%)`,
        border: `1px solid ${T.primary}33`,
      }}>
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 20, alignItems: isMobile ? "stretch" : "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.primary, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
              Patrimonio total
            </div>
            <div style={{ fontSize: isMobile ? 32 : 40, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay, letterSpacing: "-0.03em", lineHeight: 1 }}>
              {formatMoney(Math.round(totalAssetsARS))}
            </div>
            <div style={{ fontSize: 12, color: T.textSub, marginTop: 6 }}>
              Stock a precio venta: <strong style={{ color: T.text }}>{formatMoney(Math.round(stockAtPriceARS))}</strong>
              {" · "}
              <span style={{ color: T.green, fontWeight: 600 }}>
                +{formatMoney(Math.round(stockAtPriceARS - stockAtCostARS))} potencial
              </span>
            </div>
          </div>
          <Donut segments={composition} size={isMobile ? 110 : 130} />
        </div>

        {/* Composición leyenda */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 8, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.borderSoft}` }}>
          {composition.map((seg, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}>{seg.label}</div>
                <div style={{ fontSize: 13, color: T.text, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {formatMoney(Math.round(seg.value))} <span style={{ color: T.textMuted, fontWeight: 500, fontSize: 11 }}>{seg.pct.toFixed(0)}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* SALDOS POR CUENTA */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>
          Saldos por cuenta
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          {accountBalances.map(a => (
            <div key={a.id} style={{
              padding: "12px 14px", borderRadius: 10,
              background: T.surface2, border: `1px solid ${T.borderSoft}`,
              borderLeft: `3px solid ${a.accent}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 14 }}>{a.icon}</span>
                <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}>{a.label}</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay, fontVariantNumeric: "tabular-nums" }}>
                {formatMoney(Math.round(a.balance), a.currency)}
              </div>
              {a.currency !== "ARS" && rate > 0 && (
                <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>
                  ≈ {formatMoney(Math.round(a.balance * rate))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* ROI + RENDIMIENTO DEL PERÍODO */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 14 }}>
        {/* ROI card */}
        <Card>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
            ROI del período
          </div>
          <div style={{ fontSize: isMobile ? 34 : 42, fontWeight: 800, color: roiPct >= 0 ? T.green : T.red, fontFamily: T.fontDisplay, letterSpacing: "-0.02em", lineHeight: 1 }}>
            {roiPct >= 0 ? "+" : ""}{roiPct.toFixed(1)}%
          </div>
          <div style={{ marginTop: 14 }}>
            <Row label="Capital invertido" value={formatMoney(Math.round(capitalInvested))} sub="compras + stock actual" />
            <Row label="Revenue del período" value={formatMoney(Math.round(revenue))} color={T.green} />
            <Row label="Ganancia neta" value={formatMoney(Math.round(netProfit))} color={netProfit >= 0 ? T.green : T.red} bold />
          </div>
        </Card>

        {/* Desglose ganancia */}
        <Card>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
            Cómo se compone la ganancia
          </div>
          <Row label="+ Revenue" value={formatMoney(Math.round(revenue))} color={T.green} />
          <Row label="− Costos importación" value={`−${formatMoney(Math.round(costs))}`} color={T.red} />
          <Row label="− Gastos operativos" value={`−${formatMoney(Math.round(expensesTotal))}`} color={T.red} />
          <Row label="− Mermas comunes" value={`−${formatMoney(Math.round(mermasComunes))}`} color={T.amber} />
          <Row label="− Mi consumo personal" value={`−${formatMoney(Math.round(consumoDiego))}`} color={T.amber} />
          <div style={{ borderTop: `1px solid ${T.borderSoft}`, marginTop: 6, paddingTop: 6 }}>
            <Row label="Ganancia neta" value={formatMoney(Math.round(netProfit))} color={netProfit >= 0 ? T.green : T.red} bold />
          </div>
        </Card>
      </div>

      {/* RENDIMIENTO MENSUAL (chart 12 meses) */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>
            Rendimiento mensual · últimos 12 meses
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, display: "flex", gap: 12 }}>
            <span><span style={{ display: "inline-block", width: 10, height: 10, background: T.primary, borderRadius: 2, marginRight: 4, verticalAlign: "middle" }}/>Revenue</span>
            <span><span style={{ display: "inline-block", width: 10, height: 10, background: T.green, borderRadius: 2, marginRight: 4, verticalAlign: "middle" }}/>Ganancia</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: isMobile ? 4 : 8, height: 140, paddingBottom: 4 }}>
          {last12Months.map((m, i) => {
            const revH = (m.revenue / maxRev) * 110;
            const profH = (Math.abs(m.profit) / maxProfit) * 110;
            const profColor = m.profit >= 0 ? T.green : T.red;
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
                <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 2, width: "100%", justifyContent: "center" }}>
                  <div title={`Revenue: ${formatMoney(Math.round(m.revenue))}`} style={{
                    width: "45%", height: `${revH}px`, minHeight: m.revenue > 0 ? 2 : 0,
                    background: T.primary, borderRadius: "4px 4px 0 0", opacity: 0.85,
                  }} />
                  <div title={`Ganancia: ${formatMoney(Math.round(m.profit))}`} style={{
                    width: "45%", height: `${profH}px`, minHeight: m.profit !== 0 ? 2 : 0,
                    background: profColor, borderRadius: "4px 4px 0 0", opacity: 0.85,
                  }} />
                </div>
                <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4, textTransform: "capitalize" }}>{m.label}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* EVOLUCIÓN PATRIMONIO ACUMULADO (línea) */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 14 }}>
          Evolución del patrimonio · ganancia operativa acumulada 12m
        </div>
        {(() => {
          const w = 100, h = 100;
          const range = maxCum - minCum || 1;
          const pts = cumulativeSeries.map((m, i) => {
            const x = (i / (cumulativeSeries.length - 1 || 1)) * w;
            const y = h - ((m.cumValue - minCum) / range) * h;
            return { x, y, value: m.cumValue, label: m.label };
          });
          const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
          const areaPath = `${path} L${w},${h} L0,${h} Z`;
          const last = pts[pts.length - 1];
          return (
            <div style={{ position: "relative" }}>
              <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 140, display: "block" }}>
                <defs>
                  <linearGradient id="evogradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={T.primary} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={T.primary} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={areaPath} fill="url(#evogradient)" />
                <path d={path} fill="none" stroke={T.primary} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
                {pts.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="1.2" fill={T.primary} />
                ))}
              </svg>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.textMuted, marginTop: 4 }}>
                <span>{cumulativeSeries[0]?.label} '{(cumulativeSeries[0]?.year || "").toString().slice(-2)}</span>
                <span style={{ fontWeight: 700, color: last?.value >= 0 ? T.green : T.red }}>
                  Hoy: {formatMoney(Math.round(last?.value || 0))}
                </span>
              </div>
            </div>
          );
        })()}
      </Card>

      {/* LO QUE ME LLEVÉ VS LO QUE QUEDA */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Card style={{ background: `${T.amber}10`, border: `1px solid ${T.amber}33` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.amber, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
            Lo que me llevé
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay, letterSpacing: "-0.02em" }}>
            {formatMoney(Math.round(netoRetirado))}
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
            Retirado: {formatMoney(Math.round(retiradoARS))}
            {aportadoARS > 0 && <> · Aportado: {formatMoney(Math.round(aportadoARS))}</>}
          </div>
        </Card>

        <Card style={{ background: `${T.green}10`, border: `1px solid ${T.green}33` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.green, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
            Lo que sigue trabajando
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay, letterSpacing: "-0.02em" }}>
            {formatMoney(Math.round(profitRemaining))}
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
            Capital en la empresa
          </div>
        </Card>

        <Card style={{ background: `${T.primary}10`, border: `1px solid ${T.primary}33` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.primary, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
            Podés retirar
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: safeWithdraw > 0 ? T.green : T.textMuted, fontFamily: T.fontDisplay, letterSpacing: "-0.02em" }}>
            {formatMoney(safeWithdraw)}
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
            Deja 30% como capital de trabajo · saldo {formatMoney(Math.round(diegoBalance))}
          </div>
          {safeWithdraw > 0 && (
            <button onClick={() => {
              setForm(f => ({ ...f, amount: safeWithdraw, source: "MP Diego", description: "Retiro sugerido", tipoMovimiento: "retiro" }));
              setModal(true);
            }} style={{
              marginTop: 10, width: "100%", padding: "8px 12px", minHeight: 36,
              background: T.primary, border: "none", borderRadius: 8,
              color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit",
            }}>💸 Retirar {formatMoney(safeWithdraw)}</button>
          )}
        </Card>
      </div>

      {/* DEUDAS / CRÉDITOS CON CLIENTES */}
      {(clientsWithDebt.length > 0 || clientsWithCredit.length > 0) && (
        <Card style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
            Saldos con clientes
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            {clientsWithDebt.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: T.green, fontWeight: 700, marginBottom: 4 }}>📥 Me deben</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay }}>
                  {formatMoney(Math.round(totalDebtFromClients))}
                </div>
                <div style={{ fontSize: 11, color: T.textMuted }}>
                  {clientsWithDebt.length} cliente{clientsWithDebt.length === 1 ? "" : "s"}
                </div>
              </div>
            )}
            {clientsWithCredit.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: T.amber, fontWeight: 700, marginBottom: 4 }}>📤 Les debo (créditos)</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay }}>
                  {formatMoney(Math.round(totalCreditToClients))}
                </div>
                <div style={{ fontSize: 11, color: T.textMuted }}>
                  {clientsWithCredit.length} cliente{clientsWithCredit.length === 1 ? "" : "s"}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* HISTÓRICO DE MOVIMIENTOS */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>
            Histórico de retiros y aportes
          </div>
          <button onClick={exportYearCsv} style={{
            padding: "6px 10px", borderRadius: 6, border: `1px solid ${T.primary}`,
            background: `${T.primary}15`, color: T.primary, fontSize: 11, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}>📥 Exportar CSV {new Date().getFullYear()}</button>
        </div>
        <Table columns={[
          { key: "date", label: "Fecha", render: r => formatDate(r.date) },
          { key: "tipo", label: "Tipo", render: r => {
            const isAporte = r.amount < 0 || r.tipoMovimiento === "aporte";
            return <Badge color={isAporte ? T.green : T.red}>{isAporte ? "💰 Aporte" : "💸 Retiro"}</Badge>;
          }},
          { key: "amount", label: "Monto", render: r => (
            <span style={{ color: T.text, fontWeight: 700 }}>
              {formatMoney(Math.abs(r.amount), r.currency)}
            </span>
          )},
          { key: "source", label: "Cuenta", render: r => r.source || "—" },
          { key: "description", label: "Detalle", render: r => r.description || "—" },
          { key: "actions", label: "", render: r => (
            confirmDel === r.id
              ? <button onClick={() => deleteW(r.id)} style={{ background: "#F7D7D6", border: `1px solid ${T.red}55`, color: T.red, padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Confirmar</button>
              : <button onClick={() => deleteW(r.id)} style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 14 }}>🗑️</button>
          )},
        ]} data={(partnerWithdrawals || []).filter(w => !w.isDeleted && !w._historicalArchived && w.person === "Diego")} emptyMsg="No hay movimientos registrados" />
      </Card>

      {/* Modal nuevo movimiento */}
      <Modal open={modal} onClose={() => setModal(false)} title={form.tipoMovimiento === "aporte" ? "💰 Registrar Aporte" : "💸 Registrar Retiro"}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {[
            { value: "retiro", label: "💸 Retiro", color: T.red, hint: "Saco plata para mí" },
            { value: "aporte", label: "💰 Aporte", color: T.green, hint: "Inyecto capital al negocio" },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setForm(f => ({ ...f, tipoMovimiento: opt.value }))}
              style={{
                flex: 1, padding: "12px 14px", borderRadius: 8,
                border: `1px solid ${form.tipoMovimiento === opt.value ? opt.color : T.border}`,
                background: form.tipoMovimiento === opt.value ? `${opt.color}15` : "transparent",
                color: form.tipoMovimiento === opt.value ? opt.color : T.text,
                fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              }}
            >
              <span>{opt.label}</span>
              <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.7 }}>{opt.hint}</span>
            </button>
          ))}
        </div>
        <Input label="Fecha" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        <div style={{ display: "flex", gap: 12 }}>
          <Input label="Monto" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="ej: 50000" />
          <Select label="Moneda" options={["ARS", "USD", "USDT"]} value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} />
        </div>
        <Select label="Desde qué cuenta" options={SOURCES} value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} />
        <Input label="Descripción (opcional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="ej: retiro semanal, gasto personal, inyección de capital..." />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => setModal(false)}>Cancelar</Btn>
          <Btn onClick={save}>{form.tipoMovimiento === "aporte" ? "Registrar Aporte" : "Registrar Retiro"}</Btn>
        </div>
      </Modal>
    </div>
  );
};
