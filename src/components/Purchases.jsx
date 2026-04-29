import { useState, useMemo } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { isDateInClosedMonth } from "../calcs.js";
import { Modal, Card, Btn, Input, Select, Table, Badge, StatCard } from "./UI.jsx";
import { BRAND_COLORS } from "../constants.js";
import { useResponsive } from "../App.jsx";

// -- PURCHASES --
const PURCHASE_STATUSES = [
  { value: "pedido", label: "📋 Pedido", color: "#6c5ce7" },
  { value: "en_camino", label: "🚚 En camino", color: "#fdcb6e" },
  { value: "recibido", label: "📦 Recibido", color: "#00cec9" },
  { value: "verificado", label: "✅ Verificado", color: "#00b894" },
];

const emptyPurchaseForm = () => ({
  supplier: "", loteNumber: "", groups: [],
  supplierCommPercent: "", supplierCommUSDT: "",
  paseroPercent: "", paseroCostARS: "", envioCostARS: "",
  notes: "", date: new Date().toISOString().slice(0, 10), status: "pedido",
  invoiceUrl: "",
  statusHistory: [], // [{ status, timestamp, note }]
});

// Alertar atraso si una compra lleva más de N días en este estado
const STATUS_DELAY_DAYS = { en_camino: 21, recibido: 7 };

// Stepper visual de estados (Pedido → En camino → Recibido → Verificado)
const PurchaseStepper = ({ status }) => {
  const currentIdx = PURCHASE_STATUSES.findIndex(s => s.value === status);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4, marginBottom: 2 }}>
      {PURCHASE_STATUSES.map((s, i) => {
        const isPast = i < currentIdx;
        const isCurrent = i === currentIdx;
        const isFuture = i > currentIdx;
        return (
          <div key={s.value} style={{ display: "flex", alignItems: "center", flex: 1, gap: 4 }}>
            <div style={{
              width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
              background: isPast ? s.color : isCurrent ? s.color : "#E8E7E3",
              border: isCurrent ? `2px solid ${s.color}` : "none",
              boxShadow: isCurrent ? `0 0 0 3px ${s.color}33` : "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 800, color: "#fff",
            }}>{isPast ? "✓" : ""}</div>
            <span style={{
              fontSize: 10, fontWeight: isCurrent ? 700 : 500,
              color: isFuture ? "#B1AFA7" : isCurrent ? s.color : "#37352F",
              whiteSpace: "nowrap",
            }}>{s.label.replace(/^\S+\s/, "")}</span>
            {i < PURCHASE_STATUSES.length - 1 && (
              <div style={{
                flex: 1, height: 2,
                background: isPast ? PURCHASE_STATUSES[i + 1].color : "#E8E7E3",
                margin: "0 2px",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
};

export const Purchases = ({ purchases, setPurchases, products, setProducts, exchangeRate, logStock, currentUser, logAudit, monthlyClosures = [] }) => {
  const { isMobile } = useResponsive();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [verifyModal, setVerifyModal] = useState(null);
  const [costsModal, setCostsModal] = useState(null);
  const [costsForm, setCostsForm] = useState({ supplierCommPercent: "", supplierCommUSDT: "", paseroPercent: "", paseroCostARS: "", envioCostARS: "" });
  const [form, setForm] = useState(emptyPurchaseForm());
  const [verifyNote, setVerifyNote] = useState("");
  const [showSupplierStats, setShowSupplierStats] = useState(false);

  // Get unique models from products
  const modelOptions = useMemo(() => {
    const map = {};
    products.forEach(p => {
      const key = `${p.brand}|||${p.model}|||${p.puffs}`;
      if (!map[key]) map[key] = { brand: p.brand, model: p.model, puffs: p.puffs };
    });
    return Object.values(map).sort((a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model));
  }, [products]);

  const getFlavorsForModel = (brand, model) => {
    return products.filter(p => p.brand === brand && p.model === model).map(p => ({ id: p.id, name: p.flavor })).sort((a, b) => a.name.localeCompare(b.name));
  };

  // Group helpers
  const addGroup = () => setForm(f => ({ ...f, groups: [...f.groups, { brand: "", model: "", puffs: "", modelKey: "", unitCostUSDT: "", flavors: [] }] }));
  const removeGroup = (gi) => setForm(f => ({ ...f, groups: f.groups.filter((_, i) => i !== gi) }));
  const updateGroup = (gi, field, val) => setForm(f => ({
    ...f, groups: f.groups.map((g, i) => {
      if (i !== gi) return g;
      if (field === "modelKey" && val) {
        const [brand, model, puffs] = val.split("|||");
        return { ...g, brand, model, puffs, modelKey: val, flavors: [] };
      }
      return { ...g, [field]: val };
    })
  }));

  const addFlavor = (gi) => setForm(f => ({
    ...f, groups: f.groups.map((g, i) => i === gi ? { ...g, flavors: [...g.flavors, { name: "", qty: 1, productId: null, isNew: false }] } : g)
  }));
  const removeFlavor = (gi, fi) => setForm(f => ({
    ...f, groups: f.groups.map((g, i) => i === gi ? { ...g, flavors: g.flavors.filter((_, j) => j !== fi) } : g)
  }));
  const updateFlavor = (gi, fi, field, val) => setForm(f => ({
    ...f, groups: f.groups.map((g, i) => i !== gi ? g : {
      ...g, flavors: g.flavors.map((fl, j) => {
        if (j !== fi) return fl;
        if (field === "productId") {
          if (val === "__new__") return { ...fl, productId: null, isNew: true, name: "" };
          const prod = products.find(p => p.id === val);
          return { ...fl, productId: val, isNew: false, name: prod ? prod.flavor : "" };
        }
        return { ...fl, [field]: val };
      })
    })
  }));

  // Calculations
  const allItems = form.groups.flatMap(g => g.flavors.map(fl => ({ ...fl, unitCostUSDT: g.unitCostUSDT, brand: g.brand, model: g.model, puffs: g.puffs })));
  const totalItems = allItems.reduce((s, i) => s + (Number(i.qty) || 0), 0);
  const productsUSDT = allItems.reduce((s, i) => s + (Number(i.unitCostUSDT) || 0) * (Number(i.qty) || 0), 0);
  const supplierCommUSDT = form.supplierCommPercent ? Math.round(productsUSDT * (Number(form.supplierCommPercent) / 100) * 100) / 100 : (Number(form.supplierCommUSDT) || 0);
  const totalUSDTwithComm = productsUSDT + supplierCommUSDT;
  const paseroARS = form.paseroPercent ? Math.round(totalUSDTwithComm * exchangeRate * (Number(form.paseroPercent) / 100)) : (Number(form.paseroCostARS) || 0);
  const envioARS = Number(form.envioCostARS) || 0;
  const totalCostARS = Math.round(totalUSDTwithComm * exchangeRate) + paseroARS + envioARS;

  const openNew = () => { setForm(emptyPurchaseForm()); setEditing(null); setModal(true); };
  const openEdit = (p) => {
    // S14.5 — guard mes cerrado
    if (isDateInClosedMonth(monthlyClosures, p.date)) {
      const proceed = confirm(
        `⚠️ Esta compra es de un mes YA CERRADO (${(p.date || "").slice(0, 7)}).\n\n` +
        `Editarla descuadrara el snapshot del cierre. ¿Continuar de todos modos?`
      );
      if (!proceed) return;
    }
    let groups = p.groups || [];
    if (groups.length === 0 && p.items) {
      const gmap = {};
      p.items.forEach(item => {
        const prod = products.find(pr => pr.id === item.productId);
        if (prod) {
          const key = `${prod.brand}|||${prod.model}|||${prod.puffs}`;
          if (!gmap[key]) gmap[key] = { brand: prod.brand, model: prod.model, puffs: prod.puffs, modelKey: key, unitCostUSDT: item.unitCostUSDT || "", flavors: [] };
          gmap[key].flavors.push({ name: prod.flavor, qty: item.qty, productId: item.productId, isNew: false });
        }
      });
      groups = Object.values(gmap);
    }
    setForm({ supplier: p.supplier || "", loteNumber: p.loteNumber || "", groups, paseroPercent: p.paseroPercent || "", paseroCostARS: p.paseroCostARS || "", envioCostARS: p.envioCostARS || "", notes: p.notes || "", date: p.date ? p.date.slice(0, 10) : new Date().toISOString().slice(0, 10), status: p.status || "pedido" });
    setEditing(p.id); setModal(true);
  };

  const save = () => {
    const newProducts = [];
    const finalItems = [];
    form.groups.forEach(g => {
      g.flavors.forEach(fl => {
        if (!fl.name && !fl.productId) return;
        let pid = fl.productId;
        if (fl.isNew && fl.name) {
          pid = uid();
          const ref = products.find(p => p.brand === g.brand && p.model === g.model);
          newProducts.push({ id: pid, brand: g.brand, model: g.model, flavor: fl.name, puffs: g.puffs, priceUSD: ref?.priceUSD || 0, priceARS: Math.round((ref?.priceUSD || 0) * exchangeRate), stock: 0 });
        }
        if (pid) finalItems.push({ productId: pid, qty: Number(fl.qty) || 1, unitCostUSDT: g.unitCostUSDT });
      });
    });
    if (newProducts.length > 0) setProducts(prev => [...prev, ...newProducts]);
    const purchaseData = { ...form, items: finalItems, totalUSDT: productsUSDT, supplierCommUSDT, totalUSDTpaid: totalUSDTwithComm, paseroCostARS: paseroARS, envioCostARS: envioARS, totalCostARS, totalItems, createdBy: currentUser?.name || "" };
    if (editing) {
      setPurchases(prev => prev.map(p => p.id === editing ? { ...purchaseData, id: editing } : p));
      if (logAudit) logAudit("update", "purchase", editing, `Editó compra: ${form.supplier} · ${totalItems} items`);
    } else {
      const newId = uid();
      setPurchases(prev => [{ ...purchaseData, id: newId }, ...prev]);
      if (logAudit) logAudit("create", "purchase", newId, `Creó compra: ${form.supplier} · ${totalItems} items · ${productsUSDT} USDT`);
    }
    setModal(false); setEditing(null); setForm(emptyPurchaseForm());
  };

  const updateStatus = (purchaseId, newStatus, note = "") => {
    setPurchases(prev => prev.map(p => {
      if (p.id !== purchaseId) return p;
      if (newStatus === "verificado" && p.status !== "verificado") {
        (p.items || []).forEach(item => { if (item.productId) { setProducts(pr => pr.map(prod => prod.id === item.productId ? { ...prod, stock: (prod.stock || 0) + Number(item.qty) } : prod)); logStock({ productId: item.productId, type: "compra", qty: Number(item.qty), reason: `Pedido verificado - ${p.supplier || ""}`, refId: p.id }); } });
      }
      const history = [...(p.statusHistory || []), {
        status: newStatus,
        timestamp: new Date().toISOString(),
        note: note || "",
        user: currentUser?.name || "?",
      }];
      return { ...p, status: newStatus, statusHistory: history };
    }));
    setVerifyModal(null);
  };

  const [confirmDelete, setConfirmDelete] = useState(null);

  const deletePurchase = (purchase) => {
    if (confirmDelete !== purchase.id && isDateInClosedMonth(monthlyClosures, purchase.date)) {
      const proceed = confirm(
        `⚠️ Esta compra es de un mes YA CERRADO. Borrarla descuadrara el snapshot del cierre.\n\n¿Borrar de todos modos?`
      );
      if (!proceed) return;
    }
    if (confirmDelete !== purchase.id) { setConfirmDelete(purchase.id); return; }
    if (purchase.status === "verificado") { (purchase.items || []).forEach(item => { setProducts(prev => prev.map(p => p.id === item.productId ? { ...p, stock: Math.max(0, (p.stock || 0) - Number(item.qty)) } : p)); }); }
    setPurchases(prev => prev.map(p => p.id === purchase.id ? { ...p, isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: currentUser?.name || "?" } : p));
    if (logAudit) logAudit("delete", "purchase", purchase.id, `Eliminó compra: ${purchase.supplier || ""} · ${purchase.totalItems || 0} items`);
    setConfirmDelete(null);
  };

  const getStatusBadge = (s) => { const st = PURCHASE_STATUSES.find(x => x.value === s) || PURCHASE_STATUSES[0]; return <Badge color={st.color}>{st.label}</Badge>; };
  const getNextStatus = (s) => { const i = PURCHASE_STATUSES.findIndex(x => x.value === s); return i < PURCHASE_STATUSES.length - 1 ? PURCHASE_STATUSES[i + 1] : null; };

  // Detecta si una compra está atrasada en su estado actual
  const getDelayInfo = (purchase) => {
    if (!purchase || purchase.status === "verificado") return null;
    const limit = STATUS_DELAY_DAYS[purchase.status];
    if (!limit) return null;
    const lastChange = (purchase.statusHistory || []).slice().reverse().find(h => h.status === purchase.status);
    const since = lastChange?.timestamp || purchase.date;
    const days = Math.floor((Date.now() - new Date(since).getTime()) / 86400000);
    return days > limit ? { days, limit } : null;
  };

  // Stats por proveedor: count, USDT total, lead time promedio (pedido→recibido)
  const supplierStats = useMemo(() => {
    const map = {};
    purchases.filter(p => !p.isDeleted).forEach(p => {
      const sup = p.supplier || "Sin proveedor";
      if (!map[sup]) map[sup] = { name: sup, count: 0, totalUSDT: 0, totalARS: 0, leadTimes: [], pending: 0 };
      map[sup].count += 1;
      map[sup].totalUSDT += Number(p.totalUSDT) || 0;
      map[sup].totalARS += Number(p.totalCostARS) || 0;
      if (p.status !== "verificado") map[sup].pending += 1;
      // Lead time: timestamp de pedido → de recibido
      const hist = p.statusHistory || [];
      const orderedAt = hist.find(h => h.status === "pedido")?.timestamp || p.date;
      const receivedAt = hist.find(h => h.status === "recibido")?.timestamp;
      if (orderedAt && receivedAt) {
        const days = (new Date(receivedAt) - new Date(orderedAt)) / 86400000;
        if (days >= 0 && days < 365) map[sup].leadTimes.push(days);
      }
    });
    return Object.values(map)
      .map(s => ({
        ...s,
        avgLeadTime: s.leadTimes.length > 0
          ? Math.round(s.leadTimes.reduce((a, b) => a + b, 0) / s.leadTimes.length)
          : null,
      }))
      .sort((a, b) => b.totalUSDT - a.totalUSDT);
  }, [purchases]);

  // Calcula margen real promedio de una compra verificada
  const calcRealMargin = (purchase) => {
    if (!purchase || !purchase.totalCostARS || !purchase.items?.length) return null;
    const totalUnits = purchase.items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
    if (!totalUnits) return null;
    const costPerUnitARS = Number(purchase.totalCostARS) / totalUnits;
    const expectedRevenueARS = purchase.items.reduce((s, item) => {
      const prod = products.find(p => p.id === item.productId);
      const priceARS = prod ? (prod.priceARS || (prod.priceUSD * exchangeRate) || 0) : 0;
      return s + priceARS * (Number(item.qty) || 0);
    }, 0);
    const profit = expectedRevenueARS - Number(purchase.totalCostARS);
    const marginPct = expectedRevenueARS > 0 ? (profit / expectedRevenueARS) * 100 : 0;
    return { costPerUnitARS, expectedRevenueARS, profit, marginPct };
  };
  const verifyPurchase = purchases.find(p => p.id === verifyModal);

  const openCosts = (purchase) => {
    setCostsForm({ supplierCommPercent: purchase.supplierCommPercent || "", supplierCommUSDT: purchase.supplierCommUSDT || "", paseroPercent: purchase.paseroPercent || "", paseroCostARS: purchase.paseroCostARS || "", envioCostARS: purchase.envioCostARS || "" });
    setCostsModal(purchase.id);
  };

  const saveCosts = () => {
    const purchase = purchases.find(p => p.id === costsModal);
    if (!purchase) return;
    const prodUSDT = purchase.totalUSDT || 0;
    const suppComm = costsForm.supplierCommPercent ? Math.round(prodUSDT * (Number(costsForm.supplierCommPercent) / 100) * 100) / 100 : (Number(costsForm.supplierCommUSDT) || 0);
    const totalPaid = prodUSDT + suppComm;
    const pasero = costsForm.paseroPercent ? Math.round(totalPaid * exchangeRate * (Number(costsForm.paseroPercent) / 100)) : (Number(costsForm.paseroCostARS) || 0);
    const envio = Number(costsForm.envioCostARS) || 0;
    const totalCost = Math.round(totalPaid * exchangeRate) + pasero + envio;
    setPurchases(prev => prev.map(p => p.id === costsModal ? { ...p, supplierCommPercent: costsForm.supplierCommPercent, supplierCommUSDT: suppComm, totalUSDTpaid: totalPaid, paseroPercent: costsForm.paseroPercent, paseroCostARS: pasero, envioCostARS: envio, totalCostARS: totalCost } : p));
    setCostsModal(null);
  };

  const costsPurchase = purchases.find(p => p.id === costsModal);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: "#37352F", margin: 0, fontSize: 22 }}>Compras / Importaciones ({purchases.length})</h2>
        <Btn onClick={openNew}>+ Nuevo Pedido</Btn>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        {PURCHASE_STATUSES.map(s => <StatCard key={s.value} label={s.label} value={purchases.filter(p => !p.isDeleted && p.status === s.value).length} color={s.color} />)}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button onClick={() => setShowSupplierStats(s => !s)} style={{
          padding: "8px 14px", borderRadius: 8, border: "1px solid #E8E7E3",
          background: showSupplierStats ? "#5E6AD215" : "transparent",
          color: showSupplierStats ? "#5E6AD2" : "#37352F",
          fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}>
          {showSupplierStats ? "▼" : "▶"} 📊 Stats por proveedor ({supplierStats.length})
        </button>
      </div>

      {showSupplierStats && supplierStats.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "#37352F" }}>
            🏭 Histórico por proveedor (lead time + volumen)
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {supplierStats.map(s => (
              <div key={s.name} style={{
                padding: 14, background: "#FAFAF9",
                border: "1px solid #E8E7E3", borderRadius: 10,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong style={{ fontSize: 13, color: "#37352F" }}>{s.name}</strong>
                  {s.pending > 0 && (
                    <span style={{
                      fontSize: 10, padding: "2px 6px", borderRadius: 4,
                      background: "#FEF6E4", color: "#A65800", fontWeight: 700,
                    }}>{s.pending} pend.</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#8C8A82", marginBottom: 4 }}>
                  {s.count} pedido{s.count !== 1 ? "s" : ""} · {formatMoney(s.totalUSDT, "USDT")}
                </div>
                <div style={{ fontSize: 11, color: "#8C8A82", marginBottom: 8 }}>
                  Total ARS: {formatMoney(s.totalARS)}
                </div>
                <div style={{
                  padding: "6px 10px",
                  background: s.avgLeadTime !== null ? "#E8F5E9" : "#F0EFEB",
                  borderRadius: 6, fontSize: 11, fontWeight: 600,
                  color: s.avgLeadTime !== null ? "#0F7B6C" : "#8C8A82",
                  textAlign: "center",
                }}>
                  ⏱️ Lead time: {s.avgLeadTime !== null ? `${s.avgLeadTime} días promedio` : "Sin datos"}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        {isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {purchases.filter(p => !p.isDeleted).length === 0 ? (
              <p style={{ color: "#B1AFA7", fontSize: 13, textAlign: "center", padding: "24px 0", margin: 0 }}>No hay pedidos registrados</p>
            ) : (
              purchases.filter(p => !p.isDeleted).map(r => {
                const next = getNextStatus(r.status);
                const hasCosts = r.paseroCostARS && r.envioCostARS;
                const totalUnits = r.totalItems || (r.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
                const costLabel = hasCosts ? formatMoney(r.totalCostARS) : "Costos incompletos";
                return (
                  <div key={r.id} onClick={() => openEdit(r)} style={{
                    background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 12,
                    padding: 14, cursor: "pointer", display: "flex", flexDirection: "column", gap: 8,
                  }}>
                    {/* Row 1: supplier + status */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#37352F", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.supplier || "Sin proveedor"}
                        {r.loteNumber && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: "#8C8A82" }}>· {r.loteNumber}</span>}
                      </div>
                      {getStatusBadge(r.status)}
                    </div>
                    {/* Status stepper visual */}
                    <PurchaseStepper status={r.status} />
                    {/* Delay alert */}
                    {(() => {
                      const delay = getDelayInfo(r);
                      if (!delay) return null;
                      return (
                        <div style={{
                          padding: "6px 10px", background: "#FEF6E4", border: "1px solid #F59E0B55",
                          borderRadius: 6, fontSize: 11, color: "#A65800", fontWeight: 600,
                          display: "flex", alignItems: "center", gap: 6,
                        }}>
                          ⚠️ Atrasado: {delay.days} días en "{r.status.replace("_", " ")}" (límite {delay.limit}d)
                        </div>
                      );
                    })()}
                    {/* Invoice thumbnail */}
                    {r.invoiceUrl && (
                      <a href={r.invoiceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "#5E6AD2", textDecoration: "none" }}
                      >
                        🧾 Ver invoice
                      </a>
                    )}
                    {/* Row 2: fecha + unidades + costo */}
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, color: "#8C8A82" }}>
                      <span>{formatDate(r.date)}</span>
                      <span><strong style={{ color: "#37352F" }}>{totalUnits}</strong> uds</span>
                      <span style={{ color: hasCosts ? "#0F7B6C" : "#CB912F", fontWeight: 700 }}>{costLabel}</span>
                    </div>
                    {/* Row 3: USDT breakdown (compacto) */}
                    <div style={{ fontSize: 11, color: "#B1AFA7", display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <span>Vapes: {formatMoney(r.totalUSDT, "USDT")}</span>
                      {r.supplierCommUSDT > 0 && <span>Com: {formatMoney(r.supplierCommUSDT, "USDT")}</span>}
                      <span>Pasero: {r.paseroCostARS ? formatMoney(r.paseroCostARS) : "—"}</span>
                      <span>Envío: {r.envioCostARS ? formatMoney(r.envioCostARS) : "—"}</span>
                    </div>
                    {/* Row 4: acciones */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                      {!hasCosts && <button onClick={e => { e.stopPropagation(); openCosts(r); }} style={{ flex: 1, minWidth: 100, minHeight: 36, background: "#FDECC8", border: "1px solid #CB912F55", color: "#CB912F", padding: "7px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>$ Costos</button>}
                      {next && <button onClick={e => { e.stopPropagation(); next.value === "verificado" ? setVerifyModal(r.id) : updateStatus(r.id, next.value); }} style={{ flex: 1, minWidth: 100, minHeight: 36, background: `${next.color}22`, border: `1px solid ${next.color}55`, color: next.color, padding: "7px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>{next.value === "verificado" ? "Verificar" : "Avanzar"}</button>}
                      {confirmDelete === r.id
                        ? <button onClick={e => { e.stopPropagation(); deletePurchase(r); }} style={{ minHeight: 36, background: "#F7D7D6", border: "1px solid #E03E3E55", color: "#E03E3E", padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>Confirmar</button>
                        : <button onClick={e => { e.stopPropagation(); deletePurchase(r); }} style={{ minHeight: 36, background: "none", border: "1px solid #F7D7D6", color: "#E03E3E", padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>🗑️</button>
                      }
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
        <Table columns={[
          { key: "date", label: "Fecha", render: r => formatDate(r.date) },
          { key: "supplier", label: "Proveedor", render: r => (
            <div>
              <div>{r.supplier || "—"}</div>
              {r.loteNumber && <div style={{ fontSize: 10, color: "#8C8A82" }}>{r.loteNumber}</div>}
            </div>
          )},
          { key: "items", label: "Uds", render: r => <Badge color="#5E6AD2">{r.totalItems || (r.items||[]).reduce((s,i) => s + (Number(i.qty)||0), 0)}</Badge> },
          { key: "status", label: "Estado", render: r => getStatusBadge(r.status) },
          { key: "totalUSDT", label: "Vapes", render: r => formatMoney(r.totalUSDT, "USDT") },
          { key: "supplierComm", label: "Com. prov.", render: r => r.supplierCommUSDT ? formatMoney(r.supplierCommUSDT, "USDT") : "—" },
          { key: "totalPaid", label: "USDT total", render: r => formatMoney(r.totalUSDTpaid || r.totalUSDT, "USDT") },
          { key: "pasero", label: "Pasero", render: r => r.paseroCostARS ? formatMoney(r.paseroCostARS) : <span style={{ color: "#fdcb6e55", fontSize: 11 }}>pendiente</span> },
          { key: "envio", label: "Envío", render: r => r.envioCostARS ? formatMoney(r.envioCostARS) : <span style={{ color: "#fdcb6e55", fontSize: 11 }}>pendiente</span> },
          { key: "costoTotal", label: "Costo total", render: r => {
            const hasCosts = r.paseroCostARS && r.envioCostARS;
            return hasCosts ? formatMoney(r.totalCostARS) : <span style={{ color: "#8C8A82", fontSize: 11 }}>incompleto</span>;
          }},
          { key: "actions", label: "", render: r => {
            const next = getNextStatus(r.status);
            const hasCosts = r.paseroCostARS && r.envioCostARS;
            return (<div style={{ display: "flex", gap: 4 }}>
              {!hasCosts && <button onClick={e => { e.stopPropagation(); openCosts(r); }} style={{ background: "#fdcb6e22", border: "1px solid #fdcb6e55", color: "#fdcb6e", padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>$ Costos</button>}
              {next && <button onClick={e => { e.stopPropagation(); next.value === "verificado" ? setVerifyModal(r.id) : updateStatus(r.id, next.value); }} style={{ background: `${next.color}22`, border: `1px solid ${next.color}55`, color: next.color, padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>{next.value === "verificado" ? "Verificar" : "Avanzar"}</button>}
              <button onClick={e => { e.stopPropagation(); openEdit(r); }} style={{ background: "none", border: "none", color: "#5E6AD2", cursor: "pointer", fontSize: 14 }}>✏️</button>
              {confirmDelete === r.id
                ? <button onClick={e => { e.stopPropagation(); deletePurchase(r); }} style={{ background: "#F7D7D6", border: "1px solid #E03E3E55", color: "#E03E3E", padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Confirmar</button>
                : <button onClick={e => { e.stopPropagation(); deletePurchase(r); }} style={{ background: "none", border: "none", color: "#E03E3E", cursor: "pointer", fontSize: 14 }}>👑️</button>
              }
            </div>);
          }},
        ]} data={purchases.filter(p => !p.isDeleted)} emptyMsg="No hay pedidos registrados" />
        )}
      </Card>

      {/* New/Edit Modal */}
      <Modal open={modal} onClose={() => { setModal(false); setEditing(null); }} title={editing ? "Editar Pedido" : "Nuevo Pedido"}>
        <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
          <div style={{ flex: 1 }}>
            <Input label="Fecha" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div style={{ flex: 1 }}>
            <Input label="Proveedor" placeholder="Nombre..." value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
          <div style={{ flex: 1 }}>
            <Input label="N° de lote (opcional)" placeholder="ej: LOTE-042 / Paraguay-abr26" value={form.loteNumber} onChange={e => setForm(f => ({ ...f, loteNumber: e.target.value }))} />
          </div>
        </div>

        {/* Product Groups */}
        {form.groups.map((group, gi) => {
          const availFlavors = group.brand ? getFlavorsForModel(group.brand, group.model) : [];
          const bc = BRAND_COLORS[group.brand] || "#5E6AD2";
          return (
            <div key={gi} style={{ background: "#FAFAF9", border: `1px solid ${bc}33`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ color: bc, fontSize: 13, fontWeight: 700 }}>{group.brand ? `${group.brand} ${group.model}` : "Seleccioná modelo"}</span>
                <button onClick={() => removeGroup(gi)} style={{ background: "none", border: "none", color: "#E03E3E", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>
              <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 2 }}>
                  <Select label="Marca / Modelo" options={modelOptions.map(m => ({ value: `${m.brand}|||${m.model}|||${m.puffs}`, label: `${m.brand} ${m.model} (${Number(m.puffs).toLocaleString()}p)` }))} value={group.modelKey || ""} onChange={e => updateGroup(gi, "modelKey", e.target.value)} />
                </div>
                <div style={{ flex: 0.8 }}>
                  <Input label="USDT/unidad" type="number" placeholder="ej: 7" value={group.unitCostUSDT} onChange={e => updateGroup(gi, "unitCostUSDT", e.target.value)} />
                </div>
              </div>
              {group.brand && (<>
                <label style={{ display: "block", fontSize: 11, color: "#8C8A82", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>Sabores</label>
                {group.flavors.map((fl, fi) => (
                  <div key={fi} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "flex-end" }}>
                    <div style={{ flex: 2 }}>
                      {fl.isNew ? <Input placeholder="Sabor nuevo..." value={fl.name} onChange={e => updateFlavor(gi, fi, "name", e.target.value)} />
                      : <Select options={[...availFlavors.map(f => ({ value: f.id, label: f.name })), { value: "__new__", label: "➕ Sabor nuevo..." }]} value={fl.productId || ""} onChange={e => updateFlavor(gi, fi, "productId", e.target.value)} />}
                    </div>
                    <div style={{ flex: 0.4 }}><Input type="number" placeholder="Cant" value={fl.qty} min={1} onChange={e => updateFlavor(gi, fi, "qty", Number(e.target.value))} /></div>
                    <button onClick={() => removeFlavor(gi, fi)} style={{ background: "none", border: "none", color: "#E03E3E", cursor: "pointer", fontSize: 16, marginBottom: 14 }}>✕</button>
                  </div>
                ))}
                <button onClick={() => addFlavor(gi)} style={{ background: "none", border: `1px dashed ${bc}44`, color: bc, padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 11, width: "100%" }}>+ Agregar sabor</button>
                {group.flavors.length > 0 && <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #F0EFEB", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#8C8A82", fontSize: 12 }}>{group.flavors.reduce((s, f) => s + (Number(f.qty) || 0), 0)} uds</span>
                  <span style={{ color: "#555247", fontSize: 12, fontWeight: 600 }}>{formatMoney(group.flavors.reduce((s, f) => s + (Number(f.qty) || 0), 0) * (Number(group.unitCostUSDT) || 0), "USDT")}</span>
                </div>}
              </>)}
            </div>
          );
        })}
        <button onClick={addGroup} style={{ background: "#FFFFFF", border: "2px dashed #E8E7E3", color: "#5E6AD2", padding: "12px", borderRadius: 12, cursor: "pointer", fontSize: 13, fontWeight: 600, width: "100%", marginBottom: 14 }}>+ Agregar marca/modelo al pedido</button>

        {/* Costs */}
        <div style={{ background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 12, color: "#E03E3E", marginBottom: 10, fontWeight: 700, textTransform: "uppercase" }}>💰 Costos extra</label>

          <label style={{ display: "block", fontSize: 11, color: "#8C8A82", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>Comisión proveedor (USDT)</label>
          <div style={{ display: "flex", gap: 10, marginBottom: 4, flexDirection: isMobile ? "column" : "row" }}>
            <div style={{ flex: 1 }}>
              <Input label="% del total" type="number" placeholder="ej: 1" value={form.supplierCommPercent} onChange={e => setForm(f => ({ ...f, supplierCommPercent: e.target.value, supplierCommUSDT: "" }))} />
            </div>
            <div style={{ flex: 1 }}>
              <Input label="O monto fijo (USDT)" type="number" placeholder="ej: 6" value={form.supplierCommPercent ? "" : form.supplierCommUSDT} onChange={e => setForm(f => ({ ...f, supplierCommUSDT: e.target.value, supplierCommPercent: "" }))} />
            </div>
          </div>
          {supplierCommUSDT > 0 && <div style={{ color: "#26de81", fontSize: 12, marginBottom: 10 }}>
            Comisión: {formatMoney(supplierCommUSDT, "USDT")} · Total a transferir: {formatMoney(totalUSDTwithComm, "USDT")}
            {form.supplierCommPercent ? ` (${form.supplierCommPercent}% de ${formatMoney(productsUSDT, "USDT")})` : ""}
          </div>}

          <div style={{ borderTop: "1px solid #F0EFEB", paddingTop: 10, marginTop: 6 }}>
            <label style={{ display: "block", fontSize: 11, color: "#8C8A82", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>Pasero + Envío (Pesos)</label>
            <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
              <div style={{ flex: 1 }}>
                <Input label="Pasero (%)" type="number" placeholder="ej: 5" value={form.paseroPercent} onChange={e => setForm(f => ({ ...f, paseroPercent: e.target.value, paseroCostARS: "" }))} />
              </div>
              <div style={{ flex: 1 }}>
                <Input label="O monto fijo ($)" type="number" value={form.paseroPercent ? "" : form.paseroCostARS} onChange={e => setForm(f => ({ ...f, paseroCostARS: e.target.value, paseroPercent: "" }))} />
              </div>
            </div>
            {paseroARS > 0 && <div style={{ color: "#fdcb6e", fontSize: 12, marginBottom: 8 }}>Pasero: {formatMoney(paseroARS)}</div>}
            <Input label="Envío Vía Cargo ($)" type="number" placeholder="ej: 15000" value={form.envioCostARS} onChange={e => setForm(f => ({ ...f, envioCostARS: e.target.value }))} />
          </div>
        </div>

        {/* Total */}
        {totalItems > 0 && <div style={{ background: "#FAFAF9", borderRadius: 10, padding: 14, marginBottom: 14, border: "1px solid #E8E7E3" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: "#8C8A82", fontSize: 13 }}>Vapes ({totalItems} uds)</span>
            <span style={{ color: "#555247" }}>{formatMoney(productsUSDT, "USDT")}</span>
          </div>
          {supplierCommUSDT > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: "#8C8A82", fontSize: 13 }}>Comisión proveedor</span>
            <span style={{ color: "#26de81" }}>{formatMoney(supplierCommUSDT, "USDT")}</span>
          </div>}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, paddingTop: supplierCommUSDT > 0 ? 4 : 0, borderTop: supplierCommUSDT > 0 ? "1px solid #F0EFEB" : "none" }}>
            <span style={{ color: "#8C8A82", fontSize: 13, fontWeight: supplierCommUSDT > 0 ? 600 : 400 }}>Total USDT transferido</span>
            <span style={{ color: "#555247", fontWeight: 600 }}>{formatMoney(totalUSDTwithComm, "USDT")} · ~{formatMoney(Math.round(totalUSDTwithComm * exchangeRate))}</span>
          </div>
          {paseroARS > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ color: "#8C8A82", fontSize: 13 }}>Pasero</span><span style={{ color: "#fdcb6e" }}>{formatMoney(paseroARS)}</span></div>}
          {envioARS > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ color: "#8C8A82", fontSize: 13 }}>Envío</span><span style={{ color: "#fdcb6e" }}>{formatMoney(envioARS)}</span></div>}
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #E8E7E3", paddingTop: 8, marginTop: 4 }}>
            <span style={{ color: "#37352F", fontSize: 15, fontWeight: 700 }}>Costo total</span>
            <span style={{ color: "#E03E3E", fontSize: 18, fontWeight: 800 }}>{formatMoney(totalCostARS)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ color: "#8C8A82", fontSize: 12 }}>Costo por unidad</span>
            <span style={{ color: "#8C8A82", fontSize: 13 }}>{formatMoney(Math.round(totalCostARS / totalItems))} / ud</span>
          </div>
        </div>}

        <Input
          label="URL invoice / captura del pedido (opcional)"
          value={form.invoiceUrl || ""}
          onChange={e => setForm(f => ({ ...f, invoiceUrl: e.target.value }))}
          placeholder="https://..."
        />
        <Input label="Notas" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Opcional..." />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => { setModal(false); setEditing(null); }}>Cancelar</Btn>
          <Btn onClick={save}>{editing ? "Guardar" : "Registrar Pedido"}</Btn>
        </div>
      </Modal>

      {/* Verify Modal */}
      <Modal open={!!verifyModal} onClose={() => setVerifyModal(null)} title="✅ Verificar Pedido">
        {verifyPurchase && (<div>
          <div style={{ color: "#8C8A82", fontSize: 13, marginBottom: 16 }}>Pedido de <strong style={{ color: "#37352F" }}>{verifyPurchase.supplier}</strong> del {formatDate(verifyPurchase.date)}</div>
          <div style={{ background: "#FAFAF9", borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, color: "#00b894", marginBottom: 10, fontWeight: 700, textTransform: "uppercase" }}>Verificá que recibiste:</label>
            {(verifyPurchase.items || []).map((item, i) => {
              const prod = products.find(p => p.id === item.productId);
              return (<div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F0EFEB" }}>
                <span style={{ color: "#555247", fontSize: 14 }}>{prod ? `${prod.brand} ${prod.model} - ${prod.flavor}` : "?"}</span>
                <Badge color="#00b894">x{item.qty}</Badge>
              </div>);
            })}
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10 }}>
              <span style={{ color: "#37352F", fontWeight: 700 }}>Total</span>
              <span style={{ color: "#00b894", fontWeight: 700 }}>{(verifyPurchase.items||[]).reduce((s,i) => s + Number(i.qty), 0)} uds</span>
            </div>
          </div>
          <div style={{ background: "#00b89415", border: "1px solid #00b89433", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
            <span style={{ color: "#00b894", fontSize: 13 }}>⚠️ Al confirmar, se suma todo al stock.</span>
          </div>
          {(() => {
            const margin = calcRealMargin(verifyPurchase);
            if (!margin) return null;
            const positive = margin.profit > 0;
            return (
              <div style={{
                background: positive ? "#E8F5E9" : "#FEE9E7",
                border: `1px solid ${positive ? "#22C55E55" : "#EF444455"}`,
                borderRadius: 10, padding: 14, marginBottom: 14,
              }}>
                <div style={{
                  fontSize: 12, fontWeight: 700, color: positive ? "#0F7B6C" : "#E03E3E",
                  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8,
                }}>📊 Margen real proyectado</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                  <div>
                    <div style={{ color: "#8C8A82" }}>Costo / unidad</div>
                    <div style={{ fontWeight: 700, color: "#37352F" }}>{formatMoney(margin.costPerUnitARS)}</div>
                  </div>
                  <div>
                    <div style={{ color: "#8C8A82" }}>Revenue esperado</div>
                    <div style={{ fontWeight: 700, color: "#37352F" }}>{formatMoney(margin.expectedRevenueARS)}</div>
                  </div>
                  <div>
                    <div style={{ color: "#8C8A82" }}>Ganancia bruta</div>
                    <div style={{ fontWeight: 700, color: positive ? "#0F7B6C" : "#E03E3E" }}>{formatMoney(margin.profit)}</div>
                  </div>
                  <div>
                    <div style={{ color: "#8C8A82" }}>Margen</div>
                    <div style={{ fontWeight: 700, color: positive ? "#0F7B6C" : "#E03E3E" }}>
                      {margin.marginPct.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
          <Input
            label="Nota interna (opcional, queda en historial)"
            value={verifyNote}
            onChange={e => setVerifyNote(e.target.value)}
            placeholder="ej: Faltaron 2 unidades del modelo X..."
          />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => { setVerifyModal(null); setVerifyNote(""); }}>Cancelar</Btn>
            <Btn variant="success" onClick={() => { updateStatus(verifyPurchase.id, "verificado", verifyNote); setVerifyNote(""); }}>✅ Verificar</Btn>
          </div>
        </div>)}
      </Modal>

      {/* Quick Costs Modal */}
      <Modal open={!!costsModal} onClose={() => setCostsModal(null)} title="💰 Cargar Costos del Pedido">
        {costsPurchase && (<div>
          <div style={{ color: "#8888aa", fontSize: 13, marginBottom: 12 }}>
            Pedido de <strong style={{ color: "#e0e0ff" }}>{costsPurchase.supplier}</strong> del {formatDate(costsPurchase.date)} · {formatMoney(costsPurchase.totalUSDT, "USDT")} en vapes
          </div>

          <label style={{ display: "block", fontSize: 11, color: "#26de81", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>Comisión proveedor (USDT)</label>
          <div style={{ display: "flex", gap: 12 }}>
            <Input label="% del total" type="number" placeholder="ej: 1" value={costsForm.supplierCommPercent} onChange={e => setCostsForm(f => ({ ...f, supplierCommPercent: e.target.value, supplierCommUSDT: "" }))} />
            <Input label="O monto fijo (USDT)" type="number" placeholder="ej: 6" value={costsForm.supplierCommPercent ? "" : costsForm.supplierCommUSDT} onChange={e => setCostsForm(f => ({ ...f, supplierCommUSDT: e.target.value, supplierCommPercent: "" }))} />
          </div>
          {(costsForm.supplierCommPercent || costsForm.supplierCommUSDT) ? (
            <div style={{ color: "#26de81", fontSize: 12, marginBottom: 10 }}>
              Comisión: {formatMoney(costsForm.supplierCommPercent ? Math.round((costsPurchase.totalUSDT || 0) * (Number(costsForm.supplierCommPercent) / 100) * 100) / 100 : Number(costsForm.supplierCommUSDT), "USDT")}
              {costsForm.supplierCommPercent ? ` (${costsForm.supplierCommPercent}% de ${formatMoney(costsPurchase.totalUSDT, "USDT")})` : ""}
              {" · Total transferido: "}{formatMoney((costsPurchase.totalUSDT || 0) + (costsForm.supplierCommPercent ? Math.round((costsPurchase.totalUSDT || 0) * (Number(costsForm.supplierCommPercent) / 100) * 100) / 100 : Number(costsForm.supplierCommUSDT) || 0), "USDT")}
            </div>
          ) : null}

          <div style={{ borderTop: "1px solid #2a2a4a", paddingTop: 10, marginTop: 6 }}>
            <label style={{ display: "block", fontSize: 11, color: "#fdcb6e", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>Pasero + Envío (Pesos)</label>
            <div style={{ display: "flex", gap: 12 }}>
              <Input label="Pasero (%)" type="number" placeholder="ej: 5" value={costsForm.paseroPercent} onChange={e => setCostsForm(f => ({ ...f, paseroPercent: e.target.value, paseroCostARS: "" }))} />
              <Input label="O monto fijo ($)" type="number" placeholder="ej: 50000" value={costsForm.paseroPercent ? "" : costsForm.paseroCostARS} onChange={e => setCostsForm(f => ({ ...f, paseroCostARS: e.target.value, paseroPercent: "" }))} />
            </div>
            {(costsForm.paseroPercent || costsForm.paseroCostARS) ? (
              <div style={{ color: "#fdcb6e", fontSize: 12, marginBottom: 8 }}>
                Pasero: {formatMoney(costsForm.paseroPercent ? Math.round(((costsPurchase.totalUSDT || 0) + (costsForm.supplierCommPercent ? (costsPurchase.totalUSDT || 0) * Number(costsForm.supplierCommPercent) / 100 : Number(costsForm.supplierCommUSDT) || 0)) * exchangeRate * (Number(costsForm.paseroPercent) / 100)) : Number(costsForm.paseroCostARS))}
              </div>
            ) : null}
            <Input label="Envío Vía Cargo ($)" type="number" placeholder="ej: 15000" value={costsForm.envioCostARS} onChange={e => setCostsForm(f => ({ ...f, envioCostARS: e.target.value }))} />
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
            <Btn variant="secondary" onClick={() => setCostsModal(null)}>Cancelar</Btn>
            <Btn onClick={saveCosts}>Guardar Costos</Btn>
          </div>
        </div>)}
      </Modal>
    </div>
  );
};
