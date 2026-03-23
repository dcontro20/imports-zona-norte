import { useState, useMemo } from "react";
import { formatMoney, formatDate } from "../helpers.js";
import { Card, StatCard, Badge } from "./UI.jsx";
import { BRAND_COLORS } from "../constants.js";

// -- DASHBOARD --
export const Dashboard = ({ products, sales, purchases, expenses, withdrawals, exchangeRate }) => {
  const today = new Date().toDateString();
  const thisMonth = new Date().getMonth();
  const thisYear = new Date().getFullYear();

  const salesToday = sales.filter(s => new Date(s.date).toDateString() === today);
  const salesMonth = sales.filter(s => { const d = new Date(s.date); return d.getMonth() === thisMonth && d.getFullYear() === thisYear; });

  const revenueToday = salesToday.reduce((sum, s) => {
    if (s.currency === "USD") return sum + s.total * exchangeRate;
    if (s.currency === "USDT") return sum + s.total * exchangeRate;
    return sum + s.total;
  }, 0);

  const revenueMonth = salesMonth.reduce((sum, s) => {
    if (s.currency === "USD") return sum + s.total * exchangeRate;
    if (s.currency === "USDT") return sum + s.total * exchangeRate;
    return sum + s.total;
  }, 0);

  const expensesMonth = expenses.filter(e => { const d = new Date(e.date); return d.getMonth() === thisMonth && d.getFullYear() === thisYear; })
    .reduce((sum, e) => sum + (e.amountARS || 0), 0);

  const purchasesMonth = purchases.filter(p => { const d = new Date(p.date); return d.getMonth() === thisMonth && d.getFullYear() === thisYear; })
    .reduce((sum, p) => sum + (p.totalUSDT || 0) * exchangeRate, 0);

  const totalStock = products.reduce((sum, p) => sum + (p.stock || 0), 0);
  const lowStock = products.filter(p => p.stock > 0 && p.stock <= 5);

  const topProducts = useMemo(() => {
    const counts = {};
    sales.forEach(s => (s.items || []).forEach(item => {
      counts[item.productId] = (counts[item.productId] || 0) + item.qty;
    }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([pid, qty]) => {
      const prod = products.find(p => p.id === pid);
      return { name: prod ? `${prod.brand} ${prod.model} - ${prod.flavor}` : "Desconocido", qty };
    });
  }, [sales, products]);

  return (
    <div>
      <h2 style={{ color: "#e0e0ff", margin: "0 0 20px", fontSize: 22 }}>Dashboard</h2>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="Ventas hoy" value={salesToday.length} sub={`${formatMoney(revenueToday)} ARS`} icon="🛒" color="#00b894" />
        <StatCard label="Ventas mes" value={salesMonth.length} sub={`${formatMoney(revenueMonth)} ARS`} icon="📈" color="#a855f7" />
        <StatCard label="Stock total" value={totalStock} sub={`${lowStock.length} con stock bajo`} icon="📦" color="#fdcb6e" />
        <StatCard label="Ganancia est. mes" value={formatMoney(revenueMonth - purchasesMonth - expensesMonth)} icon="💰" color="#00cec9" />
        <StatCard label="Consumo propio mes" value={`${(withdrawals || []).filter(w => { const d = new Date(w.date); return d.getMonth() === thisMonth && d.getFullYear() === thisYear; }).reduce((s, w) => s + w.qty, 0)} uds`} icon="🚬" color="#e17055" />
        <StatCard label="Descuentos mes" value={formatMoney(salesMonth.reduce((s, sale) => s + (sale.discountAmount || 0), 0))} icon="🏷️" color="#fdcb6e" />
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <Card style={{ flex: 1, minWidth: 280 }}>
          <h4 style={{ color: "#a855f7", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5 }}>🏆 Top 5 más vendidos</h4>
          {topProducts.length === 0 ? <p style={{ color: "#555", fontSize: 13 }}>Sin ventas aún</p> :
            topProducts.map((p, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1a1a30" }}>
                <span style={{ color: "#c0c0e0", fontSize: 13 }}>{i + 1}. {p.name}</span>
                <Badge color="#00b894">{p.qty} uds</Badge>
              </div>
            ))}
        </Card>

        <Card style={{ flex: 1, minWidth: 280 }}>
          <h4 style={{ color: "#fdcb6e", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5 }}>⚠️ Stock bajo (≤5)</h4>
          {lowStock.length === 0 ? <p style={{ color: "#555", fontSize: 13 }}>Todo bien por ahora</p> :
            lowStock.slice(0, 8).map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1a1a30" }}>
                <span style={{ color: "#c0c0e0", fontSize: 13 }}>{p.brand} {p.model} - {p.flavor}</span>
                <Badge color="#e74c3c">{p.stock}</Badge>
              </div>
            ))}
        </Card>
      </div>
    </div>
  );
};
