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
  const [form, setForm] = useState({ person: "Diego", amount: "", currency: "ARS", source: "", description: "", date: new Date().toISOString().slice(0, 10) });

  const SOURCES = ["MP Diego", "MP Gustavo", "Lemon (Pesos)", "Lemon (USDT)", "USD Cash", "Pesos Cash"];

  const save = () => {
    if (!form.amount || !form.person) return;
    const newId = uid();
    setPartnerWithdrawals(prev => [{ ...form, id: newId, amount: Number(form.amount), createdBy: currentUser?.name || "" }, ...prev]);
    if (logAudit) logAudit("create", "partnerWithdrawal", newId, `Creó retiro socio: ${form.person} · $${form.amount}`);
    setModal(false);
    setForm({ person: "Diego", amount: "", currency: "ARS", source: "", description: "", date: new Date().toISOString().slice(0, 10) });
  };

  const deleteW = (id) => {
    if (confirmDel !== id) { setConfirmDel(id); setTimeout(() => setConfirmDel(null), 3000); return; }
    const w = (partnerWithdrawals || []).find(x => x.id === id);
    setPartnerWithdrawals(prev => prev.map(x => x.id === id ? { ...x, isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: currentUser?.name || "?" } : x));
    if (logAudit && w) logAudit("delete", "partnerWithdrawal", id, `Eliminó retiro socio: ${w.person} · $${w.amount}`);
    setConfirmDel(null);
  };

  // Calculate business profit and partner balances using shared logic
  const {
    revenue, costs, expensesTotal, mermasComunes, netProfitComun, halfProfit,
    consumoDiego, consumoGustavo,
    diegoTotal, gustavoTotal, totalWithdrawn,
    netProfit, profitRemaining, diegoBalance, gustavoBalance,
  } = calcPartnerBalances(sales, purchases, expenses, withdrawals || [], partnerWithdrawals || [], exchangeRate);

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
        <h4 style={{ color: "#fdcb6e", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>Historial de retiros</h4>
        <Table columns={[
          { key: "date", label: "Fecha", render: r => formatDate(r.date) },
          { key: "person", label: "Socio", render: r => <Badge color={r.person === "Diego" ? "#a855f7" : "#00b894"}>{r.person}</Badge> },
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
      <Modal open={modal} onClose={() => setModal(false)} title="💸 Registrar Retiro de Socio">
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
