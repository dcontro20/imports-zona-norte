import { useState, useMemo } from "react";
import { formatMoney, formatDate } from "../helpers.js";
import { Card, StatCard, Badge } from "./UI.jsx";

export const Dashboard = ({ products, sales, purchases, expenses, withdrawals, exchangeRate }) => {
  const today = new Date().toDateString();
  const thisMonth = new Date().getMonth();
  const thisYear = new Date().getFullYear();

  const salesToday = sales.filter(s => new Date(s.date).toDateString() === today);
  const salesMonth = sales.filter(s => { const d = new Date(s.date); return d.getMonth() === thisMonth && d.getFullYear() === thisYear; });

  const revenueToday = salesToday.reduce((sum, s) => sum + (s.total || 0), 0);
  const revenueMonth = salesMonth.reduce((sum, s) => sum + (s.total || 0), 0);
  const totalStock = products.reduce((sum, p) => sum + (p.stock || 0), 0);
  const lowStock = products.filter(p => p.stock > 0 && p.stock <= 5);

  const topProducts = useMemo(() => {
    const counts = {};
    sales.forEach(s => (s.items || []).forEach(item => {
      counts[item.productId] = (counts[item.productId] || 0) + item.qty;
    }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([pid, qty]) => {
      const prod = products.find(p => p.id === pid);
      return { name: prod ? `${prod.brand} ${prod.model}` : "?", qty };
    });
  }, [sales, products]);

  return (
    <div>
      <h2 style={{ color: "#1a1a2e", margin: "0 0 20px", fontSize: 22 }}>Dashboard</h2>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="Ventas hoy" value={salesToday.length} sub={`${formatMoney(revenueToday)}`} icon="🛒" />
        <StatCard label="Ventas mes" value={salesMonth.length} sub={`${formatMoney(revenueMonth)}`} icon="📈" />
        <StatCard label="Stock total" value={totalStock} sub={`${lowStock.length} bajo`} icon="📦" />
      </div>
      <Card>
        <h4 style={{ color: "#6366f1", margin: "0 0 14px" }}>Top 5 productos</h4>
        {topProducts.length === 0 ? <p>Sin ventas</p> :
          topProducts.map((p, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
              <span>{i + 1}. {p.name}</span>
              <Badge color="#00b894">{p.qty}</Badge>
            </div>
          ))}
      </Card>
    </div>
  );
};
