import { useState } from "react";
import { formatMoney, formatDate } from "../helpers.js";
import { Card, Btn } from "./UI.jsx";

export const ExportData = ({ products, sales, purchases, expenses, withdrawals, cashMovements, stockLog, exchangeRate }) => {
  const [exporting, setExporting] = useState(false);
  const getProduct = (id) => products.find(p => p.id === id);
  const toCSV = (headers, rows) => {
    const escape = (v) => { const s = String(v ?? ""); return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s; };
    return [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))].join("\n");
  };
  const download = (filename, csvContent) => {
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };
  const exportStock = () => {
    const headers = ["Marca", "Modelo", "Sabor", "Puffs", "Stock", "Precio USD", "Precio ARS", "Estado"];
    const rows = [...products].sort((a, b) => a.brand.localeCompare(b.brand))
      .map(p => [p.brand, p.model, p.flavor, p.puffs, p.stock, p.priceUSD, Math.round(p.priceUSD * exchangeRate), p.stock > 0 ? "Disponible" : "Agotado"]);
    download("stock_actual.csv", toCSV(headers, rows));
  };
  const exportSales = () => {
    const headers = ["Fecha", "Cliente", "Productos", "Cantidad", "Canal", "Pago", "Moneda", "Total"];
    const rows = sales.map(s => {
      const items = (s.items || []).map(i => { const p = getProduct(i.productId); return p ? `${p.brand} ${p.model}` : "?"; }).join("|");
      return [formatDate(s.date), s.clientName || "", items, (s.items || []).length, s.channel || "", s.paymentMethod || "", s.currency || "ARS", s.total];
    });
    download("ventas.csv", toCSV(headers, rows));
  };
  const exportPurchases = () => {
    const headers = ["Fecha", "Proveedor", "Estado", "Items", "Total USDT", "Pasero", "Envio", "Total ARS"];
    const rows = purchases.map(p => [formatDate(p.date), p.supplier || "", p.status || "", p.totalItems || "", p.totalUSDT || "", p.paseroCostARS || "", p.envioCostARS || "", p.totalCostARS || ""]);
    download("compras.csv", toCSV(headers, rows));
  };
  const exportExpenses = () => {
    const headers = ["Fecha", "Categoria", "Descripcion", "Monto ARS"];
    const rows = expenses.map(e => [formatDate(e.date), e.category, e.description || "", e.amountARS || 0]);
    download("gastos.csv", toCSV(headers, rows));
  };
  return (
    <div>
      <h2 style={{ color: "#1a1a2e", margin: 0, fontSize: 22 }}>Exportar Datos</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginTop: 20 }}>
        <Card onClick={exportStock} style={{ cursor: "pointer" }}>Stock Actual ({products.length})</Card>
        <Card onClick={exportSales} style={{ cursor: "pointer" }}>Ventas ({sales.length})</Card>
        <Card onClick={exportPurchases} style={{ cursor: "pointer" }}>Compras ({purchases.length})</Card>
        <Card onClick={exportExpenses} style={{ cursor: "pointer" }}>Gastos ({expenses.length})</Card>
      </div>
    </div>
  );
};
