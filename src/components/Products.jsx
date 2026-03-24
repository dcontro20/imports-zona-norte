import { useState } from "react";
import { uid, formatMoney } from "../helpers.js";
import { Modal, Card, Btn, Input, Select, Table, Badge } from "./UI.jsx";
import { BRAND_COLORS } from "../constants.js";

export const Products = ({ products, setProducts, exchangeRate }) => {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ brand: "", model: "", flavor: "", puffs: 500, stock: 0, priceUSD: 0 });
  const [search, setSearch] = useState("");

  const save = () => {
    if (!form.brand || !form.model || !form.flavor) return;
    setProducts(prev => [{ ...form, id: uid(), priceUSD: Number(form.priceUSD), puffs: Number(form.puffs), stock: Number(form.stock) }, ...prev]);
    setForm({ brand: "", model: "", flavor: "", puffs: 500, stock: 0, priceUSD: 0 });
    setModal(false);
  };

  const filtered = products.filter(p => 
    p.brand.toLowerCase().includes(search.toLowerCase()) ||
    p.model.toLowerCase().includes(search.toLowerCase()) ||
    p.flavor.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: "#1a1a2e", margin: 0, fontSize: 22 }}>Productos ({products.length})</h2>
        <Btn onClick={() => setModal(true)}>+ Nuevo producto</Btn>
      </div>

      <Card style={{ marginBottom: 14 }}>
        <Input type="text" placeholder="Buscar por marca, modelo o sabor..." value={search} onChange={e => setSearch(e.target.value)} />
      </Card>

      <Card>
        <Table columns={[
          { key: "brand", label: "Marca", render: r => <Badge color={BRAND_COLORS[r.brand] || "#6366f1"}>{r.brand}</Badge> },
          { key: "model", label: "Modelo" },
          { key: "flavor", label: "Sabor" },
          { key: "stock", label: "Stock", render: r => <Badge color={r.stock > 0 ? "#00b894" : "#e74c3c"}>{r.stock}</Badge> },
          { key: "price", label: "Precio", render: r => `${r.priceUSD} USD / ${Math.round(r.priceUSD * exchangeRate)} ARS` },
        ]} data={filtered} emptyMsg="No hay productos" />
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="Nuevo producto">
        <Input label="Marca" value={form.brand} onChange={e => setForm(f => ({...f, brand: e.target.value}))} />
        <Input label="Modelo" value={form.model} onChange={e => setForm(f => ({...f, model: e.target.value}))} />
        <Input label="Sabor" value={form.flavor} onChange={e => setForm(f => ({...f, flavor: e.target.value}))} />
        <Input label="Puffs" type="number" value={form.puffs} onChange={e => setForm(f => ({...f, puffs: Number(e.target.value)}))} />
        <Input label="Stock" type="number" value={form.stock} onChange={e => setForm(f => ({...f, stock: Number(e.target.value)}))} />
        <Input label="Precio USD" type="number" value={form.priceUSD} onChange={e => setForm(f => ({...f, priceUSD: Number(e.target.value)}))} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => setModal(false)}>Cancelar</Btn>
          <Btn onClick={save}>Guardar</Btn>
        </div>
      </Modal>
    </div>
  );
};
