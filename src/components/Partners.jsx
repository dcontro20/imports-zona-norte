import { useState } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { Modal, Card, Btn, Input, Select, Table, Badge, StatCard } from "./UI.jsx";

// -- PARTNERS --
export const Partners = ({ partnerWithdrawals, setPartnerWithdrawals, sales, purchases, expenses, withdrawals, exchangeRate, currentUser }) => {
  const [modal, setModal] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [form, setForm] = useState({ person: "Diego", amount: "", currency: "ARS", source: "", description: "", date: new Date().toISOString().slice(0, 10) });

  const SOURCES = ["MP Diego", "MP Gustavo", "Lemon (Pesos)", "Lemon (USDT)", "USD Cash", "Pesos Cash"];

  const save = () => {
    if (!form.amount || !form.person) return;
    setPartnerWithdrawals(prev => [{ ...form, id: uid(), amount: Number(form.amount), createdBy: currentUser?.name || "" }, ...prev]);
    setModal(false);
    setForm({ person: "Diego", amount: "", currency: "ARS", source: "", description: "", date: new Date().toISOString().slice(0, 10) });
  };

  const deleteW = (id) => {
    if (confirmDel !== id) { setConfirmDel(id); setTimeout(() => setConfirmDel(null), 3000); return; }
    setPartnerWithdrawals(prev => prev.filter(w => w.id !== id));
    setConfirmDel(null);
  };

  // Calculate business profit
  const totalRevenue = sales.reduce((s, sale) => s + (sale.total || 0), 0);
  const totalCosts = purchases.reduce((s, p) => s + (p.totalCostARS || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + (e.amountARS || 0), 0);
  const consumoValue = (withdrawals || []).reduce((s, w) => s + (w.costEstimateUSD || 0), 0) * exchangeRate;
  const netProfit = totalRevenue - totalCosts - totalExpenses - consumoValue;

  // Calculate withdrawals per partner
  const diegoWithdrawals = (partnerWithdrawals || []).filter(w => w.person === "Diego");
  const gustavoWithdrawals = (partnerWithdrawals || []).filter(w => w.person === "Gustavo");
  const diegoTotal = diegoWithdrawals.reduce((s, w) => s + (w.currency === "USD" ? w.amount * exchangeRate : w.currency === "USDT" ? w.amount * exchangeRate : w.amount), 0);
  const gustavoTotal = gustavoWithdrawals.reduce((s, w) => s + (w.currency === "USD" ? w.amount * exchangeRate : w.currency === "USDT" ? w.amount * exchangeRate : w.amount), 0);
  const totalWithdrawn = diegoTotal + gustavoTotal;
  const profitRemaining = netProfit - totalWithdrawn;
  const halfProfit = netProfit / 2;
  const diegoBalance = halfProfit - diegoTotal;
  const gustavoBalance = halfProfit - gustavoTotal;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: "#e0e0ff", margin: 0, fontSize: 22 }}>Socios — Diego & Gustavo</h2>
        <Btn onClick={() => setModal(true)}>💸 Registrar Retiro</Btn>
      </div>

      {/* Profit overview */}
      <Card style={{ marginBottom: 14, background: "#0d0d1a", border: "1px solid #a855f733" }}>
        <div style={{ display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 16, textAlign: "center", marginBottom: 14 }}>
          <div>
            <div style={{ color: "#6666aa", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Ganancia neta total</div>
            <div style={{ color: netProfit >= 0 ? "#00b894" : "#e74c3c", fontSize: 24, fontWeight: 800 }}>{formatMoney(netProfit)}</div>
          </div>
          <div>
            <div style={{ color: "#6666aa", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Retirado total</div>
            <div style={{ color: "#fdcb6e", fontSize: 24, fontWeight: 800 }}>{formatMoney(totalWithdrawn)}</div>
          </div>
          <div>
            <div style={{ color: "#6666aa", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Ganancia sin retirar</div>
            <div style={{ color: "#a855f7", fontSize: 24, fontWeight: 800 }}>{formatMoney(profitRemaining)}</div>
          </div>
        </div>
        <div style={{ borderTop: "1px solid #2a2a4a", paddingTop: 14, display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 20, textAlign: "center" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ color: "#a855f7", fontSize: 14, fontWeight: 700, marginBottom: 8 }}>💜 Diego (50%)</div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span style={{ color: "#8888aa", fontSize: 13 }}>Le corresponde</span>
              <span style={{ color: "#e0e0ff", fontWeight: 600 }}>{formatMoney(halfProfit)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span style={{ color: "#8888aa", fontSize: 13 }}>Ya retiró</span>
              <span style={{ color: "#fdcb6e", fontWeight: 600 }}>{formatMoney(diegoTotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid #1a1a30", marginTop: 4 }}>
              <span style={{ color: "#e0e0ff", fontSize: 14, fontWeight: 700 }}>Saldo pendiente</span>
              <span style={{ color: diegoBalance >= 0 ? "#00b894" : "#e74c3c", fontSize: 16, fontWeight: 800 }}>{formatMoney(diegoBalance)}</span>
            </div>
          </div>
          <div style={{ width: 1, background: "#2a2a4a" }} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ color: "#00b894", fontSize: 14, fontWeight: 700, marginBottom: 8 }}>💙 Gustavo (50%)</div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span style={{ color: "#8888aa", fontSize: 13 }}>Le corresponde</span>
              <span style={{ color: "#e0e0ff", fontWeight: 600 }}>{formatMoney(halfProfit)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span style={{ color: "#8888aa", fontSize: 13 }}>Ya retiró</span>
              <span style={{ color: "#fdcb6e", fontWeight: 600 }}>{formatMoney(gustavoTotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid #1a1a30", marginTop: 4 }}>
              <span style={{ color: "#e0e0ff", fontSize: 14, fontWeight: 700 }}>Saldo pendiente</span>
              <span style={{ color: gustavoBalance >= 0 ? "#00b894" : "#e74c3c", fontSize: 16, fontWeight: 800 }}>{formatMoney(gustavoBalance)}</span>
            </div>
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
              ? <button onClick={() => deleteW(r.id)} style={{ background: "#e74c3c22", border: "1px solid #e74c3c55", color: "#e74c3c", padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Confirmar</button>
              : <button onClick={() => deleteW(r.id)} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 14 }}>🗑️</button>
          )},
        ]} data={partnerWithdrawals || []} emptyMsg="No hay retiros registrados" />
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
