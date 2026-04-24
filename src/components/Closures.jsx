import { useState } from "react";
import { uid, formatMoney, formatDate, safeRate } from "../helpers.js";
import { Card, Btn, Badge, StatCard } from "./UI.jsx";
import { useResponsive } from "../App.jsx";

// -- MONTHLY CLOSURES --
export const MonthlyClosures = ({ monthlyClosures, setMonthlyClosures, sales, purchases, expenses, withdrawals, products, exchangeRate, logAudit }) => {
  const { isMobile } = useResponsive();
  const [showConfirm, setShowConfirm] = useState(false);

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentMonthLabel = now.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  const alreadyClosed = monthlyClosures.some(c => c.month === currentMonth);

  const mFilter = (d, month) => {
    if (!d) return false;
    const dt = new Date(d);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    return key === month;
  };

  const calcMonthData = (month) => {
    const monthSales = sales.filter(s => !s.isDeleted && mFilter(s.date, month));
    const monthPurchases = purchases.filter(p => !p.isDeleted && mFilter(p.date, month));
    const monthExpenses = expenses.filter(e => !e.isDeleted && mFilter(e.date, month));
    const monthWithdrawals = (withdrawals || []).filter(w => !w.isDeleted && mFilter(w.date, month));

    const totalSalesCount = monthSales.length;
    const totalUnits = monthSales.reduce((s, sale) => s + (sale.items || []).reduce((s2, i) => s2 + (Number(i.qty) || 0), 0), 0);
    const totalRevenue = monthSales.reduce((s, sale) => s + (sale.total || 0), 0);
    const totalDiscounts = monthSales.reduce((s, sale) => s + (sale.discountAmount || 0), 0);
    const totalExtras = monthSales.reduce((s, sale) => s + (sale.extrasTotal || 0), 0);
    const totalCostUSDT = monthPurchases.reduce((s, p) => s + (p.totalUSDT || 0), 0);
    const totalPasero = monthPurchases.reduce((s, p) => s + (p.paseroCostARS || 0), 0);
    const totalEnvio = monthPurchases.reduce((s, p) => s + (p.envioCostARS || 0), 0);
    const totalExpensesARS = monthExpenses.reduce((s, e) => s + (e.amountARS || 0), 0);
    const totalConsumo = monthWithdrawals.reduce((s, w) => s + w.qty, 0);
    const totalConsumoUSD = monthWithdrawals.reduce((s, w) => s + Number(w.costRealUSD || w.costEstimateUSD || 0), 0);
    const stockTotal = products.reduce((s, p) => s + (p.stock || 0), 0);
    const stockValue = products.reduce((s, p) => s + (p.stock || 0) * (p.priceUSD || 0), 0);

    // Ganancia neta: revenue − costos USDT (convertido a ARS) − pasero − envío − gastos − consumo común
    const rate = safeRate(exchangeRate);
    const totalCostARS = Math.round(totalCostUSDT * rate);
    const totalConsumoARS = Math.round(totalConsumoUSD * rate);
    const netProfitARS = totalRevenue - totalCostARS - totalPasero - totalEnvio - totalExpensesARS - totalConsumoARS;
    const marginPct = totalRevenue > 0 ? Math.round((netProfitARS / totalRevenue) * 100) : 0;

    return {
      totalSalesCount, totalUnits, totalRevenue, totalDiscounts, totalExtras,
      totalCostUSDT, totalCostARS, totalPasero, totalEnvio, totalExpensesARS,
      totalConsumo, totalConsumoUSD, totalConsumoARS,
      stockTotal, stockValue,
      netProfitARS, marginPct,
      purchasesCount: monthPurchases.length,
      expensesCount: monthExpenses.length,
    };
  };

  const [postActionsFor, setPostActionsFor] = useState(null); // closure object para post-acciones
  const [copyToast, setCopyToast] = useState("");

  const closeCurrent = () => {
    const data = calcMonthData(currentMonth);
    const closure = {
      id: uid(), month: currentMonth, label: currentMonthLabel,
      closedAt: new Date().toISOString(), exchangeRate,
      ...data
    };
    setMonthlyClosures(prev => [closure, ...prev]);
    setShowConfirm(false);
    setPostActionsFor(closure);
    if (logAudit) logAudit("create", "closure", closure.id, `Cierre mensual: ${closure.label} · ganancia ${formatMoney(closure.netProfitARS)}`);
  };

  // Generador del resumen WhatsApp
  const buildSummary = (c) => {
    const lines = [
      `📅 *Cierre ${c.label}* · IZN`,
      ``,
      `💵 *Ingresos:* ${formatMoney(c.totalRevenue)} · ${c.totalSalesCount} ventas · ${c.totalUnits} uds`,
      `📦 *Compras:* ${formatMoney(c.totalCostUSDT, "USDT")} (${c.purchasesCount} pedidos)`,
      `🚚 *Pasero + envío:* ${formatMoney((c.totalPasero || 0) + (c.totalEnvio || 0))}`,
      `💸 *Gastos:* ${formatMoney(c.totalExpensesARS)}`,
      `📉 *Mermas:* ${c.totalConsumo} uds · ${formatMoney(c.totalConsumoUSD, "USD")}`,
      ``,
      `📊 *Ganancia neta:* ${formatMoney(c.netProfitARS)} (${c.marginPct}% margen)`,
      ``,
      `📦 Stock actual: ${c.stockTotal} uds · ~${formatMoney(c.stockValue, "USD")}`,
      `💱 Blue al cierre: $${c.exchangeRate}`,
    ];
    return lines.join("\n");
  };

  // Descarga CSV del cierre (key=value por línea)
  const downloadCSV = (c) => {
    const rows = [
      ["Mes", c.label],
      ["Fecha cierre", new Date(c.closedAt).toLocaleString("es-AR")],
      ["Cotización blue", c.exchangeRate],
      ["", ""],
      ["INGRESOS", ""],
      ["Ventas (count)", c.totalSalesCount],
      ["Unidades vendidas", c.totalUnits],
      ["Revenue ARS", c.totalRevenue],
      ["Descuentos aplicados", c.totalDiscounts],
      ["Extras cobrados", c.totalExtras || 0],
      ["", ""],
      ["COSTOS", ""],
      ["Compras USDT", c.totalCostUSDT],
      ["Compras ARS equivalente", c.totalCostARS || 0],
      ["Pasero ARS", c.totalPasero],
      ["Envío ARS", c.totalEnvio],
      ["Gastos ARS", c.totalExpensesARS],
      ["", ""],
      ["MERMAS", ""],
      ["Unidades merma", c.totalConsumo],
      ["Valor USD merma", c.totalConsumoUSD],
      ["", ""],
      ["RESULTADO", ""],
      ["Ganancia neta ARS", c.netProfitARS],
      ["Margen %", c.marginPct],
      ["", ""],
      ["STOCK AL CIERRE", ""],
      ["Unidades", c.stockTotal],
      ["Valor USD", c.stockValue],
    ];
    const csv = rows.map(r => r.map(cell => {
      const s = String(cell ?? "");
      return s.includes(",") || s.includes("\"") ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `IZN_Cierre_${c.month}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copySummary = async (c) => {
    try {
      await navigator.clipboard.writeText(buildSummary(c));
      setCopyToast("✓ Resumen copiado");
    } catch {
      setCopyToast("No se pudo copiar");
    }
    setTimeout(() => setCopyToast(""), 2200);
  };

  const openWhatsApp = (c) => {
    const url = `https://wa.me/?text=${encodeURIComponent(buildSummary(c))}`;
    window.open(url, "_blank", "noopener");
  };

  const [confirmDelClosure, setConfirmDelClosure] = useState(null);
  const deleteClosure = (id) => {
    if (confirmDelClosure !== id) { setConfirmDelClosure(id); setTimeout(() => setConfirmDelClosure(null), 3000); return; }
    const c = monthlyClosures.find(x => x.id === id);
    setMonthlyClosures(prev => prev.filter(x => x.id !== id));
    if (logAudit && c) logAudit("delete", "closure", id, `Eliminó cierre: ${c.label || c.month}`);
    setConfirmDelClosure(null);
  };

  // Preview current month
  const preview = calcMonthData(currentMonth);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: "#37352F", margin: 0, fontSize: 22 }}>Cierres Mensuales</h2>
          <span style={{ color: "#8C8A82", fontSize: 13 }}>Foto financiera de cada mes para comparar evolución</span>
        </div>
        {!alreadyClosed ? (
          <Btn onClick={() => setShowConfirm(true)}>📅 Cerrar {currentMonthLabel}</Btn>
        ) : (
          <Badge color="#00b894">✅ {currentMonthLabel} cerrado</Badge>
        )}
      </div>

      {/* Confirm closure */}
      {showConfirm && (
        <Card style={{ marginBottom: 14, background: "#FAFAF9", border: "1px solid #5E6AD244" }}>
          <h4 style={{ color: "#5E6AD2", margin: "0 0 10px", fontSize: 14 }}>¿Cerrar {currentMonthLabel}?</h4>
          <span style={{ color: "#8C8A82", fontSize: 13 }}>Se va a guardar una foto con todos los números del mes. Podés seguir registrando ventas normalmente después del cierre.</span>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <Btn variant="success" onClick={closeCurrent}>✅ Confirmar cierre</Btn>
            <Btn variant="secondary" onClick={() => setShowConfirm(false)}>Cancelar</Btn>
          </div>
        </Card>
      )}

      {/* Post-close actions */}
      {postActionsFor && (
        <Card style={{ marginBottom: 14, background: "#DDEDEA", border: "1px solid #0F7B6C55" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <h4 style={{ color: "#0F7B6C", margin: 0, fontSize: 14 }}>✅ Cierre guardado · acciones disponibles</h4>
            <button onClick={() => setPostActionsFor(null)} style={{ background: "none", border: "none", color: "#0F7B6C", fontSize: 18, cursor: "pointer" }}>×</button>
          </div>
          <p style={{ fontSize: 13, color: "#37352F", margin: "0 0 12px" }}>
            Ganancia neta del mes: <strong>{formatMoney(postActionsFor.netProfitARS)}</strong> ({postActionsFor.marginPct}% margen)
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => downloadCSV(postActionsFor)} style={{
              padding: "10px 16px", minHeight: 42, border: "1px solid #5E6AD2", borderRadius: 8,
              background: "#EEF0FC", color: "#5E6AD2", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>📥 Descargar CSV</button>
            <button onClick={() => copySummary(postActionsFor)} style={{
              padding: "10px 16px", minHeight: 42, border: "none", borderRadius: 8,
              background: "#5E6AD2", color: "#FFFFFF", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>📋 Copiar resumen</button>
            <button onClick={() => openWhatsApp(postActionsFor)} style={{
              padding: "10px 16px", minHeight: 42, border: "none", borderRadius: 8,
              background: "#25D366", color: "#FFFFFF", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>📲 Enviar por WhatsApp</button>
          </div>
        </Card>
      )}

      {/* Current month preview */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          <h4 style={{ color: "#fdcb6e", margin: 0, fontSize: 14, textTransform: "uppercase" }}>📊 {currentMonthLabel} (en curso)</h4>
          <div style={{ fontSize: 11, color: "#8C8A82" }}>
            Ganancia neta proyectada: <strong style={{ color: preview.netProfitARS >= 0 ? "#0F7B6C" : "#E03E3E", fontSize: 14 }}>{formatMoney(preview.netProfitARS)}</strong> · {preview.marginPct}%
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(140px, 1fr))", gap: isMobile ? 8 : 12 }}>
          <div><span style={{ color: "#8C8A82", fontSize: 11 }}>Ventas</span><div style={{ color: "#00b894", fontSize: 18, fontWeight: 700 }}>{preview.totalSalesCount}</div><span style={{ color: "#B1AFA7", fontSize: 11 }}>{preview.totalUnits} uds</span></div>
          <div><span style={{ color: "#8C8A82", fontSize: 11 }}>Ingresos</span><div style={{ color: "#00b894", fontSize: 18, fontWeight: 700 }}>{formatMoney(preview.totalRevenue)}</div></div>
          <div><span style={{ color: "#8C8A82", fontSize: 11 }}>Compras (USDT)</span><div style={{ color: "#5E6AD2", fontSize: 18, fontWeight: 700 }}>{formatMoney(preview.totalCostUSDT, "USDT")}</div><span style={{ color: "#B1AFA7", fontSize: 11 }}>{preview.purchasesCount} pedidos</span></div>
          <div><span style={{ color: "#8C8A82", fontSize: 11 }}>Pasero + Envío</span><div style={{ color: "#fdcb6e", fontSize: 18, fontWeight: 700 }}>{formatMoney(preview.totalPasero + preview.totalEnvio)}</div></div>
          <div><span style={{ color: "#8C8A82", fontSize: 11 }}>Gastos</span><div style={{ color: "#E03E3E", fontSize: 18, fontWeight: 700 }}>{formatMoney(preview.totalExpensesARS)}</div><span style={{ color: "#B1AFA7", fontSize: 11 }}>{preview.expensesCount} registros</span></div>
          <div><span style={{ color: "#8C8A82", fontSize: 11 }}>Descuentos</span><div style={{ color: "#fdcb6e", fontSize: 18, fontWeight: 700 }}>{formatMoney(preview.totalDiscounts)}</div></div>
          <div><span style={{ color: "#8C8A82", fontSize: 11 }}>Extras</span><div style={{ color: "#00b894", fontSize: 18, fontWeight: 700 }}>{formatMoney(preview.totalExtras)}</div></div>
          <div><span style={{ color: "#8C8A82", fontSize: 11 }}>Consumo/Merma</span><div style={{ color: "#e17055", fontSize: 18, fontWeight: 700 }}>{preview.totalConsumo} uds</div></div>
          <div><span style={{ color: "#8C8A82", fontSize: 11 }}>Stock actual</span><div style={{ color: "#5E6AD2", fontSize: 18, fontWeight: 700 }}>{preview.stockTotal} uds</div><span style={{ color: "#B1AFA7", fontSize: 11 }}>~{formatMoney(preview.stockValue, "USD")}</span></div>
        </div>
      </Card>

      {/* Historical closures */}
      {monthlyClosures.length > 0 && (
        <Card>
          <h4 style={{ color: "#a855f7", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>Historial de cierres</h4>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Mes", "Ventas", "Uds", "Ingresos", "Compras USDT", "Pasero+Envío", "Gastos", "Descuentos", "Merma", "Stock", "Blue", ""].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, color: "#8C8A82", textTransform: "uppercase", borderBottom: "1px solid #E8E7E3", fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthlyClosures.map(c => (
                  <tr key={c.id}>
                    <td style={{ padding: "8px 10px", fontSize: 13, color: "#37352F", borderBottom: "1px solid #F0EFEB", fontWeight: 600, textTransform: "capitalize" }}>{c.label}</td>
                    <td style={{ padding: "8px 10px", fontSize: 13, color: "#555247", borderBottom: "1px solid #F0EFEB" }}>{c.totalSalesCount}</td>
                    <td style={{ padding: "8px 10px", fontSize: 13, color: "#555247", borderBottom: "1px solid #F0EFEB" }}>{c.totalUnits}</td>
                    <td style={{ padding: "8px 10px", fontSize: 13, color: "#00b894", borderBottom: "1px solid #F0EFEB", fontWeight: 600 }}>{formatMoney(c.totalRevenue)}</td>
                    <td style={{ padding: "8px 10px", fontSize: 13, color: "#5E6AD2", borderBottom: "1px solid #F0EFEB" }}>{formatMoney(c.totalCostUSDT, "USDT")}</td>
                    <td style={{ padding: "8px 10px", fontSize: 13, color: "#fdcb6e", borderBottom: "1px solid #F0EFEB" }}>{formatMoney((c.totalPasero || 0) + (c.totalEnvio || 0))}</td>
                    <td style={{ padding: "8px 10px", fontSize: 13, color: "#E03E3E", borderBottom: "1px solid #F0EFEB" }}>{formatMoney(c.totalExpensesARS)}</td>
                    <td style={{ padding: "8px 10px", fontSize: 13, color: "#fdcb6e", borderBottom: "1px solid #F0EFEB" }}>{formatMoney(c.totalDiscounts)}</td>
                    <td style={{ padding: "8px 10px", fontSize: 13, color: "#e17055", borderBottom: "1px solid #F0EFEB" }}>{c.totalConsumo} uds</td>
                    <td style={{ padding: "8px 10px", fontSize: 13, color: "#5E6AD2", borderBottom: "1px solid #F0EFEB" }}>{c.stockTotal} uds</td>
                    <td style={{ padding: "8px 10px", fontSize: 13, color: "#00b894", borderBottom: "1px solid #F0EFEB" }}>${c.exchangeRate}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #F0EFEB", display: "flex", gap: 4 }}>
                      <button onClick={() => downloadCSV(c)} title="Descargar CSV" style={{ background: "none", border: "none", color: "#5E6AD2", cursor: "pointer", fontSize: 14 }}>📥</button>
                      <button onClick={() => openWhatsApp(c)} title="Enviar por WhatsApp" style={{ background: "none", border: "none", color: "#25D366", cursor: "pointer", fontSize: 14 }}>📲</button>
                      <button onClick={() => deleteClosure(c.id)} style={{ background: "none", border: "none", color: "#E03E3E", cursor: "pointer", fontSize: 14 }}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {copyToast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#37352F", color: "#FFFFFF", padding: "12px 20px", borderRadius: 10,
          fontSize: 13, fontWeight: 600, zIndex: 1001,
          boxShadow: "0 6px 20px rgba(0,0,0,0.2)",
        }}>{copyToast}</div>
      )}
    </div>
  );
};
