import { useState } from "react";
import { formatMoney, formatDate } from "../helpers.js";
import { Card, Btn } from "./UI.jsx";

// -- EXPORT DATA --
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
    const headers = ["Marca", "Modelo", "Sabor", "Puffs", "Stock", "Precio USD", "Precio ARS (est.)", "Estado"];
    const rows = [...products].sort((a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model) || a.flavor.localeCompare(b.flavor))
      .map(p => [p.brand, p.model, p.flavor, p.puffs, p.stock, p.priceUSD, Math.round(p.priceUSD * exchangeRate), p.stock > 0 ? "Disponible" : "Agotado"]);
    download("stock_actual.csv", toCSV(headers, rows));
  };

  const exportSales = () => {
    const headers = ["Fecha", "Cliente", "Productos", "Cantidad total", "Canal", "Método de pago", "Cuenta MP", "Moneda", "Subtotal", "Descuento", "Motivo desc.", "Total"];
    const rows = sales.map(s => {
      const items = (s.items || []).map(i => { const p = getProduct(i.productId); return p ? `${p.brand} ${p.model} - ${p.flavor} (x${i.qty})` : `? (x${i.qty})`; }).join(" | ");
      const totalQty = (s.items || []).reduce((sum, i) => sum + (Number(i.qty) || 0), 0);
      return [formatDate(s.date), s.clientName || "", items, totalQty, s.channel || "", s.paymentMethod || "", s.mpAccount || "", s.currency || "ARS", s.subtotal || s.total, s.discountAmount || 0, s.discountReason || "", s.total];
    });
    download("ventas.csv", toCSV(headers, rows));
  };

  const exportPurchases = () => {
    const headers = ["Fecha", "Proveedor", "Estado", "Productos", "Cantidad total", "Vapes USDT", "Comisión prov. USDT", "Total USDT pagado", "Pasero ARS", "Envío ARS", "Costo total ARS", "Notas"];
    const rows = purchases.map(p => {
      const items = (p.items || []).map(i => { const pr = getProduct(i.productId); return pr ? `${pr.brand} ${pr.model} - ${pr.flavor} (x${i.qty})` : `? (x${i.qty})`; }).join(" | ");
      return [formatDate(p.date), p.supplier || "", p.status || "", items, p.totalItems || "", p.totalUSDT || "", p.supplierCommUSDT || "", p.totalUSDTpaid || p.totalUSDT || "", p.paseroCostARS || "", p.envioCostARS || "", p.totalCostARS || "", p.notes || ""];
    });
    download("compras.csv", toCSV(headers, rows));
  };

  const exportExpenses = () => {
    const headers = ["Fecha", "Categoría", "Descripción", "Monto ARS", "Monto USD"];
    const rows = expenses.map(e => [formatDate(e.date), e.category, e.description || "", e.amountARS || 0, e.amountUSD || 0]);
    download("gastos.csv", toCSV(headers, rows));
  };

  const exportWithdrawals = () => {
    const headers = ["Fecha", "Producto", "Cantidad", "Quién", "Valor est. USD", "Nota"];
    const rows = withdrawals.map(w => {
      const p = getProduct(w.productId);
      return [formatDate(w.date), p ? `${p.brand} ${p.model} - ${p.flavor}` : "?", w.qty, w.person, w.costEstimateUSD || 0, w.notes || ""];
    });
    download("consumo_propio.csv", toCSV(headers, rows));
  };

  const exportCashMovements = () => {
    const headers = ["Fecha", "Tipo", "Desde", "Hacia", "Monto", "USDT", "Descripción"];
    const ACCTS = { mpDiego: "MP Diego", mpGustavo: "MP Gustavo", lemonPesos: "Lemon Pesos", lemonUSDT: "Lemon USDT", usdCash: "USD Cash", pesosCash: "Pesos Cash" };
    const rows = (cashMovements || []).map(m => [formatDate(m.date), m.type, ACCTS[m.from] || m.from || "", ACCTS[m.to] || m.to || "", m.amount || 0, m.amountUSDT || "", m.description || ""]);
    download("movimientos_caja.csv", toCSV(headers, rows));
  };

  const exportStockLog = () => {
    const headers = ["Fecha", "Tipo", "Producto", "Cantidad", "Detalle"];
    const TYPES = { venta: "Venta", compra: "Compra", consumo: "Consumo", ajuste: "Ajuste", devolucion: "Devolución" };
    const rows = (stockLog || []).map(l => {
      const p = getProduct(l.productId);
      return [formatDate(l.date), TYPES[l.type] || l.type, p ? `${p.brand} ${p.model} - ${p.flavor}` : "?", l.qty, l.reason || ""];
    });
    download("historial_stock.csv", toCSV(headers, rows));
  };

  const exportAll = async () => {
    setExporting(true);
    await new Promise(r => setTimeout(r, 100));
    exportStock(); await new Promise(r => setTimeout(r, 300));
    exportSales(); await new Promise(r => setTimeout(r, 300));
    exportPurchases(); await new Promise(r => setTimeout(r, 300));
    exportExpenses(); await new Promise(r => setTimeout(r, 300));
    exportWithdrawals(); await new Promise(r => setTimeout(r, 300));
    exportCashMovements(); await new Promise(r => setTimeout(r, 300));
    exportStockLog();
    setExporting(false);
  };

  const exports = [
    { label: "Stock actual", sub: `${products.length} productos`, icon: "📦", color: "#6366f1", fn: exportStock },
    { label: "Ventas", sub: `${sales.length} registros`, icon: "🛒", color: "#00b894", fn: exportSales },
    { label: "Compras", sub: `${purchases.length} pedidos`, icon: "🚚", color: "#6366f1", fn: exportPurchases },
    { label: "Gastos", sub: `${expenses.length} registros`, icon: "💸", color: "#fdcb6e", fn: exportExpenses },
    { label: "Consumo propio", sub: `${withdrawals.length} retiros`, icon: "🚬", color: "#e17055", fn: exportWithdrawals },
    { label: "Movimientos de caja", sub: `${(cashMovements || []).length} movimientos`, icon: "💱", color: "#00cec9", fn: exportCashMovements },
    { label: "Historial de stock", sub: `${(stockLog || []).length} entradas`, icon: "📋", color: "#fd79a8", fn: exportStockLog },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: "#1a1a2e", margin: 0, fontSize: 22 }}>Exportar Datos</h2>
          <span style={{ color: "#6b7280", fontSize: 13 }}>Descargá toda la información del sistema en CSV (compatible con Excel y Google Sheets)</span>
        </div>
        <Btn onClick={exportAll} style={{ background: exporting ? "#9ca3af" : "#6366f1" }}>
          {exporting ? "⏳ Exportando..." : "📥 Descargar TODO"}
        </Btn>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 14 }}>
        {exports.map(exp => (
          <Card key={exp.label} style={{ cursor: "pointer", transition: "all 0.2s", border: `1px solid ${exp.color}22` }}
            onClick={exp.fn}
            onMouseEnter={e => e.currentTarget.style.borderColor = exp.color + "66"}
            onMouseLeave={e => e.currentTarget.style.borderColor = exp.color + "22"}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 28 }}>{exp.icon}</span>
              <div>
                <div style={{ color: exp.color, fontSize: 15, fontWeight: 700 }}>{exp.label}</div>
                <div style={{ color: "#6b7280", fontSize: 12 }}>{exp.sub}</div>
              </div>
              <span style={{ marginLeft: "auto", color: "#6b7280", fontSize: 18 }}>⬇</span>
            </div>
          </Card>
        ))}
      </div>

      <Card style={{ marginTop: 20, background: "#f7f8fa", border: "1px solid #e2e4e9" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>💡</span>
          <span style={{ color: "#6b7280", fontSize: 13 }}>
            Los archivos CSV se abren con Excel, Google Sheets, o cualquier programa de planillas. El botón "Descargar TODO" baja los 7 archivos de una. Los datos incluyen toda la información registrada en el sistema.
          </span>
        </div>
      </Card>
    </div>
  );
};
