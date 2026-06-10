import { useMemo, useState } from "react";
import { useResponsive } from "../../App.jsx";
import { formatMoney } from "../../helpers.js";
import { Card } from "../UI.jsx";
import { forecastMonthClose, forecastCashFlow } from "../../lib/financeForecast.js";
import { ticketDistribution, purchaseBatchPerformance, monthlySeasonality } from "../../lib/financeInsights.js";
import { rankSkuProfitability, profitabilitySummary, SKU_LABELS } from "../../lib/skuProfitability.js";
import { lastNDaysSnapshot, simulateWhatIf, revenueNeededFor } from "../../lib/whatIfSimulator.js";

// Sub-componentes inline para mantener el archivo manejable

export function FinanceProjections({ sales = [], purchases = [], expenses = [], products = [], exchangeRate = 1 }) {
  const { isMobile } = useResponsive();
  const now = new Date();

  // === Datos derivados ===
  const forecast = useMemo(() => forecastMonthClose(sales, exchangeRate, now), [sales, exchangeRate]);

  // Cash actual aproximado: revenue - expenses - compras verificadas últimos 90d
  // (mismo cálculo que Dashboard runway pero simplificado)
  const currentCashARS = useMemo(() => {
    const ms90 = now.getTime() - 90 * 86400000;
    let cash = 273646 + 120000; // initial balance (igual que Dashboard)
    sales.forEach(s => {
      if (s.isDeleted || !s.date || new Date(s.date).getTime() < ms90) return;
      const t = Number(s.total) || 0;
      const cur = s.currency || "ARS";
      cash += (cur === "USD" || cur === "USDT") ? t * (s.exchangeRate || exchangeRate || 1) : t;
    });
    expenses.forEach(e => {
      if (e.isDeleted || !e.date || new Date(e.date).getTime() < ms90) return;
      cash -= Number(e.amountARS) || 0;
    });
    purchases.forEach(p => {
      if (p.isDeleted || p.status !== "verificado" || !p.date || new Date(p.date).getTime() < ms90) return;
      cash -= (Number(p.totalUSDT) || 0) * (exchangeRate || 1);
    });
    return Math.max(0, cash);
  }, [sales, expenses, purchases, exchangeRate]);

  const cashFlow = useMemo(
    () => forecastCashFlow({ currentCashARS, sales, expenses, purchases, exchangeRate, now }),
    [currentCashARS, sales, expenses, purchases, exchangeRate]
  );

  const tickets = useMemo(() => ticketDistribution(sales, exchangeRate, { sinceDays: 90, now }), [sales, exchangeRate]);
  const lotes = useMemo(() => purchaseBatchPerformance({ purchases, sales, exchangeRate }), [purchases, sales, exchangeRate]);
  const season = useMemo(() => monthlySeasonality(sales, exchangeRate, { monthsBack: 12, now }), [sales, exchangeRate]);
  const ranked = useMemo(() => rankSkuProfitability({ products, sales, purchases, exchangeRate, now }), [products, sales, purchases, exchangeRate]);
  const skuSummary = useMemo(() => profitabilitySummary(ranked), [ranked]);

  // What-if simulator state
  const baseSnap = useMemo(() => lastNDaysSnapshot({ sales, expenses, products, exchangeRate, days: 30, now }), [sales, expenses, products, exchangeRate]);
  const [priceDelta, setPriceDelta] = useState(0);
  const [costDelta, setCostDelta] = useState(0);
  const [volumeDelta, setVolumeDelta] = useState(0);
  const [expensesDelta, setExpensesDelta] = useState(0);
  const sim = useMemo(
    () => simulateWhatIf(baseSnap, { priceDeltaPct: priceDelta, costDeltaPct: costDelta, volumeDeltaPct: volumeDelta, expensesDeltaPct: expensesDelta }),
    [baseSnap, priceDelta, costDelta, volumeDelta, expensesDelta]
  );

  // Meta inversa
  const [targetNet, setTargetNet] = useState("");
  const goalCalc = useMemo(() => {
    const tg = Number(targetNet) || 0;
    if (tg <= 0) return null;
    return revenueNeededFor(tg, baseSnap);
  }, [targetNet, baseSnap]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* === 1. FORECAST DEL CIERRE DEL MES === */}
      <Card>
        <SectionTitle icon="🎯" title="Proyección de cierre del mes" />
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12 }}>
          <MiniStat label="Recaudado a la fecha" value={formatMoney(forecast.revenueSoFar)} sub={`${forecast.daysElapsed}/${forecast.daysInMonth}d`} />
          <MiniStat label="Promedio diario" value={formatMoney(forecast.dailyAvgLast14)} sub="últimos 14d" />
          <MiniStat
            label="Cierre proyectado"
            value={formatMoney(forecast.projectedClose)}
            sub={`al ritmo de los últimos 14d`}
            highlight
          />
          {forecast.growthPct != null && (
            <MiniStat
              label="vs mes anterior"
              value={`${forecast.growthPct > 0 ? "+" : ""}${forecast.growthPct}%`}
              sub={formatMoney(forecast.lastMonthRevenue) + " antes"}
              color={forecast.growthPct >= 0 ? "#0F6B5C" : "#B83232"}
            />
          )}
        </div>
        <SmallNote>
          Conservador (al ritmo del mes entero): {formatMoney(forecast.projectedCloseConservative)}.
          Si seguís al ritmo actual quedan {forecast.daysRemaining} días.
        </SmallNote>
      </Card>

      {/* === 2. CASH FLOW 30/60/90 === */}
      <Card>
        <SectionTitle icon="💵" title="Proyección de caja 30 / 60 / 90 días" />
        <div style={{ marginBottom: 12, fontSize: 12, color: "#6B7794" }}>
          Cash actual estimado: <strong style={{ color: "#1E2B4A" }}>{formatMoney(cashFlow.currentCashARS)}</strong>
          {" · "}Diario: <strong style={{ color: cashFlow.netDaily >= 0 ? "#0F6B5C" : "#B83232" }}>
            {cashFlow.netDaily >= 0 ? "+" : ""}{formatMoney(cashFlow.netDaily)}
          </strong> (entran {formatMoney(cashFlow.dailyInflow)} · salen {formatMoney(cashFlow.dailyOutflow)})
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 10 }}>
          {cashFlow.horizons.map(h => (
            <div key={h.days} style={{
              padding: "12px 14px", borderRadius: 12,
              background: h.projectedCash >= 0 ? "#F8F2E7" : "#FBE4E4",
              border: `1px solid ${h.projectedCash >= 0 ? "#EFE5CE" : "#F1B8B6"}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7794", textTransform: "uppercase", letterSpacing: 0.5 }}>En {h.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: h.projectedCash >= 0 ? "#1E2B4A" : "#B83232", marginTop: 4 }}>
                {formatMoney(h.projectedCash)}
              </div>
              <div style={{ fontSize: 11, color: "#6B7794", marginTop: 4 }}>
                +{formatMoney(h.inflows)} · −{formatMoney(h.outflows)}
              </div>
            </div>
          ))}
        </div>
        {cashFlow.pendingPurchasesARS > 0 && (
          <SmallNote>
            Incluye compras pendientes a entregar por {formatMoney(cashFlow.pendingPurchasesARS)} distribuidas en próximos 30d.
          </SmallNote>
        )}
      </Card>

      {/* === 3. RENTABILIDAD POR SKU === */}
      <Card>
        <SectionTitle icon="📊" title="Rentabilidad real por SKU" />
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(6, 1fr)", gap: 8, marginBottom: 12 }}>
          {Object.entries(SKU_LABELS).filter(([k]) => k !== "needs_data" || skuSummary.counts.needs_data > 0).map(([k, meta]) => (
            <div key={k} style={{
              padding: "8px 10px", borderRadius: 10, border: `1px solid ${meta.color}30`, background: `${meta.color}08`,
            }}>
              <div style={{ fontSize: 10, color: meta.color, fontWeight: 700, textTransform: "uppercase" }}>
                {meta.emoji} {meta.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: meta.color, marginTop: 2 }}>{skuSummary.counts[k] || 0}</div>
            </div>
          ))}
        </div>
        <SmallNote>
          ROI mensual del portfolio: <strong>{skuSummary.portfolioROIMonthly}%</strong> ·
          Capital invertido en stock: <strong>USD {skuSummary.totalInvestedUSD}</strong> ·
          Beneficio mensual esperado: <strong>USD {skuSummary.totalMonthlyProfitUSD}</strong>
        </SmallNote>
        {/* Top 10 SKU ranking */}
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#F8F2E7", borderBottom: "1px solid #E5DAC2" }}>
                <th style={cellH}>Producto</th>
                <th style={cellH}>Clase</th>
                <th style={cellHR}>Margen</th>
                <th style={cellHR}>Vel/día</th>
                <th style={cellHR}>ROI mes</th>
              </tr>
            </thead>
            <tbody>
              {ranked.slice(0, 12).map(r => {
                const meta = SKU_LABELS[r.classification];
                return (
                  <tr key={r.product.id} style={{ borderBottom: "1px solid #EFE5CE" }}>
                    <td style={cell}>{r.product.brand} · {r.product.flavor || r.product.model}</td>
                    <td style={cell}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: meta.color, padding: "2px 6px", background: `${meta.color}15`, borderRadius: 6 }}>
                        {meta.emoji} {meta.label}
                      </span>
                    </td>
                    <td style={cellR}>{r.marginPct != null ? `${r.marginPct}%` : "—"}</td>
                    <td style={cellR}>{r.velocity}</td>
                    <td style={cellR}>{r.monthlyROI != null ? `${r.monthlyROI}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* === 4. DISTRIBUCIÓN DE TICKETS === */}
      <Card>
        <SectionTitle icon="🎫" title="Distribución de tickets (últimos 90d)" />
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 12 }}>
          <MiniStat label="Mediana" value={formatMoney(tickets.median)} sub="50% son ≤" highlight />
          <MiniStat label="Promedio" value={formatMoney(tickets.avg)} sub="sensible a outliers" />
          <MiniStat label="P25 — P75" value={`${formatMoney(tickets.p25)} a ${formatMoney(tickets.p75)}`} sub="rango típico" />
          <MiniStat label="Mín / Máx" value={`${formatMoney(tickets.min)} / ${formatMoney(tickets.max)}`} sub={`${tickets.count} ventas`} />
        </div>
        {tickets.count > 0 && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
            {tickets.histogram.map(h => {
              const maxCount = Math.max(...tickets.histogram.map(x => x.count), 1);
              const w = (h.count / maxCount) * 100;
              return (
                <div key={h.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 80, fontSize: 11, color: "#6B7794", textAlign: "right" }}>{h.label}</div>
                  <div style={{ flex: 1, height: 18, background: "#F8F2E7", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${w}%`, height: "100%", background: "#1E2B4A" }} />
                  </div>
                  <div style={{ width: 30, fontSize: 11, color: "#1E2B4A", fontWeight: 700 }}>{h.count}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* === 5. RENDIMIENTO DE LOTES PARAGUAY === */}
      {lotes.length > 0 && (
        <Card>
          <SectionTitle icon="🚚" title="Rendimiento por lote / viaje" />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#F8F2E7", borderBottom: "1px solid #E5DAC2" }}>
                  <th style={cellH}>Lote · Proveedor</th>
                  <th style={cellH}>Fecha</th>
                  <th style={cellHR}>Costo USD</th>
                  <th style={cellHR}>Revenue</th>
                  <th style={cellHR}>Sell-through</th>
                  <th style={cellHR}>ROI</th>
                </tr>
              </thead>
              <tbody>
                {lotes.slice(0, 10).map(l => (
                  <tr key={l.loteId} style={{ borderBottom: "1px solid #EFE5CE" }}>
                    <td style={cell}>{l.loteNumber || "—"} · {l.supplier}</td>
                    <td style={cell}>{l.date ? l.date.slice(0, 10) : "—"}</td>
                    <td style={cellR}>USD {l.costUSD}</td>
                    <td style={cellR}>{formatMoney(l.revenueARS)}</td>
                    <td style={cellR}>{l.sellThroughPct}%</td>
                    <td style={{ ...cellR, fontWeight: 800, color: l.roiPct >= 0 ? "#0F6B5C" : "#B83232" }}>
                      {l.roiPct > 0 ? "+" : ""}{l.roiPct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* === 6. ESTACIONALIDAD === */}
      <Card>
        <SectionTitle icon="📅" title="Estacionalidad mensual (últimos 12m)" />
        <div style={{ fontSize: 12, color: "#6B7794", marginBottom: 12 }}>
          Promedio mensual: <strong style={{ color: "#1E2B4A" }}>{formatMoney(season.avgMonthly)}</strong> sobre {season.monthsWithData} meses con datos
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {season.months.map(m => {
            const maxRev = Math.max(...season.months.map(x => x.revenue), 1);
            const w = (m.revenue / maxRev) * 100;
            const color = m.strength === "strong" ? "#0F6B5C" : m.strength === "weak" ? "#CB912F" : m.strength === "empty" ? "#9AA2B3" : "#1E2B4A";
            return (
              <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 60, fontSize: 11, color: "#6B7794", textTransform: "capitalize" }}>{m.label}</div>
                <div style={{ flex: 1, height: 18, background: "#F8F2E7", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${w}%`, height: "100%", background: color }} />
                </div>
                <div style={{ width: 110, textAlign: "right", fontSize: 11, color: "#1E2B4A", fontWeight: 600 }}>
                  {formatMoney(m.revenue)}
                </div>
                {m.vsAvgPct !== 0 && (
                  <div style={{ width: 50, textAlign: "right", fontSize: 10, color: m.vsAvgPct > 0 ? "#0F6B5C" : "#B83232" }}>
                    {m.vsAvgPct > 0 ? "+" : ""}{m.vsAvgPct}%
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* === 7. WHAT-IF SIMULATOR === */}
      <Card>
        <SectionTitle icon="🎲" title="Simulador what-if (base: últimos 30d)" />
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
          {/* Sliders */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <SliderRow label="📈 Subir precios" value={priceDelta} setValue={setPriceDelta} suffix="%" min={-20} max={30} />
            <SliderRow label="📉 Bajar costos" value={costDelta} setValue={setCostDelta} suffix="%" min={-30} max={20} />
            <SliderRow label="🛒 Cambio en volumen" value={volumeDelta} setValue={setVolumeDelta} suffix="%" min={-30} max={50} />
            <SliderRow label="💸 Ajustar gastos" value={expensesDelta} setValue={setExpensesDelta} suffix="%" min={-50} max={20} />
            <button onClick={() => { setPriceDelta(0); setCostDelta(0); setVolumeDelta(0); setExpensesDelta(0); }} style={{
              padding: "8px 12px", background: "transparent", border: "1px solid #E5DAC2",
              borderRadius: 8, cursor: "pointer", fontSize: 12, color: "#6B7794", fontFamily: "inherit",
            }}>Reset</button>
          </div>
          {/* Resultado */}
          <div style={{ background: "#F8F2E7", padding: 14, borderRadius: 10, border: "1px solid #EFE5CE" }}>
            <div style={{ fontSize: 11, color: "#6B7794", marginBottom: 8, fontWeight: 700, textTransform: "uppercase" }}>
              Resultado del escenario
            </div>
            <ScenarioRow label="Revenue" baseValue={baseSnap.revenueARS} newValue={sim?.revenueARS} />
            <ScenarioRow label="COGS" baseValue={baseSnap.cogsARS} newValue={sim?.cogsARS} inverse />
            <ScenarioRow label="Gastos" baseValue={baseSnap.expensesARS} newValue={sim?.expensesARS} inverse />
            <div style={{ height: 1, background: "#E5DAC2", margin: "8px 0" }} />
            <ScenarioRow label="Neto" baseValue={baseSnap.netProfitARS} newValue={sim?.netProfitARS} bold />
            <div style={{ fontSize: 11, color: "#6B7794", marginTop: 8 }}>
              Margen neto: {sim?.netMarginPct}% (era {baseSnap.netMarginPct}%)
            </div>
          </div>
        </div>
      </Card>

      {/* === 8. META INVERSA === */}
      <Card>
        <SectionTitle icon="🎯" title="¿Cuánto necesito vender para llegar a X de neto?" />
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "#6B7794" }}>Objetivo de ganancia neta mensual:</span>
          <input type="number" value={targetNet} onChange={e => setTargetNet(e.target.value)} placeholder="Ej: 500000"
            style={{
              padding: "10px 14px", fontSize: 16, border: "1px solid #E5DAC2",
              borderRadius: 8, background: "#FFF", outline: "none", width: 200,
            }} />
        </div>
        {goalCalc && (
          <div style={{ marginTop: 14, padding: 14, background: "#F8F2E7", borderRadius: 10, border: "1px solid #EFE5CE" }}>
            <div style={{ fontSize: 14, color: "#1E2B4A" }}>
              Para ganar <strong>{formatMoney(goalCalc.targetNetARS)}</strong> netos al mes,
              necesitás facturar <strong style={{ color: "#0F6B5C" }}>{formatMoney(goalCalc.neededMonthlyRevenueARS)}</strong>.
            </div>
            <div style={{ fontSize: 12, color: "#6B7794", marginTop: 6 }}>
              Hoy estás facturando <strong>{formatMoney(goalCalc.currentMonthlyRevenueARS)}</strong> al mes.
              Faltan <strong style={{ color: goalCalc.additionalRevenueARS > 0 ? "#B83232" : "#0F6B5C" }}>
                {formatMoney(Math.abs(goalCalc.additionalRevenueARS))}
              </strong> {goalCalc.additionalRevenueARS > 0 ? `más al mes (+${goalCalc.additionalPct}%)` : "menos (ya superás la meta)"}.
              Margen neto asumido: {goalCalc.netMarginPct}%.
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// === Helpers UI ===

function SectionTitle({ icon, title }) {
  return (
    <div style={{ fontSize: 14, fontWeight: 800, color: "#1E2B4A", marginBottom: 12 }}>
      {icon} {title}
    </div>
  );
}

function SmallNote({ children }) {
  return (
    <div style={{ marginTop: 10, fontSize: 11, color: "#6B7794", lineHeight: 1.5 }}>{children}</div>
  );
}

function MiniStat({ label, value, sub, highlight, color }) {
  return (
    <div style={{
      padding: "10px 12px",
      background: highlight ? "#1E2B4A" : "#F8F2E7",
      color: highlight ? "#F8F2E7" : "#1E2B4A",
      border: `1px solid ${highlight ? "#1E2B4A" : "#EFE5CE"}`,
      borderRadius: 10,
    }}>
      <div style={{
        fontSize: 10, opacity: highlight ? 0.75 : 1, color: highlight ? "#F8F2E7" : "#6B7794",
        fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5,
      }}>{label}</div>
      <div style={{
        fontSize: 18, fontWeight: 800, color: color || (highlight ? "#F8F2E7" : "#1E2B4A"), marginTop: 4,
      }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 10, color: highlight ? "rgba(248,242,231,0.65)" : "#9AA2B3", marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}

function SliderRow({ label, value, setValue, suffix, min, max }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#1E2B4A", fontWeight: 600, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: value === 0 ? "#9AA2B3" : value > 0 ? "#0F6B5C" : "#B83232" }}>
          {value > 0 ? "+" : ""}{value}{suffix}
        </span>
      </div>
      <input type="range" min={min} max={max} step="1" value={value} onChange={e => setValue(Number(e.target.value))}
        style={{ width: "100%" }} />
    </div>
  );
}

function ScenarioRow({ label, baseValue, newValue, bold, inverse }) {
  const delta = (newValue || 0) - (baseValue || 0);
  const isPositive = inverse ? delta < 0 : delta > 0;
  const color = delta === 0 ? "#1E2B4A" : isPositive ? "#0F6B5C" : "#B83232";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: bold ? 15 : 12, color: "#1E2B4A", padding: "3px 0", fontWeight: bold ? 800 : 500 }}>
      <span>{label}</span>
      <span style={{ color: bold ? color : "#1E2B4A" }}>
        {formatMoney(newValue || 0)}
        {delta !== 0 && (
          <span style={{ marginLeft: 6, fontSize: 11, color, fontWeight: 600 }}>
            ({delta > 0 ? "+" : ""}{formatMoney(delta)})
          </span>
        )}
      </span>
    </div>
  );
}

const cellH = { padding: "8px 10px", textAlign: "left", fontSize: 11, color: "#6B7794", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 };
const cellHR = { ...cellH, textAlign: "right" };
const cell = { padding: "8px 10px", color: "#1E2B4A" };
const cellR = { ...cell, textAlign: "right" };
