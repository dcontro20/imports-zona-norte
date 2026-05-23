import { useState, useMemo } from "react";
import { formatMoney, monthKey } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Card, StatCard } from "./UI.jsx";
import { buildProductSalesStats } from "../productIntelligence.js";
import {
  valuateInventory,
  buildPnL,
  projectCashFlow,
  financeKPIs,
} from "../finance.js";

// Módulo Finanzas — visión financiera devengada (COGS real, márgenes, P&L,
// valuación de inventario, flujo de caja proyectado, KPIs ejecutivos).
export const Finance = ({
  sales = [], purchases = [], expenses = [], withdrawals = [],
  products = [], exchangeRate = 1,
}) => {
  const { isMobile } = useResponsive();

  // Selector de mes (default: mes actual)
  const months = useMemo(() => {
    const set = new Set();
    sales.forEach(s => { if (!s.isDeleted && s.date) set.add(s.date.slice(0, 7)); });
    expenses.forEach(e => { if (!e.isDeleted && e.date) set.add(e.date.slice(0, 7)); });
    const arr = Array.from(set).sort().reverse();
    const current = monthKey(new Date());
    if (!arr.includes(current)) arr.unshift(current);
    return arr;
  }, [sales, expenses]);

  const [month, setMonth] = useState(months[0] || monthKey(new Date()));

  // Cálculos
  const kpis = useMemo(
    () => financeKPIs({ sales, expenses, withdrawals, products, purchases, exchangeRate, month }),
    [sales, expenses, withdrawals, products, purchases, exchangeRate, month]
  );
  const pnl = useMemo(
    () => buildPnL({ sales, expenses, withdrawals, products, exchangeRate, month }),
    [sales, expenses, withdrawals, products, exchangeRate, month]
  );
  const inventory = useMemo(() => valuateInventory(products, exchangeRate), [products, exchangeRate]);

  // Flujo de caja proyectado: necesita velocity + gastos fijos estimados (promedio últimos 3 meses)
  const stats = useMemo(() => buildProductSalesStats(products, sales, exchangeRate), [products, sales, exchangeRate]);
  const avgMonthlyExpenses = useMemo(() => {
    const byMonth = {};
    expenses.filter(e => !e.isDeleted).forEach(e => {
      const m = (e.date || "").slice(0, 7);
      byMonth[m] = (byMonth[m] || 0) + (Number(e.amountARS) || 0);
    });
    const vals = Object.values(byMonth);
    if (vals.length === 0) return 0;
    const recent = Object.entries(byMonth).sort().reverse().slice(0, 3).map(([, v]) => v);
    return Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
  }, [expenses]);

  const cashFlow = useMemo(
    () => projectCashFlow({ statsMap: stats, products, purchases, exchangeRate, horizonDays: 30, monthlyFixedExpensesARS: avgMonthlyExpenses }),
    [stats, products, purchases, exchangeRate, avgMonthlyExpenses]
  );

  const monthLabel = (m) => {
    const [y, mo] = m.split("-");
    const names = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return `${names[Number(mo) - 1]} ${y}`;
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ color: "#1E2B4A", margin: 0, fontSize: isMobile ? 22 : 26, fontWeight: 800, letterSpacing: "-0.4px" }}>
            💵 Finanzas
          </h2>
          <p style={{ color: "#6B7794", fontSize: 12, margin: "4px 0 0" }}>
            Rentabilidad real con costo de lo vendido (COGS), no de lo comprado.
          </p>
        </div>
        <select
          value={month}
          onChange={e => setMonth(e.target.value)}
          style={{
            padding: "10px 14px", background: "#FFFFFF", border: "1px solid #E5DAC2",
            borderRadius: 10, color: "#1E2B4A", fontSize: 14, fontWeight: 600,
            outline: "none", fontFamily: "inherit", cursor: "pointer",
          }}
        >
          {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      {/* KPIs ejecutivos */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <StatCard label="Ingresos del mes" value={formatMoney(kpis.revenue)} color="#1E2B4A" icon="💰" sub={`${kpis.salesCount} ventas`} />
        <StatCard label="Margen bruto" value={`${kpis.grossMarginPct}%`} color="#0F6B5C" icon="📈" sub={formatMoney(kpis.grossProfit)} />
        <StatCard label="Ganancia neta" value={formatMoney(kpis.netProfit)} color={kpis.netProfit >= 0 ? "#0F6B5C" : "#B83232"} icon="🎯" sub={`margen ${kpis.netMarginPct}%`} />
        <StatCard label="Ticket promedio" value={formatMoney(kpis.avgTicket)} color="#5B3592" icon="🧾" />
      </div>

      {/* P&L mensual */}
      <Card style={{ marginBottom: 16 }}>
        <SectionTitle>📋 Estado de Resultados — {monthLabel(month)}</SectionTitle>
        <PnLRow label="Ingresos (ventas)" value={pnl.revenue} bold />
        <PnLRow label="(−) Costo de lo vendido (COGS)" value={-pnl.cogs} color="#B83232" />
        <PnLRow label="= Margen bruto" value={pnl.grossProfit} bold pct={pnl.grossMarginPct} divider />
        <PnLRow label="(−) Gastos" value={-pnl.expensesTotal} color="#B83232" />
        {pnl.mermasARS > 0 && <PnLRow label="(−) Mermas (a costo)" value={-pnl.mermasARS} color="#B83232" />}
        <PnLRow label="= Ganancia neta operativa" value={pnl.netProfit} bold big pct={pnl.netMarginPct} divider color={pnl.netProfit >= 0 ? "#0F6B5C" : "#B83232"} />
        <div style={{ fontSize: 11, color: "#9AA2B3", marginTop: 10, lineHeight: 1.5 }}>
          💡 El COGS imputa el costo de lo que se vendió este mes (no de lo comprado).
          Esto refleja la rentabilidad real del período, sin distorsión por compras de stock.
        </div>
      </Card>

      {/* Valuación de inventario */}
      <Card style={{ marginBottom: 16 }}>
        <SectionTitle>📦 Valuación de Inventario (stock actual)</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? "140px" : "180px"}, 1fr))`, gap: 12 }}>
          <ValueBox label="Valor a costo" value={formatMoney(inventory.atCostARS)} sub={`USDT ${inventory.atCostUSDT.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`} color="#3A4868" />
          <ValueBox label="Valor a venta" value={formatMoney(inventory.atSaleARS)} sub={`${inventory.units} unidades`} color="#1E2B4A" />
          <ValueBox label="Ganancia latente" value={formatMoney(inventory.potentialProfitARS)} sub={`margen ${inventory.potentialMarginPct}%`} color="#0F6B5C" />
          <ValueBox label="Rotación inventario" value={`${kpis.turnover}×`} sub="COGS / valor stock" color="#5B3592" />
        </div>
        {inventory.costCoverage < 100 && (
          <div style={{
            marginTop: 12, padding: "8px 12px",
            background: "#F5E4C2", border: "1px solid #E1C684", borderRadius: 8,
            fontSize: 12, color: "#B07A1F",
          }}>
            ⚠️ Solo el {inventory.costCoverage}% de tus productos con stock tienen costo cargado.
            Verificá pedidos o cargá el costo en Productos para una valuación más precisa.
          </div>
        )}
      </Card>

      {/* Flujo de caja proyectado */}
      <Card style={{ marginBottom: 16 }}>
        <SectionTitle>💸 Flujo de Caja Proyectado (próximos 30 días)</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: "#0F6B5C", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>↗ Entradas estimadas</div>
            <FlowRow label="Ventas proyectadas (por velocity)" value={cashFlow.projectedRevenueARS} />
            <div style={{ fontSize: 11, color: "#9AA2B3", marginTop: 2 }}>
              Ganancia bruta esperada: {formatMoney(cashFlow.projectedGrossProfitARS)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#B83232", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>↘ Salidas comprometidas</div>
            <FlowRow label="Pedidos pendientes" value={-cashFlow.pendingPurchasesARS} color="#B83232" />
            <FlowRow label="Gastos fijos (prom. 3m)" value={-cashFlow.fixedExpensesARS} color="#B83232" />
          </div>
        </div>
        <div style={{
          marginTop: 14, paddingTop: 14, borderTop: "2px solid #E5DAC2",
          display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8,
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#1E2B4A" }}>Resultado neto proyectado</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: cashFlow.net >= 0 ? "#0F6B5C" : "#B83232" }}>
            {cashFlow.net >= 0 ? "+" : ""}{formatMoney(cashFlow.net)}
          </span>
        </div>
        {cashFlow.net < 0 && (
          <div style={{
            marginTop: 12, padding: "8px 12px",
            background: "#F7DEDE", border: "1px solid #E5A8A8", borderRadius: 8,
            fontSize: 12, color: "#B83232",
          }}>
            ⚠️ Las salidas comprometidas superan las ventas proyectadas en {formatMoney(Math.abs(cashFlow.net))}.
            Revisá si necesitás acelerar ventas o postergar algún pedido.
          </div>
        )}
      </Card>

      {/* ROI */}
      <Card>
        <SectionTitle>📊 Retorno</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? "140px" : "200px"}, 1fr))`, gap: 12 }}>
          <ValueBox label="ROI del mes" value={`${kpis.roiPct}%`} sub="ganancia / capital en stock" color={kpis.roiPct >= 0 ? "#0F6B5C" : "#B83232"} />
          <ValueBox label="Capital en stock" value={formatMoney(kpis.inventoryValueCostARS)} sub="inmovilizado a costo" color="#3A4868" />
          <ValueBox label="Potencial de ganancia" value={formatMoney(kpis.inventoryPotentialProfitARS)} sub="si vendés todo el stock" color="#5B3592" />
        </div>
      </Card>
    </div>
  );
};

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 13, color: "#1E2B4A", fontWeight: 800,
      marginBottom: 14, letterSpacing: "-0.2px",
    }}>{children}</div>
  );
}

function PnLRow({ label, value, bold, big, pct, divider, color }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: big ? "10px 0" : "6px 0",
      borderTop: divider ? "1px solid #E5DAC2" : "none",
      marginTop: divider ? 4 : 0,
    }}>
      <span style={{ fontSize: big ? 15 : 13, fontWeight: bold ? 700 : 500, color: bold ? "#1E2B4A" : "#3A4868" }}>
        {label}
      </span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        {pct != null && <span style={{ fontSize: 11, color: "#9AA2B3", fontWeight: 600 }}>{pct}%</span>}
        <span style={{ fontSize: big ? 20 : 14, fontWeight: bold ? 800 : 600, color: color || (value < 0 ? "#B83232" : "#1E2B4A") }}>
          {formatMoney(value)}
        </span>
      </span>
    </div>
  );
}

function ValueBox({ label, value, sub, color = "#1E2B4A" }) {
  return (
    <div style={{ padding: "12px 14px", background: "#F8F2E7", borderRadius: 10, border: "1px solid #EFE5CE" }}>
      <div style={{ fontSize: 10, color: "#6B7794", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color, lineHeight: 1.1, letterSpacing: "-0.3px" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#6B7794", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}
