import { useState, useMemo } from "react";
import { formatMoney, formatDate } from "../helpers.js";
import { calcTotalRevenue } from "../calcs.js";
import {
  buildProductSalesStats,
  calcABCAnalysis,
  calcBrandPerformance,
  calcInventoryHealth,
  calcProductMargin,
  calcProductCoOccurrence,
  calcDayOfWeekPattern,
  calcSellThroughRate,
} from "../productIntelligence.js";
import { Card, Badge, Table } from "./UI.jsx";
import { BRAND_COLORS, WITHDRAW_TYPES, FAILURE_REASONS, FAILURE_REASON_CATEGORY, isGarantia } from "../constants.js";
import { useResponsive } from "../App.jsx";
import { useAppContext } from "../AppContext.js";

// Helper: costo de un withdrawal (prefiere costRealUSD nuevo, fallback a costEstimateUSD viejo)
const wCost = (w) => Number(w.costRealUSD || w.costEstimateUSD) || 0;
// Color por tipo (soporta string viejo y nuevo)
const TYPE_COLOR = {
  "Consumo propio": "#e17055",
  "Cambio por garantía": "#CB912F",
  "Garantía / Devolución": "#CB912F", // compat datos viejos
  "Regalo / Canje": "#00cec9",
};

// -- REPORTS --
const BarChart = ({ data, colorKey, valueKey, labelKey, maxBars = 10, suffix = "" }) => {
  if (!data || data.length === 0) return <p style={{ color: "#B1AFA7", fontSize: 13 }}>Sin datos</p>;
  const sorted = [...data].slice(0, maxBars);
  const maxVal = Math.max(...sorted.map(d => d[valueKey] || 0), 1);
  return (
    <div>
      {sorted.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ color: "#555247", fontSize: 12, minWidth: 60, maxWidth: 120, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>{d[labelKey]}</span>
          <div style={{ flex: 1, background: "#F0EFEB", borderRadius: 6, height: 24, overflow: "hidden" }}>
            <div style={{
              width: `${Math.max(2, (d[valueKey] / maxVal) * 100)}%`, height: "100%",
              background: `linear-gradient(90deg, ${d[colorKey] || "#5E6AD2"}88, ${d[colorKey] || "#5E6AD2"})`,
              borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 8, transition: "width 0.5s"
            }}>
              <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>{typeof d[valueKey] === "number" && d[valueKey] >= 1000 ? formatMoney(d[valueKey]) : d[valueKey]}{suffix}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const DonutChart = ({ data, size = 160 }) => {
  if (!data || data.length === 0) return <p style={{ color: "#B1AFA7", fontSize: 13 }}>Sin datos</p>;
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p style={{ color: "#555", fontSize: 13 }}>Sin datos</p>;
  const r = size / 2 - 10;
  const cx = size / 2, cy = size / 2;
  let cumAngle = -Math.PI / 2;
  const slices = data.map(d => {
    const angle = (d.value / total) * 2 * Math.PI;
    const startAngle = cumAngle;
    cumAngle += angle;
    const endAngle = cumAngle;
    const largeArc = angle > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle);
    const ir = r * 0.55;
    const ix1 = cx + ir * Math.cos(endAngle), iy1 = cy + ir * Math.sin(endAngle);
    const ix2 = cx + ir * Math.cos(startAngle), iy2 = cy + ir * Math.sin(startAngle);
    const path = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${ir} ${ir} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;
    return { ...d, path, pct: Math.round(d.value / total * 100) };
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <svg width={size} height={size}>
        {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} opacity={0.85} />)}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="#37352F" fontSize={18} fontWeight={800}>{total}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#8C8A82" fontSize={10}>unidades</text>
      </svg>
      <div>
        {slices.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ color: "#555247", fontSize: 12 }}>{s.label}</span>
            <span style={{ color: "#8C8A82", fontSize: 11 }}>{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const Reports = ({ products, sales, purchases, expenses, withdrawals, clients = [] }) => {
  const { exchangeRate } = useAppContext();
  const { isMobile } = useResponsive();

  // S15 — Inteligencia de productos (consumido por las 4 sub-secciones nuevas).
  // Una sola pasada construye los stats y los demás cálculos derivan de él.
  const productStats = useMemo(
    () => buildProductSalesStats(products, sales, exchangeRate),
    [products, sales, exchangeRate]
  );
  const abcAnalysis = useMemo(() => calcABCAnalysis(productStats), [productStats]);
  const brandPerformance = useMemo(
    () => calcBrandPerformance(productStats, products),
    [productStats, products]
  );
  const inventoryHealth = useMemo(
    () => calcInventoryHealth(products, purchases, sales, productStats),
    [products, purchases, sales, productStats]
  );
  const coOccurrence = useMemo(
    () => calcProductCoOccurrence(sales, products, 3),
    [sales, products]
  );
  const dowPattern = useMemo(
    () => calcDayOfWeekPattern(sales, null, 90),
    [sales]
  );
  const sellThroughRates = useMemo(
    () => calcSellThroughRate(purchases, sales),
    [purchases, sales]
  );

  // Note: App.jsx already passes active* (filtered) data for most read-only components,
  // but we add safety filters here for any that might slip through
  const brandStats = useMemo(() => {
    const stats = {};
    sales.filter(s => !s.isDeleted).forEach(s => (s.items || []).forEach(item => {
      const prod = products.find(p => p.id === item.productId);
      if (prod) {
        if (!stats[prod.brand]) stats[prod.brand] = { sold: 0, revenue: 0 };
        stats[prod.brand].sold += item.qty;
        stats[prod.brand].revenue += s.total / (s.items.length || 1);
      }
    }));
    return Object.entries(stats).sort((a, b) => b[1].sold - a[1].sold);
  }, [sales, products]);

  const channelStats = useMemo(() => {
    const stats = {};
    sales.filter(s => !s.isDeleted).forEach(s => {
      const ch = s.channel || "Sin canal";
      if (!stats[ch]) stats[ch] = { count: 0, revenue: 0 };
      stats[ch].count++;
      stats[ch].revenue += s.total || 0;
    });
    return Object.entries(stats).sort((a, b) => b[1].count - a[1].count);
  }, [sales]);

  const paymentStats = useMemo(() => {
    const stats = {};
    sales.filter(s => !s.isDeleted).forEach(s => {
      const pm = s.paymentMethod || "Otro";
      if (!stats[pm]) stats[pm] = { count: 0, revenue: 0 };
      stats[pm].count++;
      stats[pm].revenue += s.total || 0;
    });
    return Object.entries(stats).sort((a, b) => b[1].revenue - a[1].revenue);
  }, [sales]);

  const topFlavors = useMemo(() => {
    const stats = {};
    sales.filter(s => !s.isDeleted).forEach(s => (s.items || []).forEach(item => {
      const prod = products.find(p => p.id === item.productId);
      if (prod) {
        const key = `${prod.brand} ${prod.model} - ${prod.flavor}`;
        if (!stats[key]) stats[key] = { sold: 0, brand: prod.brand };
        stats[key].sold += item.qty;
      }
    }));
    return Object.entries(stats).sort((a, b) => b[1].sold - a[1].sold).slice(0, 10);
  }, [sales, products]);

  const monthlySales = useMemo(() => {
    const stats = {};
    sales.filter(s => !s.isDeleted).forEach(s => {
      const d = new Date(s.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("es-AR", { month: "short", year: "2-digit" });
      if (!stats[key]) stats[key] = { label, count: 0, revenue: 0 };
      stats[key].count++;
      stats[key].revenue += s.total || 0;
    });
    return Object.entries(stats).sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
  }, [sales]);

  const stockByBrand = useMemo(() => {
    const stats = {};
    products.forEach(p => {
      if (!stats[p.brand]) stats[p.brand] = 0;
      stats[p.brand] += p.stock || 0;
    });
    return Object.entries(stats).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  }, [products]);

  const brandColors = { Elfbar: "#00b894", "Geek Bar": "#6c5ce7", Ignite: "#E03E3E", "Lost Mary": "#fdcb6e", Nikbar: "#00cec9", Supreme: "#e17055" };
  const channelColors = { WhatsApp: "#25d366", Instagram: "#e1306c", Delivery: "#fdcb6e", Presencial: "#a855f7" };
  const paymentColors = { "Mercado Pago": "#00b2ff", Lemon: "#f9ca24", "USD Cash": "#00cec9", USDT: "#26de81", "Pesos Cash": "#fdcb6e" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: "#37352F", margin: 0, fontSize: 22 }}>Reportes</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => window.print()} style={{
            padding: "8px 14px", borderRadius: 8, border: "1px solid #E8E7E3",
            background: "transparent", color: "#37352F", fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }} title="Imprimir o exportar a PDF">📄 Exportar PDF</button>
        </div>
      </div>

      {/* Top Performers Podium */}
      {(() => {
        const topProductMap = {};
        const topClientMap = {};
        const topChannelMap = {};
        sales.filter(s => !s.isDeleted).forEach(s => {
          (s.items || []).forEach(it => {
            const key = it.productId;
            if (!topProductMap[key]) topProductMap[key] = { qty: 0, revenue: 0, ...products.find(p => p.id === key) };
            topProductMap[key].qty += (it.qty || 1);
            topProductMap[key].revenue += (it.price || 0) * (it.qty || 1);
          });
          if (s.clientName) {
            if (!topClientMap[s.clientName]) topClientMap[s.clientName] = { count: 0, revenue: 0, name: s.clientName };
            topClientMap[s.clientName].count += 1;
            topClientMap[s.clientName].revenue += s.total || 0;
          }
          if (s.channel) {
            if (!topChannelMap[s.channel]) topChannelMap[s.channel] = { count: 0, revenue: 0, name: s.channel };
            topChannelMap[s.channel].count += 1;
            topChannelMap[s.channel].revenue += s.total || 0;
          }
        });
        const topProducts = Object.values(topProductMap).filter(p => p.brand).sort((a, b) => b.qty - a.qty).slice(0, 3);
        const topClients = Object.values(topClientMap).sort((a, b) => b.revenue - a.revenue).slice(0, 3);
        const topChannels = Object.values(topChannelMap).sort((a, b) => b.revenue - a.revenue).slice(0, 3);
        const medals = ["🥇", "🥈", "🥉"];
        const medalColors = ["#F59E0B", "#9CA3AF", "#CD7F32"];
        const Section = ({ title, items, getLabel, getValue }) => (
          <div style={{ flex: 1, minWidth: 220 }}>
            <h4 style={{ color: "#8C8A82", margin: "0 0 8px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>
              {title}
            </h4>
            {items.length === 0 ? (
              <p style={{ color: "#B1AFA7", fontSize: 12, margin: 0 }}>Sin datos</p>
            ) : (
              items.map((it, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
                  borderBottom: i < items.length - 1 ? "1px solid #F0EFEB" : "none",
                }}>
                  <span style={{ fontSize: 18 }}>{medals[i]}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: "#37352F", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {getLabel(it)}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: medalColors[i],
                    fontFamily: "'Rubik', sans-serif", whiteSpace: "nowrap",
                  }}>{getValue(it)}</span>
                </div>
              ))
            )}
          </div>
        );
        return (
          <Card style={{ marginBottom: 20 }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "#37352F" }}>
              🏆 Top Performers (histórico)
            </h3>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <Section
                title="Productos más vendidos"
                items={topProducts}
                getLabel={p => `${p.brand} ${p.model}${p.flavor ? ` · ${p.flavor}` : ""}`}
                getValue={p => `${p.qty} uds`}
              />
              <Section
                title="Clientes top revenue"
                items={topClients}
                getLabel={c => c.name}
                getValue={c => formatMoney(c.revenue)}
              />
              <Section
                title="Canales top revenue"
                items={topChannels}
                getLabel={c => c.name}
                getValue={c => formatMoney(c.revenue)}
              />
            </div>
          </Card>
        );
      })()}

      {/* ============================================
          S15 — INTELIGENCIA DE PRODUCTOS
          Sección con 4 sub-bloques: salud inventario, ABC, marca, ROI ranking.
          Toda la data viene de productIntelligence.js (funciones puras).
          ============================================ */}

      {/* S15.14 — Salud de inventario */}
      <Card style={{ marginBottom: 14 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "#37352F" }}>
          📦 Salud del inventario
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          {[
            { label: "SKUs activos", value: inventoryHealth.skuCount, color: "#37352F" },
            { label: "Con stock", value: `${inventoryHealth.productsWithStock}/${inventoryHealth.skuCount}`, sub: `${inventoryHealth.fillRatePct}% fill rate`, color: inventoryHealth.fillRatePct >= 70 ? "#0F7B6C" : "#CB912F" },
            { label: "Unidades en stock", value: inventoryHealth.stockUnits, color: "#5E6AD2" },
            { label: "Valor stock (USD)", value: formatMoney(inventoryHealth.stockValueUSD, "USD"), color: "#37352F" },
            { label: "Turnover anual", value: inventoryHealth.turnoverAnnualized.toFixed(1) + "x", sub: inventoryHealth.dio !== null ? `DIO: ${inventoryHealth.dio} días` : "Sin compras 90d", color: inventoryHealth.turnoverAnnualized >= 4 ? "#0F7B6C" : "#CB912F" },
            { label: "Dead stock", value: `${inventoryHealth.deadStockCount} SKUs`, sub: `${inventoryHealth.deadStockPct}% del valor`, color: inventoryHealth.deadStockPct >= 20 ? "#E03E3E" : inventoryHealth.deadStockPct >= 10 ? "#CB912F" : "#0F7B6C" },
          ].map((kpi, i) => (
            <div key={i} style={{ padding: 10, background: "#FAFAF9", borderRadius: 8, border: "1px solid #E8E7E3" }}>
              <div style={{ fontSize: 10, color: "#8C8A82", textTransform: "uppercase", fontWeight: 700 }}>{kpi.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: kpi.color, fontFamily: "'Rubik', sans-serif" }}>{kpi.value}</div>
              {kpi.sub && <div style={{ fontSize: 10, color: "#8C8A82", marginTop: 2 }}>{kpi.sub}</div>}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: "#8C8A82", lineHeight: 1.4 }}>
          Turnover = COGS últ. 90d / valor inventario × (365/90). DIO = días en que rotás el stock.
          Dead stock = productos sin venta ≥90d con stock ≥1.
        </div>
      </Card>

      {/* S15.2 — ABC Analysis (Pareto 80/20) */}
      <Card style={{ marginBottom: 14 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "#37352F" }}>
          📊 ABC Analysis — Pareto 80/20
        </h3>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: "#8C8A82" }}>
          A = top productos que acumulan el 80% del revenue · B = siguientes 15% · C = el 5% restante
        </p>
        {(() => {
          const aSet = abcAnalysis.filter(x => x.classification === "A");
          const bSet = abcAnalysis.filter(x => x.classification === "B");
          const cSet = abcAnalysis.filter(x => x.classification === "C");
          return (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
                {[
                  { label: "Clase A (top)", count: aSet.length, color: "#0F7B6C", bg: "#DDEDEA" },
                  { label: "Clase B (medio)", count: bSet.length, color: "#CB912F", bg: "#FEF6E4" },
                  { label: "Clase C (bottom)", count: cSet.length, color: "#8C8A82", bg: "#F5F5F2" },
                ].map((seg, i) => (
                  <div key={i} style={{ padding: 10, background: seg.bg, borderRadius: 8, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: seg.color, fontWeight: 700, textTransform: "uppercase" }}>{seg.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: seg.color, fontFamily: "'Rubik', sans-serif" }}>{seg.count}</div>
                    <div style={{ fontSize: 10, color: seg.color }}>productos</div>
                  </div>
                ))}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      {["#", "Clase", "Producto", "Uds", "Revenue", "% del total", "Acumul."].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontSize: 10, color: "#8C8A82", textTransform: "uppercase", borderBottom: "1px solid #E8E7E3" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {abcAnalysis.slice(0, 20).map((row, i) => {
                      const colors = { A: "#0F7B6C", B: "#CB912F", C: "#8C8A82" };
                      return (
                        <tr key={row.productId}>
                          <td style={{ padding: "5px 8px", color: "#8C8A82", borderBottom: "1px solid #F0EFEB" }}>{i + 1}</td>
                          <td style={{ padding: "5px 8px", borderBottom: "1px solid #F0EFEB" }}>
                            <Badge color={colors[row.classification]}>{row.classification}</Badge>
                          </td>
                          <td style={{ padding: "5px 8px", color: "#37352F", borderBottom: "1px solid #F0EFEB", fontWeight: 600 }}>
                            {row.product?.brand} {row.product?.model} {row.product?.flavor && `· ${row.product.flavor}`}
                          </td>
                          <td style={{ padding: "5px 8px", color: "#555247", borderBottom: "1px solid #F0EFEB" }}>{row.totalQty}</td>
                          <td style={{ padding: "5px 8px", color: "#37352F", borderBottom: "1px solid #F0EFEB", fontWeight: 600 }}>{formatMoney(row.totalRevenueARS)}</td>
                          <td style={{ padding: "5px 8px", color: "#555247", borderBottom: "1px solid #F0EFEB" }}>{row.revenuePct.toFixed(1)}%</td>
                          <td style={{ padding: "5px 8px", color: colors[row.classification], borderBottom: "1px solid #F0EFEB", fontWeight: 600 }}>{row.cumulativePct}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {abcAnalysis.length > 20 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "#8C8A82" }}>...y {abcAnalysis.length - 20} productos más.</div>
                )}
              </div>
            </>
          );
        })()}
      </Card>

      {/* S15.5 — Comparativa rentabilidad por marca */}
      <Card style={{ marginBottom: 14 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "#37352F" }}>
          🏷️ Rentabilidad por marca
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["Marca", "SKUs", "Con stock", "Uds vendidas", "Velocity 30d", "Revenue", "Margen prom.", "Stock USD"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontSize: 10, color: "#8C8A82", textTransform: "uppercase", borderBottom: "1px solid #E8E7E3" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {brandPerformance.map(b => (
                <tr key={b.brand}>
                  <td style={{ padding: "6px 8px", color: BRAND_COLORS[b.brand] || "#37352F", fontWeight: 700, borderBottom: "1px solid #F0EFEB" }}>{b.brand}</td>
                  <td style={{ padding: "6px 8px", color: "#555247", borderBottom: "1px solid #F0EFEB" }}>{b.skuCount}</td>
                  <td style={{ padding: "6px 8px", color: "#555247", borderBottom: "1px solid #F0EFEB" }}>{b.productsWithStock}</td>
                  <td style={{ padding: "6px 8px", color: "#37352F", borderBottom: "1px solid #F0EFEB", fontWeight: 600 }}>{b.totalQty}</td>
                  <td style={{ padding: "6px 8px", color: "#555247", borderBottom: "1px solid #F0EFEB" }}>{b.velocity30dTotal}</td>
                  <td style={{ padding: "6px 8px", color: "#0F7B6C", borderBottom: "1px solid #F0EFEB", fontWeight: 600 }}>{formatMoney(b.totalRevenueARS)}</td>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid #F0EFEB" }}>
                    {b.avgMarginPct !== null ? (
                      <Badge color={b.avgMarginPct >= 50 ? "#0F7B6C" : b.avgMarginPct >= 30 ? "#CB912F" : "#E03E3E"}>{b.avgMarginPct}%</Badge>
                    ) : (
                      <span style={{ color: "#B1AFA7", fontSize: 11 }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "6px 8px", color: "#555247", borderBottom: "1px solid #F0EFEB" }}>{formatMoney(b.stockValueUSD, "USD")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {brandPerformance.length === 0 && (
            <p style={{ color: "#B1AFA7", fontSize: 12, padding: 14 }}>Sin datos para mostrar.</p>
          )}
        </div>
      </Card>

      {/* S15.15 — ROI ranking por unidad × volumen */}
      <Card style={{ marginBottom: 14 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "#37352F" }}>
          💎 ROI ranking — qué te dio más ganancia $
        </h3>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: "#8C8A82" }}>
          Producto × ganancia/unidad × unidades vendidas. El "ROI ranking" combina alta margen + alto volumen — los que más plata te dieron en términos absolutos.
        </p>
        {(() => {
          const ranked = Object.values(productStats)
            .map(s => {
              const margin = calcProductMargin(s.product);
              if (!margin || s.totalQty === 0) return null;
              const profitPerUnit = margin.marginUSD;
              const totalProfit = profitPerUnit * s.totalQty;
              return { ...s, profitPerUnit, totalProfit, marginPct: margin.marginPct, roiPct: margin.roiPct };
            })
            .filter(Boolean)
            .sort((a, b) => b.totalProfit - a.totalProfit)
            .slice(0, 15);
          if (ranked.length === 0) {
            return <p style={{ color: "#B1AFA7", fontSize: 12 }}>Cargá costUSDT en los productos para ver el ranking de ROI.</p>;
          }
          return (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {["#", "Producto", "Uds vend.", "$/ud", "Total $", "Margen", "ROI"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontSize: 10, color: "#8C8A82", textTransform: "uppercase", borderBottom: "1px solid #E8E7E3" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((r, i) => (
                    <tr key={r.productId}>
                      <td style={{ padding: "5px 8px", color: i < 3 ? "#0F7B6C" : "#8C8A82", borderBottom: "1px solid #F0EFEB", fontWeight: 700 }}>{i + 1}</td>
                      <td style={{ padding: "5px 8px", color: "#37352F", borderBottom: "1px solid #F0EFEB", fontWeight: 600 }}>
                        {r.product.brand} {r.product.model} {r.product.flavor && `· ${r.product.flavor}`}
                      </td>
                      <td style={{ padding: "5px 8px", color: "#555247", borderBottom: "1px solid #F0EFEB" }}>{r.totalQty}</td>
                      <td style={{ padding: "5px 8px", color: "#0F7B6C", borderBottom: "1px solid #F0EFEB", fontWeight: 600 }}>{formatMoney(r.profitPerUnit, "USD")}</td>
                      <td style={{ padding: "5px 8px", color: "#0F7B6C", borderBottom: "1px solid #F0EFEB", fontWeight: 700 }}>{formatMoney(r.totalProfit, "USD")}</td>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid #F0EFEB" }}>
                        <Badge color={r.marginPct >= 50 ? "#0F7B6C" : r.marginPct >= 30 ? "#CB912F" : "#E03E3E"}>{r.marginPct}%</Badge>
                      </td>
                      <td style={{ padding: "5px 8px", color: "#555247", borderBottom: "1px solid #F0EFEB" }}>{r.roiPct !== null ? `${r.roiPct}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </Card>

      {/* S15.10 — Cross-sell: matriz de co-ocurrencia */}
      <Card style={{ marginBottom: 14 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "#37352F" }}>
          🤝 Cross-sell — los que compran X también compran Y
        </h3>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: "#8C8A82" }}>
          Productos con mayor co-ocurrencia en ventas. Útil para sugerir combos y bundles. Top 10 productos.
        </p>
        {(() => {
          // Top productos por número total de relaciones de cross-sell
          const ranked = Object.entries(coOccurrence)
            .map(([productId, partners]) => {
              const product = products.find(p => p.id === productId);
              if (!product || product.isDeleted) return null;
              const totalCo = partners.reduce((s, p) => s + p.co, 0);
              return { productId, product, partners, totalCo };
            })
            .filter(Boolean)
            .sort((a, b) => b.totalCo - a.totalCo)
            .slice(0, 10);
          if (ranked.length === 0) {
            return <p style={{ color: "#B1AFA7", fontSize: 12 }}>Sin datos suficientes — necesitás ventas con 2+ productos.</p>;
          }
          return (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
              {ranked.map(r => (
                <div key={r.productId} style={{ padding: 10, background: "#FAFAF9", borderRadius: 8, border: "1px solid #E8E7E3" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: BRAND_COLORS[r.product.brand] || "#37352F", marginBottom: 6 }}>
                    {r.product.brand} {r.product.model} {r.product.flavor && `· ${r.product.flavor}`}
                  </div>
                  <div style={{ fontSize: 11, color: "#8C8A82", marginBottom: 6 }}>
                    Suele ir junto con:
                  </div>
                  {r.partners.map((p, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
                      <span style={{ color: "#37352F", fontWeight: 500 }}>{p.productName}</span>
                      <Badge color="#5E6AD2">{p.co}x</Badge>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        })()}
      </Card>

      {/* S15.11 — Patrones por día de la semana */}
      <Card style={{ marginBottom: 14 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "#37352F" }}>
          📅 Patrones por día de semana
        </h3>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: "#8C8A82" }}>
          Unidades vendidas por día (últimos 90 días). Te dice qué días publicar promo.
        </p>
        {(() => {
          const max = Math.max(1, ...dowPattern.map(d => d.qty));
          const total = dowPattern.reduce((s, d) => s + d.qty, 0);
          const peak = dowPattern.reduce((m, d) => d.qty > m.qty ? d : m, dowPattern[0]);
          if (total === 0) {
            return <p style={{ color: "#B1AFA7", fontSize: 12 }}>Sin ventas en los últimos 90 días.</p>;
          }
          return (
            <>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120, marginBottom: 12 }}>
                {dowPattern.map(d => (
                  <div key={d.dow} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ fontSize: 10, color: "#37352F", fontWeight: 600 }}>{d.qty}</div>
                    <div title={`${d.label}: ${d.qty} uds`} style={{
                      width: "100%",
                      height: `${(d.qty / max) * 90}%`,
                      minHeight: d.qty > 0 ? 4 : 1,
                      background: d.dow === peak.dow ? "#0F7B6C" : "#5E6AD2",
                      borderRadius: "4px 4px 0 0",
                      transition: "height .3s",
                    }} />
                    <div style={{ fontSize: 11, color: d.dow === peak.dow ? "#0F7B6C" : "#8C8A82", fontWeight: d.dow === peak.dow ? 700 : 500 }}>
                      {d.label}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: 10, background: "#DDEDEA", borderRadius: 8, fontSize: 12, color: "#0F7B6C" }}>
                🏆 Día pico: <strong>{peak.label}</strong> con {peak.qty} unidades vendidas en últimos 90 días
                ({total > 0 ? Math.round((peak.qty / total) * 100) : 0}% del total).
              </div>
            </>
          );
        })()}
      </Card>

      {/* S15.13 — Sell-through rate por lote */}
      {sellThroughRates.length > 0 && (
        <Card style={{ marginBottom: 14 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "#37352F" }}>
            🚚 Sell-through rate por lote (compras verificadas)
          </h3>
          <p style={{ margin: "0 0 14px", fontSize: 12, color: "#8C8A82" }}>
            Cuánto del stock comprado ya se vendió. Lotes con STR bajo y ya viejos = candidatos a promo/liquidación.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["Proveedor", "Fecha", "Lote", "Comprado", "Vendido", "STR", "Días en mercado"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontSize: 10, color: "#8C8A82", textTransform: "uppercase", borderBottom: "1px solid #E8E7E3" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sellThroughRates.slice(0, 15).map(s => (
                  <tr key={s.purchaseId}>
                    <td style={{ padding: "6px 8px", color: "#37352F", borderBottom: "1px solid #F0EFEB", fontWeight: 600 }}>{s.supplier}</td>
                    <td style={{ padding: "6px 8px", color: "#555247", borderBottom: "1px solid #F0EFEB" }}>{formatDate(s.date)}</td>
                    <td style={{ padding: "6px 8px", color: "#555247", borderBottom: "1px solid #F0EFEB" }}>{s.loteNumber || "—"}</td>
                    <td style={{ padding: "6px 8px", color: "#555247", borderBottom: "1px solid #F0EFEB" }}>{s.totalQty}</td>
                    <td style={{ padding: "6px 8px", color: "#555247", borderBottom: "1px solid #F0EFEB" }}>{s.totalSold}</td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid #F0EFEB" }}>
                      <Badge color={s.strPct >= 75 ? "#0F7B6C" : s.strPct >= 50 ? "#CB912F" : "#E03E3E"}>{s.strPct}%</Badge>
                    </td>
                    <td style={{ padding: "6px 8px", color: s.daysSinceArrived >= 90 ? "#E03E3E" : "#555247", borderBottom: "1px solid #F0EFEB" }}>
                      {s.daysSinceArrived}d
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Financial summary */}
      <Card style={{ marginBottom: 14 }}>
        <h4 style={{ color: "#fdcb6e", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>Resumen financiero del mes</h4>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(150px, 1fr))", gap: isMobile ? 8 : 12 }}>
          {(() => {
            const thisMonth = new Date().getMonth();
            const thisYear = new Date().getFullYear();
            const mFilter = (d) => { const dt = new Date(d); return dt.getMonth() === thisMonth && dt.getFullYear() === thisYear; };
            const mSales = sales.filter(s => !s.isDeleted && mFilter(s.date));
            const rev = calcTotalRevenue(mSales, exchangeRate);
            const cost = purchases.filter(p => !p.isDeleted && mFilter(p.date)).reduce((sum, p) => sum + (p.totalCostARS || (p.totalUSDT || 0) * exchangeRate), 0);
            const exp = expenses.filter(e => !e.isDeleted && mFilter(e.date)).reduce((sum, e) => sum + (e.amountARS || 0), 0);
            const discounts = sales.filter(s => !s.isDeleted && mFilter(s.date)).reduce((sum, s) => sum + (s.discountAmount || 0), 0);
            const consumed = (withdrawals || []).filter(w => !w.isDeleted && mFilter(w.date)).reduce((sum, w) => sum + w.qty, 0);
            return (<>
              <div><span style={{ color: "#8C8A82", fontSize: 12 }}>Ingresos</span><div style={{ color: "#00b894", fontSize: 20, fontWeight: 700 }}>{formatMoney(rev)}</div></div>
              <div><span style={{ color: "#8C8A82", fontSize: 12 }}>Costos</span><div style={{ color: "#E03E3E", fontSize: 20, fontWeight: 700 }}>{formatMoney(cost)}</div></div>
              <div><span style={{ color: "#8C8A82", fontSize: 12 }}>Gastos</span><div style={{ color: "#fdcb6e", fontSize: 20, fontWeight: 700 }}>{formatMoney(exp)}</div></div>
              <div><span style={{ color: "#8C8A82", fontSize: 12 }}>Descuentos</span><div style={{ color: "#fdcb6e", fontSize: 20, fontWeight: 700 }}>{formatMoney(discounts)}</div></div>
              <div><span style={{ color: "#8C8A82", fontSize: 12 }}>Consumo</span><div style={{ color: "#e17055", fontSize: 20, fontWeight: 700 }}>{consumed} uds</div></div>
              <div><span style={{ color: "#8C8A82", fontSize: 12 }}>Ganancia est.</span><div style={{ color: "#5E6AD2", fontSize: 20, fontWeight: 700 }}>{formatMoney(rev - cost - exp)}</div></div>
            </>);
          })()}
        </div>
      </Card>

      {/* Break-even analysis */}
      <Card style={{ marginBottom: 14 }}>
        <h4 style={{ color: "#5E6AD2", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>Punto de equilibrio</h4>
        {(() => {
          const thisMonth = new Date().getMonth();
          const thisYear = new Date().getFullYear();
          const mFilter = (d) => { const dt = new Date(d); return dt.getMonth() === thisMonth && dt.getFullYear() === thisYear; };
          const monthSales = sales.filter(s => !s.isDeleted && mFilter(s.date));
          const fixedCosts = expenses.filter(e => !e.isDeleted && mFilter(e.date)).reduce((sum, e) => sum + (e.amountARS || 0), 0);
          const totalUnits = monthSales.reduce((s, sale) => s + (sale.items || []).reduce((s2, i) => s2 + (i.qty || 0), 0), 0);
          const totalRevenue = monthSales.reduce((s, sale) => s + (sale.total || 0), 0);
          const avgPricePerUnit = totalUnits > 0 ? totalRevenue / totalUnits : 0;
          const activeProds = products.filter(p => !p.isDeleted && (p.costUSDT || p.priceUSD));
          const avgCostPerUnit = activeProds.reduce((s, p) => s + ((p.costUSDT || (p.priceUSD * 0.55)) * exchangeRate), 0) / Math.max(activeProds.length, 1);
          const marginPerUnit = avgPricePerUnit - avgCostPerUnit;
          const breakEvenUnits = marginPerUnit > 0 ? Math.ceil(fixedCosts / marginPerUnit) : 0;
          const breakEvenARS = breakEvenUnits * avgPricePerUnit;
          const progress = breakEvenUnits > 0 ? Math.min(100, (totalUnits / breakEvenUnits) * 100) : 100;
          const reached = totalUnits >= breakEvenUnits;

          return (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(140px, 1fr))", gap: isMobile ? 8 : 12, marginBottom: 14 }}>
                <div><span style={{ color: "#8C8A82", fontSize: 12 }}>Gastos fijos mes</span><div style={{ color: "#E03E3E", fontSize: 18, fontWeight: 700 }}>{formatMoney(fixedCosts)}</div></div>
                <div><span style={{ color: "#8C8A82", fontSize: 12 }}>Precio prom/ud</span><div style={{ color: "#37352F", fontSize: 18, fontWeight: 700 }}>{formatMoney(avgPricePerUnit)}</div></div>
                <div><span style={{ color: "#8C8A82", fontSize: 12 }}>Costo prom/ud</span><div style={{ color: "#fdcb6e", fontSize: 18, fontWeight: 700 }}>{formatMoney(avgCostPerUnit)}</div></div>
                <div><span style={{ color: "#8C8A82", fontSize: 12 }}>Margen/ud</span><div style={{ color: "#0F7B6C", fontSize: 18, fontWeight: 700 }}>{formatMoney(marginPerUnit)}</div></div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#555247", marginBottom: 4 }}>
                  <span>Vendiste <b>{totalUnits}</b> uds este mes</span>
                  <span>Necesitás <b>{breakEvenUnits}</b> para cubrir gastos</span>
                </div>
                <div style={{ height: 10, background: "#E8E7E3", borderRadius: 5, overflow: "hidden" }}>
                  <div style={{ width: `${progress}%`, height: "100%", background: reached ? "#0F7B6C" : "#5E6AD2", borderRadius: 5, transition: "width 0.5s" }} />
                </div>
              </div>
              <div style={{ textAlign: "center", fontSize: 14, fontWeight: 700, color: reached ? "#0F7B6C" : "#CB912F" }}>
                {reached ? "✅ Punto de equilibrio alcanzado" : `Faltan ${breakEvenUnits - totalUnits} unidades para cubrir gastos`}
              </div>
            </div>
          );
        })()}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 14 }}>
        {/* Sales by brand - bar chart */}
        <Card>
          <h4 style={{ color: "#a855f7", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>📊 Ventas por Marca</h4>
          <BarChart data={brandStats.map(([brand, data]) => ({ label: brand, value: data.sold, color: brandColors[brand] || "#a855f7" }))} labelKey="label" valueKey="value" colorKey="color" suffix=" uds" />
        </Card>

        {/* Stock distribution - donut */}
        <Card>
          <h4 style={{ color: "#00cec9", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>🍩 Stock por Marca</h4>
          <DonutChart data={stockByBrand.map(([brand, qty]) => ({ label: brand, value: qty, color: brandColors[brand] || "#a855f7" }))} />
        </Card>

        {/* Sales by channel - bar chart */}
        <Card>
          <h4 style={{ color: "#25d366", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>📊 Ventas por Canal</h4>
          <BarChart data={channelStats.map(([ch, data]) => ({ label: ch, value: data.count, color: channelColors[ch] || "#a855f7" }))} labelKey="label" valueKey="value" colorKey="color" suffix="" />
        </Card>

        {/* Revenue by payment method - bar chart */}
        <Card>
          <h4 style={{ color: "#00b2ff", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>💳 Ingresos por Método de Pago</h4>
          <BarChart data={paymentStats.map(([pm, data]) => ({ label: pm, value: Math.round(data.revenue), color: paymentColors[pm] || "#a855f7" }))} labelKey="label" valueKey="value" colorKey="color" />
        </Card>
      </div>

      {/* Top flavors */}
      <Card style={{ marginBottom: 14 }}>
        <h4 style={{ color: "#E03E3E", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>🏆 Top 10 Sabores más vendidos</h4>
        <BarChart data={topFlavors.map(([name, data]) => ({ label: name, value: data.sold, color: brandColors[data.brand] || "#a855f7" }))} labelKey="label" valueKey="value" colorKey="color" suffix=" uds" />
      </Card>

      {/* Margin analysis */}
      <Card style={{ marginBottom: 14 }}>
        <h4 style={{ color: "#00b894", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>💰 Margen Real por Modelo</h4>
        {(() => {
          // Calculate average cost per model from verified purchases
          const costData = {};
          purchases.filter(p => p.status === "verificado" || !p.status).forEach(p => {
            const totalItems = (p.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
            const extraCostPerUnit = totalItems > 0 ? ((p.paseroCostARS || 0) + (p.envioCostARS || 0)) / totalItems : 0;
            const suppCommPerUnit = totalItems > 0 && p.supplierCommUSDT ? (p.supplierCommUSDT / totalItems) : 0;
            (p.items || []).forEach(item => {
              const prod = products.find(pr => pr.id === item.productId);
              if (!prod) return;
              const key = `${prod.brand}|||${prod.model}`;
              if (!costData[key]) costData[key] = { brand: prod.brand, model: prod.model, priceUSD: prod.priceUSD, totalCostUSDT: 0, totalExtraCostARS: 0, totalUnits: 0 };
              costData[key].totalCostUSDT += ((Number(item.unitCostUSDT) || 0) + suppCommPerUnit) * (Number(item.qty) || 0);
              costData[key].totalExtraCostARS += extraCostPerUnit * (Number(item.qty) || 0);
              costData[key].totalUnits += Number(item.qty) || 0;
            });
          });

          const margins = Object.values(costData).map(d => {
            const avgCostUSDT = d.totalUnits > 0 ? d.totalCostUSDT / d.totalUnits : 0;
            const avgExtraARS = d.totalUnits > 0 ? d.totalExtraCostARS / d.totalUnits : 0;
            const totalCostARS = Math.round(avgCostUSDT * exchangeRate + avgExtraARS);
            const salePriceARS = Math.round(d.priceUSD * exchangeRate);
            const marginARS = salePriceARS - totalCostARS;
            const marginPct = salePriceARS > 0 ? Math.round(marginARS / salePriceARS * 100) : 0;
            // ROI = ganancia / costo. Mide retorno sobre la inversión, no margen sobre revenue.
            const roiPct = totalCostARS > 0 ? Math.round((marginARS / totalCostARS) * 100) : 0;
            return { ...d, avgCostUSDT: Math.round(avgCostUSDT * 100) / 100, totalCostARS, salePriceARS, marginARS, marginPct, roiPct };
          }).sort((a, b) => b.marginPct - a.marginPct);

          if (margins.length === 0) return <p style={{ color: "#555", fontSize: 13 }}>Registrá compras verificadas para ver márgenes reales.</p>;

          return (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Marca", "Modelo", "Costo prom. USDT", "Costo total/ud ARS", "Precio venta ARS", "Margen/ud", "Margen %", "ROI %"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: "#8C8A82", textTransform: "uppercase", borderBottom: "1px solid #E8E7E3", fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {margins.map((m, i) => (
                    <tr key={i}>
                      <td style={{ padding: "8px 10px", fontSize: 13, color: "#555247", borderBottom: "1px solid #F0EFEB" }}><Badge color={BRAND_COLORS[m.brand] || "#5E6AD2"}>{m.brand}</Badge></td>
                      <td style={{ padding: "8px 10px", fontSize: 13, color: "#555247", borderBottom: "1px solid #F0EFEB" }}>{m.model}</td>
                      <td style={{ padding: "8px 10px", fontSize: 13, color: "#555247", borderBottom: "1px solid #F0EFEB" }}>{formatMoney(m.avgCostUSDT, "USDT")}</td>
                      <td style={{ padding: "8px 10px", fontSize: 13, color: "#E03E3E", borderBottom: "1px solid #F0EFEB", fontWeight: 600 }}>{formatMoney(m.totalCostARS)}</td>
                      <td style={{ padding: "8px 10px", fontSize: 13, color: "#555247", borderBottom: "1px solid #F0EFEB" }}>{formatMoney(m.salePriceARS)}</td>
                      <td style={{ padding: "8px 10px", fontSize: 13, borderBottom: "1px solid #F0EFEB", fontWeight: 700, color: m.marginARS >= 0 ? "#00b894" : "#E03E3E" }}>{formatMoney(m.marginARS)}</td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid #F0EFEB" }}><Badge color={m.marginPct >= 50 ? "#00b894" : m.marginPct >= 30 ? "#fdcb6e" : "#E03E3E"}>{m.marginPct}%</Badge></td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid #F0EFEB" }}><Badge color={m.roiPct >= 100 ? "#00b894" : m.roiPct >= 50 ? "#fdcb6e" : "#E03E3E"}>{m.roiPct}%</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 10, color: "#555", fontSize: 11 }}>* Costo incluye: precio USDT + comisión proveedor + pasero + envío prorrateado por unidad</div>
            </div>
          );
        })()}
      </Card>

      {/* Rentabilidad por Marca — agregado de margen, volumen y revenue */}
      <Card style={{ marginBottom: 14 }}>
        <h4 style={{ color: "#00b894", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>💰 Rentabilidad por Marca</h4>
        {(() => {
          // Acumular costo promedio USD por producto (de compras verificadas, prorrateando pasero+envío)
          const prodCostUSD = {}; // productId -> avg cost USD per unit
          purchases.filter(p => !p.isDeleted && (p.status === "verificado" || !p.status)).forEach(p => {
            const totalItems = (p.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
            const extraARSperUnit = totalItems > 0 ? ((p.paseroCostARS || 0) + (p.envioCostARS || 0)) / totalItems : 0;
            const suppCommPerUnit = totalItems > 0 && p.supplierCommUSDT ? (p.supplierCommUSDT / totalItems) : 0;
            (p.items || []).forEach(it => {
              const rate = exchangeRate || 1;
              const costUSD = (Number(it.unitCostUSDT) || 0) + suppCommPerUnit + (rate > 0 ? extraARSperUnit / rate : 0);
              if (!prodCostUSD[it.productId]) prodCostUSD[it.productId] = { sum: 0, count: 0 };
              prodCostUSD[it.productId].sum += costUSD * (Number(it.qty) || 0);
              prodCostUSD[it.productId].count += Number(it.qty) || 0;
            });
          });

          // Agregar por marca desde ventas
          const byBrand = {};
          sales.filter(s => !s.isDeleted).forEach(s => {
            const rate = s.exchangeRate || exchangeRate || 0;
            (s.items || []).forEach(it => {
              const prod = products.find(p => p.id === it.productId);
              if (!prod) return;
              const qty = Number(it.qty) || 1;
              const unitPrice = Number(it.customPrice) || prod.priceUSD || 0; // USD
              const revenueUSD = unitPrice * qty;
              const revenueARS = s.currency === "ARS" ? (unitPrice * qty * rate) : (unitPrice * qty * rate);
              const avgCost = prodCostUSD[it.productId] && prodCostUSD[it.productId].count > 0
                ? prodCostUSD[it.productId].sum / prodCostUSD[it.productId].count
                : (prod.costUSDT || prod.priceUSD * 0.55);
              const costUSD = avgCost * qty;

              if (!byBrand[prod.brand]) byBrand[prod.brand] = { brand: prod.brand, units: 0, revenueUSD: 0, costUSD: 0, salesCount: 0 };
              byBrand[prod.brand].units += qty;
              byBrand[prod.brand].revenueUSD += revenueUSD;
              byBrand[prod.brand].costUSD += costUSD;
            });
          });

          const rows = Object.values(byBrand).map(b => {
            const margin = b.revenueUSD - b.costUSD;
            const pct = b.revenueUSD > 0 ? (margin / b.revenueUSD) * 100 : 0;
            const avgTicket = b.units > 0 ? b.revenueUSD / b.units : 0;
            return { ...b, margin, pct, avgTicket };
          }).sort((a, b) => b.revenueUSD - a.revenueUSD);

          if (rows.length === 0) {
            return <p style={{ color: "#555", fontSize: 13 }}>Cargá ventas con productos activos para ver rentabilidad por marca.</p>;
          }

          const totalRevenueUSD = rows.reduce((s, r) => s + r.revenueUSD, 0);

          return (
            <>
              <p style={{ color: "#8C8A82", fontSize: 12, margin: "0 0 14px" }}>
                Margen = revenue − costo real (USDT pagado + comisión + pasero + envío prorrateados). Ordenado por revenue descendente.
              </p>
              <div style={{ overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#8C8A82", borderBottom: "1px solid #E8E7E3" }}>
                      <th style={{ padding: "8px 10px", fontWeight: 600 }}>Marca</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>Uds</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>Revenue</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>Costo</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>Margen</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>%</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>Ticket avg</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>% total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.brand} style={{ borderBottom: "1px solid #F0EFEB" }}>
                        <td style={{ padding: "8px 10px", color: "#37352F", fontWeight: 700 }}>{r.brand}</td>
                        <td style={{ padding: "8px 10px", color: "#8C8A82", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.units}</td>
                        <td style={{ padding: "8px 10px", color: "#37352F", fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatMoney(r.revenueUSD, "USD")}</td>
                        <td style={{ padding: "8px 10px", color: "#8C8A82", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatMoney(r.costUSD, "USD")}</td>
                        <td style={{ padding: "8px 10px", color: r.margin >= 0 ? "#0F7B6C" : "#E03E3E", fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatMoney(r.margin, "USD")}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }}>
                          <span style={{
                            padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                            background: r.pct >= 50 ? "#DDEDEA" : r.pct >= 30 ? "#FDECC8" : "#FBE4E4",
                            color: r.pct >= 50 ? "#0F7B6C" : r.pct >= 30 ? "#CB912F" : "#E03E3E",
                          }}>{r.pct.toFixed(0)}%</span>
                        </td>
                        <td style={{ padding: "8px 10px", color: "#8C8A82", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatMoney(r.avgTicket, "USD")}</td>
                        <td style={{ padding: "8px 10px", color: "#8C8A82", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{totalRevenueUSD > 0 ? Math.round(r.revenueUSD / totalRevenueUSD * 100) : 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 10, color: "#555", fontSize: 11 }}>
                * Costo estimado: usa costo promedio de compras verificadas del producto; si no hay, fallback costUSDT o 55% de priceUSD.
              </div>
            </>
          );
        })()}
      </Card>

      {/* Monthly evolution */}
      {monthlySales.length > 0 && (
        <Card>
          <h4 style={{ color: "#5E6AD2", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>📈 Evolución Mensual</h4>
          <BarChart data={monthlySales.map(m => ({ label: m.label, value: m.count, color: "#5E6AD2" }))} labelKey="label" valueKey="value" colorKey="color" suffix=" ventas" />
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #F0EFEB" }}>
            <span style={{ color: "#8C8A82", fontSize: 12, textTransform: "uppercase" }}>Ingresos mensuales</span>
            <BarChart data={monthlySales.map(m => ({ label: m.label, value: Math.round(m.revenue), color: "#00b894" }))} labelKey="label" valueKey="value" colorKey="color" />
          </div>
        </Card>
      )}

      {/* Balance General */}
      <Card style={{ marginBottom: 14 }}>
        <h4 style={{ color: "#a855f7", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>📊 Balance General</h4>
        {(() => {
          // ACTIVOS
          const stockValue = products.reduce((s, p) => s + (p.stock || 0) * p.priceUSD * exchangeRate, 0);
          const stockUnits = products.reduce((s, p) => s + (p.stock || 0), 0);
          
          // Cash from INITIAL_BALANCES + sales - purchases - expenses
          const IB = { lemonPesos: 273646.62, lemonUSDT: 40.12, mpDiego: 0, mpGustavo: 0, usdCash: 0, pesosCash: 0 };
          const totalCashARS = IB.lemonPesos + IB.pesosCash + IB.mpDiego + IB.mpGustavo
            + sales.filter(s => s.currency !== "USD" && s.paymentMethod !== "USDT").reduce((s, sale) => s + (sale.total || 0), 0)
            - expenses.reduce((s, e) => s + (e.amountARS || 0), 0)
            - purchases.reduce((s, p) => s + (p.paseroCostARS || 0) + (p.envioCostARS || 0), 0);
          const totalCashUSDT = IB.lemonUSDT
            + sales.filter(s => s.paymentMethod === "USDT").reduce((s, sale) => s + (sale.total || 0), 0)
            - purchases.filter(p => p.status === "verificado" || !p.status).reduce((s, p) => s + (p.totalUSDTpaid || p.totalUSDT || 0), 0);
          const totalCashUSD = IB.usdCash + sales.filter(s => s.paymentMethod === "USD Cash").reduce((s, sale) => s + (sale.total || 0), 0);
          
          const totalAssets = stockValue + totalCashARS + (totalCashUSD * exchangeRate) + (totalCashUSDT * exchangeRate);
          
          // Revenue & costs
          const totalRevenue = sales.reduce((s, sale) => {
            if (sale.currency === "USD") return s + sale.total * exchangeRate;
            if (sale.currency === "USDT") return s + sale.total * exchangeRate;
            return s + (sale.total || 0);
          }, 0);
          const totalCosts = purchases.reduce((s, p) => s + (p.totalCostARS || 0), 0);
          const totalExpenses = expenses.reduce((s, e) => s + (e.amountARS || 0), 0);
          const consumoValue = (withdrawals || []).filter(w => !w.isDeleted).reduce((s, w) => s + Number(w.costRealUSD || w.costEstimateUSD || 0), 0) * exchangeRate;
          
          return (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 12 : 20 }}>
              <div>
                <div style={{ color: "#00b894", fontSize: 13, fontWeight: 700, marginBottom: 10, textTransform: "uppercase" }}>Activos</div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F0EFEB" }}>
                  <span style={{ color: "#8C8A82", fontSize: 13 }}>Stock en mercadería ({stockUnits} uds)</span>
                  <span style={{ color: "#37352F", fontWeight: 600 }}>{formatMoney(stockValue)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F0EFEB" }}>
                  <span style={{ color: "#8C8A82", fontSize: 13 }}>Efectivo ARS</span>
                  <span style={{ color: "#37352F", fontWeight: 600 }}>{formatMoney(Math.max(0, totalCashARS))}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F0EFEB" }}>
                  <span style={{ color: "#8C8A82", fontSize: 13 }}>USDT</span>
                  <span style={{ color: "#37352F", fontWeight: 600 }}>{formatMoney(Math.max(0, totalCashUSDT), "USDT")} (~{formatMoney(Math.max(0, totalCashUSDT) * exchangeRate)})</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F0EFEB" }}>
                  <span style={{ color: "#8C8A82", fontSize: 13 }}>USD Cash</span>
                  <span style={{ color: "#37352F", fontWeight: 600 }}>{formatMoney(totalCashUSD, "USD")} (~{formatMoney(totalCashUSD * exchangeRate)})</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "2px solid #E8E7E3", marginTop: 6 }}>
                  <span style={{ color: "#00b894", fontSize: 15, fontWeight: 700 }}>Total Activos (est.)</span>
                  <span style={{ color: "#00b894", fontSize: 18, fontWeight: 800 }}>{formatMoney(totalAssets)}</span>
                </div>
              </div>
              <div>
                <div style={{ color: "#5E6AD2", fontSize: 13, fontWeight: 700, marginBottom: 10, textTransform: "uppercase" }}>Resultados acumulados</div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F0EFEB" }}>
                  <span style={{ color: "#8C8A82", fontSize: 13 }}>Ingresos por ventas</span>
                  <span style={{ color: "#00b894", fontWeight: 600 }}>{formatMoney(totalRevenue)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F0EFEB" }}>
                  <span style={{ color: "#8C8A82", fontSize: 13 }}>Costo mercadería</span>
                  <span style={{ color: "#E03E3E", fontWeight: 600 }}>-{formatMoney(totalCosts)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F0EFEB" }}>
                  <span style={{ color: "#8C8A82", fontSize: 13 }}>Gastos operativos</span>
                  <span style={{ color: "#E03E3E", fontWeight: 600 }}>-{formatMoney(totalExpenses)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F0EFEB" }}>
                  <span style={{ color: "#8C8A82", fontSize: 13 }}>Consumo propio (merma)</span>
                  <span style={{ color: "#e17055", fontWeight: 600 }}>-{formatMoney(consumoValue)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "2px solid #E8E7E3", marginTop: 6 }}>
                  <span style={{ color: "#5E6AD2", fontSize: 15, fontWeight: 700 }}>Resultado neto</span>
                  <span style={{ color: totalRevenue - totalCosts - totalExpenses - consumoValue >= 0 ? "#00b894" : "#E03E3E", fontSize: 18, fontWeight: 800 }}>
                    {formatMoney(totalRevenue - totalCosts - totalExpenses - consumoValue)}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}
      </Card>

      {/* ============================================ */}
      {/* MERMAS — sección dedicada (PARTE 6)         */}
      {/* ============================================ */}
      <Card style={{ marginBottom: 14 }}>
        <h4 style={{ color: "#e17055", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase", letterSpacing: 0.6 }}>
          📉 Mermas
        </h4>
        {(() => {
          const allW = (withdrawals || []).filter(w => !w.isDeleted);
          const now = new Date();
          const monthW = allW.filter(w => {
            const d = new Date(w.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          });

          // 6.1 — KPIs del mes
          const totalQty = monthW.reduce((s, w) => s + (w.qty || 0), 0);
          const totalUSD = monthW.reduce((s, w) => s + wCost(w), 0);
          const totalARS = totalUSD * (exchangeRate || 0);
          const diegoQty = monthW.filter(w => w.person === "Diego").reduce((s, w) => s + (w.qty || 0), 0);
          const diegoUSD = monthW.filter(w => w.person === "Diego").reduce((s, w) => s + wCost(w), 0);
          const gusQty = monthW.filter(w => w.person === "Gustavo").reduce((s, w) => s + (w.qty || 0), 0);
          const gusUSD = monthW.filter(w => w.person === "Gustavo").reduce((s, w) => s + wCost(w), 0);

          // Por tipo (donut)
          const byType = WITHDRAW_TYPES.map(t => ({
            label: t,
            qty: monthW.filter(w => w.withdrawType === t).reduce((s, w) => s + (w.qty || 0), 0),
            usd: monthW.filter(w => w.withdrawType === t).reduce((s, w) => s + wCost(w), 0),
            color: TYPE_COLOR[t] || "#8C8A82",
          })).filter(x => x.qty > 0);
          const totalForDonut = byType.reduce((s, x) => s + x.qty, 0) || 1;

          // 6.2 — Top 5 productos más merma'do (qty)
          const byProd = {};
          allW.forEach(w => {
            const p = products.find(pr => pr.id === w.productId);
            const key = p ? `${p.brand} ${p.model} - ${p.flavor}` : `(${w.productId})`;
            if (!byProd[key]) byProd[key] = { qty: 0, usd: 0 };
            byProd[key].qty += (w.qty || 0);
            byProd[key].usd += wCost(w);
          });
          const top5 = Object.entries(byProd).sort((a, b) => b[1].qty - a[1].qty).slice(0, 5);
          const topMaxQty = Math.max(1, ...top5.map(([, v]) => v.qty));

          // 6.3 — Tendencia 6 meses (qty stacked por tipo)
          const last6 = [];
          for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthIdx = d.getMonth();
            const yearIdx = d.getFullYear();
            const wMes = allW.filter(w => { const wd = new Date(w.date); return wd.getMonth() === monthIdx && wd.getFullYear() === yearIdx; });
            const stack = WITHDRAW_TYPES.map(t => ({
              type: t,
              qty: wMes.filter(w => w.withdrawType === t).reduce((s, w) => s + (w.qty || 0), 0),
              color: TYPE_COLOR[t] || "#8C8A82",
            }));
            last6.push({
              label: d.toLocaleDateString("es-AR", { month: "short" }),
              total: wMes.reduce((s, w) => s + (w.qty || 0), 0),
              stack,
            });
          }
          const maxBar = Math.max(1, ...last6.map(m => m.total));

          // 6.4 — Alerta si mes actual > 50% sobre el promedio de los 3 anteriores
          const last3 = last6.slice(-4, -1); // 3 anteriores al actual
          const avgPrev = last3.length > 0 ? last3.reduce((s, m) => s + m.total, 0) / last3.length : 0;
          const currMonth = last6[last6.length - 1]?.total || 0;
          const isHigh = avgPrev > 0 && currMonth > avgPrev * 1.5;

          // Reclamables al proveedor (acumulado, todos los meses)
          const reclamables = allW.filter(w => w.reclamableProveedor);
          const reclamablesUSD = reclamables.reduce((s, w) => s + wCost(w), 0);
          const reclamablesQty = reclamables.reduce((s, w) => s + (w.qty || 0), 0);

          return (
            <>
              {/* Alerta consumo alto */}
              {isHigh && (
                <div style={{
                  padding: "10px 14px", borderRadius: 10, marginBottom: 14,
                  background: "#FBE4E4", border: "1px solid #F1B8B6",
                  fontSize: 13, color: "#E03E3E", fontWeight: 600,
                }}>
                  ⚠️ Mes actual ({currMonth} uds) está {Math.round((currMonth / avgPrev - 1) * 100)}% por encima del promedio de los últimos 3 meses ({avgPrev.toFixed(1)} uds prom). Revisá si es estacional o hay algo raro.
                </div>
              )}

              {/* KPIs del mes */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
                <div style={{ background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#8C8A82", textTransform: "uppercase", letterSpacing: 0.5 }}>Mes — total</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#37352F", marginTop: 2 }}>{totalQty} uds</div>
                  <div style={{ fontSize: 11, color: "#8C8A82", marginTop: 2 }}>{formatMoney(totalUSD, "USD")} · {formatMoney(Math.round(totalARS))}</div>
                </div>
                <div style={{ background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#8C8A82", textTransform: "uppercase", letterSpacing: 0.5 }}>Diego</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#a855f7", marginTop: 2 }}>{diegoQty} uds</div>
                  <div style={{ fontSize: 11, color: "#8C8A82", marginTop: 2 }}>{formatMoney(diegoUSD, "USD")}</div>
                </div>
                <div style={{ background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#8C8A82", textTransform: "uppercase", letterSpacing: 0.5 }}>Gustavo</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#00b894", marginTop: 2 }}>{gusQty} uds</div>
                  <div style={{ fontSize: 11, color: "#8C8A82", marginTop: 2 }}>{formatMoney(gusUSD, "USD")}</div>
                </div>
                <div style={{ background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#8C8A82", textTransform: "uppercase", letterSpacing: 0.5 }}>Reclamable proveedor</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#CB912F", marginTop: 2 }}>{reclamablesQty} uds</div>
                  <div style={{ fontSize: 11, color: "#8C8A82", marginTop: 2 }}>{formatMoney(reclamablesUSD, "USD")} pedido próximo</div>
                </div>
              </div>

              {/* Donut por tipo + leyenda */}
              {byType.length > 0 && (
                <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 16, alignItems: "center", marginBottom: 16, padding: 12, background: "#FAFAF9", borderRadius: 10, border: "1px solid #E8E7E3" }}>
                  {/* SVG donut */}
                  <svg width={120} height={120} viewBox="0 0 120 120" style={{ flexShrink: 0 }}>
                    {(() => {
                      const cx = 60, cy = 60, r = 45;
                      const circ = 2 * Math.PI * r;
                      let acc = 0;
                      return byType.map((seg, i) => {
                        const pct = seg.qty / totalForDonut;
                        const dash = pct * circ;
                        const offset = -acc * circ;
                        acc += pct;
                        return (
                          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={18}
                            strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={offset}
                            transform={`rotate(-90 ${cx} ${cy})`} />
                        );
                      });
                    })()}
                    <text x={60} y={58} textAnchor="middle" fontSize={20} fontWeight="800" fill="#37352F">{totalForDonut}</text>
                    <text x={60} y={74} textAnchor="middle" fontSize={10} fill="#8C8A82">uds totales</text>
                  </svg>
                  {/* Leyenda */}
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                    {byType.map(seg => (
                      <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 12, height: 12, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: "#37352F", flex: 1, minWidth: 0 }}>{seg.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#37352F", fontVariantNumeric: "tabular-nums" }}>{seg.qty} uds</span>
                        <span style={{ fontSize: 11, color: "#8C8A82", fontVariantNumeric: "tabular-nums", minWidth: 60, textAlign: "right" }}>{formatMoney(seg.usd, "USD")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top 5 productos */}
              {top5.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#8C8A82", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                    Top 5 productos más merma'dos (histórico)
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {top5.map(([name, v], i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, color: "#555247", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                        <div style={{ width: isMobile ? 120 : 200, height: 18, background: "#F0EFEB", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ width: `${(v.qty / topMaxQty) * 100}%`, height: "100%", background: "linear-gradient(90deg, #e17055aa, #e17055)", borderRadius: 4 }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#E03E3E", minWidth: 40, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{v.qty}</span>
                        <span style={{ fontSize: 11, color: "#8C8A82", minWidth: 70, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatMoney(v.usd, "USD")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tendencia 6 meses */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#8C8A82", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                  Tendencia últimos 6 meses (uds, stacked por tipo)
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120, padding: "6px 0", borderBottom: "1px solid #E8E7E3" }}>
                  {last6.map((m, i) => (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%" }}>
                      <div style={{ flex: 1, width: "100%", display: "flex", flexDirection: "column-reverse", justifyContent: "flex-start" }}>
                        {m.stack.map((seg, j) => seg.qty > 0 && (
                          <div key={j} style={{
                            background: seg.color,
                            height: `${(seg.qty / maxBar) * 100}%`,
                            borderRadius: j === m.stack.findIndex(s => s.qty > 0) ? "4px 4px 0 0" : 0,
                            transition: "height 0.3s",
                          }} title={`${seg.type}: ${seg.qty} uds`} />
                        ))}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#37352F", fontVariantNumeric: "tabular-nums" }}>{m.total}</div>
                      <div style={{ fontSize: 10, color: "#8C8A82", textTransform: "capitalize" }}>{m.label.replace(".", "")}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          );
        })()}
      </Card>

      {/* ============================================ */}
      {/* CALIDAD DE PRODUCTOS — solo garantías         */}
      {/* ============================================ */}
      <Card style={{ marginBottom: 14 }}>
        <h4 style={{ color: "#CB912F", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase", letterSpacing: 0.6 }}>
          🛡️ Calidad de productos
        </h4>
        {(() => {
          const allW = (withdrawals || []).filter(w => !w.isDeleted);
          const garantias = allW.filter(w => isGarantia(w.withdrawType));
          if (garantias.length === 0) {
            return (
              <div style={{ textAlign: "center", padding: 24, color: "#8C8A82", fontSize: 13 }}>
                Aún no hay cambios por garantía registrados — los KPIs de calidad
                van a aparecer acá cuando empieces a cargarlos.
              </div>
            );
          }

          // 5.1 Top 5 modelos con más fallas (por failedProductId)
          const failureByModel = {};
          garantias.forEach(w => {
            const fid = w.failedProductId || w.productId;
            if (!fid) return;
            const p = products.find(pr => pr.id === fid);
            if (!p) return;
            const key = `${p.brand} ${p.model}`;
            if (!failureByModel[key]) failureByModel[key] = { qty: 0, usd: 0, productIds: new Set() };
            failureByModel[key].qty += w.qty || 0;
            failureByModel[key].usd += wCost(w);
            failureByModel[key].productIds.add(fid);
          });
          // Calcular ventas totales por modelo para la tasa
          const salesByModel = {};
          (sales || []).filter(s => !s.isDeleted).forEach(s => {
            (s.items || []).forEach(it => {
              const p = products.find(pr => pr.id === it.productId);
              if (!p) return;
              const key = `${p.brand} ${p.model}`;
              salesByModel[key] = (salesByModel[key] || 0) + (Number(it.qty) || 0);
            });
          });
          const top5Failed = Object.entries(failureByModel)
            .map(([key, v]) => ({ key, ...v, ventas: salesByModel[key] || 0, tasa: salesByModel[key] > 0 ? (v.qty / salesByModel[key]) * 100 : 0 }))
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 5);
          const maxFailureQty = Math.max(1, ...top5Failed.map(x => x.qty));

          // 5.2 Razones más comunes
          const byReason = {};
          garantias.forEach(w => {
            if (!w.failureReason) return;
            byReason[w.failureReason] = (byReason[w.failureReason] || 0) + 1;
          });
          const reasonEntries = Object.entries(byReason).sort((a, b) => b[1] - a[1]);
          const totalReasons = reasonEntries.reduce((s, [, n]) => s + n, 0);
          const reasonCatColor = {
            electrico: "#E03E3E", liquido: "#2383E2",
            fisico: "#CB912F", envio: "#6940A5", otro: "#8C8A82",
          };

          // 5.3 % reclamables al proveedor
          const reclamables = garantias.filter(w => w.reclamableProveedor);
          const pctReclamables = garantias.length > 0 ? (reclamables.length / garantias.length) * 100 : 0;

          // 5.4 Evolución mensual últimos 6 meses
          const now = new Date();
          const months = [];
          for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthIdx = d.getMonth();
            const yearIdx = d.getFullYear();
            const count = garantias.filter(w => {
              const wd = new Date(w.date);
              return wd.getMonth() === monthIdx && wd.getFullYear() === yearIdx;
            }).length;
            months.push({
              label: d.toLocaleDateString("es-AR", { month: "short" }),
              count,
            });
          }
          const maxMonth = Math.max(1, ...months.map(m => m.count));

          return (
            <>
              {/* KPI: % reclamables al proveedor */}
              <div style={{
                padding: "12px 14px", borderRadius: 10, marginBottom: 14,
                background: pctReclamables > 15 ? "#FDECC8" : "#FAFAF9",
                border: `1px solid ${pctReclamables > 15 ? "#F2D59A" : "#E8E7E3"}`,
                display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
              }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: pctReclamables > 15 ? "#CB912F" : "#37352F" }}>
                  {pctReclamables.toFixed(0)}%
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 13, color: "#37352F", fontWeight: 600 }}>
                    de cambios fueron por daño de envío desde Paraguay
                  </div>
                  <div style={{ fontSize: 11, color: "#8C8A82", marginTop: 2 }}>
                    {reclamables.length} reclamables sobre {garantias.length} cambios totales
                    {pctReclamables > 15 && " · Hablá con el pasero/proveedor sobre el empacado"}
                  </div>
                </div>
              </div>

              {/* Top 5 modelos con más fallas */}
              {top5Failed.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#8C8A82", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                    Top 5 modelos con más fallas
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {top5Failed.map((m, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, color: "#555247", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.key}</span>
                        <div style={{ width: isMobile ? 90 : 180, height: 18, background: "#F0EFEB", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ width: `${(m.qty / maxFailureQty) * 100}%`, height: "100%", background: `linear-gradient(90deg, #CB912Faa, #CB912F)`, borderRadius: 4 }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#CB912F", minWidth: 32, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{m.qty}</span>
                        {m.ventas > 0 && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                            background: m.tasa > 3 ? "#FBE4E4" : "#F0EFEB",
                            color: m.tasa > 3 ? "#E03E3E" : "#8C8A82",
                            minWidth: 50, textAlign: "center",
                            fontVariantNumeric: "tabular-nums",
                          }} title={`${m.qty} fallas sobre ${m.ventas} ventas`}>
                            {m.tasa.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: "#8C8A82", marginTop: 6, fontStyle: "italic" }}>
                    Chip rojo: tasa de falla &gt; 3% (cambios / ventas del mismo modelo)
                  </div>
                </div>
              )}

              {/* Donut razones + evolución mensual */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
                {/* Donut razones */}
                {reasonEntries.length > 0 && (
                  <div style={{ padding: 12, background: "#FAFAF9", borderRadius: 10, border: "1px solid #E8E7E3" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#8C8A82", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
                      Razones de falla
                    </div>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <svg width={100} height={100} viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
                        {(() => {
                          const cx = 50, cy = 50, r = 38;
                          const circ = 2 * Math.PI * r;
                          let acc = 0;
                          return reasonEntries.map(([reason, n], i) => {
                            const cat = FAILURE_REASON_CATEGORY[reason] || "otro";
                            const color = reasonCatColor[cat];
                            const pct = n / totalReasons;
                            const dash = pct * circ;
                            const offset = -acc * circ;
                            acc += pct;
                            return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={14}
                              strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={offset}
                              transform={`rotate(-90 ${cx} ${cy})`} />;
                          });
                        })()}
                        <text x={50} y={50} textAnchor="middle" fontSize={18} fontWeight="800" fill="#37352F">{totalReasons}</text>
                        <text x={50} y={63} textAnchor="middle" fontSize={9} fill="#8C8A82">con razón</text>
                      </svg>
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                        {reasonEntries.slice(0, 5).map(([reason, n]) => {
                          const cat = FAILURE_REASON_CATEGORY[reason] || "otro";
                          const color = reasonCatColor[cat];
                          return (
                            <div key={reason} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                              <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                              <span style={{ color: "#555247", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{reason}</span>
                              <span style={{ fontWeight: 700, color: "#37352F", fontVariantNumeric: "tabular-nums" }}>{n}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Evolución mensual */}
                <div style={{ padding: 12, background: "#FAFAF9", borderRadius: 10, border: "1px solid #E8E7E3" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#8C8A82", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
                    Garantías últimos 6 meses
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80, paddingBottom: 4 }}>
                    {months.map((m, i) => (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%" }}>
                        <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                          <div style={{
                            width: "100%", background: "#CB912F",
                            height: m.count > 0 ? `${(m.count / maxMonth) * 100}%` : 2,
                            minHeight: m.count > 0 ? 4 : 2,
                            borderRadius: "3px 3px 0 0",
                            opacity: m.count > 0 ? 1 : 0.3,
                          }} title={`${m.count} cambios`} />
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#37352F", fontVariantNumeric: "tabular-nums" }}>{m.count}</div>
                        <div style={{ fontSize: 9, color: "#8C8A82", textTransform: "capitalize" }}>{m.label.replace(".", "")}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          );
        })()}
      </Card>

      {/* ===== PROYECCIÓN DE INVENTARIO ===== */}
      <Card style={{ marginBottom: 14 }}>
        <h4 style={{ color: "#5E6AD2", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>
          📈 Proyección de inventario
        </h4>
        {(() => {
          // Ventas de últimos 30 días por producto (unidades).
          const thirtyAgo = new Date();
          thirtyAgo.setDate(thirtyAgo.getDate() - 30);
          const soldByProduct = {};
          sales.filter(s => !s.isDeleted && new Date(s.date) >= thirtyAgo).forEach(s => {
            (s.items || []).forEach(i => {
              soldByProduct[i.productId] = (soldByProduct[i.productId] || 0) + (Number(i.qty) || 1);
            });
          });

          const activeProds = (products || []).filter(p => !p.isDeleted && (p.stock || 0) > 0);
          const rows = activeProds.map(p => {
            const sold30 = soldByProduct[p.id] || 0;
            const velocity = sold30 / 30; // uds/día
            const daysLeft = velocity > 0 ? Math.floor((p.stock || 0) / velocity) : Infinity;
            const depletion = velocity > 0 ? new Date(Date.now() + daysLeft * 86400000) : null;
            return {
              ...p, sold30, velocity, daysLeft, depletion,
              velocityLabel: velocity >= 1 ? `${velocity.toFixed(1)}/día` : velocity > 0 ? `${(velocity * 7).toFixed(1)}/sem` : "sin ventas",
            };
          }).sort((a, b) => {
            // Primero los que se agotan antes; "sin ventas" al final
            if (a.daysLeft === Infinity && b.daysLeft === Infinity) return 0;
            if (a.daysLeft === Infinity) return 1;
            if (b.daysLeft === Infinity) return -1;
            return a.daysLeft - b.daysLeft;
          });

          const soonOut = rows.filter(r => r.daysLeft !== Infinity && r.daysLeft <= 7).length;
          const stale = rows.filter(r => r.daysLeft === Infinity).length;

          if (rows.length === 0) {
            return <p style={{ color: "#555", fontSize: 13 }}>No hay productos con stock.</p>;
          }

          return (
            <>
              <p style={{ color: "#8C8A82", fontSize: 12, margin: "0 0 14px" }}>
                Velocidad = unidades vendidas en últimos 30 días ÷ 30. Ordenado por días restantes ascendente.
                {soonOut > 0 && <span style={{ color: "#E03E3E", fontWeight: 700 }}> · {soonOut} se agota{soonOut > 1 ? "n" : ""} en ≤7 días</span>}
                {stale > 0 && <span style={{ color: "#8C8A82" }}> · {stale} sin ventas 30d</span>}
              </p>
              <div style={{ overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#8C8A82", borderBottom: "1px solid #E8E7E3" }}>
                      <th style={{ padding: "8px 10px", fontWeight: 600 }}>Producto</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>Stock</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>Vendidos 30d</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>Velocidad</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>Días restantes</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600 }}>Se agota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 25).map(r => {
                      const color = r.daysLeft === Infinity ? "#8C8A82"
                        : r.daysLeft <= 7 ? "#E03E3E"
                        : r.daysLeft <= 14 ? "#CB912F"
                        : r.daysLeft <= 30 ? "#5E6AD2"
                        : "#0F7B6C";
                      return (
                        <tr key={r.id} style={{ borderBottom: "1px solid #F0EFEB" }}>
                          <td style={{ padding: "8px 10px", color: "#37352F", fontWeight: 600 }}>
                            {r.brand} {r.model}
                            <span style={{ color: "#8C8A82", fontWeight: 400 }}> · {r.flavor}</span>
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#37352F", fontWeight: 700 }}>{r.stock}</td>
                          <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#8C8A82" }}>{r.sold30}</td>
                          <td style={{ padding: "8px 10px", textAlign: "right", color: "#8C8A82", fontSize: 11 }}>{r.velocityLabel}</td>
                          <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: `${color}18`, color }}>
                              {r.daysLeft === Infinity ? "—" : `${r.daysLeft}d`}
                            </span>
                          </td>
                          <td style={{ padding: "8px 10px", color: "#8C8A82", fontSize: 11 }}>
                            {r.depletion ? formatDate(r.depletion) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {rows.length > 25 && (
                  <p style={{ fontSize: 11, color: "#B1AFA7", margin: "10px 0 0", textAlign: "center" }}>
                    Mostrando 25 de {rows.length} productos con stock
                  </p>
                )}
              </div>
            </>
          );
        })()}
      </Card>

      {/* ===== ABC DE CLIENTES ===== */}
      {/* Ranking por revenue acumulado (YTD). Segmenta:
          - Tier A: top 20% de clientes por revenue (Pareto: suelen aportar 80% del ingreso)
          - Tier B: siguientes 30%
          - Tier C: resto */}
      <Card style={{ marginBottom: 14 }}>
        <h4 style={{ color: "#a855f7", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>
          👥 ABC de clientes
        </h4>
        {(() => {
          // Acumular revenue por clientId (normalizando monedas a ARS con el rate de la venta)
          const byClient = {};
          (sales || []).filter(s => !s.isDeleted && s.clientId).forEach(s => {
            const rate = s.exchangeRate || exchangeRate || 0;
            const ars = (s.currency === "USD" || s.currency === "USDT") ? (Number(s.total) || 0) * rate : (Number(s.total) || 0);
            if (!byClient[s.clientId]) byClient[s.clientId] = { revenue: 0, count: 0, lastDate: "" };
            byClient[s.clientId].revenue += ars;
            byClient[s.clientId].count += 1;
            if (s.date > byClient[s.clientId].lastDate) byClient[s.clientId].lastDate = s.date;
          });

          const clientsEnriched = Object.entries(byClient)
            .map(([cid, v]) => {
              const c = clients.find(cl => cl.id === cid);
              return { id: cid, name: c?.name || "Cliente eliminado", zone: c?.zone || "", ...v };
            })
            .sort((a, b) => b.revenue - a.revenue);

          const totalRevenue = clientsEnriched.reduce((s, c) => s + c.revenue, 0);
          if (totalRevenue === 0 || clientsEnriched.length === 0) {
            return <p style={{ color: "#555", fontSize: 13 }}>Cargá ventas con cliente asignado para ver el ranking ABC.</p>;
          }

          // Asignar tier por acumulado: A = primeros que suman hasta 80% del revenue, B = hasta 95%, C = resto
          let acc = 0;
          const ranked = clientsEnriched.map(c => {
            acc += c.revenue;
            const pct = (acc / totalRevenue) * 100;
            const tier = pct <= 80 ? "A" : pct <= 95 ? "B" : "C";
            return { ...c, pct, pctOfTotal: (c.revenue / totalRevenue) * 100, tier };
          });

          const tierStats = { A: { count: 0, revenue: 0 }, B: { count: 0, revenue: 0 }, C: { count: 0, revenue: 0 } };
          ranked.forEach(c => {
            tierStats[c.tier].count += 1;
            tierStats[c.tier].revenue += c.revenue;
          });

          const tierColors = {
            A: { bg: "#DDEDEA", border: "#0F7B6C", text: "#0F7B6C" },
            B: { bg: "#FDECC8", border: "#CB912F", text: "#CB912F" },
            C: { bg: "#EEF0FC", border: "#5E6AD2", text: "#5E6AD2" },
          };

          return (
            <>
              <p style={{ color: "#8C8A82", fontSize: 12, margin: "0 0 14px" }}>
                Segmentación Pareto: <strong>A</strong> = top que aporta 80% del revenue · <strong>B</strong> = siguiente 15% · <strong>C</strong> = el 5% restante.
              </p>

              {/* Stats por tier */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
                {["A", "B", "C"].map(t => {
                  const col = tierColors[t];
                  const stats = tierStats[t];
                  return (
                    <div key={t} style={{
                      padding: "12px 14px", borderRadius: 10,
                      background: col.bg, border: `1px solid ${col.border}55`,
                    }}>
                      <div style={{ fontSize: 11, color: col.text, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Tier {t}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "#37352F", marginTop: 2 }}>{stats.count}</div>
                      <div style={{ fontSize: 11, color: "#8C8A82", marginTop: 2 }}>
                        {formatMoney(stats.revenue)} ({totalRevenue > 0 ? Math.round(stats.revenue / totalRevenue * 100) : 0}%)
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tabla top 20 */}
              <div style={{ overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#8C8A82", borderBottom: "1px solid #E8E7E3" }}>
                      <th style={{ padding: "8px 10px", fontWeight: 600 }}>#</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600 }}>Cliente</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600 }}>Tier</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>Revenue</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>% total</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>Ventas</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600 }}>Última</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.slice(0, 20).map((c, i) => {
                      const col = tierColors[c.tier];
                      return (
                        <tr key={c.id} style={{ borderBottom: "1px solid #F0EFEB" }}>
                          <td style={{ padding: "8px 10px", color: "#B1AFA7", fontVariantNumeric: "tabular-nums" }}>{i + 1}</td>
                          <td style={{ padding: "8px 10px", color: "#37352F", fontWeight: 600 }}>
                            {c.name}
                            {c.zone && <span style={{ color: "#B1AFA7", fontWeight: 400, marginLeft: 6 }}>· {c.zone}</span>}
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            <span style={{
                              padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700,
                              background: col.bg, color: col.text, border: `1px solid ${col.border}55`,
                            }}>{c.tier}</span>
                          </td>
                          <td style={{ padding: "8px 10px", color: "#37352F", fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatMoney(c.revenue)}</td>
                          <td style={{ padding: "8px 10px", color: "#8C8A82", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{c.pctOfTotal.toFixed(1)}%</td>
                          <td style={{ padding: "8px 10px", color: "#8C8A82", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{c.count}</td>
                          <td style={{ padding: "8px 10px", color: "#8C8A82" }}>{formatDate(c.lastDate)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {ranked.length > 20 && (
                  <p style={{ fontSize: 11, color: "#B1AFA7", margin: "10px 0 0", textAlign: "center" }}>
                    Mostrando top 20 de {ranked.length} clientes con compras
                  </p>
                )}
              </div>
            </>
          );
        })()}
      </Card>

    </div>
  );
};
