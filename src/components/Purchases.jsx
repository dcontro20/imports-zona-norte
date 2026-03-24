import { useState } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { Modal, Card, Btn, Input, Table, Badge } from "./UI.jsx";

export const Purchases = ({ purchases, setPurchases, products, exchangeRate }) => {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), supplier: "", totalUSDT: 0, paseroCostARS: 0, envioCostARS: 0, status: "pendiente" });

  const save = () => {
    if (!form.supplier) return;
    setPurchases(prev => [{
      ...form, id: uid(), 
      totalUSDT: Number(form.totalUSDT),
      paseroCostARS: Number(form.paseroCostARS),
      envioCostARS: Number(form.envioCostARS),
      totalCostARS: (Number(form.totalUSDT) * exchangeRate) + Number(form.paseroCostARS) + Number(form.envioCostARS),
      items: [], createdBy: ""
    }, ...prev]);
    setForm({ date: new Date().toISOString().slice(0, 10), supplier: "", totalUSDT: 0, paseroCostARS: 0, envioCostARS: 0, status: "pendiente" });
    setModal(false);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: "#1a1a2e", margin: 0, fontSize: 22 }}>Compras ({purchases.length})</h2>
        <Btn onClick={() => setModal(true)}>+ Nueva compra</Btn>
      </div>

      <Card>
        <Table columns={[
          { key: "date", label: "Fecha", render: r => formatDate(r.date) },
          { key: "supplier", label: "Proveedor" },
          { key: "totalUSDT", label: "Total USDT" },
          { key: "totalCostARS", label: "Costo ARS", render: r => formatMoney(r.totalCostARS || 0) },
          { key: "status", label: "Estado", render: r => <Badge color={r.status === "verificado" ? "#00b894" : "#fdcb6e"}>{r.status}</Badge> },
        ]} data={purchases} emptyMsg="No hay compras" />
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="Nueva compra">
        <Input label="Fecha" type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} />
        <Input label="Proveedor" value={form.supplier} onChange={e => setForm(f => ({...f, supplier: e.target.value}))} />
        <Input label="Total USDT" type="number" value={form.totalUSDT} onChange={e => setForm(f => ({...f, totalUSDT: e.target.value}))} />
        <Input label="Pasero ARS" type="number" value={form.paseroCostARS} onChange={e => setForm(f => ({...f, paseroCostARS: e.target.value}))} />
        <Input label="Envio ARS" type="number" value={form.envioCostARS} onChange={e => setForm(f => ({...f, envioCostARS: e.target.value}))} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => setModal(false)}>Cancelar</Btn>
          <Btn onClick={save}>Guardar</Btn>
        </div>
      </Modal>
    </div>
  );
};
