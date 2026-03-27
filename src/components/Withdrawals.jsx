import { useState, useMemo } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { Modal, Card, Btn, Input, Badge, StatCard } from "./UI.jsx";

// -- CONSUMO PROPIO --
const TYPES = ["Consumo propio", "Garantía / Devolución", "Regalo / Canje"];
const TYPE_ICONS = { "Consumo propio": "\u{1F372}", "Garantía / Devolución": "\u{1F504}", "Regalo / Canje": "\u{1F381}" };
const TYPE_COLORS = { "Consumo propio": "#6366f1", "Garantía / Devolución": "#f59e0b", "Regalo / Canje": "#10b981" };

export const Withdrawals = ({ withdrawals, setWithdrawals, products, setProducts, logStock, currentUser }) => {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ product: "", qty: 1, type: TYPES[0], person: "", notes: "" });
  const [filterType, setFilterType] = useState("all");
  const [filterPerson, setFilterPerson] = useState("");
  const [search, setSearch] = useState("");

  // Stats computados
  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = withdrawals.filter(w => {
      const d = new Date(w.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const byType = {};
    TYPES.forEach(t => { byType[t] = 0; });
    const byPerson = {};
    let totalUnits = 0;
    thisMonth.forEach(w => {
      byType[w.type] = (byType[w.type] || 0) + (w.qty || 1);
      if (w.person) byPerson[w.person] = (byPerson[w.person] || 0) + (w.qty || 1);
      totalUnits += (w.qty || 1);
    });
    const topPerson = Object.entries(byPerson).sort((a, b) => b[1] - a[1])[0];
    return { thisMonth: thisMonth.length, totalUnits, byType, topPerson: topPerson ? topPerson[0] : "-" };
  }, [withdrawals]);

  // Personas únicas para filtro
  const uniquePersons = useMemo(() => {
    const set = new Set(withdrawals.map(w => w.person).filter(Boolean));
    return [...set].sort();
  }, [withdrawals]);

  // Filtros aplicados
  const filtered = useMemo(() => {
    let list = [...withdrawals];
    if (filterType !== "all") list = list.filter(w => w.type === filterType);
    if (filterPerson) list = list.filter(w => w.person && w.person.toLowerCase().includes(filterPerson.toLowerCase()));
    if (search) list = list.filter(w =>
      (w.productName || "").toLowerCase().includes(search.toLowerCase()) ||
      (w.person || "").toLowerCase().includes(search.toLowerCase()) ||
      (w.notes || "").toLowerCase().includes(search.toLowerCase())
    );
    return list.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [withdrawals, filterType, filterPerson, search]);

  const handleAdd = () => {
    const prod = products.find(p => p.id === form.product);
    if (!prod) return;
    if (prod.stock < form.qty) return alert("Stock insuficiente");

    const entry = {
      id: uid(),
      productId: prod.id,
      productName: prod.name,
      qty: Number(form.qty),
      type: form.type,
      person: form.person.trim(),
      notes: form.notes.trim(),
      date: new Date().toISOString(),
      user: currentUser,
    };

    setWithdrawals(prev => [...prev, entry]);
    setProducts(prev => prev.map(p => p.id === prod.id ? { ...p, stock: p.stock - entry.qty } : p));
    logStock(prod.id, prod.name, -entry.qty, `Merma: ${form.type}${form.person ? ` - ${form.person}` : ""}`);
    setForm({ product: "", qty: 1, type: TYPES[0], person: "", notes: "" });
    setShowModal(false);
  };

  const handleDelete = (w) => {
    if (!confirm(`¿Eliminar merma de ${w.productName}?`)) return;
    setWithdrawals(prev => prev.filter(x => x.id !== w.id));
    setProducts(prev => prev.map(p => p.id === w.productId ? { ...p, stock: p.stock + (w.qty || 1) } : p));
    logStock(w.productId, w.productName, w.qty || 1, `Revertir merma: ${w.type}`);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1a1a2e", margin: 0 }}>Mermas y Retiros</h2>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>
            Control de consumo propio, garantías y regalos
          </p>
        </div>
        <Btn onClick={() => setShowModal(true)}>+ Nueva Merma</Btn>
      </div>

      {/* Stats Cards */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="Este mes" value={stats.thisMonth} sub={`${stats.totalUnits} unidades`} color="#6366f1" />
        <StatCard label="Consumo propio" value={stats.byType["Consumo propio"] || 0} sub="unidades" color="#6366f1" />
        <StatCard label="Garantías" value={stats.byType["Garantía / Devolución"] || 0} sub="unidades" color="#f59e0b" />
        <StatCard label="Regalos" value={stats.byType["Regalo / Canje"] || 0} sub="unidades" color="#10b981" />
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <Input
          placeholder="Buscar producto, persona..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: "1 1 200px", minWidth: 180 }}
        />
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ minWidth: 160, padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e4e9", fontSize: 14, background: "#fff" }}>
          <option value="all">Todos los tipos</option>
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {uniquePersons.length > 0 && (
          <select value={filterPerson} onChange={e => setFilterPerson(e.target.value)} style={{ minWidth: 140, padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e4e9", fontSize: 14, background: "#fff" }}>
            <option value="">Todas las personas</option>
            {uniquePersons.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        {(filterType !== "all" || filterPerson || search) && (
          <Btn onClick={() => { setFilterType("all"); setFilterPerson(""); setSearch(""); }}
            style={{ background: "#f3f4f6", color: "#6b7280", fontSize: 12 }}>
            Limpiar filtros
          </Btn>
        )}
      </div>

      {/* Tabla */}
      <Card>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
            {withdrawals.length === 0 ? "No hay mermas registradas" : "No hay resultados con estos filtros"}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e2e4e9" }}>
                {["Fecha", "Producto", "Cant.", "Tipo", "Persona", "Notas", ""].map((h, i) => (
                  <th key={i} style={{ padding: "8px 12px", textAlign: "left", color: "#6b7280", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
            {filtered.map(w => (
              <tr key={w.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "10px 12px", fontSize: 13, color: "#6b7280", whiteSpace: "nowrap" }}>
                  {formatDate(w.date)}
                </td>
                <td style={{ padding: "10px 12px", fontWeight: 600, color: "#1a1a2e" }}>
                  {w.productName}
                </td>
                <td style={{ padding: "10px 12px", fontWeight: 700, color: "#1a1a2e", textAlign: "center" }}>
                  {w.qty || 1}
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <Badge color={TYPE_COLORS[w.type] || "#6366f1"}>
                    {TYPE_ICONS[w.type] || ""} {w.type}
                  </Badge>
                </td>
                <td style={{ padding: "10px 12px", fontSize: 13, color: "#6b7280" }}>
                  {w.person || "-"}
                </td>
                <td style={{ padding: "10px 12px", fontSize: 12, color: "#9ca3af", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {w.notes || "-"}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right" }}>
                  <Btn onClick={() => handleDelete(w)} style={{ background: "#fef2f2", color: "#dc2626", fontSize: 11, padding: "4px 10px" }}>
                    Eliminar
                  </Btn>
                </td>
              </tr>
            ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Modal nueva merma */}
      {showModal && (
        <Modal open={true} title="Registrar Merma" onClose={() => setShowModal(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <select value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))} style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e4e9", fontSize: 14, background: "#fff", width: "100%" }}>
              <option value="">Seleccionar producto...</option>
              {products.filter(p => p.stock > 0).map(p => (
                <option key={p.id} value={p.id}>{p.name} (stock: {p.stock})</option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 10 }}>
              <Input
                type="number"
                min={1}
                value={form.qty}
                onChange={e => setForm(f => ({ ...f, qty: Math.max(1, Number(e.target.value)) }))}
                placeholder="Cantidad"
                style={{ flex: 1 }}
              />
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={{ flex: 2, padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e4e9", fontSize: 14, background: "#fff" }}>
                {TYPES.map(t => <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}
              </select>
            </div>
            <Input
              placeholder="Persona (opcional)"
              value={form.person}
              onChange={e => setForm(f => ({ ...f, person: e.target.value }))}
            />
            <Input
              placeholder="Notas (opcional)"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
            <Btn onClick={handleAdd} disabled={!form.product}>Registrar Merma</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};
