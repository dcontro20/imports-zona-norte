import { useState, useMemo } from "react";
import { uid, formatMoney } from "../helpers.js";
import { Modal, Card, Btn, Input, Select, Table, Badge, SearchBar } from "./UI.jsx";
import { BRANDS, BRAND_COLORS } from "../constants.js";
import { useResponsive } from "../App.jsx";
import { useAppContext } from "../AppContext.js";
import { T } from "../theme.js";
import {
  buildProductSalesStats,
  calcProductMargin,
  classifyVelocity,
  findSlowMovers,
  findDeadStock,
  classifyLifecycle,
} from "../productIntelligence.js";

// -- PRODUCTS / STOCK --


export const Products = ({ products, setProducts, priceLog = [], sales = [] }) => {
  const { exchangeRate, logStock, logPrice, currentUser, logAudit } = useAppContext();
  const { isMobile } = useResponsive();
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [brandFilter, setBrandFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [collapsed, setCollapsed] = useState({});
  const [quickEdit, setQuickEdit] = useState(false);
  const [quickStocks, setQuickStocks] = useState({});
  const [toast, setToast] = useState("");
  const [form, setForm] = useState({ brand: "", model: "", flavor: "", puffs: "", priceUSD: "", priceARS: "", costUSDT: "", stock: 0, expiryDate: "", tags: [], photoUrl: "" });
  const [tagFilter, setTagFilter] = useState("");
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState("");

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
    const msg = changes === 0
      ? "Sin cambios"
      : `✓ ${changes} producto${changes !== 1 ? "s" : ""} actualizado${changes !== 1 ? "s" : ""}`;
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  };

  const cancelQuickEdit = () => { setQuickEdit(false); setQuickStocks({}); };

  const activeProducts = products.filter(p => !p.isDeleted);
  const filtered = activeProducts.filter(p => {
    const matchSearch = `${p.brand} ${p.model} ${p.flavor} ${p.puffs} ${(p.tags || []).join(" ")}`.toLowerCase().includes(search.toLowerCase());
    const matchBrand = !brandFilter || p.brand === brandFilter;
    const matchStock = stockFilter === "all" || (stockFilter === "instock" && p.stock > 0) || (stockFilter === "nostock" && p.stock === 0);
    const matchTag = !tagFilter || (p.tags || []).includes(tagFilter);
    return matchSearch && matchBrand && matchStock && matchTag;
  });

  // Tags únicos disponibles para filtro
  const allTags = useMemo(() => {
    const set = new Set();
    products.forEach(p => (p.tags || []).forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [products]);

  // S15 — Inteligencia de producto: stats por producto en una pasada, después
  // derivados slow/dead/lifecycle desde el mismo map. useMemo para no recalcular
  // en cada render si sales no cambió.
  const productStats = useMemo(
    () => buildProductSalesStats(products, sales, exchangeRate),
    [products, sales, exchangeRate]
  );
  const slowMoverIds = useMemo(() => {
    const set = new Set();
    findSlowMovers(productStats, products).forEach(s => set.add(s.productId));
    return set;
  }, [productStats, products]);
  const deadStockIds = useMemo(() => {
    const set = new Set();
    findDeadStock(productStats).forEach(s => set.add(s.productId));
    return set;
  }, [productStats]);

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

  const openNew = () => { setForm({ brand: "", model: "", flavor: "", puffs: "", priceUSD: "", priceARS: "", costUSDT: "", stock: 0, expiryDate: "", tags: [], photoUrl: "" }); setEditing(null); setModal(true); };
  const openEdit = (p) => { setForm({ tags: [], photoUrl: "", ...p }); setEditing(p.id); setModal(true); };

  const save = () => {
    if (!form.brand || !form.model || !form.flavor) return;
    if (editing) {
      const old = products.find(p => p.id === editing);
      if (old && Number(old.priceUSD) !== Number(form.priceUSD)) logPrice(editing, old.priceUSD, Number(form.priceUSD), "USD");
      setProducts(prev => prev.map(p => p.id === editing ? { ...form, id: editing } : p));
      if (logAudit) logAudit("update", "product", editing, `Editó producto: ${form.brand} ${form.model} - ${form.flavor}`);
    } else {
      const newId = uid();
      setProducts(prev => [...prev, { ...form, id: newId, stock: Number(form.stock) || 0 }]);
      if (logAudit) logAudit("create", "product", newId, `Creó producto: ${form.brand} ${form.model} - ${form.flavor}`);
    }
    setModal(false);
  };

  const [confirmDeleteProd, setConfirmDeleteProd] = useState(null);
  const remove = (id) => {
    if (confirmDeleteProd !== id) { setConfirmDeleteProd(id); setTimeout(() => setConfirmDeleteProd(null), 3000); return; }
    const p = products.find(p => p.id === id);
    setProducts(prev => prev.map(x => x.id === id ? { ...x, isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: currentUser?.name || "?" } : x));
    if (logAudit && p) logAudit("delete", "product", id, `Eliminó producto: ${p.brand} ${p.model} - ${p.flavor}`);
    setConfirmDeleteProd(null);
  };

  return (
    <div>
      {/* Toast de confirmación */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#37352F", color: "#FFFFFF", padding: "12px 20px", borderRadius: 10,
          fontSize: 13, fontWeight: 600, zIndex: 1001,
          boxShadow: "0 6px 20px rgba(0,0,0,0.2)",
        }}>{toast}</div>
      )}
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: "#37352F", margin: 0, fontSize: 22 }}>Stock</h2>
          <span style={{ color: "#8C8A82", fontSize: 13 }}>{totalWithStock} productos con stock · {totalInStock} unidades totales · {filtered.length} productos listados</span>
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
              <Btn variant="secondary" onClick={() => setBulkImportOpen(true)} style={{ padding: "10px 14px" }}>📥 Importar CSV</Btn>
              <Btn onClick={openNew}>+ Nuevo</Btn>
            </>
          )}
        </div>
      </div>

      {/* Filters — scroll horizontal en mobile */}
      <div style={{
        display: "flex", gap: 6, marginBottom: 16, alignItems: "center",
        overflowX: "auto", WebkitOverflowScrolling: "touch",
        paddingBottom: 4,
        scrollbarWidth: "thin",
      }}>
        {["", ...BRANDS].map(b => (
          <button key={b} onClick={() => setBrandFilter(b)} style={{
            padding: "8px 14px", borderRadius: 20, minHeight: 36, flexShrink: 0,
            border: "1px solid " + (brandFilter === b ? (BRAND_COLORS[b] || "#5E6AD2") : "#E8E7E3"),
            background: brandFilter === b ? (BRAND_COLORS[b] || "#5E6AD2") + "22" : "transparent",
            color: brandFilter === b ? (BRAND_COLORS[b] || "#5E6AD2") : "#8C8A82",
            cursor: "pointer", fontSize: 12, fontWeight: 600,
            fontFamily: "inherit", whiteSpace: "nowrap",
          }}>{b || "Todas"}</button>
        ))}
        <span style={{ color: "#E8E7E3", margin: "0 4px", flexShrink: 0 }}>|</span>
        {[["all", "Todos"], ["instock", "Con stock"], ["nostock", "Sin stock"]].map(([val, label]) => (
          <button key={val} onClick={() => setStockFilter(val)} style={{
            padding: "8px 14px", borderRadius: 20, minHeight: 36, flexShrink: 0,
            border: "1px solid " + (stockFilter === val ? "#00b894" : "#E8E7E3"),
            background: stockFilter === val ? "#00b89422" : "transparent",
            color: stockFilter === val ? "#00b894" : "#8C8A82",
            cursor: "pointer", fontSize: 12, fontWeight: 600,
            fontFamily: "inherit", whiteSpace: "nowrap",
          }}>{label}</button>
        ))}
      </div>

      {allTags.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, overflowX: "auto", paddingBottom: 4, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 600, marginRight: 4, whiteSpace: "nowrap" }}>Tags:</span>
          <button onClick={() => setTagFilter("")} style={{
            padding: "5px 10px", borderRadius: 14, minHeight: 28, flexShrink: 0,
            border: "1px solid " + (tagFilter === "" ? T.primary : T.borderSoft),
            background: tagFilter === "" ? `${T.primary}15` : "transparent",
            color: tagFilter === "" ? T.primary : T.textMuted,
            cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap",
          }}>Todos</button>
          {allTags.map(tag => (
            <button key={tag} onClick={() => setTagFilter(tag)} style={{
              padding: "5px 10px", borderRadius: 14, minHeight: 28, flexShrink: 0,
              border: "1px solid " + (tagFilter === tag ? T.primary : T.borderSoft),
              background: tagFilter === tag ? `${T.primary}15` : "transparent",
              color: tagFilter === tag ? T.primary : T.textSub,
              cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap",
            }}>#{tag}</button>
          ))}
        </div>
      )}

      {/* Quick edit banner */}
      {quickEdit && (
        <Card style={{ marginBottom: 14, background: "#5E6AD211", border: "1px solid #5E6AD244" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>⚡</span>
            <span style={{ color: "#5E6AD2", fontSize: 13, fontWeight: 600 }}>
              Modo edición rápida — Cambiá las cantidades directo y dale "Guardar todo". Los campos modificados se resaltan en violeta.
            </span>
          </div>
        </Card>
      )}

      {/* Grouped Cards */}
      {grouped.length === 0 ? (
        <Card><p style={{ color: "#B1AFA7", textAlign: "center", padding: 20 }}>No hay productos que coincidan con los filtros.</p></Card>
      ) : grouped.map(group => {
        const key = `${group.brand}-${group.model}`;
        const isCollapsed = collapsed[key];
        const groupStock = group.items.reduce((s, p) => s + (p.stock || 0), 0);
        const groupInStock = group.items.filter(p => p.stock > 0).length;
        const brandColor = BRAND_COLORS[group.brand] || "#5E6AD2";
        const puffsFormatted = Number(group.puffs).toLocaleString("es-AR");

        return (
          <div key={key} style={{ marginBottom: 12 }}>
            {/* Group Header */}
            <div onClick={() => toggleCollapse(key)} style={{
              background: "#FAFAF9", borderRadius: isCollapsed ? 12 : "12px 12px 0 0", padding: "14px 18px",
              border: `1px solid ${brandColor}33`, borderBottom: isCollapsed ? `1px solid ${brandColor}33` : "none",
              cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
              transition: "all 0.2s"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 18, transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.2s", display: "inline-block" }}>▼</span>
                <Badge color={brandColor}>{group.brand}</Badge>
                <span style={{ color: "#37352F", fontWeight: 700, fontSize: 15 }}>{group.model}</span>
                <span style={{ color: "#8C8A82", fontSize: 13 }}>· {puffsFormatted} puffs</span>
                <span style={{ color: "#8C8A82", fontSize: 13 }}>· {formatMoney(group.priceUSD, "USD")} / {formatMoney(Math.round(group.priceUSD * exchangeRate))}</span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ color: "#8C8A82", fontSize: 12 }}>{groupInStock}/{group.items.length} sabores</span>
                <Badge color={groupStock > 0 ? "#00b894" : "#E03E3E"}>{groupStock} uds</Badge>
              </div>
            </div>

            {/* Flavors List */}
            {!isCollapsed && (
              <div style={{
                background: "#FAFAF9", borderRadius: "0 0 12px 12px", border: `1px solid ${brandColor}22`,
                borderTop: `1px solid ${brandColor}15`, overflow: "hidden"
              }}>
                {group.items.map((p, i) => (
                  <div key={p.id}
                    onClick={() => { if (!quickEdit) openEdit(p); }}
                    style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 18px", borderBottom: i < group.items.length - 1 ? "1px solid #F0EFEB" : "none",
                    opacity: p.stock === 0 ? 0.4 : 1, transition: "opacity 0.2s, background 0.15s",
                    cursor: quickEdit ? "default" : "pointer",
                  }}
                  onMouseEnter={e => { if (!quickEdit) e.currentTarget.style.background = "#F5F5F2"; }}
                  onMouseLeave={e => { if (!quickEdit) e.currentTarget.style.background = "transparent"; }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: p.stock > 0 ? "#00b894" : "#E03E3E",
                        flexShrink: 0
                      }} />
                      {p.photoUrl && (
                        <img
                          src={p.photoUrl}
                          alt=""
                          onClick={e => { e.stopPropagation(); setLightboxUrl(p.photoUrl); }}
                          onError={e => { e.target.style.display = "none"; }}
                          style={{
                            width: 28, height: 28, borderRadius: 4, objectFit: "cover",
                            border: `1px solid ${T.borderSoft}`, cursor: "zoom-in", flexShrink: 0,
                          }}
                        />
                      )}
                      <span style={{
                        color: p.stock > 0 ? "#37352F" : "#B1AFA7",
                        fontSize: 14,
                        textDecoration: p.stock === 0 ? "line-through" : "none",
                      }}>{p.flavor}</span>
                      {(p.tags || []).slice(0, 3).map(tag => (
                        <span key={tag} style={{
                          fontSize: 10, padding: "2px 6px", borderRadius: 8,
                          background: `${T.primary}15`, color: T.primary, fontWeight: 600,
                          flexShrink: 0,
                        }}>#{tag}</span>
                      ))}
                      {p.expiryDate && (() => {
                        const days = Math.floor((new Date(p.expiryDate) - new Date()) / 86400000);
                        if (days > 60) return null;
                        return (
                          <span style={{
                            fontSize: 10, padding: "2px 6px", borderRadius: 8,
                            background: days < 0 ? T.redBg : days < 30 ? T.amberBg : T.surface2,
                            color: days < 0 ? T.red : days < 30 ? T.amber : T.textMuted,
                            fontWeight: 600, flexShrink: 0,
                          }}>
                            {days < 0 ? `Vencido` : `Vence ${days}d`}
                          </span>
                        );
                      })()}
                      {/* S15 — badges de inteligencia de producto */}
                      {(() => {
                        const stat = productStats[p.id];
                        if (!stat) return null;
                        const v = classifyVelocity(stat.velocity30dPerDay);
                        const lc = classifyLifecycle(stat);
                        const isSlow = slowMoverIds.has(p.id);
                        const isDead = deadStockIds.has(p.id);
                        const margin = calcProductMargin(p);
                        return (
                          <>
                            {/* Velocity tier (15.1) — solo mostrar si hay stock o ventas */}
                            {(p.stock > 0 || stat.totalQty > 0) && (
                              <span title={`Velocidad: ${stat.velocity30dPerDay.toFixed(2)} uds/día (últ. 30d)`}
                                style={{
                                  fontSize: 10, padding: "2px 6px", borderRadius: 8,
                                  background: `${v.color}18`, color: v.color, fontWeight: 600,
                                  flexShrink: 0, border: `1px solid ${v.color}33`,
                                }}>
                                {v.label}
                              </span>
                            )}
                            {/* Slow mover (15.4) o Dead stock (15.6) — mutually exclusive, dead gana */}
                            {isDead && (
                              <span title={`Stock dormido: ${stat.daysSinceLastSale === Infinity ? "nunca vendido" : stat.daysSinceLastSale + " días sin venta"}`}
                                style={{
                                  fontSize: 10, padding: "2px 6px", borderRadius: 8,
                                  background: T.redBg, color: T.red, fontWeight: 700,
                                  flexShrink: 0, border: `1px solid ${T.redBorder}`,
                                }}>💀 Dead</span>
                            )}
                            {!isDead && isSlow && (
                              <span title={`${stat.daysSinceLastSale} días sin venta — considerar promo`}
                                style={{
                                  fontSize: 10, padding: "2px 6px", borderRadius: 8,
                                  background: T.amberBg, color: T.amber, fontWeight: 600,
                                  flexShrink: 0, border: `1px solid ${T.amberBorder}`,
                                }}>🐌 Slow</span>
                            )}
                            {/* Lifecycle (15.9) — solo "new" para no inflar */}
                            {lc.stage === "new" && (
                              <span title="Producto creado hace <30 días"
                                style={{
                                  fontSize: 10, padding: "2px 6px", borderRadius: 8,
                                  background: `${lc.color}18`, color: lc.color, fontWeight: 600,
                                  flexShrink: 0, border: `1px solid ${lc.color}33`,
                                }}>{lc.label}</span>
                            )}
                            {/* Margen (15.3) — visible si hay datos de costo */}
                            {margin && margin.roiPct !== null && (
                              <span title={`Margen ${margin.marginPct}% · ROI ${margin.roiPct}% · Cost ${formatMoney(p.costUSDT, "USDT")}`}
                                style={{
                                  fontSize: 10, padding: "2px 6px", borderRadius: 8,
                                  background: margin.marginPct >= 50 ? T.greenBg : margin.marginPct >= 30 ? T.amberBg : T.redBg,
                                  color: margin.marginPct >= 50 ? T.green : margin.marginPct >= 30 ? T.amber : T.red,
                                  fontWeight: 600, flexShrink: 0,
                                }}>
                                m{margin.marginPct}%
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {quickEdit ? (
                        <input type="number" min={0} value={quickStocks[p.id] ?? p.stock ?? 0}
                          onChange={e => setQuickStocks(prev => ({ ...prev, [p.id]: Number(e.target.value) }))}
                          style={{
                            width: 60, padding: "4px 8px", background: (quickStocks[p.id] ?? p.stock) !== (p.stock || 0) ? "#EAECF9" : "#FAFAF9",
                            border: `1px solid ${(quickStocks[p.id] ?? p.stock) !== (p.stock || 0) ? "#5E6AD2" : "#E8E7E3"}`,
                            borderRadius: 6, color: "#37352F", fontSize: 14, fontWeight: 700, textAlign: "center"
                          }} />
                      ) : (
                        <span style={{
                          color: p.stock === 0 ? "#444" : p.stock <= 3 ? "#fdcb6e" : "#00b894",
                          fontWeight: 700, fontSize: 15, minWidth: 30, textAlign: "right"
                        }}>{p.stock}</span>
                      )}
                      {!quickEdit && <>
                        <button onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                          style={{ background: "none", border: "none", color: "#8C8A82", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}
                          title="Editar">✏️</button>
                        <button onClick={(e) => { e.stopPropagation(); remove(p.id); }}
                          style={{ background: "none", border: "none", color: "#8C8A82", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}
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
        <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
          <div style={{ flex: 1 }}>
            <Input label="Precio venta USD" type="number" value={form.priceUSD} onChange={e => setForm(f => ({ ...f, priceUSD: e.target.value }))} />
          </div>
          <div style={{ flex: 1 }}>
            <Input label="Precio venta ARS" type="number" value={form.priceARS} onChange={e => setForm(f => ({ ...f, priceARS: e.target.value }))} />
          </div>
        </div>
        {/* S15.3 — Costo USDT (importación Paraguay). Necesario para calcular margen real. */}
        <Input
          label="Costo USDT (lo que pagás en Paraguay — para cálculo de margen)"
          type="number"
          value={form.costUSDT}
          onChange={e => setForm(f => ({ ...f, costUSDT: e.target.value }))}
          placeholder="ej: 5.50"
        />
        {/* Margen preview en vivo */}
        {form.priceUSD > 0 && form.costUSDT > 0 && (() => {
          const margin = calcProductMargin({ priceUSD: Number(form.priceUSD), costUSDT: Number(form.costUSDT) });
          if (!margin) return null;
          const color = margin.marginPct >= 50 ? T.green : margin.marginPct >= 30 ? T.amber : T.red;
          return (
            <div style={{
              padding: "8px 12px", marginBottom: 12,
              background: `${color}15`, border: `1px solid ${color}33`, borderRadius: 8,
              fontSize: 12, color, fontWeight: 600,
            }}>
              📊 Margen: <strong>{margin.marginPct}%</strong> · Ganancia/ud: ${margin.marginUSD} USD
              {margin.roiPct !== null && <> · ROI: <strong>{margin.roiPct}%</strong></>}
            </div>
          );
        })()}
        <Input label="Stock" type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: Number(e.target.value) }))} />
        <Input label="Fecha de vencimiento (opcional)" type="date" value={form.expiryDate || ""} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))} />
        <Input
          label="Tags (separados por coma — ej: premium, puff alto, discontinuado)"
          placeholder="premium, puff alto"
          value={(form.tags || []).join(", ")}
          onChange={e => setForm(f => ({ ...f, tags: e.target.value.split(",").map(t => t.trim()).filter(Boolean) }))}
        />
        <Input
          label="Foto (URL — opcional)"
          placeholder="https://..."
          value={form.photoUrl || ""}
          onChange={e => setForm(f => ({ ...f, photoUrl: e.target.value }))}
        />
        {form.photoUrl && (
          <div style={{ marginBottom: 12 }}>
            <img src={form.photoUrl} alt="preview" style={{
              maxWidth: 120, maxHeight: 120, borderRadius: 8, border: `1px solid ${T.borderSoft}`,
            }} onError={e => { e.target.style.display = "none"; }} />
          </div>
        )}
        {editing && (() => {
          const history = (priceLog || [])
            .filter(p => p.productId === editing)
            .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
            .slice(0, 8);
          if (history.length === 0) return null;
          return (
            <div style={{
              marginTop: 8, marginBottom: 12,
              padding: 12, background: T.surface2,
              border: `1px solid ${T.borderSoft}`, borderRadius: 8,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>
                📈 Histórico de precios (últimos {history.length})
              </div>
              {history.map((h, i) => {
                const diff = (Number(h.newPrice) || 0) - (Number(h.oldPrice) || 0);
                const up = diff > 0;
                return (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "5px 0", borderBottom: i < history.length - 1 ? `1px solid ${T.borderSoft}` : "none",
                    fontSize: 12,
                  }}>
                    <span style={{ color: T.textMuted }}>{(h.date || "").slice(0, 10)}</span>
                    <span style={{ color: T.textSub }}>
                      {formatMoney(h.oldPrice, h.currency || "USD")} → <strong>{formatMoney(h.newPrice, h.currency || "USD")}</strong>
                    </span>
                    <span style={{
                      color: up ? T.green : T.red, fontWeight: 700, fontSize: 11,
                      background: up ? T.greenBg : T.redBg, padding: "2px 6px", borderRadius: 4,
                    }}>
                      {up ? "▲" : "▼"} {Math.abs(diff).toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })()}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => setModal(false)}>Cancelar</Btn>
          <Btn onClick={save}>{editing ? "Guardar" : "Crear"}</Btn>
        </div>
      </Modal>

      {bulkImportOpen && (
        <BulkImportModal
          products={products}
          setProducts={setProducts}
          logAudit={logAudit}
          onClose={() => setBulkImportOpen(false)}
        />
      )}

      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl("")}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000, padding: 20, cursor: "pointer",
          }}
        >
          <img src={lightboxUrl} alt="" style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
};

// ============================================
// BulkImportModal — pegar CSV o subir archivo para crear/actualizar productos
// Headers esperados: brand,model,flavor,puffs,priceUSD,priceARS,stock,expiryDate,tags,photoUrl
// Match por (brand+model+flavor) → si existe, actualiza; sino, crea nuevo.
// ============================================
const BulkImportModal = ({ products, setProducts, logAudit, onClose }) => {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState(null); // { toCreate: [], toUpdate: [], errors: [] }

  const parseCsv = () => {
    const lines = csv.trim().split("\n").filter(l => l.trim());
    if (lines.length < 2) {
      setPreview({ toCreate: [], toUpdate: [], errors: ["CSV debe tener al menos header + 1 fila"] });
      return;
    }
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const REQUIRED = ["brand", "model", "flavor"];
    const missing = REQUIRED.filter(r => !headers.includes(r));
    if (missing.length > 0) {
      setPreview({ toCreate: [], toUpdate: [], errors: [`Faltan columnas: ${missing.join(", ")}`] });
      return;
    }
    const toCreate = [];
    const toUpdate = [];
    const errors = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(",").map(c => c.trim());
      const row = {};
      headers.forEach((h, idx) => { row[h] = cells[idx] || ""; });
      if (!row.brand || !row.model || !row.flavor) {
        errors.push(`Fila ${i + 1}: faltan brand/model/flavor`);
        continue;
      }
      const existing = products.find(p =>
        !p.isDeleted &&
        p.brand?.toLowerCase() === row.brand.toLowerCase() &&
        p.model?.toLowerCase() === row.model.toLowerCase() &&
        p.flavor?.toLowerCase() === row.flavor.toLowerCase()
      );
      const data = {
        brand: row.brand,
        model: row.model,
        flavor: row.flavor,
        puffs: row.puffs || "",
        priceUSD: Number(row.priceusd) || Number(row.priceUSD) || 0,
        priceARS: Number(row.pricears) || Number(row.priceARS) || 0,
        costUSDT: Number(row.costusdt) || Number(row.costUSDT) || 0,
        stock: Number(row.stock) || 0,
        expiryDate: row.expirydate || "",
        tags: row.tags ? row.tags.split(";").map(t => t.trim()).filter(Boolean) : [],
        photoUrl: row.photourl || "",
      };
      if (existing) toUpdate.push({ ...data, id: existing.id, oldStock: existing.stock || 0 });
      else toCreate.push(data);
    }
    setPreview({ toCreate, toUpdate, errors });
  };

  const applyImport = () => {
    if (!preview) return;
    const newIds = [];
    setProducts(prev => {
      let next = prev.map(p => {
        const upd = preview.toUpdate.find(u => u.id === p.id);
        return upd ? { ...p, ...upd, id: p.id } : p;
      });
      preview.toCreate.forEach(p => {
        const id = uid();
        newIds.push(id);
        next = [...next, { ...p, id }];
      });
      return next;
    });
    if (logAudit) logAudit("import", "products", "bulk", `Importación CSV: ${preview.toCreate.length} nuevos + ${preview.toUpdate.length} actualizados`);
    onClose();
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => setCsv(String(ev.target.result || ""));
    reader.readAsText(f);
  };

  return (
    <Modal open onClose={onClose} title="📥 Importar productos desde CSV">
      <p style={{ fontSize: 12, color: T.textMuted, margin: "0 0 12px" }}>
        Headers esperados: <code>brand,model,flavor,puffs,priceUSD,priceARS,costUSDT,stock,expiryDate,tags,photoUrl</code>.
        Tags separados por <code>;</code>. Match por marca+modelo+sabor (case-insensitive).
      </p>

      <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ marginBottom: 10, fontSize: 13 }} />

      <textarea
        value={csv}
        onChange={e => { setCsv(e.target.value); setPreview(null); }}
        placeholder="Pega aquí el CSV o subí un archivo arriba..."
        style={{
          width: "100%", minHeight: 140, padding: 10, borderRadius: 8,
          border: `1px solid ${T.borderSoft}`, fontFamily: "monospace", fontSize: 12,
          background: T.surface2, color: T.text, marginBottom: 10, resize: "vertical",
        }}
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <Btn variant="secondary" onClick={parseCsv} disabled={!csv.trim()}>👁 Previsualizar</Btn>
        {preview && preview.errors.length === 0 && (preview.toCreate.length + preview.toUpdate.length) > 0 && (
          <Btn onClick={applyImport}>✓ Aplicar import</Btn>
        )}
      </div>

      {preview && (
        <div style={{ background: T.surface2, padding: 12, borderRadius: 8, fontSize: 12, color: T.text, maxHeight: 280, overflowY: "auto" }}>
          {preview.errors.length > 0 && (
            <div style={{ color: T.red, marginBottom: 8 }}>
              <strong>Errores:</strong>
              <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                {preview.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          <div style={{ color: T.green, marginBottom: 6 }}>
            <strong>{preview.toCreate.length}</strong> nuevos · <strong>{preview.toUpdate.length}</strong> a actualizar
          </div>
          {preview.toCreate.slice(0, 5).map((p, i) => (
            <div key={`c${i}`} style={{ color: T.green, padding: "2px 0" }}>+ {p.brand} {p.model} {p.flavor} (stock: {p.stock})</div>
          ))}
          {preview.toUpdate.slice(0, 5).map((p, i) => (
            <div key={`u${i}`} style={{ color: T.amber, padding: "2px 0" }}>~ {p.brand} {p.model} {p.flavor} (stock: {p.oldStock} → {p.stock})</div>
          ))}
          {(preview.toCreate.length + preview.toUpdate.length) > 10 && (
            <div style={{ color: T.textMuted, marginTop: 6 }}>...y {preview.toCreate.length + preview.toUpdate.length - 10} más</div>
          )}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <Btn variant="secondary" onClick={onClose}>Cerrar</Btn>
      </div>
    </Modal>
  );
};
