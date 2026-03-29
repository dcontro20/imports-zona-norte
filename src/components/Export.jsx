import { useState } from "react";
import { formatMoney, formatDate } from "../helpers.js";
import { Card, Btn, Badge } from "./UI.jsx";

// -- EXPORT DATA & BACKUP --
export const ExportData = ({ products, sales, purchases, expenses, withdrawals, cashMovements, stockLog, priceLog, clients, partnerWithdrawals, monthlyClosures, exchangeRate }) => {
  const [exporting, setExporting] = useState(false);
  const [lastBackup, setLastBackup] = useState(() => {
    try { return localStorage.getItem("vapestock_lastBackup") || null; } catch { return null; }
  });

  const getProduct = (id) => products.find(p => p.id === id);

  const toCSV = (headers, rows) => {
    const escape = (v) => { const s = String(v ?? ""); return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s; };
    return [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))].join("\n");
  };

  const download = (filename, content, type = "text/csv;charset=utf-8;") => {
    const BOM = "\uFEFF";
    const blob = new Blob([type.includes("json") ? content : BOM + content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  // ===== FULL JSON BACKUP =====
  const backupJSON = () => {
    const backup = {
      _meta: {
        version: "1.0",
        exportDate: new Date().toISOString(),
        exchangeRate,
        counts: {
          products: products.length,
          sales: sales.length,
          purchases: purchases.length,
          clients: (clients || []).length,
          expenses: expenses.length,
          withdrawals: withdrawals.length,
          cashMovements: (cashMovements || []).length,
          stockLog: (stockLog || []).length,
          priceLog: (priceLog || []).length,
          partnerWithdrawals: (partnerWithdrawals || []).length,
          monthlyClosures: (monthlyClosures || []).length,
        }
      },
      products,
      sales,
      purchases,
      clients: clients || [],
      expenses,
      withdrawals,
      cashMovements: cashMovements || [],
      stockLog: stockLog || [],
      priceLog: priceLog || [],
      partnerWithdrawals: partnerWithdrawals || [],
      monthlyClosures: monthlyClosures || [],
      exchangeRate
    };
    const dateStr = new Date().toISOString().slice(0, 10);
    download(`backup_IZN_${dateStr}.json`, JSON.stringify(backup, null, 2), "application/json;charset=utf-8;");
    const now = new Date().toISOString();
    setLastBackup(now);
    try { localStorage.setItem("vapestock_lastBackup", now); } catch {}
  };

  // ===== CSV EXPORTS =====
  const exportStock = () => {
    const headers = ["Marca", "Modelo", "Sabor", "Puffs", "Stock", "Precio USD", "Precio ARS (est.)", "Estado"];
    const rows = [...products].sort((a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model) || a.flavor.localeCompare(b.flavor))
      .map(p => [p.brand, p.model, p.flavor, p.puffs, p.stock, p.priceUSD, Math.round(p.priceUSD * exchangeRate), p.stock > 0 ? "Disponible" : "Agotado"]);
    download("stock_actual.csv", toCSV(headers, rows));
  };

  const exportSales = () => {
    const headers = ["Fecha", "Cliente", "Productos", "Cantidad total", "Canal", "Método de pago", "Cuenta MP", "Moneda", "TC usado", "Subtotal", "Descuento", "Motivo desc.", "Total", "Pagado", "Diferencia", "Accion saldo"];
    const rows = sales.map(s => {
      const items = (s.items || []).map(i => { const p = getProduct(i.productId); return p ? `${p.brand} ${p.model} - ${p.flavor} (x${i.qty})` : `? (x${i.qty})`; }).join(" | ");
      const totalQty = (s.items || []).reduce((sum, i) => sum + (Number(i.qty) || 0), 0);
      return [formatDate(s.date), s.clientName || "", items, totalQty, s.channel || "", s.paymentMethod || "", s.mpAccount || "", s.currency || "ARS", s.saleExchangeRate || exchangeRate, s.subtotal || s.total, s.discountAmount || 0, s.discountReason || "", s.total, s.totalPaid || "", s.paymentDiff || 0, s.balanceAction || "none"];
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

  const exportClients = () => {
    const headers = ["Nombre", "Teléfono", "Instagram", "Barrio", "Saldo", "Total compras", "Notas"];
    const rows = (clients || []).map(c => {
      const clientSales = sales.filter(s => s.clientId === c.id);
      const totalSpent = clientSales.reduce((sum, s) => sum + (s.total || 0), 0);
      return [c.name, c.phone || "", c.instagram || "", c.barrio || "", c.balance || 0, totalSpent, c.notes || ""];
    });
    download("clientes.csv", toCSV(headers, rows));
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
    exportStockLog(); await new Promise(r => setTimeout(r, 300));
    exportClients();
    setExporting(false);
  };

  const timeSince = (dateStr) => {
    if (!dateStr) return null;
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(hours / 24);
    if (days > 0) return `hace ${days} día${days > 1 ? "s" : ""}`;
    if (hours > 0) return `hace ${hours}h`;
    return "recién";
  };

  const daysSinceBackup = lastBackup ? Math.floor((Date.now() - new Date(lastBackup).getTime()) / 86400000) : null;
  const backupUrgent = daysSinceBackup === null || daysSinceBackup >= 7;
  const backupWarning = daysSinceBackup !== null && daysSinceBackup >= 3 && daysSinceBackup < 7;

  const totalRecords = products.length + sales.length + purchases.length + expenses.length + withdrawals.length + (cashMovements || []).length + (stockLog || []).length + (clients || []).length;

  const exports = [
    { label: "Stock actual", sub: `${products.length} productos`, icon: "📦", color: "#6366f1", fn: exportStock },
    { label: "Ventas", sub: `${sales.length} registros`, icon: "🛒", color: "#00b894", fn: exportSales },
    { label: "Compras", sub: `${purchases.length} pedidos`, icon: "🚚", color: "#6366f1", fn: exportPurchases },
    { label: "Gastos", sub: `${expenses.length} registros`, icon: "💸", color: "#fdcb6e", fn: exportExpenses },
    { label: "Consumo propio", sub: `${withdrawals.length} retiros`, icon: "🚬", color: "#e17055", fn: exportWithdrawals },
    { label: "Mov. de caja", sub: `${(cashMovements || []).length} movimientos`, icon: "💱", color: "#00cec9", fn: exportCashMovements },
    { label: "Historial stock", sub: `${(stockLog || []).length} entradas`, icon: "📋", color: "#fd79a8", fn: exportStockLog },
    { label: "Clientes", sub: `${(clients || []).length} registros`, icon: "👥", color: "#a855f7", fn: exportClients },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: "#1a1a2e", margin: 0, fontSize: 22 }}>Exportar y Respaldar</h2>
          <span style={{ color: "#6b7280", fontSize: 13 }}>Descargá backups completos o datos individuales en CSV</span>
        </div>
      </div>

      {/* BACKUP SECTION */}
      <Card style={{ marginBottom: 20, background: backupUrgent ? "linear-gradient(135deg, #dc262622, #ef444422)" : backupWarning ? "linear-gradient(135deg, #f59e0b11, #f59e0b22)" : "linear-gradient(135deg, #05966911, #34d39922)", border: `1px solid ${backupUrgent ? "#ef444444" : backupWarning ? "#f59e0b44" : "#05966944"}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 50, height: 50, borderRadius: 14, background: backupUrgent ? "#ef444422" : backupWarning ? "#f59e0b22" : "#05966922", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
              {backupUrgent ? "🚨" : backupWarning ? "⚠️" : "🛡️"}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e" }}>Backup Completo</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                {totalRecords.toLocaleString()} registros totales · {lastBackup ? `Último backup: ${timeSince(lastBackup)}` : "Nunca se hizo un backup"}
              </div>
              {backupUrgent && <div style={{ fontSize: 11, color: "#ef4444", fontWeight: 600, marginTop: 2 }}>Se recomienda hacer backup al menos una vez por semana</div>}
              {backupWarning && <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600, marginTop: 2 }}>Hay datos nuevos desde tu último backup</div>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={backupJSON} style={{ background: "#059669", fontSize: 14, padding: "10px 20px" }}>
              🛡️ Descargar Backup JSON
            </Btn>
            <Btn onClick={exportAll} style={{ background: exporting ? "#9ca3af" : "#6366f1", fontSize: 13 }}>
              {exporting ? "⏳ Exportando..." : "📥 CSV Todo"}
            </Btn>
          </div>
        </div>
      </Card>

      {/* Individual exports */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14, marginBottom: 20 }}>
        {exports.map(exp => (
          <Card key={exp.label} style={{ cursor: "pointer", transition: "all 0.2s", border: `1px solid ${exp.color}22` }}
            onClick={exp.fn}
            onMouseEnter={e => e.currentTarget.style.borderColor = exp.color + "66"}
            onMouseLeave={e => e.currentTarget.style.borderColor = exp.color + "22"}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 28 }}>{exp.icon}</span>
              <div>
                <div style={{ color: exp.color, fontSize: 14, fontWeight: 700 }}>{exp.label}</div>
                <div style={{ color: "#6b7280", fontSize: 12 }}>{exp.sub}</div>
              </div>
              <span style={{ marginLeft: "auto", color: "#6b7280", fontSize: 18 }}>⬇</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Info cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Card style={{ background: "#f7f8fa", border: "1px solid #e2e4e9" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>🛡️</span>
            <div>
              <div style={{ color: "#1a1a2e", fontSize: 13, fontWeight: 600 }}>Backup JSON</div>
              <span style={{ color: "#6b7280", fontSize: 12 }}>Un solo archivo con TODA la información del sistema. Ideal para respaldo completo o migración. Se puede restaurar.</span>
            </div>
          </div>
        </Card>
        <Card style={{ background: "#f7f8fa", border: "1px solid #e2e4e9" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>📊</span>
            <div>
              <div style={{ color: "#1a1a2e", fontSize: 13, fontWeight: 600 }}>Archivos CSV</div>
              <span style={{ color: "#6b7280", fontSize: 12 }}>Archivos individuales compatibles con Excel y Google Sheets para análisis detallado de cada área.</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
