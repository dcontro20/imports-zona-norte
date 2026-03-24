import { useState } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { Modal, Card, Btn, Input, Select, Table, Badge } from "./UI.jsx";

// -- WITHDRAWALS --
export const Withdrawals = ({ withdrawals, setWithdrawals, currentUser }) => {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ method: "", amount: "", currency: "ARS", destination: "", notes: "", date: new Date().toISOString().slice(0, 10) });

  const openNew = () => { setForm({ method: "", amount: "", currency: "ARS", destination: "", notes: "", date: new Date().toISOString().slice(0, 10) }); setEditing(null); setModal(true); };
  const openEdit = (w) => { setForm({ method: w.method || "", amount: w.amount || "", currency: w.currency || "ARS", destination: w.destination || "", notes: w.notes || "", date: w.date ? w.date.slice(0, 10) : new Date().toISOString().slice(0, 10) }); setEditing(w.id); setModal(true); };

  const save = () => {
    if (!form.method || !form.amount) return;
    const data = { ...form, amount: Number(form.amount), createdBy: currentUser?.name || "" };
    if (editing) {
      setWithdrawals(prev => prev.map(w => w.id === editing ? { ...data, id: editing } : w));
    } else {
      setWithdrawals(prev => [{ ...data, id: uid() }, ...prev]);
    }
    setModal(false); setEditing(null);
    setForm({ method: "", amount: "", currency: "ARS", destination: "", notes: "", date: new Date().toISOString().slice(0, 10) });
  };

  const [confirmDeleteWd, setConfirmDeleteWd] = useState(null);
  const deleteWithdrawal = (id) => {
    if (confirmDeleteWd !== id) { setConfirmDeleteWd(id); setTimeout(() => setConfirmDeleteWd(null), 3000); return; }
    setWithdrawals(prev => prev.filter(w => w.id !== id));
    setConfirmDeleteWd(null);
  };

  const totalMonth = withdrawals.filter(w => {
    const d = new Date(w.date);
    return d.getMonth() === new Date().getMonth() && d.getFullYear() === new Date().getFullYear();
  }).reduce((s, w) => s + (w.amount || 0), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: "#1a1a2e", margin: 0, fontSize: 22 }}>
          Retiros <span style={{ fontSize: 14, color: "#6b7280" }}>— Este mes: {formatMoney(totalMonth)}</span>
        </h2>
        <Btn onClick={openNew}>+ Nuevo Retiro</Btn>
      </div>

      <Card>
        <Table
          columns={[
            { key: "date", label: "Fecha", render: r => formatDate(r.date) },
            { key: "method", label: "Método", render: r => <Badge>{r.method}</Badge> },
            { key: "destination", label: "Destino" },
            { key: "amount", label: "Monto", render: r => formatMoney(r.amount, r.currency) },
            { key: "actions", label: "", render: r => (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} style={{ background: "none", border: "none", color: "#a855f7", cursor: "pointer", fontSize: 14 }}>✏️</button>
                {confirmDeleteWd === r.id
                ? <button onClick={(e) => { e.stopPropagation(); deleteWithdrawal(r.id); }} style={{ background: "#e74c3c22", border: "1px solid #e74c3c55", color: "#e74c3c", padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Confirmar</button>
                : <button onClick={(e) => { e.stopPropagation(); deleteWithdrawal(r.id); }} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 14 }}>🗑️</button>
              }
              </div>
            )},
          ]}
          data={withdrawals}
          emptyMsg="No hay retiros registrados"
        />
      </Card>

      <Modal open={modal} onClose={() => { setModal(false); setEditing(null); }} title={editing ? "Editar Retiro" : "Nuevo Retiro"}>
        <Input label="Fecha" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        <Input label="Método" placeholder="Transferencia, Efectivo, etc." value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))} />
        <Input label="Destino" placeholder="Banco, Persona, etc." value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} />
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 2 }}>
            <Input label="Monto" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div style={{ flex: 1 }}>
            <Select label="Moneda" options={["ARS", "USD", "USDT"]} value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} />
          </div>
        </div>
        <Input label="Notas" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Opcional..." />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => { setModal(false); setEditing(null); }}>Cancelar</Btn>
          <Btn onClick={save}>{editing ? "Guardar" : "Registrar"}</Btn>
        </div>
      </Modal>
    </div>
  );
};
