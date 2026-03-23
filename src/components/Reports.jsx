import { useState, useMemo } from "react";
import { formatMoney, formatDate } from "../helpers.js";
import { Card, Badge, Table } from "./UI.jsx";
import { BRAND_COLORS } from "../constants.js";

// -- REPORTS --
const BarChart = ({ data, colorKey, valueKey, labelKey, maxBars = 10, suffix = "" }) => {
  if (!data || data.length === 0) return <p style={{ color: "#555", fontSize: 13 }}>Sin datos</p>;
  const sorted = [...data].slice(0, maxBars);
  const maxVal = Math.max(...sorted.map(d => d[valueKey] || 0), 1);
  return (
    <div>
      {sorted.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ color: "#c0c0e0", fontSize: 12, minWidth: 100, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d[labelKey]}</span>
          <div style={{ flex: 1, background: "#1a1a30", borderRadius: 6, height: 24, overflow: "hidden" }}>
            <div style={{
              width: `${Math.max(2, (d[valueKey] / maxVal) * 100)}%`, height: "100%",
              background: `linear-gradient(90deg, ${d[colorKey] || "#a855f7"}88, ${d[colorKey] || "#a855f7"})`,
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
  if (!data || data.length === 0) return <p style={{ color: "#555", fontSize: 13 }}>Sin datos</p>;
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
        <text x={cx} y={cy - 6} textAnchor="middle" fill="#e0e0ff" fontSize={18} fontWeight={800}>{total}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#6666aa" fontSize={10}>unidades</text>
      </svg>
      <div>
        {slices.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ color: "#c0c0e0", fontSize: 12 }}>{s.label}</span>
            <span style={{ color: "#6666aa", fontSize: 11 }}>{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const Reports = ({ products, sales, purchases, expenses, withdrawals, exchangeRate }) => {
  const brandStats = useMemo(() => {
    const stats = {};
    sales.forEach(s => (s.items || []).forEach(item => {
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
    sales.forEach(s => {
      const ch = s.channel || "Sin canal";
      if (!stats[ch]) stats[ch] = { count: 0, revenue: 0 };
      stats[ch].count++;
      stats[ch].revenue += s.total || 0;
    });
    return Object.entries(stats).sort((a, b) => b[1].count - a[1].count);
  }, [sales]);

  const paymentStats = useMemo(() => {
    const stats = {};
    sales.forEach(s => {
      const pm = s.paymentMethod || "Otro";
      if (!stats[pm]) stats[pm] = { count: 0, revenue: 0 };
      stats[pm].count++;
      stats[pm].revenue += s.total || 0;
    });
    return Object.entries(stats).sort((a, b) => b[1].revenue - a[1].revenue);
  }, [sales]);

  const topFlavors = useMemo(() => {
    const stats = {};
    sales.forEach(s => (s.items || []).forEach(item => {
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
    sales.forEach(s => {
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

  const brandColors = { Elfbar: "#00b894", "Geek Bar": "#6c5ce7", Ignite: "#e74c3c", "Lost Mary": "#fdcb6e", Nikbar: "#00cec9", Supreme: "#e17055" };
  const channelColors = { WhatsApp: "#25d366", Instagram: "#e1306c", Delivery: "#fdcb6e", Presencial: "#a855f7" };
  const paymentColors = { "Mercado Pago": "#00b2ff", Lemon: "#f9ca24", "USD Cash": "#00cec9", USDT: "#26de81", "Pesos Cash": "#fdcb6e" };

  return (
    <div>
      <h2 style={{ color: "#e0e0ff", margin: "0 0 20px", fontSize: 22 }}>Reportes</h2>

      {/* Financial summary */}
      <Card style={{ marginBottom: 14 }}>
        <h4 style={{ color: "#fdcb6e", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>Resumen financiero del mes</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
          {(() => {
            const thisMonth = new Date().getMonth();
            const thisYear = new Date().getFullYear();
            const mFilter = (d) => { const dt = new Date(d); return dt.getMonth() === thisMonth && dt.getFullYear() === thisYear; };
            const rev = sales.filter(s => mFilter(s.date)).reduce((sum, s) => sum + (s.total || 0), 0);
            const cost = purchases.filter(p => mFilter(p.date)).reduce((sum, p) => sum + ((p.totalUSDT || 0) * exchangeRate), 0);
            const exp = expenses.filter(e => mFilter(e.date)).reduce((sum, e) => sum + (e.amountARS || 0), 0);
            const discounts = sales.filter(s => mFilter(s.date)).reduce((sum, s) => sum + (s.discountAmount || 0), 0);
            const consumed = (withdrawals || []).filter(w => mFilter(w.date)).reduce((sum, w) => sum + w.qty, 0);
            return (<>
              <div><span style={{ color: "#6666aa", fontSize: 12 }}>Ingresos</span><div style={{ color: "#00b894", fontSize: 20, fontWeight: 700 }}>{formatMoney(rev)}</div></div>
              <div><span style={{ color: "#6666aa", fontSize: 12 }}>Costos</span><div style={{ color: "#e74c3c", fontSize: 20, fontWeight: 700 }}>{formatMoney(cost)}</div></div>
              <div><span style={{ color: "#6666aa", fontSize: 12 }}>Gastos</span><div style={{ color: "#fdcb6e", fontSize: 20, fontWeight: 700 }}>{formatMoney(exp)}</div></div>
              <div><span style={{ color: "#6666aa", fontSize: 12 }}>Descuentos</span><div style={{ color: "#fdcb6e", fontSize: 20, fontWeight: 700 }}>{formatMoney(discounts)}</div></div>
              <div><span style={{ color: "#6666aa", fontSize: 12 }}>Consumo</span><div style={{ color: "#e17055", fontSize: 20, fontWeight: 700 }}>{consumed} uds</div></div>
              <div><span style={{ color: "#6666aa", fontSize: 12 }}>Ganancia est.</span><div style={{ color: "#a855f7", fontSize: 20, fontWeight: 700 }}>{formatMoney(rev - cost - exp)}</div></div>
            </>);
          })()}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
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
        <h4 style={{ color: "#e74c3c", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>🏆 Top 10 Sabores más vendidos</h4>
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
            return { ...d, avgCostUSDT: Math.round(avgCostUSDT * 100) / 100, totalCostARS, salePriceARS, marginARS, marginPct };
          }).sort((a, b) => b.marginPct - a.marginPct);

          if (margins.length === 0) return <p style={{ color: "#555", fontSize: 13 }}>Registrá compras verificadas para ver márgenes reales.</p>;

          return (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Marca", "Modelo", "Costo prom. USDT", "Costo total/ud ARS", "Precio venta ARS", "Margen/ud", "Margen %"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: "#6666aa", textTransform: "uppercase", borderBottom: "1px solid #2a2a4a", fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {margins.map((m, i) => (
                    <tr key={i}>
                      <td style={{ padding: "8px 10px", fontSize: 13, color: "#c0c0e0", borderBottom: "1px solid #1a1a30" }}><Badge color={BRAND_COLORS[m.brand] || "#a855f7"}>{m.brand}</Badge></td>
                      <td style={{ padding: "8px 10px", fontSize: 13, color: "#c0c0e0", borderBottom: "1px solid #1a1a30" }}>{m.model}</td>
                      <td style={{ padding: "8px 10px", fontSize: 13, color: "#c0c0e0", borderBottom: "1px solid #1a1a30" }}>{formatMoney(m.avgCostUSDT, "USDT")}</td>
                      <td style={{ padding: "8px 10px", fontSize: 13, color: "#e74c3c", borderBottom: "1px solid #1a1a30", fontWeight: 600 }}>{formatMoney(m.totalCostARS)}</td>
                      <td style={{ padding: "8px 10px", fontSize: 13, color: "#c0c0e0", borderBottom: "1px solid #1a1a30" }}>{formatMoney(m.salePriceARS)}</td>
                      <td style={{ padding: "8px 10px", fontSize: 13, borderBottom: "1px solid #1a1a30", fontWeight: 700, color: m.marginARS >= 0 ? "#00b894" : "#e74c3c" }}>{formatMoney(m.marginARS)}</td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid #1a1a30" }}><Badge color={m.marginPct >= 50 ? "#00b894" : m.marginPct >= 30 ? "#fdcb6e" : "#e74c3c"}>{m.marginPct}%</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 10, color: "#555", fontSize: 11 }}>* Costo incluye: precio USDT + comisión proveedor + pasero + envío prorrateado por unidad</div>
            </div>
          );
        })()}
      </Card>

      {/* Monthly evolution */}
      {monthlySales.length > 0 && (
        <Card>
          <h4 style={{ color: "#6c5ce7", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>📈 Evolución Mensual</h4>
          <BarChart data={monthlySales.map(m => ({ label: m.label, value: m.count, color: "#6c5ce7" }))} labelKey="label" valueKey="value" colorKey="color" suffix=" ventas" />
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #1a1a30" }}>
            <span style={{ color: "#6666aa", fontSize: 12, textTransform: "uppercase" }}>Ingresos mensuales</span>
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
          const consumoValue = (withdrawals || []).reduce((s, w) => s + (w.costEstimateUSD || 0), 0) * exchangeRate;
          
          return (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <div style={{ color: "#00b894", fontSize: 13, fontWeight: 700, marginBottom: 10, textTransform: "uppercase" }}>Activos</div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1a1a30" }}>
                  <span style={{ color: "#8888aa", fontSize: 13 }}>Stock en mercadería ({stockUnits} uds)</span>
                  <span style={{ color: "#e0e0ff", fontWeight: 600 }}>{formatMoney(stockValue)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1a1a30" }}>
                  <span style={{ color: "#8888aa", fontSize: 13 }}>Efectivo ARS</span>
                  <span style={{ color: "#e0e0ff", fontWeight: 600 }}>{formatMoney(Math.max(0, totalCashARS))}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1a1a30" }}>
                  <span style={{ color: "#8888aa", fontSize: 13 }}>USDT</span>
                  <span style={{ color: "#e0e0ff", fontWeight: 600 }}>{formatMoney(Math.max(0, totalCashUSDT), "USDT")} (~{formatMoney(Math.max(0, totalCashUSDT) * exchangeRate)})</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1a1a30" }}>
                  <span style={{ color: "#8888aa", fontSize: 13 }}>USD Cash</span>
                  <span style={{ color: "#e0e0ff", fontWeight: 600 }}>{formatMoney(totalCashUSD, "USD")} (~{formatMoney(totalCashUSD * exchangeRate)})</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "2px solid #2a2a4a", marginTop: 6 }}>
                  <span style={{ color: "#00b894", fontSize: 15, fontWeight: 700 }}>Total Activos (est.)</span>
                  <span style={{ color: "#00b894", fontSize: 18, fontWeight: 800 }}>{formatMoney(totalAssets)}</span>
                </div>
              </div>
              <div>
                <div style={{ color: "#6c5ce7", fontSize: 13, fontWeight: 700, marginBottom: 10, textTransform: "uppercase" }}>Resultados acumulados</div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1a1a30" }}>
                  <span style={{ color: "#8888aa", fontSize: 13 }}>Ingresos por ventas</span>
                  <span style={{ color: "#00b894", fontWeight: 600 }}>{formatMoney(totalRevenue)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1a1a30" }}>
                  <span style={{ color: "#8888aa", fontSize: 13 }}>Costo mercadería</span>
                  <span style={{ color: "#e74c3c", fontWeight: 600 }}>-{formatMoney(totalCosts)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1a1a30" }}>
                  <span style={{ color: "#8888aa", fontSize: 13 }}>Gastos operativos</span>
                  <span style={{ color: "#e74c3c", fontWeight: 600 }}>-{formatMoney(totalExpenses)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1a1a30" }}>
                  <span style={{ color: "#8888aa", fontSize: 13 }}>Consumo propio (merma)</span>
                  <span style={{ color: "#e17055", fontWeight: 600 }}>-{formatMoney(consumoValue)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "2px solid #2a2a4a", marginTop: 6 }}>
                  <span style={{ color: "#6c5ce7", fontSize: 15, fontWeight: 700 }}>Resultado neto</span>
                  <span style={{ color: totalRevenue - totalCosts - totalExpenses - consumoValue >= 0 ? "#00b894" : "#e74c3c", fontSize: 18, fontWeight: 800 }}>
                    {formatMoney(totalRevenue - totalCosts - totalExpenses - consumoValue)}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}
      </Card>

    </div>
  );
};
