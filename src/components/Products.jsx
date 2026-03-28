import { useState, useMemo } from "react";
import { uid, formatMoney } from "../helpers.js";
import { Modal, Card, Btn, Input, Select, Table, Badge, SearchBar } from "./UI.jsx";
import { BRANDS, BRAND_COLORS } from "../constants.js";
import { useResponsive } from "../App.jsx";

// -- PRODUCTS / STOCK --


export const Products = ({ products, setProducts, exchangeRate, logStock, logPrice, currentUser }) => {
  const { isMobile } = useResponsive();
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
      {/* Header - Stack on mobile */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: isMobile ? "flex-start" : "center",
        marginBottom: 16,
        flexDirection: isMobile ? "column" : "row",
        gap: 12
      }}>
        <div>
          <h2 style={{ color: "#1a1a2e", margin: 0, fontSize: 22 }}>Stock</h2>
          <span style={{ color: "#6b7280", fontSize: 13 }}>{totalWithStock} productos con stock · {totalInStock} unidades totales · {filtered.length} productos listados</span>
        </div>
        <div style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          width: isMobile ? "100%" : "auto",
          flexDirection: isMobile ? "column" : "row"
        }}>
          <div style={{ width: isMobile ? "100%" : "auto" }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Buscar producto..." />
          </div>
          {quickEdit ? (
            <div style={{ display: "flex", gap: 10, width: isMobile ? "100%" : "auto", flexDirection: isMobile ? "column" : "row" }}>
              <Btn variant="success" onClick={saveQuickEdit} style={{ flex: isMobile ? 1 : "initial" }}>✅ Guardar todo</Btn>
              <Btn variant="secondary" onClick={cancelQuickEdit} style={{ flex: isMobile ? 1 : "initial" }}>Cancelar</Btn>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, width: isMobile ? "100%" : "auto", flexDirection: isMobile ? "column" : "row" }}>
              <Btn variant="secondary" onClick={startQuickEdit} style={{ padding: "10px 14px", flex: isMobile ? 1 : "initial" }}>⚡ Edición rápida</Btn>
              <Btn onClick={openNew} style={{ flex: isMobile ? 1 : "initial" }}>+ Nuevo</Btn>
            </div>
          )}
        </div>
      </div>

      {/* Filters - Scrollable horizontally on mobile */}
      <div style={{
        display: "flex",
        gap: 8,
        marginBottom: 16,
        flexWrap: isMobile ? "nowrap" : "wrap",
        overflowX: isMobile ? "auto" : "visible",
        alignItems: "center",
        paddingBottom: isMobile ? 8 : 0
      }}>
        {["", ...BRANDS].map(b => (
          <button key={b} onClick={() => setBrandFilter(b)} style={{
            padding: isMobile ? "4px 10px" : "6px 14px",
            borderRadius: 20,
            border: "1px solid " + (brandFilter === b ? (BRAND_COLORS[b] || "#6366f1") : "#e2e4e9"),
            background: brandFilter === b ? (BRAND_COLORS[b] || "#6366f1") + "22" : "transparent",
            color: brandFilter === b ? (BRAND_COLORS[b] || "#6366f1") : "#6b7280",
            cursor: "pointer",
            fontSize: isMobile ? 11 : 12,
            fontWeight: 600,
            flexShrink: 0
          }}>{b || "Todas"}</button>
        ))}
        <span style={{ color: "#e2e4e9", margin: "0 2px", flexShrink: 0 }}>|</span>
        {[["all", "Todos"], ["instock", "Con stock"], ["nostock", "Sin stock"]].map(([val, label]) => (
          <button key={val} onClick={() => setStockFilter(val)} style={{
            padding: isMobile ? "4px 10px" : "6px 14px",
            borderRadius: 20,
            border: "1px solid " + (stockFilter === val ? "#00b894" : "#e2e4e9"),
            background: stockFilter === val ? "#00b89422" : "transparent",
            color: stockFilter === val ? "#00b894" : "#6b7280",
            cursor: "pointer",
            fontSize: isMobile ? 11 : 12,
            fontWeight: 600,
            flexShrink: 0
          }}>{label}</button>
        ))}
      </div>

      {/* Quick edit banner */}
      {quickEdit && (
        <Card style={{ marginBottom: 14, background: "#6366f111", border: "1px solid #6366f144" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>⚡</span>
            <span style={{ color: "#6366f1", fontSize: 13, fontWeight: 600 }}>
              Modo edición rápida — Cambiá las cantidades directo y dale "Guardar todo". Los campos modificados se resaltan en violeta.
            </span>
          </div>
        </Card>
      )}

      {/* Grouped Cards */}
      {grouped.length === 0 ? (
        <Card><p style={{ color: "#9ca3af", textAlign: "center", padding: 20 }}>No hay productos que coincidan con los filtros.</p></Card>
      ) : grouped.map(group => {
        const key = `${group.brand}-${group.model}`;
        const isCollapsed = collapsed[key];
        const groupStock = group.items.reduce((s, p) => s + (p.stock || 0), 0);
        const groupInStock = group.items.filter(p => p.stock > 0).length;
        const brandColor = BRAND_COLORS[group.brand] || "#6366f1";
        const puffsFormatted = Number(group.puffs).toLocaleString("es-AR");

        return (
          <div key={key} style={{ marginBottom: 12 }}>
            {/* Group Header - Simplified on mobile */}
            <div onClick={() => toggleCollapse(key)} style={{
              background: "#f7f8fa",
              borderRadius: isCollapsed ? 12 : "12px 12px 0 0",
              padding: isMobile ? "12px 14px" : "14px 18px",
              border: `1px solid ${brandColor}33`,
              borderBottom: isCollapsed ? `1px solid ${brandColor}33` : "none",
              cursor: "pointer",
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              justifyContent: "space-between",
              alignItems: isMobile ? "flex-start" : "center",
              gap: isMobile ? 10 : 0,
              transition: "all 0.2s"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, width: isMobile ? "100%" : "auto" }}>
                <span style={{ fontSize: 18, transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.2s", display: "inline-block", flexShrink: 0 }}>▼</span>
                <Badge color={brandColor}>{group.brand}</Badge>
                <span style={{ color: "#1a1a2e", fontWeight: 700, fontSize: isMobile ? 14 : 15 }}>{group.model}</span>
              </div>

              {/* Mobile: Show price and stock on second line */}
              {isMobile && (
                <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", paddingLeft: 32 }}>
                  <span style={{ color: "#6b7280", fontSize: 12 }}>{formatMoney(group.priceUSD, "USD")}</span>
                  <Badge color={groupStock > 0 ? "#00b894" : "#e74c3c"}>{groupStock} uds</Badge>
                </div>
              )}

              {/* Desktop: Show all info on one line */}
              {!isMobile && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ color: "#6b7280", fontSize: 13 }}>· {puffsFormatted} puffs</span>
                    <span style={{ color: "#6b7280", fontSize: 13 }}>· {formatMoney(group.priceUSD, "USD")} / {formatMoney(Math.round(group.priceUSD * exchangeRate))}</span>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ color: "#6b7280", fontSize: 12 }}>{groupInStock}/{group.items.length} sabores</span>
                    <Badge color={groupStock > 0 ? "#00b894" : "#e74c3c"}>{groupStock} uds</Badge>
                  </div>
                </>
              )}
            </div>

            {/* Flavors List */}
            {!isCollapsed && (
              <div style={{
                background: "#f7f8fa", borderRadius: "0 0 12px 12px", border: `1px solid ${brandColor}22`,
                borderTop: `1px solid ${brandColor}15`, overflow: "hidden"
              }}>
                {group.items.map((p, i) => (
                  <div key={p.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: isMobile ? "8px 14px" : "10px 18px",
                    borderBottom: i < group.items.length - 1 ? "1px solid #edf0f2" : "none",
                    opacity: p.stock === 0 ? 0.4 : 1, transition: "opacity 0.2s"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: p.stock > 0 ? "#00b894" : "#e74c3c",
                        flexShrink: 0
                      }} />
                      <span style={{
                        color: p.stock > 0 ? "#1a1a2e" : "#9ca3af",
                        fontSize: isMobile ? 13 : 14,
                        textDecoration: p.stock === 0 ? "line-through" : "none"
                      }}>{p.flavor}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {quickEdit ? (
                        <input type="number" min={0} value={quickStocks[p.id] ?? p.stock ?? 0}
                          onChange={e => setQuickStocks(prev => ({ ...prev, [p.id]: Number(e.target.value) }))}
                          style={{
                            width: 60, padding: "4px 8px", background: (quickStocks[p.id] ?? p.stock) !== (p.stock || 0) ? "#6366f122" : "#f7f8fa",
                            border: `1px solid ${(quickStocks[p.id] ?? p.stock) !== (p.stock || 0) ? "#6366f1" : "#e2e4e9"}`,
                            borderRadius: 6, color: "#1a1a2e", fontSize: 14, fontWeight: 700, textAlign: "center"
                          }} />
                      ) : (
                        <span style={{
                          color: p.stock === 0 ? "#444" : p.stock <= 3 ? "#fdcb6e" : "#00b894",
                          fontWeight: 700, fontSize: 15, minWidth: 30, textAlign: "right"
                        }}>{p.stock}</span>
                      )}
                      {!quickEdit && <>
                        <button onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                          style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}
                          title="Editar">✏️</button>
                        <button onClick={(e) => { e.stopPropagation(); remove(p.id); }}
                          style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}
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
        <div style={{ display: "flex", gap: 12, flexDirection: isMobile ? "column" : "row" }}>
          <Input label="Precio venta USD" type="number" value={form.priceUSD} onChange={e => setForm(f => ({ ...f, priceUSD: e.target.value }))} />
          <Input label="Precio venta ARS" type="number" value={form.priceARS} onChange={e => setForm(f => ({ ...f, priceARS: e.target.value }))} />
        </div>
        <Input label="Stock" type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: Number(e.target.value) }))} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16, flexDirection: isMobile ? "column-reverse" : "row" }}>
          <Btn variant="secondary" onClick={() => setModal(false)} style={{ flex: isMobile ? 1 : "initial" }}>Cancelar</Btn>
          <Btn onClick={save} style={{ flex: isMobile ? 1 : "initial" }}>{editing ? "Guardar" : "Crear"}</Btn>
        </div>
      </Modal>
    </div>
  );
};
