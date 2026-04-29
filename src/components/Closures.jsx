import { useState } from "react";
import { uid, formatMoney, formatDate, safeRate } from "../helpers.js";
import { calcMonthSummary } from "../calcs.js";
import { Card, Btn, Badge, StatCard } from "./UI.jsx";
import { useResponsive } from "../App.jsx";

// -- MONTHLY CLOSURES --
export const MonthlyClosures = ({ monthlyClosures, setMonthlyClosures, sales, purchases, expenses, withdrawals, products, exchangeRate, logAudit }) => {
  const { isMobile } = useResponsive();
  const [showConfirm, setShowConfirm] = useState(false);
  const [closureNotes, setClosureNotes] = useState("");

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentMonthLabel = now.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  const alreadyClosed = monthlyClosures.some(c => c.month === currentMonth);

  // Auto-cierre reminder: si estamos en los primeros 5 días del mes y el anterior no está cerrado
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonth = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const previousMonthLabel = previousMonthDate.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  const previousMonthClosed = monthlyClosures.some(c => c.month === previousMonth);
  const showReminder = now.getDate() <= 5 && !previousMonthClosed;

  const mFilter = (d, month) => {
    if (!d) return false;
    const dt = new Date(d);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    return key === month;
  };

  // calcMonthData ahora delega en calcMonthSummary (función pura única en calcs.js).
  // Antes esta función restaba TODAS las mermas (incluyendo consumo personal de socios)
  // del netProfitARS, lo que generaba un drift contra Partners.netProfitComun y
  // mostraba ganancia menor de la real. Ahora ambos usan la misma lógica:
  //   netProfitOperativo = revenue - costs - expenses - mermasComunes (sin personal)
  // Ver S14.4 + S14.6 en plan de mejoras.
  const calcMonthData = (month) => {
    return calcMonthSummary(month, {
      sales, purchases, expenses, withdrawals, products, exchangeRate,
    });
  };

  const [postActionsFor, setPostActionsFor] = useState(null); // closure object para post-acciones
  const [copyToast, setCopyToast] = useState("");

  // Calcula top productos y top clientes del mes (para snapshot detallado)
  const calcDetailedSnapshot = (month) => {
    const monthSales = (sales || []).filter(s => !s.isDeleted && (s.date || "").slice(0, 7) === month);
    const productMap = {};
    const clientMap = {};
    monthSales.forEach(s => {
      (s.items || []).forEach(it => {
        const key = it.productId;
        if (!productMap[key]) {
          const prod = (products || []).find(p => p.id === key);
          productMap[key] = { name: prod ? `${prod.brand} ${prod.model}` : "Desconocido", flavor: prod?.flavor || "", qty: 0 };
        }
        productMap[key].qty += (it.qty || 1);
      });
      if (s.clientName) {
        if (!clientMap[s.clientName]) clientMap[s.clientName] = { name: s.clientName, count: 0, revenue: 0 };
        clientMap[s.clientName].count += 1;
        clientMap[s.clientName].revenue += s.total || 0;
      }
    });
    const topProducts = Object.values(productMap).sort((a, b) => b.qty - a.qty).slice(0, 5);
    const topClients = Object.values(clientMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    return { topProducts, topClients };
  };

  const closeCurrent = () => {
    const data = calcMonthData(currentMonth);
    const detailed = calcDetailedSnapshot(currentMonth);
    const closure = {
      id: uid(), month: currentMonth, label: currentMonthLabel,
      closedAt: new Date().toISOString(), exchangeRate,
      notes: closureNotes.trim() || "",
      ...data,
      ...detailed,
    };
    setMonthlyClosures(prev => [closure, ...prev]);
    setShowConfirm(false);
    setClosureNotes("");
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
  // S14.16 — Export contable formato debe/haber para contador.
  // Una fila por transacción del mes (ventas, compras, gastos, mermas).
  // Columnas: fecha · concepto · categoría · debe (ARS) · haber (ARS) · moneda · ref
  // El "debe" es lo que sale (gastos, costos, mermas) y "haber" lo que entra (ingresos por venta).
  const downloadAccountingCSV = (c) => {
    const month = c.month;
    const rows = [];
    const escape = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const rate = c.exchangeRate || exchangeRate;
    const toARS = (amount, cur) => (cur === "USD" || cur === "USDT") ? Math.round((amount || 0) * rate) : (amount || 0);

    // Header
    rows.push(["Fecha", "Concepto", "Categoría", "Debe (ARS)", "Haber (ARS)", "Moneda original", "Monto original", "Ref"]);

    // VENTAS → haber
    sales.filter(s => !s.isDeleted && (s.date || "").slice(0, 7) === month)
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
      .forEach(s => {
        const cur = s.currency || "ARS";
        const ars = toARS(s.total, cur);
        rows.push([
          (s.date || "").slice(0, 10),
          `Venta ${s.clientName || "sin nombre"} (${s.channel || "?"})`,
          "Ingresos por ventas",
          0, ars, cur, s.total || 0, s.id,
        ]);
      });

    // COMPRAS verificadas → debe
    purchases.filter(p => !p.isDeleted && (p.date || "").slice(0, 7) === month && p.status === "verificado")
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
      .forEach(p => {
        const ars = p.totalCostARS || Math.round((p.totalUSDT || 0) * rate) + (p.paseroCostARS || 0) + (p.envioCostARS || 0);
        rows.push([
          (p.date || "").slice(0, 10),
          `Compra ${p.supplier || "?"} (lote ${p.loteNumber || "?"})`,
          "Costos mercadería",
          ars, 0, "USDT", p.totalUSDT || 0, p.id,
        ]);
      });

    // GASTOS → debe
    expenses.filter(e => !e.isDeleted && (e.date || "").slice(0, 7) === month)
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
      .forEach(e => {
        rows.push([
          (e.date || "").slice(0, 10),
          e.description || e.category || "Gasto",
          e.category || "Gastos operativos",
          e.amountARS || 0, 0, e.currency || "ARS", e.amountARS || 0, e.id,
        ]);
      });

    // MERMAS → debe (separadas en común vs personal)
    (withdrawals || []).filter(w => !w.isDeleted && (w.date || "").slice(0, 7) === month)
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
      .forEach(w => {
        const usd = Number(w.costRealUSD || w.costEstimateUSD || 0);
        const ars = Math.round(usd * rate);
        const isPersonal = w.withdrawType === "Consumo propio";
        const cat = isPersonal ? `Consumo personal ${w.person || ""}`.trim() : "Mermas operativas";
        rows.push([
          (w.date || "").slice(0, 10),
          `${w.withdrawType || "Merma"} ${w.qty || 0} uds`,
          cat,
          ars, 0, "USD", usd, w.id,
        ]);
      });

    // Totales finales
    rows.push(["", "", "", "", "", "", "", ""]);
    const totalDebe = rows.slice(1).reduce((s, r) => s + (Number(r[3]) || 0), 0);
    const totalHaber = rows.slice(1).reduce((s, r) => s + (Number(r[4]) || 0), 0);
    rows.push(["", "TOTALES", "", totalDebe, totalHaber, "", "", ""]);
    rows.push(["", "Resultado del mes (Haber − Debe)", "", "", totalHaber - totalDebe, "", "", ""]);

    const csv = rows.map(r => r.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `IZN_LibroMayor_${month}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => window.print()} style={{
            padding: "8px 14px", borderRadius: 8, border: "1px solid #E8E7E3",
            background: "transparent", color: "#37352F", fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }} title="Imprimir cierres como PDF">📄 PDF</button>
          {!alreadyClosed ? (
            <Btn onClick={() => setShowConfirm(true)}>📅 Cerrar {currentMonthLabel}</Btn>
          ) : (
            <Badge color="#00b894">✅ {currentMonthLabel} cerrado</Badge>
          )}
        </div>
      </div>

      {showReminder && (
        <Card style={{
          marginBottom: 14, background: "#FEF6E4",
          border: "1px solid #F2D59A",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>📅</span>
            <div style={{ flex: 1 }}>
              <strong style={{ color: "#A65800", fontSize: 13 }}>Recordatorio: cerrá {previousMonthLabel}</strong>
              <p style={{ margin: "2px 0 0", color: "#8C8A82", fontSize: 12 }}>
                Estamos en los primeros días del mes. Hacé el cierre del mes anterior antes de que se acumulen ajustes.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Confirm closure */}
      {showConfirm && (
        <Card style={{ marginBottom: 14, background: "#FAFAF9", border: "1px solid #5E6AD244" }}>
          <h4 style={{ color: "#5E6AD2", margin: "0 0 10px", fontSize: 14 }}>¿Cerrar {currentMonthLabel}?</h4>
          <span style={{ color: "#8C8A82", fontSize: 13 }}>Se va a guardar una foto con todos los números del mes + top productos/clientes. Podés seguir registrando ventas normalmente después del cierre.</span>
          <textarea
            value={closureNotes}
            onChange={e => setClosureNotes(e.target.value)}
            placeholder="📝 Notas del mes (opcional): contexto, eventos, decisiones tomadas..."
            rows={3}
            style={{
              width: "100%", padding: 10, marginTop: 10, marginBottom: 4,
              border: "1px solid #E8E7E3", borderRadius: 8,
              fontSize: 13, fontFamily: "inherit", resize: "vertical", outline: "none",
              background: "#FFF", color: "#37352F", boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <Btn variant="success" onClick={closeCurrent}>✅ Confirmar cierre</Btn>
            <Btn variant="secondary" onClick={() => { setShowConfirm(false); setClosureNotes(""); }}>Cancelar</Btn>
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
            }}>📥 Descargar resumen CSV</button>
            <button onClick={() => downloadAccountingCSV(postActionsFor)} style={{
              padding: "10px 16px", minHeight: 42, border: "1px solid #0F7B6C", borderRadius: 8,
              background: "#DDEDEA", color: "#0F7B6C", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }} title="Libro mayor en formato debe/haber para contador">📚 Libro mayor</button>
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
      {monthlyClosures.length >= 2 && (
        <Card style={{ marginBottom: 14 }}>
          <h4 style={{ color: "#37352F", margin: "0 0 14px", fontSize: 14, fontWeight: 700 }}>📈 Evolución últimos cierres</h4>
          {(() => {
            const recent = [...monthlyClosures]
              .sort((a, b) => (a.month || "").localeCompare(b.month || ""))
              .slice(-6);
            const maxRev = Math.max(1, ...recent.map(c => c.revenueARS || 0));
            const maxProf = Math.max(1, ...recent.map(c => Math.abs(c.netProfitARS || 0)));
            return (
              <div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 100, marginBottom: 8, paddingBottom: 18, borderBottom: "1px solid #E8E7E3" }}>
                  {recent.map(c => (
                    <div key={c.id} title={`${c.label}: rev ${formatMoney(c.revenueARS)} · profit ${formatMoney(c.netProfitARS)}`}
                      style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", gap: 2 }}>
                      <div style={{ height: `${((c.revenueARS || 0) / maxRev) * 70}%`, background: "#5E6AD2", borderRadius: "3px 3px 0 0" }} />
                      <div style={{
                        height: `${(Math.abs(c.netProfitARS || 0) / maxProf) * 30}%`,
                        background: (c.netProfitARS || 0) >= 0 ? "#00b894" : "#E03E3E",
                      }} />
                      <div style={{ fontSize: 9, color: "#8C8A82", textAlign: "center", marginTop: 4, whiteSpace: "nowrap" }}>
                        {c.month?.slice(5)}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 14, fontSize: 11, color: "#8C8A82" }}>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#5E6AD2", borderRadius: 2, marginRight: 4 }} />Revenue</span>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#00b894", borderRadius: 2, marginRight: 4 }} />Profit (verde) / Pérdida (rojo)</span>
                </div>
              </div>
            );
          })()}
        </Card>
      )}

      {monthlyClosures.length > 0 && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
            <h4 style={{ color: "#a855f7", margin: 0, fontSize: 14, textTransform: "uppercase" }}>Historial de cierres</h4>
            <button onClick={() => {
              // S14.10 — Detector de inconsistencias: compara los snapshots
              // guardados contra el cálculo actual (con datos vivos). Si la
              // diferencia supera 0.01 ARS en cualquier total, es un drift.
              const diffs = [];
              monthlyClosures.forEach(c => {
                const live = calcMonthData(c.month);
                const fields = [
                  ["totalRevenue", "Ingresos"],
                  ["totalCostARS", "Costos ARS"],
                  ["totalExpensesARS", "Gastos"],
                  ["mermasComunesARS", "Mermas comunes"],
                  ["consumoPersonalARS", "Consumo personal"],
                  ["netProfitOperativo", "Ganancia operativa"],
                ];
                fields.forEach(([key, label]) => {
                  const snap = Number(c[key] || 0);
                  const now = Number(live[key] || 0);
                  if (Math.abs(snap - now) > 0.01) {
                    diffs.push({ month: c.label, field: label, snap, now, diff: now - snap });
                  }
                });
              });
              if (diffs.length === 0) {
                alert("✓ Todos los cierres están consistentes con el dato actual.");
              } else {
                const msg = diffs.slice(0, 15).map(d =>
                  `${d.month} · ${d.field}: snapshot ${formatMoney(d.snap)} vs actual ${formatMoney(d.now)} (diff ${d.diff >= 0 ? "+" : ""}${formatMoney(d.diff)})`
                ).join("\n");
                alert(`⚠️ ${diffs.length} inconsistencias detectadas (cierres vs cálculo actual):\n\n${msg}${diffs.length > 15 ? "\n\n…y más." : ""}\n\nEsto pasa cuando se editaron ventas/compras/gastos de meses ya cerrados.`);
                console.warn("[S14.10] Inconsistencias entre cierres y cálculo actual:", diffs);
              }
            }} style={{
              padding: "7px 12px", borderRadius: 8,
              border: "1px solid #E8E7E3",
              background: "transparent", color: "#37352F",
              fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}>🧮 Verificar consistencia</button>
          </div>
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
                      <button onClick={() => downloadCSV(c)} title="Descargar CSV resumen" style={{ background: "none", border: "none", color: "#5E6AD2", cursor: "pointer", fontSize: 14 }}>📥</button>
                      <button onClick={() => downloadAccountingCSV(c)} title="Libro mayor (CSV contable debe/haber)" style={{ background: "none", border: "none", color: "#0F7B6C", cursor: "pointer", fontSize: 14 }}>📚</button>
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
