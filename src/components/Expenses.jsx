import { useState } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { Modal, Card, Btn, Input, Select, Table, Badge } from "./UI.jsx";
import { EXPENSE_CATEGORIES } from "../constants.js";

// -- EXPENSES --
export const Expenses = ({ expenses, setExpenses, currentUser }) => {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ category: "", description: "", amountARS: "", amountUSD: "", currency: "ARS", date: new Date().toISOString().slice(0, 10) });

  const openNew = () => { setForm({ category: "", description: "", amountARS: "", amountUSD: "", currency: "ARS", date: new Date().toISOString().slice(0, 10) }); setEditing(null); setModal(true); };
  const openEdit = (e) => { setForm({ category: e.category || "", description: e.description || "", amountARS: e.amountARS || "", amountUSD: e.amountUSD || "", currency: e.currency || "ARS", date: e.date ? e.date.slice(0, 10) : new Date().toISOString().slice(0, 10) }); setEditing(e.id); setModal(true); };

  const save = () => {
    if (!form.category || (!form.amountARS && !form.amountUSD)) return;
    const data = { ...form, amountARS: Number(form.amountARS) || 0, amountUSD: Number(form.amountUSD) || 0, createdBy: currentUser?.name || "" };
    if (editing) {
      setExpenses(prev => prev.map(e => e.id === editing ? { ...data, id: editing } : e));
    } else {
      setExpenses(prev => [{ ...data, id: uid() }, ...prev]);
    }
    setModal(false); setEditing(null);
    setForm({ category: "", description: "", amountARS: "", amountUSD: "", currency: "ARS", date: new Date().toISOString().slice(0, 10) });
  };

  const [confirmDeleteExp, setConfirmDeleteExp] = useState(null);
  const deleteExpense = (id) => {
    if (confirmDeleteExp !== id) { setConfirmDeleteExp(id); setTimeout(() => setConfirmDeleteExp(null), 3000); return; }
    setExpenses(prev => prev.filter(e => e.id !== id));
    setConfirmDeleteExp(null);
  };

  const totalMonth = expenses.filter(e => {
    const d = new Date(e.date);
    return d.getMonth() === new Date().getMonth() && d.getFullYear() === new Date().getFullYear();
  }).reduce((s, e) => s + (e.amountARS || 0), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: "#1a1a2e", margin: 0, fontSize: 22 }}>
          Gastos <span style={{ fontSize: 14, color: "#6b7280" }}>— Este mes: {formatMoney(totalMonth)}</span>
        </h2>
        <Btn onClick={openNew}>+ Nuevo Gasto</Btn>
      </div>

      <Card>
        <Table
          columns={[
            { key: "date", label: "Fecha", render: r => formatDate(r.date) },
            { key: "category", label: "Categoría", render: r => <Badge color="#fdcb6e">{r.category}</Badge> },
            { key: "description", label: "Descripción" },
            { key: "amount", label: "Monto", render: r => r.amountARS ? formatMoney(r.amountARS) : formatMoney(r.amountUSD, "USD") },
            { key: "actions", label: "", render: r => (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} style={{ background: "none", border: "none", color: "#a855f7", cursor: "pointer", fontSize: 14 }}>✏️</button>
                {confirmDeleteExp === r.id
                ? <button onClick={(e) => { e.stopPropagation(); deleteExpense(r.id); }} style={{ background: "#e74c3c22", border: "1px solid #e74c3c55", color: "#e74c3c", padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Confirmar</button>
                : <button onClick={(e) => { e.stopPropagation(); deleteExpense(r.id); }} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 14 }}>🗑️</button>
              }
              </div>
            )},
          ]}
          data={expenses}
          emptyMsg="No hay gastos registrados"
        />
      </Card>

      <Modal open={modal} onClose={() => { setModal(false); setEditing(null); }} title={editing ? "Editar Gasto" : "Nuevo Gasto"}>
        <Input label="Fecha" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        <Select label="Categoría" options={EXPENSE_CATEGORIES} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
        <Input label="Descripción" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Detalle del gasto..." />
        <div style={{ display: "flex", gap: 12 }}>
          <Input label="Monto ARS" type="number" value={form.amountARS} onChange={e => setForm(f => ({ ...f, amountARS: e.target.value }))} />
          <Input label="Monto USD" type="number" value={form.amountUSD} onChange={e => setForm(f => ({ ...f, amountUSD: e.target.value }))} />
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => { setModal(false); setEditing(null); }}>Cancelar</Btn>
          <Btn onClick={save}>{editing ? "Guardar" : "Registrar"}</Btn>
        </div>
      </Modal>
    </div>
  );
};
