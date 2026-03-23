import { useState } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { Modal, Card, Btn, Input, Select, Table, Badge, StatCard } from "./UI.jsx";

// -- CASH / CAJA --
const INITIAL_BALANCES = {
  lemonPesos: 305523.10,
  lemonUSDT: 40.12,
  mpDiego: 0,
  mpGustavo: 0,
  usdCash: 0,
  pesosCash: 13000,
};

const ACCOUNTS = [
  { id: "mpDiego", label: "MP Diego", currency: "ARS", icon: "💜", color: "#a855f7" },
  { id: "mpGustavo", label: "MP Gustavo", currency: "ARS", icon: "💙", color: "#00b894" },
  { id: "lemonPesos", label: "Lemon (Pesos)", currency: "ARS", icon: "🍋", color: "#f9ca24" },
  { id: "lemonUSDT", label: "Lemon (USDT)", currency: "USDT", icon: "🍋", color: "#26de81" },
  { id: "usdCash", label: "USD Cash", currency: "USD", icon: "💵", color: "#00cec9" },
  { id: "pesosCash", label: "Pesos Cash", currency: "ARS", icon: "💰", color: "#fdcb6e" },
];

const MOVEMENT_TYPES = [
  { value: "transfer", label: "Transferencia entre cuentas" },
  { value: "crypto_buy", label: "Compra USDT (pesos → crypto)" },
  { value: "deposit", label: "Ingreso / Depósito" },
  { value: "withdrawal", label: "Retiro / Extracción" },
];

export const CashBox = ({ sales, purchases, expenses, withdrawals, cashMovements, setCashMovements, exchangeRate, setExchangeRate, currentUser }) => {
  const [modal, setModal] = useState(false);
  const [moveForm, setMoveForm] = useState({ type: "transfer", from: "", to: "", amount: "", amountUSDT: "", description: "", date: new Date().toISOString().slice(0, 10) });

  // Calculate account balances including movements
  const calcBalance = (accountId) => {
    let bal = INITIAL_BALANCES[accountId] || 0;
    
    // Add from sales
    if (accountId === "mpDiego") bal += sales.filter(s => s.paymentMethod === "Mercado Pago" && s.mpAccount === "MP Diego").reduce((s, sale) => s + sale.total, 0);
    if (accountId === "mpGustavo") bal += sales.filter(s => s.paymentMethod === "Mercado Pago" && s.mpAccount === "MP Gustavo").reduce((s, sale) => s + sale.total, 0);
    if (accountId === "lemonPesos") bal += sales.filter(s => s.paymentMethod === "Lemon").reduce((s, sale) => s + sale.total, 0);
    if (accountId === "lemonUSDT") {
      bal += sales.filter(s => s.paymentMethod === "USDT").reduce((s, sale) => s + sale.total, 0);
      bal -= purchases.filter(p => p.status === "verificado" || !p.status).reduce((s, p) => s + (p.totalUSDT || 0), 0);
    }
    if (accountId === "usdCash") bal += sales.filter(s => s.paymentMethod === "USD Cash").reduce((s, sale) => s + sale.total, 0);
    if (accountId === "pesosCash") bal += sales.filter(s => s.paymentMethod === "Pesos Cash").reduce((s, sale) => s + sale.total, 0);
    
    // Apply cash movements
    (cashMovements || []).forEach(m => {
      if (m.from === accountId) bal -= Number(m.amount) || 0;
      if (m.to === accountId) {
        if (m.type === "crypto_buy" && accountId === "lemonUSDT") bal += Number(m.amountUSDT) || 0;
        else bal += Number(m.amount) || 0;
      }
    });
    
    return bal;
  };

  const balances = {};
  ACCOUNTS.forEach(a => { balances[a.id] = calcBalance(a.id); });

  const totalARS = (balances.mpDiego || 0) + (balances.mpGustavo || 0) + (balances.lemonPesos || 0) + (balances.pesosCash || 0);
  const totalUSD = balances.usdCash || 0;
  const totalUSDT = balances.lemonUSDT || 0;

  const saveMovement = () => {
    if (!moveForm.amount || (!moveForm.from && !moveForm.to)) return;
    const movement = { ...moveForm, id: uid(), amount: Number(moveForm.amount), amountUSDT: Number(moveForm.amountUSDT) || 0, createdBy: currentUser?.name || "" };
    setCashMovements(prev => [movement, ...prev]);
    setModal(false);
    setMoveForm({ type: "transfer", from: "", to: "", amount: "", amountUSDT: "", description: "", date: new Date().toISOString().slice(0, 10) });
  };

  const [confirmDeleteMov, setConfirmDeleteMov] = useState(null);
  const deleteMovement = (id) => {
    if (confirmDeleteMov !== id) { setConfirmDeleteMov(id); setTimeout(() => setConfirmDeleteMov(null), 3000); return; }
    setCashMovements(prev => prev.filter(m => m.id !== id));
    setConfirmDeleteMov(null);
  };

  const getAccountLabel = (id) => ACCOUNTS.find(a => a.id === id)?.label || id;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: "#e0e0ff", margin: 0, fontSize: 22 }}>Caja Multi-Moneda</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#8888aa", fontSize: 13 }}>Blue:</span>
          <input type="number" value={exchangeRate} onChange={e => setExchangeRate(Number(e.target.value))}
            style={{ width: 90, padding: "6px 10px", background: "#12122a", border: "1px solid #2a2a4a", borderRadius: 8, color: "#00b894", fontSize: 14, fontWeight: 700 }} />
          <Btn onClick={() => setModal(true)} style={{ padding: "8px 14px" }}>💱 Movimiento</Btn>
        </div>
      </div>

      {/* Totals */}
      <Card style={{ marginBottom: 14, background: "#0d0d1a", border: "1px solid #a855f733" }}>
        <div style={{ display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 16, textAlign: "center" }}>
          <div>
            <div style={{ color: "#6666aa", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Total Pesos</div>
            <div style={{ color: "#a855f7", fontSize: 22, fontWeight: 800 }}>{formatMoney(totalARS)}</div>
          </div>
          <div>
            <div style={{ color: "#6666aa", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Total USD</div>
            <div style={{ color: "#00cec9", fontSize: 22, fontWeight: 800 }}>{formatMoney(totalUSD, "USD")}</div>
          </div>
          <div>
            <div style={{ color: "#6666aa", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Total USDT</div>
            <div style={{ color: "#26de81", fontSize: 22, fontWeight: 800 }}>{formatMoney(totalUSDT, "USDT")}</div>
          </div>
          <div>
            <div style={{ color: "#6666aa", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Todo en ARS</div>
            <div style={{ color: "#fdcb6e", fontSize: 22, fontWeight: 800 }}>{formatMoney(totalARS + (totalUSD * exchangeRate) + (totalUSDT * exchangeRate))}</div>
          </div>
        </div>
      </Card>

      {/* Account cards */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        {ACCOUNTS.map(a => (
          <StatCard key={a.id} label={a.label} value={formatMoney(balances[a.id], a.currency)} icon={a.icon} color={a.color} />
        ))}
      </div>

      {/* Recent movements */}
      <Card>
        <h4 style={{ color: "#a855f7", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>💱 Movimientos de caja</h4>
        <Table columns={[
          { key: "date", label: "Fecha", render: r => formatDate(r.date) },
          { key: "type", label: "Tipo", render: r => {
            const t = MOVEMENT_TYPES.find(mt => mt.value === r.type);
            return <Badge color={r.type === "crypto_buy" ? "#26de81" : r.type === "deposit" ? "#00b894" : r.type === "withdrawal" ? "#e74c3c" : "#a855f7"}>{t?.label || r.type}</Badge>;
          }},
          { key: "from", label: "Desde", render: r => r.from ? getAccountLabel(r.from) : "—" },
          { key: "to", label: "Hacia", render: r => r.to ? getAccountLabel(r.to) : "—" },
          { key: "amount", label: "Monto", render: r => {
            const fromAcc = ACCOUNTS.find(a => a.id === r.from);
            return formatMoney(r.amount, fromAcc?.currency || "ARS");
          }},
          { key: "usdt", label: "USDT", render: r => r.amountUSDT ? formatMoney(r.amountUSDT, "USDT") : "—" },
          { key: "desc", label: "Detalle", render: r => r.description || "—" },
          { key: "actions", label: "", render: r => (
            confirmDeleteMov === r.id
            ? <button onClick={() => deleteMovement(r.id)} style={{ background: "#e74c3c22", border: "1px solid #e74c3c55", color: "#e74c3c", padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Confirmar</button>
            : <button onClick={() => deleteMovement(r.id)} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 14 }}>🗑️</button>
          )},
        ]} data={cashMovements || []} emptyMsg="No hay movimientos registrados" />
      </Card>

      {/* Movement Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="💱 Nuevo Movimiento de Caja">
        <Input label="Fecha" type="date" value={moveForm.date} onChange={e => setMoveForm(f => ({ ...f, date: e.target.value }))} />
        <Select label="Tipo de movimiento" options={MOVEMENT_TYPES.map(t => ({ value: t.value, label: t.label }))} value={moveForm.type} onChange={e => setMoveForm(f => ({ ...f, type: e.target.value, from: "", to: "" }))} />
        
        {(moveForm.type === "transfer" || moveForm.type === "crypto_buy") && (
          <div style={{ display: "flex", gap: 12 }}>
            <Select label="Desde" options={ACCOUNTS.map(a => ({ value: a.id, label: `${a.icon} ${a.label}` }))} value={moveForm.from} onChange={e => setMoveForm(f => ({ ...f, from: e.target.value }))} />
            <Select label="Hacia" options={ACCOUNTS.map(a => ({ value: a.id, label: `${a.icon} ${a.label}` }))} value={moveForm.to} onChange={e => setMoveForm(f => ({ ...f, to: e.target.value }))} />
          </div>
        )}

        {moveForm.type === "deposit" && (
          <Select label="Cuenta destino" options={ACCOUNTS.map(a => ({ value: a.id, label: `${a.icon} ${a.label}` }))} value={moveForm.to} onChange={e => setMoveForm(f => ({ ...f, to: e.target.value }))} />
        )}

        {moveForm.type === "withdrawal" && (
          <Select label="Cuenta origen" options={ACCOUNTS.map(a => ({ value: a.id, label: `${a.icon} ${a.label}` }))} value={moveForm.from} onChange={e => setMoveForm(f => ({ ...f, from: e.target.value }))} />
        )}

        <Input label={moveForm.type === "crypto_buy" ? "Monto en pesos" : "Monto"} type="number" value={moveForm.amount} onChange={e => setMoveForm(f => ({ ...f, amount: e.target.value }))} placeholder="ej: 100000" />
        
        {moveForm.type === "crypto_buy" && (
          <>
            <Input label="USDT recibidos" type="number" value={moveForm.amountUSDT} onChange={e => setMoveForm(f => ({ ...f, amountUSDT: e.target.value }))} placeholder="ej: 65.5" />
            {moveForm.amount && moveForm.amountUSDT && (
              <div style={{ color: "#26de81", fontSize: 13, marginBottom: 8 }}>
                Cotización: {formatMoney(Math.round(Number(moveForm.amount) / Number(moveForm.amountUSDT)))} por USDT
              </div>
            )}
          </>
        )}

        <Input label="Descripción (opcional)" value={moveForm.description} onChange={e => setMoveForm(f => ({ ...f, description: e.target.value }))} placeholder="ej: Pasé plata a Lemon para comprar USDT" />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => setModal(false)}>Cancelar</Btn>
          <Btn onClick={saveMovement}>Registrar</Btn>
        </div>
      </Modal>
    </div>
  );
};
