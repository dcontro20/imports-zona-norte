import { useState } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { Modal, Card, Btn, Input, Select, Table, Badge, StatCard } from "./UI.jsx";
import { WITHDRAW_PERSONS, WITHDRAW_TYPES } from "../constants.js";

// -- CONSUMO PROPIO --
export const Withdrawals = ({ withdrawals, setWithdrawals, products, setProducts, logStock, currentUser, logAudit }) => {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ productId: "", qty: 1, person: "", withdrawType: "Consumo propio", notes: "", date: new Date().toISOString().slice(0, 10) });

  const save = () => {
    if (!form.productId || !form.person) return;
    const prod = products.find(p => p.id === form.productId);
    if (!prod) return;
    // Validate stock
    if (Number(form.qty) > (prod.stock || 0)) {
      alert(`No hay suficiente stock de ${prod.brand} ${prod.model} - ${prod.flavor}. Disponible: ${prod.stock}, pedido: ${form.qty}`);
      return;
    }
    const costEstimate = Number(prod.priceUSD) || 0;
    const newId = uid();
    const withdrawal = { ...form, id: newId, qty: Number(form.qty), costEstimateUSD: costEstimate * Number(form.qty), withdrawType: form.withdrawType, createdBy: currentUser?.name || "" };
    setWithdrawals(prev => [withdrawal, ...prev]);
    if (logAudit) logAudit("create", "withdrawal", newId, `Registró merma: ${prod.brand} ${prod.model} - ${prod.flavor} x${form.qty} (${form.withdrawType})`);
    logStock({ productId: form.productId, type: "consumo", qty: -Number(form.qty), reason: `${form.withdrawType} - ${form.person}`, date: form.date });
    setProducts(prev => prev.map(p => p.id === form.productId ? { ...p, stock: Math.max(0, (p.stock || 0) - Number(form.qty)) } : p));
    setModal(false);
    setForm({ productId: "", qty: 1, person: "", withdrawType: "Consumo propio", notes: "", date: new Date().toISOString().slice(0, 10) });
  };

  const totalMine = withdrawals.filter(w => w.person === "Diego").reduce((s, w) => s + w.qty, 0);
  const totalBro = withdrawals.filter(w => w.person === "Gustavo").reduce((s, w) => s + w.qty, 0);
  const totalCostUSD = withdrawals.reduce((s, w) => s + (w.costEstimateUSD || 0), 0);
  const totalConsumo = withdrawals.filter(w => !w.withdrawType || w.withdrawType === "Consumo propio").reduce((s, w) => s + w.qty, 0);
  const totalGarantia = withdrawals.filter(w => w.withdrawType === "Garantía / Devolución").reduce((s, w) => s + w.qty, 0);
  const totalRegalo = withdrawals.filter(w => w.withdrawType === "Regalo / Canje").reduce((s, w) => s + w.qty, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: "#1a1a2e", margin: 0, fontSize: 22 }}>Mermas (Consumo, Garantías, Canjes)</h2>
        <Btn onClick={() => setModal(true)}>+ Registrar Merma</Btn>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="Diego" value={`${totalMine} uds`} icon="🚬" color="#6366f1" />
        <StatCard label="Gustavo" value={`${totalBro} uds`} icon="🚬" color="#00b894" />
        <StatCard label="Consumo" value={`${totalConsumo} uds`} icon="🚬" color="#e17055" />
        <StatCard label="Garantías" value={`${totalGarantia} uds`} icon="🔄" color="#fdcb6e" />
        <StatCard label="Regalos/Canjes" value={`${totalRegalo} uds`} icon="🎁" color="#00cec9" />
        <StatCard label="Valor total" value={formatMoney(totalCostUSD, "USD")} icon="📉" color="#e74c3c" />
      </div>

      <Card>
        <Table
          columns={[
            { key: "date", label: "Fecha", render: r => formatDate(r.date) },
            { key: "product", label: "Producto", render: r => {
              const p = products.find(pr => pr.id === r.productId);
              return p ? `${p.brand} ${p.model} - ${p.flavor}` : "?";
            }},
            { key: "qty", label: "Cant.", render: r => <Badge color="#e74c3c">{r.qty}</Badge> },
            { key: "type", label: "Tipo", render: r => <Badge color={r.withdrawType === "Garantía / Devolución" ? "#fdcb6e" : r.withdrawType === "Regalo / Canje" ? "#00cec9" : "#e17055"}>{r.withdrawType || "Consumo"}</Badge> },
            { key: "person", label: "Quién", render: r => <Badge color={r.person === "Diego" ? "#a855f7" : "#00b894"}>{r.person}</Badge> },
            { key: "cost", label: "Valor est.", render: r => formatMoney(r.costEstimateUSD, "USD") },
            { key: "notes", label: "Nota", render: r => r.notes || "-" },
          ]}
          data={withdrawals}
          emptyMsg="No hay retiros registrados"
        />
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="Registrar Consumo Propio">
        <Input label="Fecha" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        <Select label="Producto" options={[...products].filter(p => p.stock > 0).sort((a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model) || a.flavor.localeCompare(b.flavor)).map(p => ({ value: p.id, label: `${p.brand} ${p.model} - ${p.flavor} (${p.puffs}p) [${p.stock}]` }))}
          value={form.productId} onChange={e => setForm(f => ({ ...f, productId: e.target.value }))} />
        <Input label="Cantidad" type="number" min={1} value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} />
        <Select label="Tipo" options={WITHDRAW_TYPES} value={form.withdrawType} onChange={e => setForm(f => ({ ...f, withdrawType: e.target.value }))} />
        <Select label="¿Quién?" options={WITHDRAW_PERSONS} value={form.person} onChange={e => setForm(f => ({ ...f, person: e.target.value }))} />
        <Input label="Nota (opcional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="ej: para probar sabor nuevo..." />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => setModal(false)}>Cancelar</Btn>
          <Btn variant="danger" onClick={save}>Registrar Retiro</Btn>
        </div>
      </Modal>
    </div>
  );
};
