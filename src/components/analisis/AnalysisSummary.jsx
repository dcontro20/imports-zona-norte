import { useMemo } from "react";
import { formatMoney, monthKey } from "../../helpers.js";
import { useResponsive } from "../../App.jsx";
import { Card } from "../UI.jsx";
import { buildProductSalesStats } from "../../productIntelligence.js";
import {
  financeKPIs,
  buildPnL,
  valuateInventory,
  projectCashFlow,
} from "../../finance.js";

// Tab "📊 Resumen" del hub Análisis — panorama ejecutivo en un vistazo.
// Junta lo más importante de las 4 áreas (resultados, inventario, flujo de caja)
// con comparativo vs el mes anterior. Para el detalle, los otros tabs.
export function AnalysisSummary({
  sales = [], purchases = [], expenses = [], withdrawals = [],
  products = [], exchangeRate = 1, onGoToTab,
}) {
  const { isMobile } = useResponsive();

  const thisMonth = monthKey(new Date());
  const prevMonth = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return monthKey(d);
  }, []);

  const kpis = useMemo(
    () => financeKPIs({ sales, expenses, withdrawals, products, purchases, exchangeRate, month: thisMonth }),
    [sales, expenses, withdrawals, products, purchases, exchangeRate, thisMonth]
  );
  const prevPnl = useMemo(
    () => buildPnL({ sales, expenses, withdrawals, products, exchangeRate, month: prevMonth }),
    [sales, expenses, withdrawals, products, exchangeRate, prevMonth]
  );
  const inventory = useMemo(() => valuateInventory(products, exchangeRate), [products, exchangeRate]);

  // Flujo de caja proyectado 30d
  const stats = useMemo(() => buildProductSalesStats(products, sales, exchangeRate), [products, sales, exchangeRate]);
  const avgMonthlyExpenses = useMemo(() => {
    const byMonth = {};
    expenses.filter(e => !e.isDeleted).forEach(e => {
      const m = (e.date || "").slice(0, 7);
      byMonth[m] = (byMonth[m] || 0) + (Number(e.amountARS) || 0);
    });
    const recent = Object.entries(byMonth).sort().reverse().slice(0, 3).map(([, v]) => v);
    return recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : 0;
  }, [expenses]);
  const cashFlow = useMemo(
    () => projectCashFlow({ statsMap: stats, products, purchases, exchangeRate, horizonDays: 30, monthlyFixedExpensesARS: avgMonthlyExpenses }),
    [stats, products, purchases, exchangeRate, avgMonthlyExpenses]
  );

  // Comparativo % vs mes anterior
  const delta = (cur, prev) => {
    if (!prev || prev === 0) return null;
    return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
  };
  const revDelta = delta(kpis.revenue, prevPnl.revenue);
  const profitDelta = delta(kpis.netProfit, prevPnl.netProfit);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Hero KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? "150px" : "200px"}, 1fr))`, gap: 12 }}>
        <HeroKPI label="Ingresos del mes" value={formatMoney(kpis.revenue)} delta={revDelta} color="#1E2B4A" />
        <HeroKPI label="Margen bruto" value={`${kpis.grossMarginPct}%`} sub={formatMoney(kpis.grossProfit)} color="#0F6B5C" />
        <HeroKPI label="Ganancia neta" value={formatMoney(kpis.netProfit)} delta={profitDelta} color={kpis.netProfit >= 0 ? "#0F6B5C" : "#B83232"} />
        <HeroKPI label="ROI del mes" value={`${kpis.roiPct}%`} sub="sobre capital en stock" color="#5B3592" />
      </div>

      {/* Resultados resumidos + inventario */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        <Card>
          <SecTitle onClick={() => onGoToTab?.("results")}>📈 Resultados del mes →</SecTitle>
          <Row label="Ingresos" value={formatMoney(kpis.revenue)} />
          <Row label="(−) Costo de lo vendido" value={formatMoney(-kpis.cogs)} color="#B83232" />
          <Row label="= Margen bruto" value={formatMoney(kpis.grossProfit)} bold pct={kpis.grossMarginPct} divider />
          <Row label="(−) Gastos + mermas" value={formatMoney(-(kpis.revenue - kpis.cogs - kpis.netProfit))} color="#B83232" />
          <Row label="= Ganancia neta" value={formatMoney(kpis.netProfit)} bold big pct={kpis.netMarginPct} color={kpis.netProfit >= 0 ? "#0F6B5C" : "#B83232"} divider />
          <div style={{ fontSize: 11, color: "#6B7794", marginTop: 8 }}>
            Ticket promedio: <strong>{formatMoney(kpis.avgTicket)}</strong> · {kpis.salesCount} ventas
          </div>
        </Card>

        <Card>
          <SecTitle onClick={() => onGoToTab?.("results")}>📦 Inventario →</SecTitle>
          <Row label="Valor a costo" value={formatMoney(inventory.atCostARS)} />
          <Row label="Valor a venta" value={formatMoney(inventory.atSaleARS)} bold />
          <Row label="Ganancia latente" value={formatMoney(inventory.potentialProfitARS)} color="#0F6B5C" pct={inventory.potentialMarginPct} divider />
          <Row label="Unidades en stock" value={`${inventory.units}u`} muted />
          <Row label="Rotación" value={`${kpis.turnover}×`} muted />
          {inventory.costCoverage < 100 && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#B07A1F" }}>
              ⚠️ {inventory.costCoverage}% de los productos con costo cargado
            </div>
          )}
        </Card>
      </div>

      {/* Flujo de caja proyectado */}
      <Card>
        <SecTitle onClick={() => onGoToTab?.("results")}>💸 Flujo de caja proyectado (30d) →</SecTitle>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <MiniFlow label="↗ Entran (ventas)" value={cashFlow.projectedRevenueARS} color="#0F6B5C" />
            <MiniFlow label="↘ Salen (pedidos + gastos)" value={cashFlow.outflows} color="#B83232" />
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "#6B7794", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Neto proyectado</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: cashFlow.net >= 0 ? "#0F6B5C" : "#B83232" }}>
              {cashFlow.net >= 0 ? "+" : ""}{formatMoney(cashFlow.net)}
            </div>
          </div>
        </div>
        {cashFlow.net < 0 && (
          <div style={{ marginTop: 10, padding: "8px 12px", background: "#F7DEDE", border: "1px solid #E5A8A8", borderRadius: 8, fontSize: 12, color: "#B83232" }}>
            ⚠️ Las salidas comprometidas superan las ventas proyectadas en {formatMoney(Math.abs(cashFlow.net))}.
          </div>
        )}
      </Card>

      {/* Accesos a tabs */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? "140px" : "160px"}, 1fr))`, gap: 10 }}>
        <NavTile icon="📈" label="Resultados" desc="P&L, COGS, inventario" onClick={() => onGoToTab?.("results")} />
        <NavTile icon="🛒" label="Reportes" desc="Ventas, ABC, break-even" onClick={() => onGoToTab?.("reports")} />
        <NavTile icon="💼" label="Patrimonio" desc="Capital, ROI, retiros" onClick={() => onGoToTab?.("patrimony")} />
        <NavTile icon="📅" label="Cierres" desc="Foto mensual" onClick={() => onGoToTab?.("closures")} />
      </div>
    </div>
  );
}

function HeroKPI({ label, value, sub, delta, color }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: "#6B7794", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1, letterSpacing: "-0.4px" }}>{value}</div>
      {delta != null && (
        <div style={{ fontSize: 11, fontWeight: 700, marginTop: 5, color: delta >= 0 ? "#0F6B5C" : "#B83232" }}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% vs mes anterior
        </div>
      )}
      {sub && delta == null && <div style={{ fontSize: 11, color: "#6B7794", marginTop: 5 }}>{sub}</div>}
    </Card>
  );
}

function SecTitle({ children, onClick }) {
  return (
    <div onClick={onClick} style={{
      fontSize: 13, fontWeight: 800, color: "#1E2B4A", marginBottom: 12,
      cursor: onClick ? "pointer" : "default", letterSpacing: "-0.1px",
    }}>{children}</div>
  );
}

function Row({ label, value, bold, big, pct, color, muted, divider }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: big ? "8px 0" : "4px 0",
      borderTop: divider ? "1px solid #EFE5CE" : "none", marginTop: divider ? 4 : 0,
    }}>
      <span style={{ fontSize: big ? 14 : 12, fontWeight: bold ? 700 : 500, color: muted ? "#9AA2B3" : bold ? "#1E2B4A" : "#3A4868" }}>{label}</span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        {pct != null && <span style={{ fontSize: 10, color: "#9AA2B3", fontWeight: 600 }}>{pct}%</span>}
        <span style={{ fontSize: big ? 18 : 13, fontWeight: bold ? 800 : 600, color: color || (muted ? "#9AA2B3" : "#1E2B4A") }}>{value}</span>
      </span>
    </div>
  );
}

function MiniFlow({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#6B7794", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color }}>{formatMoney(value)}</div>
    </div>
  );
}

function NavTile({ icon, label, desc, onClick }) {
  return (
    <div onClick={onClick} style={{
      padding: "14px 12px", background: "#FFFFFF", border: "1px solid #E5DAC2",
      borderRadius: 12, cursor: "pointer", transition: "box-shadow 0.15s",
      textAlign: "center",
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 12px rgba(30,43,74,0.08)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
    >
      <div style={{ fontSize: 24, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#1E2B4A" }}>{label}</div>
      <div style={{ fontSize: 10, color: "#6B7794", marginTop: 2 }}>{desc}</div>
    </div>
  );
}
