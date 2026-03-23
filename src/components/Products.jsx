import { useState, useMemo } from "react";
import { uid, formatMoney } from "../helpers.js";
import { Modal, Card, Btn, Input, Select, Table, Badge, SearchBar } from "./UI.jsx";
import { BRANDS, BRAND_COLORS } from "../constants.js";

// -- PRODUCTS / STOCK --


export const Products = ({ products, setProducts, exchangeRate, logStock, logPrice, currentUser }) => {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [brandFilter, setBrandFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [collapsed, setCollapsed] = useState({});
  const [quickEdit, setQuickEdit] = useState(false);
  const [quickStocks, setQuickStocks] = useState({});
  const [form, setForm] = useState({ brand: "", model: "", flavor: "", puffs: "", priceUSD: "", priceARS: "", stock: 0 });

  // Quick edit handlers
  const startQuickEdit = () => {
    const stocks = {};
    products.forEach(p => { stocks[p.id] = p.stock || 0; });
    setQuickStocks(stocks);
    setQuickEdit(true);
  };

  const saveQuickEdit = () => {
    let changes = 0;
    const logs = [];
    setProducts(prev => prev.map(p => {
      const newStock = Number(quickStocks[p.id]) || 0;
      if (newStock !== (p.stock || 0)) {
        changes++;
        const diff = newStock - (p.stock || 0);
        logs.push({ productId: p.id, type: "ajuste", qty: diff, reason: `Ajuste manual (${p.stock || 0} → ${newStock})` });
        return { ...p, stock: newStock };
      }
      return p;
    }));
    if (logs.length > 0) logStock(logs);
    setQuickEdit(false);
    setQuickStocks({});
    alert(`Stock actualizado: ${changes} producto${changes !== 1 ? "s" : ""} modificado${changes !== 1 ? "s" : ""}`);
  };

  const cancelQuickEdit = () => { setQuickEdit(false); setQuickStocks({}); };

  const filtered = products.filter(p => {
    const matchSearch = `${p.brand} ${p.model} ${p.flavor} ${p.puffs}`.toLowerCase().includes(search.toLowerCase());
    const matchBrand = !brandFilter || p.brand === brandFilter;
    const matchStock = stockFilter === "all" || (stockFilter === "instock" && p.stock > 0) || (stockFilter === "nostock" && p.stock === 0);
    return matchSearch && matchBrand && matchStock;
  });

  // Group by Brand → Model (sorted alphabetically)
  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach(p => {
      const key = `${p.brand}|||${p.model}|||${p.puffs}`;
      if (!map[key]) map[key] = { brand: p.brand, model: p.model, puffs: p.puffs, priceUSD: p.priceUSD, priceARS: p.priceARS, items: [] };
      map[key].items.push(p);
    });
    // Sort items alphabetically by flavor within each group
    Object.values(map).forEach(g => g.items.sort((a, b) => a.flavor.localeCompare(b.flavor)));
    // Sort groups by brand then model
    return Object.values(map).sort((a, b) => {
      if (a.brand !== b.brand) return a.brand.localeCompare(b.brand);
      return a.model.localeCompare(b.model);
    });
  }, [filtered]);

  const toggleCollapse = (key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  const totalInStock = filtered.reduce((s, p) => s + (p.stock || 0), 0);
  const totalWithStock = filtered.filter(p => p.stock > 0).length;

  const openNew = () => { setForm({ brand: "", model: "", flavor: "", puffs: "", priceUSD: "", priceARS: "", stock: 0 }); setEditing(null); setModal(true); };
  const openEdit = (p) => { setForm(p); setEditing(p.id); setModal(true); };

  const save = () => {
    if (!form.brand || !form.model || !form.flavor) return;
    if (editing) {
      const old = products.find(p => p.id === editing);
      if (old && Number(old.priceUSD) !== Number(form.priceUSD)) logPrice(editing, old.priceUSD, Number(form.priceUSD), "USD");
      setProducts(prev => prev.map(p => p.id === editing ? { ...form, id: editing } : p));
    } else {
      setProducts(prev => [...prev, { ...form, id: uid(), stock: Number(form.stock) || 0 }]);
    }
    setModal(false);
  };

  const [confirmDeleteProd, setConfirmDeleteProd] = useState(null);
  const remove = (id) => {
    if (confirmDeleteProd !== id) { setConfirmDeleteProd(id); setTimeout(() => setConfirmDeleteProd(null), 3000); return; }
    setProducts(prev => prev.filter(p => p.id !== id));
    setConfirmDeleteProd(null);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: "#e0e0ff", margin: 0, fontSize: 22 }}>Stock</h2>
          <span style={{ color: "#6666aa", fontSize: 13 }}>{totalWithStock} productos con stock · {totalInStock} unidades totales · {filtered.length} productos listados</span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar producto..." />
          {quickEdit ? (
            <>
              <Btn variant="success" onClick={saveQuickEdit}>✅ Guardar todo</Btn>
              <Btn variant="secondary" onClick={cancelQuickEdit}>Cancelar</Btn>
            </>
          ) : (
            <>
              <Btn variant="secondary" onClick={startQuickEdit} style={{ padding: "10px 14px" }}>⚡ Edición rápida</Btn>
              <Btn onClick={openNew}>+ Nuevo</Btn>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {["", ...BRANDS].map(b => (
          <button key={b} onClick={() => setBrandFilter(b)} style={{
            padding: "6px 14px", borderRadius: 20, border: "1px solid " + (brandFilter === b ? (BRAND_COLORS[b] || "#a855f7") : "#2a2a4a"),
            background: brandFilter === b ? (BRAND_COLORS[b] || "#a855f7") + "22" : "transparent",
            color: brandFilter === b ? (BRAND_COLORS[b] || "#a855f7") : "#6666aa",
            cursor: "pointer", fontSize: 12, fontWeight: 600
          }}>{b || "Todas"}</button>
        ))}
        <span style={{ color: "#2a2a4a", margin: "0 2px" }}>|</span>
        {[["all", "Todos"], ["instock", "Con stock"], ["nostock", "Sin stock"]].map(([val, label]) => (
          <button key={val} onClick={() => setStockFilter(val)} style={{
            padding: "6px 14px", borderRadius: 20, border: "1px solid " + (stockFilter === val ? "#00b894" : "#2a2a4a"),
            background: stockFilter === val ? "#00b89422" : "transparent", color: stockFilter === val ? "#00b894" : "#6666aa",
            cursor: "pointer", fontSize: 12, fontWeight: 600
          }}>{label}</button>
        ))}
      </div>

      {/* Quick edit banner */}
      {quickEdit && (
        <Card style={{ marginBottom: 14, background: "#a855f711", border: "1px solid #a855f744" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>⚡</span>
            <span style={{ color: "#a855f7", fontSize: 13, fontWeight: 600 }}>
              Modo edición rápida — Cambiá las cantidades directo y dale "Guardar todo". Los campos modificados se resaltan en violeta.
            </span>
          </div>
        </Card>
      )}

      {/* Grouped Cards */}
      {grouped.length === 0 ? (
        <Card><p style={{ color: "#555", textAlign: "center", padding: 20 }}>No hay productos que coincidan con los filtros.</p></Card>
      ) : grouped.map(group => {
        const key = `${group.brand}-${group.model}`;
        const isCollapsed = collapsed[key];
        const groupStock = group.items.reduce((s, p) => s + (p.stock || 0), 0);
        const groupInStock = group.items.filter(p => p.stock > 0).length;
        const brandColor = BRAND_COLORS[group.brand] || "#a855f7";
        const puffsFormatted = Number(group.puffs).toLocaleString("es-AR");

        return (
          <div key={key} style={{ marginBottom: 12 }}>
            {/* Group Header */}
            <div onClick={() => toggleCollapse(key)} style={{
              background: "#1a1a2e", borderRadius: isCollapsed ? 12 : "12px 12px 0 0", padding: "14px 18px",
              border: `1px solid ${brandColor}33`, borderBottom: isCollapsed ? `1px solid ${brandColor}33` : "none",
              cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
              transition: "all 0.2s"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 18, transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.2s", display: "inline-block" }}>▼</span>
                <Badge color={brandColor}>{group.brand}</Badge>
                <span style={{ color: "#e0e0ff", fontWeight: 700, fontSize: 15 }}>{group.model}</span>
                <span style={{ color: "#6666aa", fontSize: 13 }}>· {puffsFormatted} puffs</span>
                <span style={{ color: "#6666aa", fontSize: 13 }}>· {formatMoney(group.priceUSD, "USD")} / {formatMoney(Math.round(group.priceUSD * exchangeRate))}</span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ color: "#6666aa", fontSize: 12 }}>{groupInStock}/{group.items.length} sabores</span>
                <Badge color={groupStock > 0 ? "#00b894" : "#e74c3c"}>{groupStock} uds</Badge>
              </div>
            </div>

            {/* Flavors List */}
            {!isCollapsed && (
              <div style={{
                background: "#12122a", borderRadius: "0 0 12px 12px", border: `1px solid ${brandColor}22`,
                borderTop: `1px solid ${brandColor}15`, overflow: "hidden"
              }}>
                {group.items.map((p, i) => (
                  <div key={p.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 18px", borderBottom: i < group.items.length - 1 ? "1px solid #1a1a30" : "none",
                    opacity: p.stock === 0 ? 0.4 : 1, transition: "opacity 0.2s"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: p.stock > 0 ? "#00b894" : "#e74c3c",
                        flexShrink: 0
                      }} />
                      <span style={{
                        color: p.stock > 0 ? "#e0e0ff" : "#555",
                        fontSize: 14,
                        textDecoration: p.stock === 0 ? "line-through" : "none"
                      }}>{p.flavor}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {quickEdit ? (
                        <input type="number" min={0} value={quickStocks[p.id] ?? p.stock ?? 0}
                          onChange={e => setQuickStocks(prev => ({ ...prev, [p.id]: Number(e.target.value) }))}
                          style={{
                            width: 60, padding: "4px 8px", background: (quickStocks[p.id] ?? p.stock) !== (p.stock || 0) ? "#a855f722" : "#12122a",
                            border: `1px solid ${(quickStocks[p.id] ?? p.stock) !== (p.stock || 0) ? "#a855f7" : "#2a2a4a"}`,
                            borderRadius: 6, color: "#e0e0ff", fontSize: 14, fontWeight: 700, textAlign: "center"
                          }} />
                      ) : (
                        <span style={{
                          color: p.stock === 0 ? "#444" : p.stock <= 3 ? "#fdcb6e" : "#00b894",
                          fontWeight: 700, fontSize: 15, minWidth: 30, textAlign: "right"
                        }}>{p.stock}</span>
                      )}
                      {!quickEdit && <>
                        <button onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                          style={{ background: "none", border: "none", color: "#6666aa", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}
                          title="Editar">✏️</button>
                        <button onClick={(e) => { e.stopPropagation(); remove(p.id); }}
                          style={{ background: "none", border: "none", color: "#6666aa", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}
                          title="Eliminar">🗑️</button>
                      </>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? "Editar Producto" : "Nuevo Producto"}>
        <Select label="Marca" options={BRANDS} value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} />
        <Input label="Modelo" placeholder="ej: BC5000, A16000..." value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
        <Input label="Sabor" placeholder="ej: Watermelon Ice, Grape..." value={form.flavor} onChange={e => setForm(f => ({ ...f, flavor: e.target.value }))} />
        <Input label="Puffs" placeholder="ej: 5000, 8000, 16000..." value={form.puffs} onChange={e => setForm(f => ({ ...f, puffs: e.target.value }))} />
        <div style={{ display: "flex", gap: 12 }}>
          <Input label="Precio venta USD" type="number" value={form.priceUSD} onChange={e => setForm(f => ({ ...f, priceUSD: e.target.value }))} />
          <Input label="Precio venta ARS" type="number" value={form.priceARS} onChange={e => setForm(f => ({ ...f, priceARS: e.target.value }))} />
        </div>
        <Input label="Stock" type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: Number(e.target.value) }))} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => setModal(false)}>Cancelar</Btn>
          <Btn onClick={save}>{editing ? "Guardar" : "Crear"}</Btn>
        </div>
      </Modal>
    </div>
  );
};
