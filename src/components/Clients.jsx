import { useState } from "react";
import { uid, formatMoney } from "../helpers.js";
import { Modal, Card, Btn, Input, Table, Badge, SearchBar } from "./UI.jsx";

export const Clients = ({ clients, setClients, sales, products }) => {
  const [modal, setModal] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", instagram: "", notes: "" });
  const [editing, setEditing] = useState(null);

  const openEdit = (c) => { setForm(c); setEditing(c.id); setModal(true); };
  const openNew = () => { setForm({ name: "", phone: "", instagram: "", notes: "" }); setEditing(null); setModal(true); };

  const save = () => {
    if (!form.name) return;
    if (editing) {
      setClients(prev => prev.map(c => c.id === editing ? { ...form, id: editing } : c));
    } else {
      setClients(prev => [...prev, { ...form, id: uid() }]);
    }
    setModal(false);
  };

  const clientSales = (cid) => sales.filter(s => s.clientId === cid);

  const filtered = clients.filter(c => `${c.name} ${c.phone} ${c.instagram}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: "#1a1a2e", margin: 0, fontSize: 22 }}>Clientes ({clients.length})</h2>
        <div style={{ display: "flex", gap: 10 }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar cliente..." />
          <Btn onClick={openNew}>+ Nuevo</Btn>
        </div>
      </div>

      <Card>
        <Table
          columns={[
            { key: "name", label: "Nombre" },
            { key: "phone", label: "Teléfono" },
            { key: "instagram", label: "Instagram" },
            { key: "purchases", label: "Compras", render: r => <Badge color="#00b894">{clientSales(r.id).length}</Badge> },
            { key: "total", label: "Total gastado", render: r => {
              const total = clientSales(r.id).reduce((s, sale) => s + (sale.total || 0), 0);
              return formatMoney(total);
            }},
            { key: "actions", label: "", render: r => (
              <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} style={{ background: "none", border: "none", color: "#a855f7", cursor: "pointer" }}>✏️</button>
            )}
          ]}
          data={filtered}
          emptyMsg="No hay clientes registrados"
        />
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? "Editar Cliente" : "Nuevo Cliente"}>
        <Input label="Nombre" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <Input label="Teléfono" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        <Input label="Instagram" value={form.instagram} onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))} placeholder="@usuario" />
        <Input label="Notas" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => setModal(false)}>Cancelar</Btn>
          <Btn onClick={save}>{editing ? "Guardar" : "Crear"}</Btn>
        </div>
      </Modal>
    </div>
  );
};
