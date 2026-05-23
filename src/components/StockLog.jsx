import { useState } from "react";
import { formatMoney, formatDate } from "../helpers.js";
import { Card, Input, Select, Table, Badge, StatCard } from "./UI.jsx";
import { useResponsive } from "../App.jsx";

// -- STOCK LOG --
const STOCK_LOG_TYPES = {
  "venta": { label: "Venta", color: "#00b894", icon: "🛒" },
  "compra": { label: "Compra", color: "#1E2B4A", icon: "📦" },
  "consumo": { label: "Consumo", color: "#e17055", icon: "🚬" },
  "ajuste": { label: "Ajuste", color: "#fdcb6e", icon: "⚡" },
  "devolucion": { label: "Devolución", color: "#00cec9", icon: "↩️" },
};

export const StockLog = ({ stockLog, setStockLog, products }) => {
  const { isMobile } = useResponsive();
  const [filterType, setFilterType] = useState("");
  const [filterProduct, setFilterProduct] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const filtered = (stockLog || []).filter(log => {
    const matchType = !filterType || log.type === filterType;
    const matchProduct = !filterProduct || log.productId === filterProduct;
    const matchFrom = !filterDateFrom || (log.date && log.date >= filterDateFrom);
    const matchTo = !filterDateTo || (log.date && log.date <= filterDateTo + "T23:59:59");
    return matchType && matchProduct && matchFrom && matchTo;
  });

  const getProduct = (id) => products.find(p => p.id === id);
  const hasFilters = filterType || filterProduct || filterDateFrom || filterDateTo;

  // Stats
  const totalIn = filtered.filter(l => l.qty > 0).reduce((s, l) => s + l.qty, 0);
  const totalOut = filtered.filter(l => l.qty < 0).reduce((s, l) => s + Math.abs(l.qty), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: "#1E2B4A", margin: 0, fontSize: 22 }}>Historial de Stock</h2>
          <span style={{ color: "#6B7794", fontSize: 13 }}>{filtered.length} movimientos{hasFilters ? " (filtrados)" : ""}</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <StatCard label="Entradas" value={`+${totalIn}`} icon="📥" color="#00b894" />
        <StatCard label="Salidas" value={`-${totalOut}`} icon="📤" color="#E03E3E" />
        <StatCard label="Neto" value={totalIn - totalOut >= 0 ? `+${totalIn - totalOut}` : `${totalIn - totalOut}`} icon="📊" color="#1E2B4A" />
      </div>

      {/* Filters — responsive grid */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 2fr",
          gap: 10,
        }}>
          <Input label="Desde" type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
          <Input label="Hasta" type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
          <Select label="Tipo" options={Object.entries(STOCK_LOG_TYPES).map(([k, v]) => ({ value: k, label: `${v.icon} ${v.label}` }))} value={filterType} onChange={e => setFilterType(e.target.value)} />
          <div style={{ gridColumn: isMobile ? "1 / -1" : "auto" }}>
            <Select label="Producto" options={[...new Set((stockLog || []).map(l => l.productId))].map(pid => {
              const p = getProduct(pid);
              return p ? { value: pid, label: `${p.brand} ${p.model} - ${p.flavor}` } : { value: pid, label: pid };
            }).sort((a, b) => a.label.localeCompare(b.label))} value={filterProduct} onChange={e => setFilterProduct(e.target.value)} />
          </div>
        </div>
        {hasFilters && (
          <button onClick={() => { setFilterType(""); setFilterProduct(""); setFilterDateFrom(""); setFilterDateTo(""); }}
            style={{ background: "none", border: "1px solid #E03E3E55", color: "#E03E3E", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, marginTop: 4 }}>✕ Limpiar filtros</button>
        )}
      </Card>

      <Card>
        <Table columns={[
          { key: "date", label: "Fecha", render: r => formatDate(r.date) },
          { key: "type", label: "Tipo", render: r => {
            const t = STOCK_LOG_TYPES[r.type] || { label: r.type, color: "#888", icon: "?" };
            return <Badge color={t.color}>{t.icon} {t.label}</Badge>;
          }},
          { key: "product", label: "Producto", render: r => {
            const p = getProduct(r.productId);
            return p ? `${p.brand} ${p.model} - ${p.flavor}` : "?";
          }},
          { key: "qty", label: "Cantidad", render: r => (
            <span style={{ color: r.qty > 0 ? "#00b894" : "#E03E3E", fontWeight: 700 }}>
              {r.qty > 0 ? `+${r.qty}` : r.qty}
            </span>
          )},
          { key: "reason", label: "Detalle" },
        ]} data={filtered} emptyMsg="No hay movimientos registrados" />
      </Card>
    </div>
  );
};
