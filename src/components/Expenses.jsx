import { useState, useMemo } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { Modal, Card, Btn, Input, Select, Table, Badge, StatCard } from "./UI.jsx";
import { EXPENSE_CATEGORIES } from "../constants.js";

// Category colors
const CAT_COLORS = {
  "Flete Paraguay": "#e17055",
  "Comisiones Crypto": "#6c5ce7",
  "Packaging": "#00cec9",
  "Envíos locales": "#fdcb6e",
  "Publicidad": "#e84393",
  "Comisión pasero": "#f9ca24",
  "Comisión proveedor": "#0984e3",
  "Envío Vía Cargo": "#d63031",
  "Impuestos/Tasas": "#636e72",
  "Herramientas/Sistema": "#00b894",
  "Otro": "#b2bec3",
};

// -- EXPENSES MEJORADO --
export const Expenses = ({ expenses, setExpenses, currentUser, exchangeRate }) => {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("all"); // "all" | category name
  const [form, setForm] = useState({
    category: "", description: "", amountARS: "", amountUSD: "",
    currency: "ARS", date: new Date().toISOString().slice(0, 10),
    relatedTo: "", recurring: false
  });

  const openNew = () => {
    setForm({
      category: "", description: "", amountARS: "", amountUSD: "",
      currency: "ARS", date: new Date().toISOString().slice(0, 10),
      relatedTo: "", recurring: false
    });
    setEditing(null);
    setModal(true);
  };

  const openEdit = (e) => {
    setForm({
      category: e.category || "", description: e.description || "",
      amountARS: e.amountARS || "", amountUSD: e.amountUSD || "",
      currency: e.currency || "ARS",
      date: e.date ? e.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      relatedTo: e.relatedTo || "", recurring: e.recurring || false
    });
    setEditing(e.id);
    setModal(true);
  };

  const save = () => {
    if (!form.category || (!form.amountARS && !form.amountUSD)) return;
    const data = {
      ...form,
      amountARS: Number(form.amountARS) || 0,
      amountUSD: Number(form.amountUSD) || 0,
      createdBy: currentUser?.name || ""
    };
    if (editing) {
      setExpenses(prev => prev.map(e => e.id === editing ? { ...data, id: editing } : e));
    } else {
      setExpenses(prev => [{ ...data, id: uid() }, ...prev]);
    }
    setModal(false);
    setEditing(null);
  };

  const [confirmDeleteExp, setConfirmDeleteExp] = useState(null);
  const deleteExpense = (id) => {
    if (confirmDeleteExp !== id) { setConfirmDeleteExp(id); setTimeout(() => setConfirmDeleteExp(null), 3000); return; }
    setExpenses(prev => prev.filter(e => e.id !== id));
    setConfirmDeleteExp(null);
  };

  // ---- Stats ----
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const monthExpenses = expenses.filter(e => {
    const d = new Date(e.date);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });

  const totalMonthARS = monthExpenses.reduce((s, e) => s + (e.amountARS || 0), 0);
  const totalMonthUSD = monthExpenses.reduce((s, e) => s + (e.amountUSD || 0), 0);
  const totalAllARS = expenses.reduce((s, e) => s + (e.amountARS || 0), 0);
  const totalAllUSD = expenses.reduce((s, e) => s + (e.amountUSD || 0), 0);

  // By category breakdown
  const byCategory = useMemo(() => {
    const cats = {};
    monthExpenses.forEach(e => {
      const c = e.category || "Otro";
      if (!cats[c]) cats[c] = { ars: 0, usd: 0, count: 0 };
      cats[c].ars += e.amountARS || 0;
      cats[c].usd += e.amountUSD || 0;
      cats[c].count += 1;
    });
    return Object.entries(cats).sort((a, b) => {
      const totalA = a[1].ars + (a[1].usd * (exchangeRate || 1));
      const totalB = b[1].ars + (b[1].usd * (exchangeRate || 1));
      return totalB - totalA;
    });
  }, [monthExpenses, exchangeRate]);

  // Filtered data
  const filteredExpenses = filter === "all" ? expenses : expenses.filter(e => e.category === filter);

  // Unique categories used
  const usedCategories = [...new Set(expenses.map(e => e.category).filter(Boolean))];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: "#1a1a2e", margin: 0, fontSize: 22, fontWeight: 800 }}>Gastos Operativos</h2>
          <p style={{ color: "#6b7280", margin: "4px 0 0", fontSize: 13 }}>Control de egresos del negocio</p>
        </div>
        <Btn onClick={openNew}>+ Registrar Gasto</Btn>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
        <Card style={{ padding: "14px 18px", background: "linear-gradient(135deg, #fef2f2 0%, #fff 100%)" }}>
          <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>Este mes (ARS)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#e74c3c" }}>{formatMoney(totalMonthARS)}</div>
          {totalMonthUSD > 0 && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>+ {formatMoney(totalMonthUSD, "USD")}</div>}
        </Card>
        <Card style={{ padding: "14px 18px" }}>
          <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>Este mes (USD equiv.)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#e17055" }}>
            {formatMoney(totalMonthUSD + (exchangeRate ? totalMonthARS / exchangeRate : 0), "USD")}
          </div>
        </Card>
        <Card style={{ padding: "14px 18px" }}>
          <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>Gastos este mes</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#6366f1" }}>{monthExpenses.length}</div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{byCategory.length} categorías</div>
        </Card>
        <Card style={{ padding: "14px 18px" }}>
          <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>Total histórico</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#636e72" }}>{formatMoney(totalAllARS)}</div>
          {totalAllUSD > 0 && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>+ {formatMoney(totalAllUSD, "USD")}</div>}
        </Card>
      </div>

      {/* Category breakdown */}
      {byCategory.length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <h4 style={{ color: "#1a1a2e", margin: "0 0 14px", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>
            Desglose por categoría (este mes)
          </h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            {byCategory.map(([cat, data]) => {
              const total = data.ars + (data.usd * (exchangeRate || 1));
              const maxTotal = byCategory[0] ? byCategory[0][1].ars + (byCategory[0][1].usd * (exchangeRate || 1)) : 1;
              return (
                <div key={cat} onClick={() => setFilter(filter === cat ? "all" : cat)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, cursor: "pointer", background: filter === cat ? "#f5f3ff" : "#f7f8fa", border: filter === cat ? "1px solid #c7d2fe" : "1px solid transparent", transition: "all 0.2s" }}>
                  <div style={{ width: 4, height: 32, borderRadius: 2, background: CAT_COLORS[cat] || "#b2bec3" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: "#4b5563", fontWeight: 600 }}>{cat}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>{data.count} gasto{data.count > 1 ? "s" : ""}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e" }}>{formatMoney(total)}</div>
                    {data.usd > 0 && <div style={{ fontSize: 10, color: "#059669" }}>{formatMoney(data.usd, "USD")}</div>}
                  </div>
                </div>
              );
            })}
          </div>
          {filter !== "all" && (
            <button onClick={() => setFilter("all")} style={{ marginTop: 10, background: "none", border: "none", color: "#6366f1", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
              ✕ Quitar filtro "{filter}"
            </button>
          )}
        </Card>
      )}

      {/* Table */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h4 style={{ color: "#1a1a2e", margin: 0, fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>
            {filter === "all" ? "Todos los gastos" : `Gastos: ${filter}`}
            <span style={{ color: "#9ca3af", fontWeight: 500 }}> ({filteredExpenses.length})</span>
          </h4>
        </div>
        <Table
          columns={[
            { key: "date", label: "Fecha", render: r => formatDate(r.date) },
            { key: "category", label: "Categoría", render: r => (
              <Badge color={CAT_COLORS[r.category] || "#b2bec3"}>{r.category}</Badge>
            )},
            { key: "description", label: "Descripción", render: r => (
              <div>
                <div style={{ color: "#1a1a2e", fontSize: 13 }}>{r.description || "—"}</div>
                {r.relatedTo && <div style={{ fontSize: 10, color: "#9ca3af" }}>Ref: {r.relatedTo}</div>}
              </div>
            )},
            { key: "amount", label: "Monto", render: r => (
              <div style={{ textAlign: "right" }}>
                {r.amountARS > 0 && <div style={{ fontWeight: 700, color: "#e74c3c" }}>{formatMoney(r.amountARS)}</div>}
                {r.amountUSD > 0 && <div style={{ fontWeight: 700, color: "#e17055" }}>{formatMoney(r.amountUSD, "USD")}</div>}
              </div>
            )},
            { key: "createdBy", label: "Quién", render: r => r.createdBy ? <Badge color={r.createdBy === "Diego" ? "#6366f1" : "#059669"}>{r.createdBy}</Badge> : "—" },
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
          data={filteredExpenses}
          emptyMsg="No hay gastos registrados"
        />
      </Card>

      {/* Modal */}
      <Modal open={modal} onClose={() => { setModal(false); setEditing(null); }} title={editing ? "Editar Gasto" : "Registrar Gasto"}>
        <Input label="Fecha" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />

        <Select label="Categoría" options={EXPENSE_CATEGORIES.map(c => typeof c === "string" ? { value: c, label: c } : c)} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />

        <Input label="Descripción" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Detalle del gasto..." />

        <div style={{ display: "flex", gap: 12 }}>
          <Input label="Monto ARS" type="number" value={form.amountARS} onChange={e => setForm(f => ({ ...f, amountARS: e.target.value }))} placeholder="ej: 15000" />
          <Input label="Monto USD" type="number" value={form.amountUSD} onChange={e => setForm(f => ({ ...f, amountUSD: e.target.value }))} placeholder="ej: 10" />
        </div>

        {form.amountARS > 0 && exchangeRate > 0 && (
          <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 8 }}>
            Equivalente: ~{formatMoney(Number(form.amountARS) / exchangeRate, "USD")}
          </div>
        )}

        <Input label="Referencia (opcional)" value={form.relatedTo} onChange={e => setForm(f => ({ ...f, relatedTo: e.target.value }))} placeholder="ej: Pedido #5, envío a cliente X..." />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => { setModal(false); setEditing(null); }}>Cancelar</Btn>
          <Btn onClick={save}>{editing ? "Guardar" : "Registrar"}</Btn>
        </div>
      </Modal>
    </div>
  );
};
