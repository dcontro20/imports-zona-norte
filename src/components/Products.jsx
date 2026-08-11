import { useState, useMemo, useEffect } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { Modal, Card, Btn, Input, Select, Table, Badge, SearchBar, useBodyScrollLock } from "./UI.jsx";
import { BRANDS, BRAND_COLORS } from "../constants.js";
import { useResponsive } from "../App.jsx";
import { useAppContext } from "../AppContext.js";
import { T } from "../theme.js";
import {
  buildProductSalesStats,
  calcProductMargin,
  classifyVelocity,
  classifyLifecycle,
} from "../productIntelligence.js";
import { calcMarginGuard } from "../pricing.js";
import { productosParaMotor } from "../lib/pricingAdapter.js";
import { ultimoCostoCompra, driftCostoFicha } from "../lib/costoCompras.js";

// -- PRODUCTS / STOCK --

// Sub-componente: badges informativos de un producto en la lista de stock.
// Diego pidió quitar los badges "Lento" y "Sin movimiento" porque no eran
// accionables en la lista y generaban ruido. Mantenemos solo: tags, expiry,
// "🔥 Top mover", "🆕 Nuevo" y margen (cuando hay datos).
const ProductBadges = ({ product, stat, margin, lc, expiryBadge, isMobile }) => {
  const tags = product.tags || [];
  const maxTags = isMobile ? 2 : 3;
  const tagsToShow = tags.slice(0, maxTags);
  const hasMoreTags = tags.length > maxTags;

  const velocity = stat ? classifyVelocity(stat.velocity30d) : null;
  // Solo mostramos hot/warm (Top mover, Activo). cold/frozen quedaron afuera.
  const showVelocity = velocity && (velocity.tier === "hot" || velocity.tier === "warm") && stat?.totalQty > 0;
  const showLifecycle = lc && lc.stage === "new";
  const showMargin = margin && margin.marginPct !== null;

  const hasAnyBadge = tagsToShow.length > 0 || expiryBadge || showVelocity || showLifecycle || showMargin;
  if (!hasAnyBadge) return null;

  const baseStyle = {
    fontSize: isMobile ? 10 : 10,
    padding: "2px 7px",
    borderRadius: 10,
    fontWeight: 600,
    whiteSpace: "nowrap",
    flexShrink: 0,
    lineHeight: 1.4,
  };

  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 4,
      alignItems: "center",
      marginLeft: isMobile ? 0 : 8,
    }}>
      {tagsToShow.map(tag => (
        <span key={tag} style={{
          ...baseStyle,
          background: `${T.primary}15`, color: T.primary,
          border: `1px solid ${T.primary}33`,
        }}>#{tag}</span>
      ))}
      {hasMoreTags && (
        <span style={{ ...baseStyle, background: T.surface2, color: T.textMuted }}>
          +{tags.length - maxTags}
        </span>
      )}
      {expiryBadge && (
        <span style={{
          ...baseStyle,
          background: expiryBadge.bg, color: expiryBadge.color,
        }}>{expiryBadge.label}</span>
      )}
      {showLifecycle && (
        <span style={{
          ...baseStyle,
          background: `${lc.color}18`, color: lc.color,
          border: `1px solid ${lc.color}40`,
        }}>{lc.label}</span>
      )}
      {showVelocity && (
        <span style={{
          ...baseStyle,
          background: `${velocity.color}18`, color: velocity.color,
          border: `1px solid ${velocity.color}40`,
        }}>{velocity.label}</span>
      )}
      {showMargin && !isMobile && (
        <span style={{
          ...baseStyle,
          background: margin.marginPct >= 50 ? T.greenBg : margin.marginPct >= 30 ? T.amberBg : T.redBg,
          color: margin.marginPct >= 50 ? T.green : margin.marginPct >= 30 ? T.amber : T.red,
        }}>{margin.marginPct}% margen</span>
      )}
    </div>
  );
};


export const Products = ({ products, setProducts, priceLog = [], sales = [], purchases = [], pricingPolicy = null }) => {
  const { exchangeRate, logStock, logPrice, currentUser, logAudit } = useAppContext();
  const { isMobile } = useResponsive();
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [brandFilter, setBrandFilter] = useState("");
  // Default "instock" — Diego prefiere ver primero lo disponible.
  const [stockFilter, setStockFilter] = useState("instock");
  const [collapsed, setCollapsed] = useState({});
  const [quickEdit, setQuickEdit] = useState(false);
  const [quickStocks, setQuickStocks] = useState({});
  const [toast, setToast] = useState("");
  const [form, setForm] = useState({ brand: "", model: "", flavor: "", puffs: "", priceUSD: "", priceARS: "", costUSDT: "", stock: 0, expiryDate: "", tags: [], photoUrl: "", priceByChannel: {} });
  const [tagFilter, setTagFilter] = useState("");
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  // Pricing Engine F3 — editor masivo de costos por modelo (el costo alimenta
  // la lista mayorista; cargarlo sabor por sabor invita al error de carga).
  const [costosModal, setCostosModal] = useState(false);
  const [costosDraft, setCostosDraft] = useState({});
  // Llegada desde 🏷️ Lista de precios ("Editar costos"): abre el editor solo y
  // recuerda a dónde volver — el costo es el único dato de entrada del motor,
  // corregirlo no puede costar navegar y buscar el botón.
  const [volverA, setVolverA] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState("");
  // Lock del scroll de fondo mientras el lightbox está abierto (iOS)
  useBodyScrollLock(!!lightboxUrl);

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

  // Pricing Engine F3 — vista por MODELO para el costo (el motor precia por
  // marca+modelo) + inconsistencias VISIBLES: sabores del mismo modelo con
  // costos distintos suelen ser error de carga, no situación legítima. El
  // adaptador usa el más alto mientras tanto (protege margen), pero el
  // operador lo tiene que ver para corregirlo.
  const { productosMotor: modelosCosto, inconsistencias } = useMemo(
    () => productosParaMotor(products),
    [products]
  );
  const inconsistenciasCosto = inconsistencias.filter(i => i.tipo === "costo");

  const abrirCostosModal = () => {
    const draft = {};
    const inconsistentes = new Set(inconsistenciasCosto.map(i => i.id));
    modelosCosto.forEach(m => {
      draft[m.id] = inconsistentes.has(m.id) ? "" : (m.costo > 0 ? m.costo : "");
    });
    setCostosDraft(draft);
    setCostosModal(true);
  };

  useEffect(() => {
    let destino = null;
    try {
      destino = localStorage.getItem("izn:abrirCostos");
      if (destino) localStorage.removeItem("izn:abrirCostos");
    } catch {}
    if (destino) { setVolverA(destino); abrirCostosModal(); }
  }, []); // eslint-disable-line

  const cerrarCostosModal = () => {
    setCostosModal(false);
    if (volverA) {
      const page = volverA;
      setVolverA(null);
      window.dispatchEvent(new CustomEvent("izn:navigate", { detail: { page } }));
    }
  };

  const guardarCostosPorModelo = () => {
    // Cambios calculados ANTES del setState (nada de side effects en el updater).
    const nuevosPorClave = {};
    for (const [clave, val] of Object.entries(costosDraft)) {
      const n = Number(val);
      if (val !== "" && n > 0) nuevosPorClave[clave] = n;
    }
    const cambiados = products.filter(p => {
      if (p.isDeleted) return false;
      const nuevo = nuevosPorClave[`${p.brand}|${p.model}`];
      return nuevo != null && Number(p.costUSDT) !== nuevo;
    });
    if (cambiados.length > 0) {
      setProducts(prev => prev.map(p => {
        if (p.isDeleted) return p;
        const nuevo = nuevosPorClave[`${p.brand}|${p.model}`];
        return nuevo != null && Number(p.costUSDT) !== nuevo ? { ...p, costUSDT: nuevo } : p;
      }));
      if (logAudit) logAudit("update", "product", "costos-masivo", `Actualizó costos por modelo (${cambiados.length} sabores)`);
    }
    cerrarCostosModal();
    setToast(cambiados.length > 0 ? `✓ Costo actualizado en ${cambiados.length} sabor${cambiados.length !== 1 ? "es" : ""}` : "Sin cambios");
    setTimeout(() => setToast(""), 2600);
  };

  // S15 — Inteligencia de producto: stats por producto en una pasada.
  // Los badges slow/dead se quitaron por feedback de UX (poco accionables
  // en la lista). La info equivalente vive en Reports → ABC + Salud inventario.
  const productStats = useMemo(
    () => buildProductSalesStats(products, sales, exchangeRate),
    [products, sales, exchangeRate]
  );

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

  const openNew = () => { setForm({ brand: "", model: "", flavor: "", puffs: "", priceUSD: "", priceARS: "", costUSDT: "", stock: 0, expiryDate: "", tags: [], photoUrl: "", priceByChannel: {} }); setEditing(null); setModal(true); };
  const openEdit = (p) => { setForm({ tags: [], photoUrl: "", priceByChannel: {}, ...p }); setEditing(p.id); setModal(true); };

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
          background: "#1E2B4A", color: "#FFFFFF", padding: "12px 20px", borderRadius: 10,
          fontSize: 13, fontWeight: 600, zIndex: 1001,
          boxShadow: "0 6px 20px rgba(0,0,0,0.2)",
        }}>{toast}</div>
      )}
      {/* Header — stack en mobile, row en desktop */}
      <div style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        justifyContent: "space-between",
        alignItems: isMobile ? "stretch" : "center",
        marginBottom: 16, gap: isMobile ? 12 : 12, flexWrap: "wrap",
      }}>
        <div>
          <h2 style={{ color: "#1E2B4A", margin: 0, fontSize: isMobile ? 20 : 22 }}>Stock</h2>
          <span style={{ color: "#6B7794", fontSize: isMobile ? 12 : 13 }}>
            {totalWithStock} con stock · {totalInStock} uds · {filtered.length} listados
          </span>
        </div>
        <div style={{
          display: "flex", gap: isMobile ? 8 : 10, alignItems: "center",
          flexWrap: "wrap",
          width: isMobile ? "100%" : "auto",
        }}>
          <div style={{ flex: isMobile ? "1 1 100%" : "0 0 auto", minWidth: isMobile ? 0 : 200 }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Buscar producto..." />
          </div>
          {quickEdit ? (
            <>
              <Btn variant="success" onClick={saveQuickEdit} style={{ flex: isMobile ? 1 : "0 0 auto", minHeight: 44 }}>✅ Guardar todo</Btn>
              <Btn variant="secondary" onClick={cancelQuickEdit} style={{ flex: isMobile ? 1 : "0 0 auto", minHeight: 44 }}>Cancelar</Btn>
            </>
          ) : (
            <>
              <Btn variant="secondary" onClick={startQuickEdit} style={{ padding: isMobile ? "10px 12px" : "10px 14px", minHeight: 44, flex: isMobile ? 1 : "0 0 auto", fontSize: isMobile ? 12 : 13 }}>⚡ {isMobile ? "Rápida" : "Edición rápida"}</Btn>
              <Btn variant="secondary" onClick={() => setBulkImportOpen(true)} style={{ padding: isMobile ? "10px 12px" : "10px 14px", minHeight: 44, flex: isMobile ? 1 : "0 0 auto", fontSize: isMobile ? 12 : 13 }}>📥 {isMobile ? "CSV" : "Importar CSV"}</Btn>
              <Btn variant="secondary" onClick={abrirCostosModal} style={{ padding: isMobile ? "10px 12px" : "10px 14px", minHeight: 44, flex: isMobile ? 1 : "0 0 auto", fontSize: isMobile ? 12 : 13 }}>💲 {isMobile ? "Costos" : "Costos por modelo"}</Btn>
              <Btn onClick={openNew} style={{ minHeight: 44, flex: isMobile ? 1 : "0 0 auto" }}>+ Nuevo</Btn>
            </>
          )}
        </div>
      </div>

      {/* Pricing Engine F3 — inconsistencias de costo VISIBLES (pedido de
          Gustavo en gate F2): en general es error de carga; mientras tanto la
          lista mayorista usa el costo más alto del modelo. */}
      {inconsistenciasCosto.length > 0 && (
        <div style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 10,
          background: `${T.amber}12`, border: `1px solid ${T.amber}55`,
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        }}>
          <div style={{ flex: 1, minWidth: 220, fontSize: 12, color: T.amber }}>
            <strong>⚠️ Costos distintos entre sabores del mismo modelo</strong> — suele ser
            error de carga; la lista mayorista usa el más alto mientras tanto:
            <div style={{ marginTop: 4, color: "#6B7794" }}>
              {inconsistenciasCosto.map(i => (
                <div key={i.id}>• {i.id.replace("|", " ")}: ${i.valores.join(" / $")}</div>
              ))}
            </div>
          </div>
          <Btn variant="secondary" onClick={abrirCostosModal} style={{ minHeight: 40, color: T.amber, flexShrink: 0 }}>
            Corregir
          </Btn>
        </div>
      )}

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
            border: "1px solid " + (brandFilter === b ? (BRAND_COLORS[b] || "#1E2B4A") : "#E5DAC2"),
            background: brandFilter === b ? (BRAND_COLORS[b] || "#1E2B4A") + "22" : "transparent",
            color: brandFilter === b ? (BRAND_COLORS[b] || "#1E2B4A") : "#6B7794",
            cursor: "pointer", fontSize: 12, fontWeight: 600,
            fontFamily: "inherit", whiteSpace: "nowrap",
          }}>{b || "Todas"}</button>
        ))}
        <span style={{ color: "#E5DAC2", margin: "0 4px", flexShrink: 0 }}>|</span>
        {[["instock", "Con stock"], ["all", "Todos"], ["nostock", "Sin stock"]].map(([val, label]) => (
          <button key={val} onClick={() => setStockFilter(val)} style={{
            padding: "8px 14px", borderRadius: 20, minHeight: 36, flexShrink: 0,
            border: "1px solid " + (stockFilter === val ? "#00b894" : "#E5DAC2"),
            background: stockFilter === val ? "#00b89422" : "transparent",
            color: stockFilter === val ? "#00b894" : "#6B7794",
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
        <Card style={{ marginBottom: 14, background: "#1E2B4A11", border: "1px solid #1E2B4A44" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>⚡</span>
            <span style={{ color: "#1E2B4A", fontSize: 13, fontWeight: 600 }}>
              Modo edición rápida — Cambiá las cantidades directo y dale "Guardar todo". Los campos modificados se resaltan en violeta.
            </span>
          </div>
        </Card>
      )}

      {/* Grouped Cards */}
      {grouped.length === 0 ? (
        <Card><p style={{ color: "#9AA2B3", textAlign: "center", padding: 20 }}>No hay productos que coincidan con los filtros.</p></Card>
      ) : grouped.map(group => {
        const key = `${group.brand}-${group.model}`;
        const isCollapsed = collapsed[key];
        const groupStock = group.items.reduce((s, p) => s + (p.stock || 0), 0);
        const groupInStock = group.items.filter(p => p.stock > 0).length;
        const brandColor = BRAND_COLORS[group.brand] || "#1E2B4A";
        const puffsFormatted = Number(group.puffs).toLocaleString("es-AR");

        return (
          <div key={key} style={{ marginBottom: 12 }}>
            {/* Group Header — stack en mobile para no overflowear */}
            <div onClick={() => toggleCollapse(key)} style={{
              background: "#F8F2E7", borderRadius: isCollapsed ? 12 : "12px 12px 0 0",
              padding: isMobile ? "12px 14px" : "14px 18px",
              border: `1px solid ${brandColor}33`, borderBottom: isCollapsed ? `1px solid ${brandColor}33` : "none",
              cursor: "pointer", display: "flex",
              flexDirection: isMobile ? "column" : "row",
              justifyContent: "space-between",
              alignItems: isMobile ? "stretch" : "center",
              gap: isMobile ? 8 : 0,
              transition: "all 0.2s",
              minHeight: isMobile ? 56 : "auto",
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: isMobile ? 8 : 12,
                flexWrap: "wrap", flex: 1, minWidth: 0,
              }}>
                <span style={{ fontSize: isMobile ? 14 : 18, transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.2s", display: "inline-block", flexShrink: 0 }}>▼</span>
                <Badge color={brandColor}>{group.brand}</Badge>
                <span style={{ color: "#1E2B4A", fontWeight: 700, fontSize: isMobile ? 14 : 15 }}>{group.model}</span>
                <span style={{ color: "#6B7794", fontSize: isMobile ? 11 : 13 }}>· {puffsFormatted} puffs</span>
                {!isMobile && (
                  <span style={{ color: "#6B7794", fontSize: 13 }}>· {formatMoney(group.priceUSD, "USD")} / {formatMoney(Math.round(group.priceUSD * exchangeRate))}</span>
                )}
              </div>
              <div style={{
                display: "flex", gap: isMobile ? 8 : 10, alignItems: "center",
                justifyContent: isMobile ? "space-between" : "flex-end",
                flexShrink: 0,
              }}>
                {isMobile && (
                  <span style={{ color: "#6B7794", fontSize: 11 }}>
                    {formatMoney(group.priceUSD, "USD")} · {formatMoney(Math.round(group.priceUSD * exchangeRate))}
                  </span>
                )}
                <div style={{ display: "flex", gap: isMobile ? 6 : 10, alignItems: "center" }}>
                  <span style={{ color: "#6B7794", fontSize: isMobile ? 11 : 12 }}>{groupInStock}/{group.items.length} sabores</span>
                  <Badge color={groupStock > 0 ? "#00b894" : "#E03E3E"}>{groupStock} uds</Badge>
                </div>
              </div>
            </div>

            {/* Flavors List */}
            {!isCollapsed && (
              <div style={{
                background: "#F8F2E7", borderRadius: "0 0 12px 12px", border: `1px solid ${brandColor}22`,
                borderTop: `1px solid ${brandColor}15`, overflow: "hidden"
              }}>
                {group.items.map((p, i) => {
                  const stat = productStats[p.id];
                  const lc = stat ? classifyLifecycle(stat) : null;
                  const margin = calcProductMargin(p);
                  // expiryDays solo si tiene fecha
                  let expiryBadge = null;
                  if (p.expiryDate) {
                    const days = Math.floor((new Date(p.expiryDate) - new Date()) / 86400000);
                    if (days <= 60) {
                      expiryBadge = {
                        days,
                        label: days < 0 ? "Vencido" : `Vence ${days}d`,
                        bg: days < 0 ? T.redBg : days < 30 ? T.amberBg : T.surface2,
                        color: days < 0 ? T.red : days < 30 ? T.amber : T.textMuted,
                      };
                    }
                  }
                  return (
                  <div key={p.id}
                    onClick={() => { if (!quickEdit) openEdit(p); }}
                    style={{
                    display: "flex",
                    flexDirection: isMobile ? "column" : "row",
                    alignItems: isMobile ? "stretch" : "center",
                    justifyContent: "space-between",
                    gap: isMobile ? 8 : 0,
                    padding: isMobile ? "12px 14px" : "10px 18px",
                    borderBottom: i < group.items.length - 1 ? "1px solid #EFE5CE" : "none",
                    opacity: p.stock === 0 ? 0.55 : 1, transition: "opacity 0.2s, background 0.15s",
                    cursor: quickEdit ? "default" : "pointer",
                    minHeight: isMobile ? 48 : "auto",
                  }}
                  onMouseEnter={e => { if (!quickEdit && !isMobile) e.currentTarget.style.background = "#F5F5F2"; }}
                  onMouseLeave={e => { if (!quickEdit && !isMobile) e.currentTarget.style.background = "transparent"; }}>
                    {/* Top row: dot + foto + sabor */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 10,
                      flex: 1, minWidth: 0,
                    }}>
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
                            width: isMobile ? 32 : 28, height: isMobile ? 32 : 28,
                            borderRadius: 4, objectFit: "cover",
                            border: `1px solid ${T.borderSoft}`, cursor: "zoom-in", flexShrink: 0,
                          }}
                        />
                      )}
                      <span style={{
                        color: p.stock > 0 ? "#1E2B4A" : "#9AA2B3",
                        fontSize: isMobile ? 15 : 14,
                        fontWeight: isMobile ? 600 : 400,
                        textDecoration: p.stock === 0 ? "line-through" : "none",
                        flex: 1, minWidth: 0,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{p.flavor}</span>
                      {/* En desktop: badges inline a la derecha del sabor.
                          En mobile: van abajo en su propia row con wrap. */}
                      {!isMobile && (
                        <ProductBadges
                          product={p} stat={stat} margin={margin} lc={lc}
                          expiryBadge={expiryBadge} isMobile={false}
                        />
                      )}
                    </div>
                    {/* Mobile: badges en row separada con wrap */}
                    {isMobile && (
                      <ProductBadges
                        product={p} stat={stat} margin={margin} lc={lc}
                        expiryBadge={expiryBadge} isMobile={true}
                      />
                    )}
                    <div style={{
                      display: "flex", alignItems: "center", gap: isMobile ? 8 : 12,
                      justifyContent: isMobile ? "space-between" : "flex-end",
                      marginTop: isMobile ? 4 : 0,
                    }}>
                      {isMobile && !quickEdit && (
                        <span style={{ fontSize: 11, color: "#6B7794", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Stock</span>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 12 }}>
                        {quickEdit ? (
                          <input type="number" min={0} value={quickStocks[p.id] ?? p.stock ?? 0}
                            onChange={e => setQuickStocks(prev => ({ ...prev, [p.id]: Number(e.target.value) }))}
                            style={{
                              width: isMobile ? 80 : 60,
                              padding: isMobile ? "8px 10px" : "4px 8px",
                              minHeight: isMobile ? 44 : "auto",
                              background: (quickStocks[p.id] ?? p.stock) !== (p.stock || 0) ? "#EAECF9" : "#F8F2E7",
                              border: `1px solid ${(quickStocks[p.id] ?? p.stock) !== (p.stock || 0) ? "#1E2B4A" : "#E5DAC2"}`,
                              borderRadius: 6, color: "#1E2B4A",
                              fontSize: isMobile ? 16 : 14,
                              fontWeight: 700, textAlign: "center",
                            }} />
                        ) : (
                          <span style={{
                            color: p.stock === 0 ? "#444" : p.stock <= 3 ? "#fdcb6e" : "#00b894",
                            fontWeight: 700, fontSize: isMobile ? 17 : 15,
                            minWidth: 30, textAlign: "right",
                          }}>{p.stock}</span>
                        )}
                        {!quickEdit && <>
                          <button onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                            style={{
                              background: "none", border: "none", color: "#6B7794", cursor: "pointer",
                              fontSize: 16, padding: isMobile ? "8px 10px" : "2px 4px",
                              minHeight: isMobile ? 44 : "auto", minWidth: isMobile ? 44 : "auto",
                            }}
                            title="Editar"
                            aria-label={`Editar ${p.flavor}`}>✏️</button>
                          <button onClick={(e) => { e.stopPropagation(); remove(p.id); }}
                            style={{
                              background: "none", border: "none", color: "#6B7794", cursor: "pointer",
                              fontSize: 16, padding: isMobile ? "8px 10px" : "2px 4px",
                              minHeight: isMobile ? 44 : "auto", minWidth: isMobile ? 44 : "auto",
                            }}
                            title="Eliminar"
                            aria-label={`Eliminar ${p.flavor}`}>🗑️</button>
                        </>}
                      </div>
                    </div>
                  </div>
                  );
                })}
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
        {/* Pricing Engine F3 — el costo es EL dato de entrada del motor: de acá
            deriva la lista mayorista completa (decisión #3: costo de REPOSICIÓN,
            cargado en la ficha; Compras es referencia, no fuente). */}
        <Input
          label="Costo proveedor USD (reposición — de acá deriva la lista mayorista)"
          type="number"
          value={form.costUSDT}
          onChange={e => setForm(f => ({ ...f, costUSDT: e.target.value }))}
          placeholder="ej: 8.50"
        />
        {/* Referencia del último lote en Compras + warning de drift (riesgo §9:
            costo desactualizado). No pisa la ficha sola: botón "Usar" explícito. */}
        {editing && (() => {
          const ref = ultimoCostoCompra(editing, purchases);
          if (!ref) return null;
          const drift = driftCostoFicha(form.costUSDT, ref.costo, pricingPolicy?.umbralRecalculoPct ?? 0.03);
          const alerta = drift?.fueraDeUmbral;
          return (
            <div style={{
              marginTop: -6, marginBottom: 12, padding: "8px 12px", borderRadius: 8,
              background: alerta ? `${T.amber}15` : "#FBF7EE",
              border: `1px solid ${alerta ? T.amber + "55" : "#EFE5CE"}`,
              fontSize: 12, color: alerta ? T.amber : "#6B7794",
              display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
            }}>
              <span style={{ flex: 1, minWidth: 180 }}>
                🧾 Último lote en Compras: <strong>${ref.costo}</strong> ({formatDate(ref.fecha)})
                {alerta && <> — difiere <strong>{(drift.pct * 100).toFixed(1)}%</strong> de la ficha: el costo de reposición puede estar viejo</>}
              </span>
              {Number(form.costUSDT) !== ref.costo && (
                <button onClick={() => setForm(f => ({ ...f, costUSDT: ref.costo }))} style={{
                  border: `1px solid ${T.amber}`, background: "transparent", color: T.amber,
                  borderRadius: 6, cursor: "pointer", fontWeight: 700, padding: "4px 10px",
                  fontSize: 11, minHeight: isMobile ? 36 : 24, fontFamily: "inherit", flexShrink: 0,
                }}>Usar</button>
              )}
            </div>
          );
        })()}
        {/* Precio de calle observado: NO participa del cálculo — solo alimenta la
            validación de margen del kiosco de la lista mayorista (RN-15). */}
        <Input
          label="Precio de calle observado ARS (opcional — solo valida la lista, no la calcula)"
          type="number"
          value={form.streetPriceARS || ""}
          onChange={e => setForm(f => ({ ...f, streetPriceARS: e.target.value === "" ? undefined : Number(e.target.value) }))}
          placeholder="ej: 38000 (lo que cobra el kiosco al público)"
        />
        {/* Margen preview en vivo + S16.4 calculadora margin guard */}
        {form.priceUSD > 0 && form.costUSDT > 0 && (() => {
          const margin = calcProductMargin({ priceUSD: Number(form.priceUSD), costUSDT: Number(form.costUSDT) });
          if (!margin) return null;
          const color = margin.marginPct >= 50 ? T.green : margin.marginPct >= 30 ? T.amber : T.red;
          // S16.4 — Margin guard: muestra descuento máximo manteniendo 30% de margen
          const guard30 = calcMarginGuard({ priceUSD: Number(form.priceUSD), costUSDT: Number(form.costUSDT) }, 30);
          const guard20 = calcMarginGuard({ priceUSD: Number(form.priceUSD), costUSDT: Number(form.costUSDT) }, 20);
          return (
            <div style={{
              padding: "8px 12px", marginBottom: 12,
              background: `${color}15`, border: `1px solid ${color}33`, borderRadius: 8,
              fontSize: 12, color, fontWeight: 600,
            }}>
              <div>
                📊 Margen actual: <strong>{margin.marginPct}%</strong> · Ganancia/ud: ${margin.marginUSD} USD
                {margin.roiPct !== null && <> · ROI: <strong>{margin.roiPct}%</strong></>}
              </div>
              {guard30 && guard30.maxDiscountPct > 0 && (
                <div style={{ marginTop: 4, fontSize: 11, opacity: 0.85 }}>
                  💡 Descuento máximo manteniendo 30% margen: <strong>-{guard30.maxDiscountPct.toFixed(1)}%</strong> (precio mínimo ${guard30.minPrice})
                  {guard20 && guard20.maxDiscountPct > guard30.maxDiscountPct && (
                    <> · si bajás a 20% margen: <strong>-{guard20.maxDiscountPct.toFixed(1)}%</strong></>
                  )}
                </div>
              )}
            </div>
          );
        })()}
        <Input label="Stock" type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: Number(e.target.value) }))} />
        <Input label="Fecha de vencimiento (opcional)" type="date" value={form.expiryDate || ""} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))} />

        {/* S16.2 — Pricing por canal (override opcional) */}
        <details style={{ marginBottom: 12 }}>
          <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#1E2B4A", padding: "6px 0" }}>
            🛒 Precios por canal (override opcional, en USD)
          </summary>
          <div style={{ paddingTop: 8, paddingLeft: 12, borderLeft: "2px solid #E5DAC2", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
            {[
              { key: "whatsapp", label: "WhatsApp" },
              { key: "instagram", label: "Instagram" },
              { key: "presencial", label: "Presencial" },
              { key: "delivery", label: "Delivery" },
              { key: "mercadolibre", label: "MercadoLibre" },
            ].map(ch => (
              <div key={ch.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <label style={{ fontSize: 11, color: "#6B7794", flex: 1, fontWeight: 600 }}>{ch.label}</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder={`USD (default: ${form.priceUSD || "—"})`}
                  value={form.priceByChannel?.[ch.key] || ""}
                  onChange={e => {
                    const val = e.target.value;
                    setForm(f => ({
                      ...f,
                      priceByChannel: {
                        ...(f.priceByChannel || {}),
                        [ch.key]: val === "" ? undefined : Number(val),
                      },
                    }));
                  }}
                  style={{
                    width: isMobile ? 110 : 100, padding: isMobile ? "8px 10px" : "6px 8px",
                    borderRadius: 6, minHeight: isMobile ? 44 : "auto",
                    border: "1px solid #E5DAC2",
                    fontSize: isMobile ? 16 : 13, fontFamily: "inherit",
                    textAlign: "right",
                  }}
                />
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: "#6B7794", marginTop: 6, paddingLeft: 12 }}>
            Vacío = usa precio default. Sirve para cargar fee de MercadoLibre o descuento presencial.
          </p>
        </details>
        {/* Pricing Engine F3 (RN-16): el editor de precios mayoristas por tier
            A/B/C se RETIRÓ. El precio mayorista ya no es un dato de entrada:
            lo deriva el motor desde el costo (pantalla 🎛️ Política comercial +
            🏷️ Lista de precios). Los priceByChannel.mayorista_* viejos quedan
            inertes en la data hasta la limpieza de F6. */}
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

      {/* Pricing Engine F3 — costos por modelo: un solo costo por marca+modelo,
          aplicado a todos sus sabores. La vía rápida para mantener el costo de
          reposición al día (y corregir inconsistencias de carga). */}
      <Modal open={costosModal} onClose={cerrarCostosModal} title="💲 Costos por modelo (USD)">
        <p style={{ fontSize: 12, color: "#6B7794", marginTop: 0 }}>
          El costo se aplica a todos los sabores del modelo. De este dato deriva
          la lista mayorista — mantenerlo como costo de REPOSICIÓN (lo que pagarías hoy).
        </p>
        {(() => {
          const inconsistentes = new Set(inconsistenciasCosto.map(i => i.id));
          return modelosCosto.map(m => (
            <div key={m.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "7px 0",
              borderBottom: "1px solid #EFE5CE",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1E2B4A" }}>
                  {m.marca} {m.modelo}
                </div>
                <div style={{ fontSize: 11, color: inconsistentes.has(m.id) ? T.amber : "#9AA2B3" }}>
                  {m.sabores} sabor{m.sabores !== 1 ? "es" : ""}
                  {inconsistentes.has(m.id) && " · ⚠️ costos mezclados — unificar"}
                  {!inconsistentes.has(m.id) && !(m.costo > 0) && " · sin costo: no entra a la lista (RN-18)"}
                </div>
              </div>
              <input
                type="number" step="0.25" min="0"
                placeholder={inconsistentes.has(m.id) ? "mezclados" : "—"}
                value={costosDraft[m.id] ?? ""}
                onChange={e => setCostosDraft(d => ({ ...d, [m.id]: e.target.value }))}
                style={{
                  width: 96, padding: isMobile ? "10px 10px" : "7px 9px", borderRadius: 8,
                  minHeight: isMobile ? 44 : 34, textAlign: "right", boxSizing: "border-box",
                  border: `1px solid ${inconsistentes.has(m.id) ? T.amber : "#E5DAC2"}`,
                  fontSize: isMobile ? 16 : 13, fontFamily: "inherit",
                }}
              />
            </div>
          ));
        })()}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="secondary" onClick={cerrarCostosModal}>{volverA ? "Volver" : "Cancelar"}</Btn>
          <Btn onClick={guardarCostosPorModelo}>{volverA ? "Guardar y volver" : "Guardar costos"}</Btn>
        </div>
      </Modal>

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
          width: "100%", minHeight: 140, padding: 10, borderRadius: 8, boxSizing: "border-box",
          border: `1px solid ${T.borderSoft}`, fontFamily: "monospace", fontSize: 16,
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
