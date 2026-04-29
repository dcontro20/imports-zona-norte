import { useState } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { calcPartnerBalances } from "../calcs.js";
import { Modal, Card, Btn, Input, Select, Table, Badge, StatCard } from "./UI.jsx";
import { useResponsive } from "../App.jsx";

// -- PARTNERS --
export const Partners = ({ partnerWithdrawals, setPartnerWithdrawals, sales, purchases, expenses, withdrawals, exchangeRate, currentUser, logAudit }) => {
  const { isMobile } = useResponsive();
  const [modal, setModal] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [form, setForm] = useState({ person: "Diego", amount: "", currency: "ARS", source: "", description: "", date: new Date().toISOString().slice(0, 10), tipoMovimiento: "retiro" });
  const [showHistory, setShowHistory] = useState(false);

  const SOURCES = ["MP Diego", "MP Gustavo", "Lemon (Pesos)", "Lemon (USDT)", "USD Cash", "Pesos Cash"];

  const save = () => {
    if (!form.amount || !form.person) return;
    const newId = uid();
    // Si es aporte, el monto se guarda negativo para que reste correctamente del balance
    const sign = form.tipoMovimiento === "aporte" ? -1 : 1;
    setPartnerWithdrawals(prev => [{ ...form, id: newId, amount: Number(form.amount) * sign, createdBy: currentUser?.name || "" }, ...prev]);
    if (logAudit) logAudit("create", "partnerWithdrawal", newId, `${form.tipoMovimiento === "aporte" ? "Aporte de capital" : "Retiro"} socio: ${form.person} · $${form.amount}`);
    setModal(false);
    setForm({ person: "Diego", amount: "", currency: "ARS", source: "", description: "", date: new Date().toISOString().slice(0, 10), tipoMovimiento: "retiro" });
  };

  const deleteW = (id) => {
    if (confirmDel !== id) { setConfirmDel(id); setTimeout(() => setConfirmDel(null), 3000); return; }
    const w = (partnerWithdrawals || []).find(x => x.id === id);
    setPartnerWithdrawals(prev => prev.map(x => x.id === id ? { ...x, isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: currentUser?.name || "?" } : x));
    if (logAudit && w) logAudit("delete", "partnerWithdrawal", id, `Eliminó retiro socio: ${w.person} · $${w.amount}`);
    setConfirmDel(null);
  };

  // Liquidar (settle): precarga el modal con el saldo pendiente del socio.
  // Un click y confirmás — crea el retiro, cerrando el saldo a 0.
  const settle = (person, balance) => {
    if (balance <= 0) return;
    setForm({
      person,
      amount: Math.round(balance * 100) / 100,
      currency: "ARS",
      source: person === "Diego" ? "MP Diego" : "MP Gustavo",
      description: `Liquidación de saldo pendiente`,
      date: new Date().toISOString().slice(0, 10),
    });
    setModal(true);
  };

  // Calculate business profit and partner balances using shared logic
  const {
    revenue, costs, expensesTotal, mermasComunes, netProfitComun, halfProfit,
    consumoDiego, consumoGustavo,
    diegoTotal, gustavoTotal, totalWithdrawn,
    netProfit, profitRemaining, diegoBalance, gustavoBalance,
  } = calcPartnerBalances(sales, purchases, expenses, withdrawals || [], partnerWithdrawals || [], exchangeRate);

  // S14.8 — Calculadora "qué retiramos este mes" con cap por balance real.
  // Regla: 70% del halfProfit COMO TECHO, pero NUNCA superar el balance del
  // socio (lo que efectivamente le queda a favor del pozo). Si el socio ya
  // tiene balance negativo (sobre-retiró), sugiere 0.
  // ANTES: la fórmula `halfProfit*0.7 - retiros` podía sugerir retiro a un
  // socio endeudado si halfProfit subió mucho — el cap por balance lo evita.
  const safeWithdrawDiego = Math.max(0, Math.min(
    Math.floor((halfProfit * 0.7) - diegoTotal),
    Math.floor(diegoBalance)
  ));
  const safeWithdrawGustavo = Math.max(0, Math.min(
    Math.floor((halfProfit * 0.7) - gustavoTotal),
    Math.floor(gustavoBalance)
  ));

  // S14.13 — Equidad desglosada: 4 números separados (retiros vs aportes
  // por socio) en lugar de un único equityDiff abstracto. Hace explícito
  // por qué hay desequilibrio: si Diego aportó capital, no es lo mismo que
  // si Gustavo se "llevó de más".
  // amount negativo en partnerWithdrawals = aporte (S10.3 convención)
  const sumByPersonAndDir = (person, isDeposit) => {
    return (partnerWithdrawals || [])
      .filter(w => !w.isDeleted && w.person === person)
      .reduce((sum, w) => {
        const isAporte = w.amount < 0 || w.tipoMovimiento === "aporte";
        if (isDeposit !== isAporte) return sum;
        const ars = (w.currency === "USD" || w.currency === "USDT")
          ? Math.abs(w.amount) * exchangeRate
          : Math.abs(w.amount);
        return sum + ars;
      }, 0);
  };
  const retirosDiego = sumByPersonAndDir("Diego", false);
  const aportesDiego = sumByPersonAndDir("Diego", true);
  const retirosGustavo = sumByPersonAndDir("Gustavo", false);
  const aportesGustavo = sumByPersonAndDir("Gustavo", true);

  // Reporte de equidad: saldo a favor o en contra entre socios
  const equityDiff = diegoBalance - gustavoBalance;
  const moreWithdrawn = equityDiff < 0 ? "Diego" : equityDiff > 0 ? "Gustavo" : null;

  // Export CSV de retiros del año actual por socio
  const exportYearCsv = (partner) => {
    const year = new Date().getFullYear();
    const rows = (partnerWithdrawals || [])
      .filter(w => !w.isDeleted && w.person === partner && new Date(w.date).getFullYear() === year)
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const header = "fecha,tipo,monto,moneda,source,descripcion";
    const escape = s => `"${String(s || "").replace(/"/g, '""')}"`;
    const csv = [header, ...rows.map(r => [
      r.date,
      r.amount < 0 ? "aporte" : (r.tipoMovimiento || "retiro"),
      Math.abs(r.amount),
      r.currency || "ARS",
      escape(r.source),
      escape(r.description),
    ].join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `IZN_${partner}_retiros_${year}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Helper para fila de breakdown del pozo común
  const Row = ({ label, value, color = "#37352F", bold }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}>
      <span style={{ color: "#555247", fontWeight: bold ? 700 : 500 }}>{label}</span>
      <span style={{ color, fontWeight: bold ? 800 : 600, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: "#37352F", margin: 0, fontSize: 22 }}>Socios — Diego & Gustavo</h2>
        <Btn onClick={() => setModal(true)}>💸 Registrar Retiro</Btn>
      </div>

      {/* ============================================ */}
      {/* POZO COMÚN — lo que se reparte 50/50 */}
      {/* ============================================ */}
      <Card style={{ marginBottom: 14, background: "#FAFAF9", border: "1px solid #5E6AD233" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#5E6AD2", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
          Pozo común · ganancia neta dividida 50/50
        </div>
        <Row label="Ingresos por ventas" value={`+${formatMoney(revenue)}`} color="#00b894" />
        <Row label="Costos de importación" value={`−${formatMoney(costs)}`} color="#E03E3E" />
        <Row label="Gastos operativos" value={`−${formatMoney(expensesTotal)}`} color="#E03E3E" />
        <Row label="Mermas comunes (garantías + regalos)" value={`−${formatMoney(mermasComunes)}`} color="#CB912F" />
        <div style={{ borderTop: "1px solid #E8E7E3", marginTop: 6, paddingTop: 6 }}>
          <Row label="Ganancia neta común" value={formatMoney(netProfitComun)} color={netProfitComun >= 0 ? "#00b894" : "#E03E3E"} bold />
          <Row label="Le toca a cada socio (50%)" value={formatMoney(halfProfit)} color="#5E6AD2" bold />
        </div>
      </Card>

      {/* ============================================ */}
      {/* POR SOCIO — share - consumo personal - retiros */}
      {/* ============================================ */}
      <Card style={{ marginBottom: 14, background: "#FAFAF9", border: "1px solid #E8E7E3" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#8C8A82", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
          Por socio · share común − consumo personal − retiros = saldo pendiente
        </div>

        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 14 : 20 }}>
          {/* Diego */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ color: "#5E6AD2", fontSize: 14, fontWeight: 700 }}>💜 Diego</span>
              {consumoDiego > halfProfit * 0.1 && (
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "#FDECC8", color: "#CB912F", fontWeight: 700 }}>
                  consumo personal alto
                </span>
              )}
            </div>
            <Row label="Le corresponde (50%)" value={formatMoney(halfProfit)} />
            <Row label="− Su consumo personal" value={`−${formatMoney(consumoDiego)}`} color={consumoDiego > 0 ? "#CB912F" : "#8C8A82"} />
            <Row label="− Sus retiros en plata" value={`−${formatMoney(diegoTotal)}`} color={diegoTotal > 0 ? "#fdcb6e" : "#8C8A82"} />
            <div style={{ borderTop: "1px solid #F0EFEB", marginTop: 4, paddingTop: 4 }}>
              <Row label="Saldo pendiente" value={formatMoney(diegoBalance)} color={diegoBalance >= 0 ? "#00b894" : "#E03E3E"} bold />
            </div>
            {diegoBalance > 0 && (
              <button onClick={() => settle("Diego", diegoBalance)} style={{
                marginTop: 10, width: "100%", padding: "8px 12px", minHeight: 36,
                background: "#DDEDEA", border: "1px solid #0F7B6C55", borderRadius: 8,
                color: "#0F7B6C", fontSize: 12, fontWeight: 700, cursor: "pointer",
                fontFamily: "inherit",
              }}>💰 Liquidar {formatMoney(diegoBalance)}</button>
            )}
          </div>

          <div style={{ width: isMobile ? "100%" : 1, height: isMobile ? 1 : "auto", background: "#E8E7E3" }} />

          {/* Gustavo */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ color: "#00b894", fontSize: 14, fontWeight: 700 }}>💙 Gustavo</span>
              {consumoGustavo > halfProfit * 0.1 && (
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "#FDECC8", color: "#CB912F", fontWeight: 700 }}>
                  consumo personal alto
                </span>
              )}
            </div>
            <Row label="Le corresponde (50%)" value={formatMoney(halfProfit)} />
            <Row label="− Su consumo personal" value={`−${formatMoney(consumoGustavo)}`} color={consumoGustavo > 0 ? "#CB912F" : "#8C8A82"} />
            <Row label="− Sus retiros en plata" value={`−${formatMoney(gustavoTotal)}`} color={gustavoTotal > 0 ? "#fdcb6e" : "#8C8A82"} />
            <div style={{ borderTop: "1px solid #F0EFEB", marginTop: 4, paddingTop: 4 }}>
              <Row label="Saldo pendiente" value={formatMoney(gustavoBalance)} color={gustavoBalance >= 0 ? "#00b894" : "#E03E3E"} bold />
            </div>
            {gustavoBalance > 0 && (
              <button onClick={() => settle("Gustavo", gustavoBalance)} style={{
                marginTop: 10, width: "100%", padding: "8px 12px", minHeight: 36,
                background: "#DDEDEA", border: "1px solid #0F7B6C55", borderRadius: 8,
                color: "#0F7B6C", fontSize: 12, fontWeight: 700, cursor: "pointer",
                fontFamily: "inherit",
              }}>💰 Liquidar {formatMoney(gustavoBalance)}</button>
            )}
          </div>
        </div>

        {/* Footer aclaratorio */}
        <div style={{
          marginTop: 12, padding: "8px 12px",
          background: "#EEF0FC", border: "1px solid #5E6AD233", borderRadius: 8,
          fontSize: 11, color: "#555247", lineHeight: 1.5,
        }}>
          ℹ️ <strong>Cómo se calcula:</strong> el consumo propio (Diego o Gustavo se fuman/usan
          un producto) se imputa 100% al socio que lo hizo, no al pozo común. Las garantías y
          regalos a clientes sí afectan el pozo común porque son gastos del negocio compartidos.
        </div>
      </Card>

      {/* Calculadora retiro sugerido + Reporte de equidad */}
      <Card style={{
        marginBottom: 14,
        background: "linear-gradient(135deg, #EAECF9 0%, #FFFFFF 100%)",
        border: "1px solid #D4D7F2",
      }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#37352F" }}>
          💡 Calculadora de retiro sugerido (deja 30% como capital de trabajo)
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div style={{ padding: 12, background: "#fff", borderRadius: 10, border: "1px solid #E8E7E3" }}>
            <div style={{ fontSize: 11, color: "#5E6AD2", fontWeight: 700, textTransform: "uppercase" }}>Diego puede retirar</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: safeWithdrawDiego > 0 ? "#0F7B6C" : "#8C8A82", fontFamily: "'Rubik', sans-serif" }}>
              {formatMoney(safeWithdrawDiego)}
            </div>
            <div style={{ fontSize: 10, color: "#8C8A82", marginTop: 2 }}>
              Ya retirado: {formatMoney(diegoTotal)} · Share: {formatMoney(halfProfit)}
            </div>
          </div>
          <div style={{ padding: 12, background: "#fff", borderRadius: 10, border: "1px solid #E8E7E3" }}>
            <div style={{ fontSize: 11, color: "#0F7B6C", fontWeight: 700, textTransform: "uppercase" }}>Gustavo puede retirar</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: safeWithdrawGustavo > 0 ? "#0F7B6C" : "#8C8A82", fontFamily: "'Rubik', sans-serif" }}>
              {formatMoney(safeWithdrawGustavo)}
            </div>
            <div style={{ fontSize: 10, color: "#8C8A82", marginTop: 2 }}>
              Ya retirado: {formatMoney(gustavoTotal)} · Share: {formatMoney(halfProfit)}
            </div>
          </div>
        </div>
        {/* S14.13 — Desglose explícito retiros vs aportes por socio */}
        <div style={{
          padding: 10, background: "#FAFAF9", border: "1px solid #E8E7E3",
          borderRadius: 8, fontSize: 12, color: "#37352F", marginBottom: 10,
        }}>
          <div style={{ fontSize: 11, color: "#8C8A82", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
            Movimientos del histórico
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: "#5E6AD2", fontWeight: 600 }}>Diego</div>
              <div style={{ fontSize: 11, color: "#37352F" }}>
                Retiró {formatMoney(retirosDiego)}
                {aportesDiego > 0 && <> · Aportó {formatMoney(aportesDiego)}</>}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#0F7B6C", fontWeight: 600 }}>Gustavo</div>
              <div style={{ fontSize: 11, color: "#37352F" }}>
                Retiró {formatMoney(retirosGustavo)}
                {aportesGustavo > 0 && <> · Aportó {formatMoney(aportesGustavo)}</>}
              </div>
            </div>
          </div>
        </div>
        {moreWithdrawn && Math.abs(equityDiff) > 1000 && (
          <div style={{
            padding: 10, background: "#FFF7E0", border: "1px solid #F2D59A",
            borderRadius: 8, fontSize: 12, color: "#A65800",
          }}>
            ⚖️ <strong>Desequilibrio detectado</strong>: <strong>{moreWithdrawn}</strong> tiene
            {" "}{formatMoney(Math.abs(equityDiff))} de saldo{equityDiff > 0 ? " a favor (le toca menos retiro)" : " en contra (le toca más retiro)"}.
            Para emparejar, el otro socio puede retirar {formatMoney(Math.abs(equityDiff))} extra del pozo.
          </div>
        )}
      </Card>

      {/* Resumen totales (compact) */}
      <Card style={{ marginBottom: 14, background: "#FFFFFF", border: "1px solid #E8E7E3" }}>
        <div style={{ display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 14, textAlign: "center" }}>
          <div>
            <div style={{ color: "#8C8A82", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Ganancia neta total</div>
            <div style={{ color: netProfit >= 0 ? "#00b894" : "#E03E3E", fontSize: 18, fontWeight: 800 }}>{formatMoney(netProfit)}</div>
            <div style={{ color: "#B1AFA7", fontSize: 10 }}>incluye consumo personal</div>
          </div>
          <div>
            <div style={{ color: "#8C8A82", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Retirado en plata</div>
            <div style={{ color: "#fdcb6e", fontSize: 18, fontWeight: 800 }}>{formatMoney(totalWithdrawn)}</div>
          </div>
          <div>
            <div style={{ color: "#8C8A82", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Sin retirar (común)</div>
            <div style={{ color: "#5E6AD2", fontSize: 18, fontWeight: 800 }}>{formatMoney(profitRemaining)}</div>
          </div>
        </div>
      </Card>

      {/* Withdrawal history */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <h4 style={{ color: "#fdcb6e", margin: 0, fontSize: 14, textTransform: "uppercase" }}>Historial de retiros / aportes</h4>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => exportYearCsv("Diego")} style={{
              padding: "6px 10px", borderRadius: 6, border: "1px solid #5E6AD2",
              background: "#5E6AD215", color: "#5E6AD2", fontSize: 11, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}>📥 Diego CSV</button>
            <button onClick={() => exportYearCsv("Gustavo")} style={{
              padding: "6px 10px", borderRadius: 6, border: "1px solid #0F7B6C",
              background: "#E8F5E9", color: "#0F7B6C", fontSize: 11, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}>📥 Gustavo CSV</button>
          </div>
        </div>
        <Table columns={[
          { key: "date", label: "Fecha", render: r => formatDate(r.date) },
          { key: "person", label: "Socio", render: r => <Badge color={r.person === "Diego" ? "#a855f7" : "#00b894"}>{r.person}</Badge> },
          { key: "tipo", label: "Tipo", render: r => {
            const isAporte = r.amount < 0 || r.tipoMovimiento === "aporte";
            return <Badge color={isAporte ? "#0F7B6C" : "#E03E3E"}>{isAporte ? "💰 Aporte" : "💸 Retiro"}</Badge>;
          }},
          { key: "amount", label: "Monto", render: r => <span style={{ color: "#fdcb6e", fontWeight: 700 }}>{formatMoney(r.amount, r.currency)}</span> },
          { key: "source", label: "Desde", render: r => r.source || "—" },
          { key: "description", label: "Detalle", render: r => r.description || "—" },
          { key: "actions", label: "", render: r => (
            confirmDel === r.id
              ? <button onClick={() => deleteW(r.id)} style={{ background: "#F7D7D6", border: "1px solid #E03E3E55", color: "#E03E3E", padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Confirmar</button>
              : <button onClick={() => deleteW(r.id)} style={{ background: "none", border: "none", color: "#E03E3E", cursor: "pointer", fontSize: 14 }}>🗑️</button>
          )},
        ]} data={(partnerWithdrawals || []).filter(w => !w.isDeleted)} emptyMsg="No hay retiros registrados" />
      </Card>

      {/* New withdrawal modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={form.tipoMovimiento === "aporte" ? "💰 Registrar Aporte de Capital" : "💸 Registrar Retiro de Socio"}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {[
            { value: "retiro", label: "💸 Retiro", color: "#E03E3E" },
            { value: "aporte", label: "💰 Aporte", color: "#0F7B6C" },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setForm(f => ({ ...f, tipoMovimiento: opt.value }))}
              style={{
                flex: 1, padding: "10px 14px", borderRadius: 8,
                border: `1px solid ${form.tipoMovimiento === opt.value ? opt.color : "#E8E7E3"}`,
                background: form.tipoMovimiento === opt.value ? `${opt.color}15` : "transparent",
                color: form.tipoMovimiento === opt.value ? opt.color : "#37352F",
                fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}
            >{opt.label}</button>
          ))}
        </div>
        <Input label="Fecha" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        <Select label="Socio" options={["Diego", "Gustavo"]} value={form.person} onChange={e => setForm(f => ({ ...f, person: e.target.value }))} />
        <div style={{ display: "flex", gap: 12 }}>
          <Input label="Monto" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="ej: 50000" />
          <Select label="Moneda" options={["ARS", "USD", "USDT"]} value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} />
        </div>
        <Select label="Desde qué cuenta" options={SOURCES} value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} />
        <Input label="Descripción (opcional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="ej: retiro semanal, pago de algo personal..." />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => setModal(false)}>Cancelar</Btn>
          <Btn onClick={save}>Registrar Retiro</Btn>
        </div>
      </Modal>
    </div>
  );
};
