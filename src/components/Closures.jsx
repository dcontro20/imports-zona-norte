import { useState } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { Card, Btn, Badge, StatCard } from "./UI.jsx";

// -- MONTHLY CLOSURES --
export const MonthlyClosures = ({ monthlyClosures, setMonthlyClosures, sales, purchases, expenses, withdrawals, products, exchangeRate, logAudit }) => {
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
    const monthSales = sales.filter(s => mFilter(s.date, month));
    const monthPurchases = purchases.filter(p => mFilter(p.date, month));
    const monthExpenses = expenses.filter(e => mFilter(e.date, month));
    const monthWithdrawals = (withdrawals || []).filter(w => mFilter(w.date, month));

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
    const totalConsumoUSD = monthWithdrawals.reduce((s, w) => s + (w.costEstimateUSD || 0), 0);
    const stockTotal = products.reduce((s, p) => s + (p.stock || 0), 0);  const stockValue = products.reduce((s, p) => s + (p.stock || 0) * (p.priceUSD || 0), 0);

    return {
      totalSalesCount, totalUnits, totalRevenue, totalDiscounts, totalExtras,
      totalCostUSDT, totalPasero, totalEnvio, totalExpensesARS,
      totalConsumo, totalConsumoUSD, stockTotal, stockValue,
      purchasesCount: monthPurchases.length,
      expensesCount: monthExpenses.length,
    };
  };

  const closeCurrent = () => {
    const data = calcMonthData(currentMonth);
    const closure = {
      id: uid(), month: currentMonth, label: currentMonthLabel,
      closedAt: new Date().toISOString(), exchangeRate,
      ...data
    };
    setMonthlyClosures(prev => [closure, ...prev]);
    setShowConfirm(false);
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
          <h2 style={{ color: "#1a1a2e", margin: 0, fontSize: 22 }}>Cierres Mensuales</h2>
          <span style={{ color: "#6b7280", fontSize: 13 }}>Foto financiera de cada mes para comparar evolución</span>
        </div>
        {!alreadyClosed ? (
          <Btn onClick={() => setShowConfirm(true)}>📅 Cerrar {currentMonthLabel}</Btn>
        ) : (
          <Badge color="#00b894">✅ {currentMonthLabel} cerrado</Badge>
        )}
      </div>

      {/* Confirm closure */}
      {showConfirm && (
        <Card style={{ marginBottom: 14, background: "#f7f8fa", border: "1px solid #6366f144" }}>
          <h4 style={{ color: "#6366f1", margin: "0 0 10px", fontSize: 14 }}>¿Cerrar {currentMonthLabel}?</h4>
          <span style={{ color: "#6b7280", fontSize: 13 }}>Se va a guardar una foto con todos los números del mes. Podés seguir registrando ventas normalmente después del cierre.</span>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <Btn variant="success" onClick={closeCurrent}>✅ Confirmar cierre</Btn>
            <Btn variant="secondary" onClick={() => setShowConfirm(false)}>Cancelar</Btn>
          </div>
        </Card>
      )}

      {/* Current month preview */}
      <Card style={{ marginBottom: 14 }}>
        <h4 style={{ color: "#fdcb6e", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>📊 {currentMonthLabel} (en curso)</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
          <div><span style={{ color: "#6b7280", fontSize: 11 }}>Ventas</span><div style={{ color: "#00b894", fontSize: 18, fontWeight: 700 }}>{preview.totalSalesCount}</div><span style={{ color: "#9ca3af", fontSize: 11 }}>{preview.totalUnits} uds</span></div>
          <div><span style={{ color: "#6b7280", fontSize: 11 }}>Ingresos</span><div style={{ color: "#00b894", fontSize: 18, fontWeight: 700 }}>{formatMoney(preview.totalRevenue)}</div></div>
          <div><span style={{ color: "#6b7280", fontSize: 11 }}>Compras (USDT)</span><div style={{ color: "#6366f1", fontSize: 18, fontWeight: 700 }}>{formatMoney(preview.totalCostUSDT, "USDT")}</div><span style={{ color: "#9ca3af", fontSize: 11 }}>{preview.purchasesCount} pedidos</span></div>
          <div><span style={{ color: "#6b7280", fontSize: 11 }}>Pasero + Envío</span><div style={{ color: "#fdcb6e", fontSize: 18, fontWeight: 700 }}>{formatMoney(preview.totalPasero + preview.totalEnvio)}</div></div>
          <div><span style={{ color: "#6b7280", fontSize: 11 }}>Gastos</span><div style={{ color: "#e74c3c", fontSize: 18, fontWeight: 700 }}>{formatMoney(preview.totalExpensesARS)}</div><span style={{ color: "#9ca3af", fontSize: 11 }}>{preview.expensesCount} registros</span></div>
          <div><span style={{ color: "#6b7280", fontSize: 11 }}>Descuentos</span><div style={{ color: "#fdcb6e", fontSize: 18, fontWeight: 700 }}>{formatMoney(preview.totalDiscounts)}</div></div>
          <div><span style={{ color: "#6b7280", fontSize: 11 }}>Extras</span><div style={{ color: "#00b894", fontSize: 18, fontWeight: 700 }}>{formatMoney(preview.totalExtras)}</div></div>
          <div><span style={{ color: "#6b7280", fontSize: 11 }}>Consumo/Merma</span><div style={{ color: "#e17055", fontSize: 18, fontWeight: 700 }}>{preview.totalConsumo} uds</div></div>
          <div><span style={{ color: "#6b7280", fontSize: 11 }}>Stock actual</span><div style={{ color: "#6366f1", fontSize: 18, fontWeight: 700 }}>{preview.stockTotal} uds</div><span style={{ color: "#9ca3af", fontSize: 11 }}>~{formatMoney(preview.stockValue, "USD")}</span></div>
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
                    <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, color: "#6b7280", textTransform: "uppercase", borderBottom: "1px solid #e2e4e9", fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthlyClosures.map(c => (
                  <tr key={c.id}>
                    <td style={{ padding: "8px 10px", fontSize: 13, color: "#1a1a2e", borderBottom: "1px solid #edf0f2", fontWeight: 600, textTransform: "capitalize" }}>{c.label}</td>
                    <td style={{ padding: "8px 10px", fontSize: 13, color: "#4b5563", borderBottom: "1px solid #edf0f2" }}>{c.totalSalesCount}</td>
                    <td style={{ padding: "8px 10px", fontSize: 13, color: "#4b5563", borderBottom: "1px solid #edf0f2" }}>{c.totalUnits}</td>
                    <td style={{ padding: "8px 10px", fontSize: 13, color: "#00b894", borderBottom: "1px solid #edf0f2", fontWeight: 600 }}>{formatMoney(c.totalRevenue)}</td>
                    <td style={{ padding: "8px 10px", fontSize: 13, color: "#6366f1", borderBottom: "1px solid #edf0f2" }}>{formatMoney(c.totalCostUSDT, "USDT")}</td>
                    <td style={{ padding: "8px 10px", fontSize: 13, color: "#fdcb6e", borderBottom: "1px solid #edf0f2" }}>{formatMoney((c.totalPasero || 0) + (c.totalEnvio || 0))}</td>
                    <td style={{ padding: "8px 10px", fontSize: 13, color: "#e74c3c", borderBottom: "1px solid #edf0f2" }}>{formatMoney(c.totalExpensesARS)}</td>
                    <td style={{ padding: "8px 10px", fontSize: 13, color: "#fdcb6e", borderBottom: "1px solid #edf0f2" }}>{formatMoney(c.totalDiscounts)}</td>
                    <td style={{ padding: "8px 10px", fontSize: 13, color: "#e17055", borderBottom: "1px solid #edf0f2" }}>{c.totalConsumo} uds</td>
                    <td style={{ padding: "8px 10px", fontSize: 13, color: "#6366f1", borderBottom: "1px solid #edf0f2" }}>{c.stockTotal} uds</td>
                    <td style={{ padding: "8px 10px", fontSize: 13, color: "#00b894", borderBottom: "1px solid #edf0f2" }}>${c.exchangeRate}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #edf0f2" }}>
                      <button onClick={() => deleteClosure(c.id)} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 14 }}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};
