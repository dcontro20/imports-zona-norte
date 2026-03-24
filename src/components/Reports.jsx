import { useState, useMemo } from "react";
import { formatMoney, formatDate } from "../helpers.js";
import { Card, Badge, Table } from "./UI.jsx";
import { BRAND_COLORS } from "../constants.js";

// -- REPORTS --
const BarChart = ({ data, colorKey, valueKey, labelKey, maxBars = 10, suffix = "" }) => {
  if (!data || data.length === 0) return <p style={{ color: "#9ca3af", fontSize: 13 }}>Sin datos</p>;
  const sorted = [...data].slice(0, maxBars);
  const maxVal = Math.max(...sorted.map(d => d[valueKey] || 0), 1);
  return (
    <div>
      {sorted.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ color: "#4b5563", fontSize: 12, minWidth: 100, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d[labelKey]}</span>
          <div style={{ flex: 1, background: "#edf0f2", borderRadius: 6, height: 24, overflow: "hidden" }}>
            <div style={{
              width: `${Math.max(2, (d[valueKey] / maxVal) * 100)}%`, height: "100%",
              background: `linear-gradient(90deg, ${d[colorKey] || "#6366f1"}88, ${d[colorKey] || "#6366f1"})`,
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
  if (!data || data.length === 0) return <p style={{ color: "#9ca3af", fontSize: 13 }}>Sin datos</p>;
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
        <text x={cx} y={cy - 6} textAnchor="middle" fill="#1a1a2e" fontSize={18} fontWeight={800}>{total}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#6b7280" fontSize={10}>unidades</text>
      </svg>
      <div>
        {slices.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ color: "#4b5563", fontSize: 12 }}>{s.label}</span>
            <span style={{ color: "#6b7280", fontSize: 11 }}>{s.pct}%</span>
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
      const pm = s.paymentMethod || "Outro";
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
      <h2 style={{ color: "#1a1a2e", margin: "0 0 20px", fontSize: 22 }}>Reportes</h2>

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
              <div><span style={{ color: "#6b7280", fontSize: 12 }}>Ingresos</span><div style={{ color: "#00b894", fontSize: 20, fontWeight: 700 }}>{formatMoney(rev)}</div></div>
              <div><span style={{ color: "#6b7280", fontSize: 12 }}>Costos</span><div style={{ color: "#e74c3c", fontSize: 20, fontWeight: 700 }}>{formatMoney(cost)}</div></div>
              <div><span style={{ color: "#6b7280", fontSize: 12 }}>Gastos</span><div style={{ color: "#fdcb6e", fontSize: 20, fontWeight: 700 }}>{formatMoney(exp)}</div></div>
              <div><span style={{ color: "#6b7280", fontSize: 12 }}>Descuentos</span><div style={{ color: "#fdcb6e", fontSize: 20, fontWeight: 700 }}>{formatMoney(discounts)}</div></div>
              <div><span style={{ color: "#6b7280", fontSize: 12 }}>Consumo</span><div style={{ color: "#e17055", fontSize: 20, fontWeight: 700 }}>{consumed} uds</div></div>
              <div><span style={{ color: "#6b7280", fontSize: 12 }}>Ganancia est.</span><div style={{ color: "#6366f1", fontSize: 20, fontWeight: 700 }}>{formatMoney(rev - cost - exp)}</div></div>
            </>);
          })()}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Card>
          <h4 style={{ color: "#a855f7", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>Ventas por Marca</h4>
          <BarChart data={brandStats.map(([brand, data]) => ({ label: brand, value: data.sold, color: brandColors[brand] || "#a855f7" }))} labelKey="label" valueKey="value" colorKey="color" suffix=" uds" />
        </Card>

        <Card>
          <h4 style={{ color: "#00cec9", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>Stock por Marca</h4>
          <DonutChart data={stockByBrand.map(([brand, qty]) => ({ label: brand, value: qty, color: brandColors[brand] || "#a855f7" }))} />
        </Card>

        <Card>
          <h4 style={{ color: "#25d366", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>Ventas por Canal</h4>
          <BarChart data={channelStats.map(([ch, data]) => ({ label: ch, value: data.count, color: channelColors[ch] || "#a855f7" }))} labelKey="label" valueKey="value" colorKey="color" suffix="" />
        </Card>

        <Card>
          <h4 style={{ color: "#00b2ff", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>Ingresos por Metodo de Pago</h4>
          <BarChart data={paymentStats.map(([pm, data]) => ({ label: pm, value: Math.round(data.revenue), color: paymentColors[pm] || "#a855f7" }))} labelKey="label" valueKey="value" colorKey="color" />
        </Card>
      </div>

      <Card style={{ marginBottom: 14 }}>
        <h4 style={{ color: "#e74c3c", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>Top 10 Sabores mas vendidos</h4>
        <BarChart data={topFlavors.map(([name, data]) => ({ label: name, value: data.sold, color: brandColors[data.brand] || "#a855f7" }))} labelKey="label" valueKey="value" colorKey="color" suffix=" uds" />
      </Card>

      {monthlySales.length > 0 && (
        <Card>
          <h4 style={{ color: "#6366f1", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>Evolucion Mensual</h4>
          <BarChart data={monthlySales.map(m => ({ label: m.label, value: m.count, color: "#6366f1" }))} labelKey="label" valueKey="value" colorKey="color" suffix=" ventas" />
        </Card>
      )}
    </div>
  );
};
