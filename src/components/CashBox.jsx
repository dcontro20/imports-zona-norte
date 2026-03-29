import { useState } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { Modal, Card, Btn, Input, Select, Table, Badge, StatCard } from "./UI.jsx";

// -- CASH / CAJA --
const INITIAL_BALANCES = {
  lemonPesos: 273646.62,
  lemonUSDT: 40.12,
  mpDiego: 0,
  mpGustavo: 0,
  usdCash: 0,
  pesosCash: 120000,
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

export const CashBox = ({ sales, purchases, expenses, withdrawals, cashMovements, setCashMovements, exchangeRate, setExchangeRate, currentUser, logAudit }) => {
  const [modal, setModal] = useState(false);
  const [moveForm, setMoveForm] = useState({ type: "transfer", from: "", to: "", amount: "", amountUSDT: "", description: "", date: new Date().toISOString().slice(0, 10) });

  // Calculate account balances including movements
  // IMPORTANT: All queries must exclude soft-deleted items (!isDeleted)
  const calcBalance = (accountId) => {
    let bal = INITIAL_BALANCES[accountId] || 0;

    // Only count active (non-deleted) sales
    const activeSales = (sales || []).filter(s => !s.isDeleted);
    const activePurchases = (purchases || []).filter(p => !p.isDeleted);

    // Add from sales — supports both legacy (single paymentMethod) and new (payments array) format
    const ACCOUNT_METHOD_MAP = {
      mpDiego: (p) => p.method === "Mercado Pago" && p.mpAccount === "MP Diego",
      mpGustavo: (p) => p.method === "Mercado Pago" && p.mpAccount === "MP Gustavo",
      lemonPesos: (p) => p.method === "Lemon",
      lemonUSDT: (p) => p.method === "USDT",
      usdCash: (p) => p.method === "USD Cash",
      pesosCash: (p) => p.method === "Pesos Cash",
    };
    const matchFn = ACCOUNT_METHOD_MAP[accountId];
    if (matchFn) {
      activeSales.forEach(sale => {
        if (sale.payments && sale.payments.length > 0) {
          // New format: sum matching payments from the payments array
          sale.payments.filter(matchFn).forEach(p => { bal += Number(p.amount) || 0; });
        } else {
          // Legacy format: single paymentMethod field
          const legacyPay = { method: sale.paymentMethod, mpAccount: sale.mpAccount, amount: sale.total };
          if (matchFn(legacyPay)) bal += Number(sale.total) || 0;
        }
      });
    }
    // Purchases reduce USDT
    if (accountId === "lemonUSDT") {
      bal -= activePurchases.filter(p => p.status === "verificado" || !p.status).reduce((s, p) => s + (p.totalUSDT || 0), 0);
    }

    // Apply cash movements (exclude deleted)
    (cashMovements || []).filter(m => !m.isDeleted).forEach(m => {
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
    const newId = uid();
    const movement = { ...moveForm, id: newId, amount: Number(moveForm.amount), amountUSDT: Number(moveForm.amountUSDT) || 0, createdBy: currentUser?.name || "" };
    setCashMovements(prev => [movement, ...prev]);
    if (logAudit) logAudit("create", "cashMovement", newId, `Creó movimiento: ${moveForm.type} $${moveForm.amount} ${moveForm.from ? getAccountLabel(moveForm.from) : ""} → ${moveForm.to ? getAccountLabel(moveForm.to) : ""}`);
    setModal(false);
    setMoveForm({ type: "transfer", from: "", to: "", amount: "", amountUSDT: "", description: "", date: new Date().toISOString().slice(0, 10) });
  };

  const [confirmDeleteMov, setConfirmDeleteMov] = useState(null);
  const deleteMovement = (id) => {
    if (confirmDeleteMov !== id) { setConfirmDeleteMov(id); setTimeout(() => setConfirmDeleteMov(null), 3000); return; }
    const mov = (cashMovements || []).find(m => m.id === id);
    setCashMovements(prev => prev.map(m => m.id === id ? { ...m, isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: currentUser?.name || "?" } : m));
    if (logAudit && mov) logAudit("delete", "cashMovement", id, `Eliminó movimiento: ${mov.type} $${mov.amount}`);
    setConfirmDeleteMov(null);
  };

  const getAccountLabel = (id) => ACCOUNTS.find(a => a.id === id)?.label || id;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: "#1a1a2e", margin: 0, fontSize: 22 }}>Caja Multi-Moneda</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#6b7280", fontSize: 13 }}>Blue:</span>
          <input type="number" value={exchangeRate} onChange={e => setExchangeRate(Number(e.target.value))}
            style={{ width: 90, padding: "6px 10px", background: "#f7f8fa", border: "1px solid #e2e4e9", borderRadius: 8, color: "#00b894", fontSize: 14, fontWeight: 700 }} />
          <Btn onClick={() => setModal(true)} style={{ padding: "8px 14px" }}>💱 Movimiento</Btn>
        </div>
      </div>

      {/* Totals */}
      <Card style={{ marginBottom: 16, background: "linear-gradient(135deg, #f8f9fc 0%, #f0f1f8 100%)", border: "1px solid #e2e4e9" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, textAlign: "center" }}>
          <div style={{ padding: "8px 12px" }}>
            <div style={{ color: "#6b7280", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>Total Pesos</div>
            <div style={{ color: "#6366f1", fontSize: 20, fontWeight: 800 }}>{formatMoney(totalARS)}</div>
          </div>
          <div style={{ padding: "8px 12px", borderLeft: "1px solid #e2e4e9" }}>
            <div style={{ color: "#6b7280", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>Total USD</div>
            <div style={{ color: "#00b8a9", fontSize: 20, fontWeight: 800 }}>{formatMoney(totalUSD, "USD")}</div>
          </div>
          <div style={{ padding: "8px 12px", borderLeft: "1px solid #e2e4e9" }}>
            <div style={{ color: "#6b7280", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>Total USDT</div>
            <div style={{ color: "#26de81", fontSize: 20, fontWeight: 800 }}>{formatMoney(totalUSDT, "USDT")}</div>
          </div>
          <div style={{ padding: "8px 12px", borderLeft: "1px solid #e2e4e9" }}>
            <div style={{ color: "#6b7280", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>Todo en ARS</div>
            <div style={{ color: "#f59e0b", fontSize: 20, fontWeight: 800 }}>{formatMoney(totalARS + (totalUSD * exchangeRate) + (totalUSDT * exchangeRate))}</div>
          </div>
        </div>
      </Card>

      {/* Account cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
        {ACCOUNTS.map(a => {
          const val = formatMoney(balances[a.id], a.currency);
          const isLong = val.length > 12;
          return (
            <Card key={a.id} style={{ position: "relative", overflow: "hidden", padding: "16px 18px" }}>
              <div style={{ position: "absolute", top: 12, right: 14, fontSize: 24, opacity: 0.15 }}>{a.icon}</div>
              <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, fontWeight: 600, whiteSpace: "nowrap" }}>{a.label}</div>
              <div style={{ fontSize: isLong ? 20 : 24, fontWeight: 800, color: a.color, lineHeight: 1.1 }}>{val}</div>
            </Card>
          );
        })}
      </div>

      {/* Recent movements */}
      <Card>
        <h4 style={{ color: "#6366f1", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>💱 Movimientos de caja</h4>
        <Table columns={[
          { key: "date", label: "Fecha", render: r => formatDate(r.date) },
          { key: "type", label: "Tipo", render: r => {
            const t = MOVEMENT_TYPES.find(mt => mt.value === r.type);
            return <Badge color={r.type === "crypto_buy" ? "#26de81" : r.type === "deposit" ? "#00b894" : r.type === "withdrawal" ? "#e74c3c" : "#6366f1"}>{t?.label || r.type}</Badge>;
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
        ]} data={(cashMovements || []).filter(m => !m.isDeleted)} emptyMsg="No hay movimientos registrados" />
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
