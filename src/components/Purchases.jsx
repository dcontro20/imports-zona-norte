import { useState, useMemo } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { Modal, Card, Btn, Input, Select, Table, Badge, StatCard } from "./UI.jsx";
import { BRAND_COLORS } from "../constants.js";

// -- PURCHASES --
const PURCHASE_STATUSES = [
  { value: "pedido", label: "📋 Pedido", color: "#6c5ce7" },
  { value: "en_camino", label: "🚚 En camino", color: "#fdcb6e" },
  { value: "recibido", label: "📦 Recibido", color: "#00cec9" },
  { value: "verificado", label: "✅ Verificado", color: "#00b894" },
];

const emptyPurchaseForm = () => ({
  supplier: "", groups: [],
  supplierCommPercent: "", supplierCommUSDT: "",
  paseroPercent: "", paseroCostARS: "", envioCostARS: "",
  notes: "", date: new Date().toISOString().slice(0, 10), status: "pedido"
});

export const Purchases = ({ purchases, setPurchases, products, setProducts, exchangeRate, logStock, currentUser }) => {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [verifyModal, setVerifyModal] = useState(null);
  const [costsModal, setCostsModal] = useState(null);
  const [costsForm, setCostsForm] = useState({ supplierCommPercent: "", supplierCommUSDT: "", paseroPercent: "", paseroCostARS: "", envioCostARS: "" });
  const [form, setForm] = useState(emptyPurchaseForm());

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
    setForm({ supplier: p.supplier || "", groups, paseroPercent: p.paseroPercent || "", paseroCostARS: p.paseroCostARS || "", envioCostARS: p.envioCostARS || "", notes: p.notes || "", date: p.date ? p.date.slice(0, 10) : new Date().toISOString().slice(0, 10), status: p.status || "pedido" });
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
    if (editing) { setPurchases(prev => prev.map(p => p.id === editing ? { ...purchaseData, id: editing } : p)); }
    else { setPurchases(prev => [{ ...purchaseData, id: uid() }, ...prev]); }
    setModal(false); setEditing(null); setForm(emptyPurchaseForm());
  };

  const updateStatus = (purchaseId, newStatus) => {
    setPurchases(prev => prev.map(p => {
      if (p.id !== purchaseId) return p;
      if (newStatus === "verificado" && p.status !== "verificado") {
        (p.items || []).forEach(item => { if (item.productId) { setProducts(pr => pr.map(prod => prod.id === item.productId ? { ...prod, stock: (prod.stock || 0) + Number(item.qty) } : prod)); logStock({ productId: item.productId, type: "compra", qty: Number(item.qty), reason: `Pedido verificado - ${p.supplier || ""}`, refId: p.id }); } });
      }
      return { ...p, status: newStatus };
    }));
    setVerifyModal(null);
  };

  const [confirmDelete, setConfirmDelete] = useState(null);

  const deletePurchase = (purchase) => {
    if (confirmDelete !== purchase.id) { setConfirmDelete(purchase.id); return; }
    if (purchase.status === "verificado") { (purchase.items || []).forEach(item => { setProducts(prev => prev.map(p => p.id === item.productId ? { ...p, stock: Math.max(0, (p.stock || 0) - Number(item.qty)) } : p)); }); }
    setPurchases(prev => prev.filter(p => p.id !== purchase.id));
    setConfirmDelete(null);
  };

  const getStatusBadge = (s) => { const st = PURCHASE_STATUSES.find(x => x.value === s) || PURCHASE_STATUSES[0]; return <Badge color={st.color}>{st.label}</Badge>; };
  const getNextStatus = (s) => { const i = PURCHASE_STATUSES.findIndex(x => x.value === s); return i < PURCHASE_STATUSES.length - 1 ? PURCHASE_STATUSES[i + 1] : null; };
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
        <h2 style={{ color: "#e0e0ff", margin: 0, fontSize: 22 }}>Compras / Importaciones ({purchases.length})</h2>
        <Btn onClick={openNew}>+ Nuevo Pedido</Btn>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        {PURCHASE_STATUSES.map(s => <StatCard key={s.value} label={s.label} value={purchases.filter(p => p.status === s.value).length} color={s.color} />)}
      </div>

      <Card>
        <Table columns={[
          { key: "date", label: "Fecha", render: r => formatDate(r.date) },
          { key: "supplier", label: "Proveedor" },
          { key: "items", label: "Uds", render: r => <Badge color="#a855f7">{r.totalItems || (r.items||[]).reduce((s,i) => s + (Number(i.qty)||0), 0)}</Badge> },
          { key: "status", label: "Estado", render: r => getStatusBadge(r.status) },
          { key: "totalUSDT", label: "Vapes", render: r => formatMoney(r.totalUSDT, "USDT") },
          { key: "supplierComm", label: "Com. prov.", render: r => r.supplierCommUSDT ? formatMoney(r.supplierCommUSDT, "USDT") : "—" },
          { key: "totalPaid", label: "USDT total", render: r => formatMoney(r.totalUSDTpaid || r.totalUSDT, "USDT") },
          { key: "pasero", label: "Pasero", render: r => r.paseroCostARS ? formatMoney(r.paseroCostARS) : <span style={{ color: "#fdcb6e55", fontSize: 11 }}>pendiente</span> },
          { key: "envio", label: "Envío", render: r => r.envioCostARS ? formatMoney(r.envioCostARS) : <span style={{ color: "#fdcb6e55", fontSize: 11 }}>pendiente</span> },
          { key: "costoTotal", label: "Costo total", render: r => {
            const hasCosts = r.paseroCostARS && r.envioCostARS;
            return hasCosts ? formatMoney(r.totalCostARS) : <span style={{ color: "#6666aa", fontSize: 11 }}>incompleto</span>;
          }},
          { key: "actions", label: "", render: r => {
            const next = getNextStatus(r.status);
            const hasCosts = r.paseroCostARS && r.envioCostARS;
            return (<div style={{ display: "flex", gap: 4 }}>
              {!hasCosts && <button onClick={e => { e.stopPropagation(); openCosts(r); }} style={{ background: "#fdcb6e22", border: "1px solid #fdcb6e55", color: "#fdcb6e", padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>$ Costos</button>}
              {next && <button onClick={e => { e.stopPropagation(); next.value === "verificado" ? setVerifyModal(r.id) : updateStatus(r.id, next.value); }} style={{ background: `${next.color}22`, border: `1px solid ${next.color}55`, color: next.color, padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>{next.value === "verificado" ? "Verificar" : "Avanzar"}</button>}
              <button onClick={e => { e.stopPropagation(); openEdit(r); }} style={{ background: "none", border: "none", color: "#a855f7", cursor: "pointer", fontSize: 14 }}>✏️</button>
              {confirmDelete === r.id
                ? <button onClick={e => { e.stopPropagation(); deletePurchase(r); }} style={{ background: "#e74c3c22", border: "1px solid #e74c3c55", color: "#e74c3c", padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Confirmar</button>
                : <button onClick={e => { e.stopPropagation(); deletePurchase(r); }} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 14 }}>🗑️</button>
              }
            </div>);
          }},
        ]} data={purchases} emptyMsg="No hay pedidos registrados" />
      </Card>

      {/* New/Edit Modal */}
      <Modal open={modal} onClose={() => { setModal(false); setEditing(null); }} title={editing ? "Editar Pedido" : "Nuevo Pedido"}>
        <div style={{ display: "flex", gap: 12 }}>
          <Input label="Fecha" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          <Input label="Proveedor" placeholder="Nombre..." value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} />
        </div>

        {/* Product Groups */}
        {form.groups.map((group, gi) => {
          const availFlavors = group.brand ? getFlavorsForModel(group.brand, group.model) : [];
          const bc = BRAND_COLORS[group.brand] || "#a855f7";
          return (
            <div key={gi} style={{ background: "#12122a", border: `1px solid ${bc}33`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ color: bc, fontSize: 13, fontWeight: 700 }}>{group.brand ? `${group.brand} ${group.model}` : "Seleccioná modelo"}</span>
                <button onClick={() => removeGroup(gi)} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 16 }}>✕</button>
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
                <label style={{ display: "block", fontSize: 11, color: "#6666aa", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>Sabores</label>
                {group.flavors.map((fl, fi) => (
                  <div key={fi} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "flex-end" }}>
                    <div style={{ flex: 2 }}>
                      {fl.isNew ? <Input placeholder="Sabor nuevo..." value={fl.name} onChange={e => updateFlavor(gi, fi, "name", e.target.value)} />
                      : <Select options={[...availFlavors.map(f => ({ value: f.id, label: f.name })), { value: "__new__", label: "➕ Sabor nuevo..." }]} value={fl.productId || ""} onChange={e => updateFlavor(gi, fi, "productId", e.target.value)} />}
                    </div>
                    <div style={{ flex: 0.4 }}><Input type="number" placeholder="Cant" value={fl.qty} min={1} onChange={e => updateFlavor(gi, fi, "qty", Number(e.target.value))} /></div>
                    <button onClick={() => removeFlavor(gi, fi)} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 16, marginBottom: 14 }}>✕</button>
                  </div>
                ))}
                <button onClick={() => addFlavor(gi)} style={{ background: "none", border: `1px dashed ${bc}44`, color: bc, padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 11, width: "100%" }}>+ Agregar sabor</button>
                {group.flavors.length > 0 && <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a1a30", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#6666aa", fontSize: 12 }}>{group.flavors.reduce((s, f) => s + (Number(f.qty) || 0), 0)} uds</span>
                  <span style={{ color: "#c0c0e0", fontSize: 12, fontWeight: 600 }}>{formatMoney(group.flavors.reduce((s, f) => s + (Number(f.qty) || 0), 0) * (Number(group.unitCostUSDT) || 0), "USDT")}</span>
                </div>}
              </>)}
            </div>
          );
        })}
        <button onClick={addGroup} style={{ background: "#1a1a2e", border: "2px dashed #2a2a4a", color: "#a855f7", padding: "12px", borderRadius: 12, cursor: "pointer", fontSize: 13, fontWeight: 600, width: "100%", marginBottom: 14 }}>+ Agregar marca/modelo al pedido</button>

        {/* Costs */}
        <div style={{ background: "#12122a", border: "1px solid #2a2a4a", borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 12, color: "#e74c3c", marginBottom: 10, fontWeight: 700, textTransform: "uppercase" }}>💰 Costos extra</label>
          
          <label style={{ display: "block", fontSize: 11, color: "#6666aa", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>Comisión proveedor (USDT)</label>
          <div style={{ display: "flex", gap: 12, marginBottom: 4 }}>
            <Input label="% del total" type="number" placeholder="ej: 1" value={form.supplierCommPercent} onChange={e => setForm(f => ({ ...f, supplierCommPercent: e.target.value, supplierCommUSDT: "" }))} />
            <Input label="O monto fijo (USDT)" type="number" placeholder="ej: 6" value={form.supplierCommPercent ? "" : form.supplierCommUSDT} onChange={e => setForm(f => ({ ...f, supplierCommUSDT: e.target.value, supplierCommPercent: "" }))} />
          </div>
          {supplierCommUSDT > 0 && <div style={{ color: "#26de81", fontSize: 12, marginBottom: 10 }}>
            Comisión: {formatMoney(supplierCommUSDT, "USDT")} · Total a transferir: {formatMoney(totalUSDTwithComm, "USDT")}
            {form.supplierCommPercent ? ` (${form.supplierCommPercent}% de ${formatMoney(productsUSDT, "USDT")})` : ""}
          </div>}

          <div style={{ borderTop: "1px solid #1a1a30", paddingTop: 10, marginTop: 6 }}>
            <label style={{ display: "block", fontSize: 11, color: "#6666aa", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>Pasero + Envío (Pesos)</label>
            <div style={{ display: "flex", gap: 12 }}>
              <Input label="Pasero (%)" type="number" placeholder="ej: 5" value={form.paseroPercent} onChange={e => setForm(f => ({ ...f, paseroPercent: e.target.value, paseroCostARS: "" }))} />
              <Input label="O monto fijo ($)" type="number" value={form.paseroPercent ? "" : form.paseroCostARS} onChange={e => setForm(f => ({ ...f, paseroCostARS: e.target.value, paseroPercent: "" }))} />
            </div>
            {paseroARS > 0 && <div style={{ color: "#fdcb6e", fontSize: 12, marginBottom: 8 }}>Pasero: {formatMoney(paseroARS)}</div>}
            <Input label="Envío Vía Cargo ($)" type="number" placeholder="ej: 15000" value={form.envioCostARS} onChange={e => setForm(f => ({ ...f, envioCostARS: e.target.value }))} />
          </div>
        </div>

        {/* Total */}
        {totalItems > 0 && <div style={{ background: "#0d0d1a", borderRadius: 10, padding: 14, marginBottom: 14, border: "1px solid #2a2a4a" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: "#6666aa", fontSize: 13 }}>Vapes ({totalItems} uds)</span>
            <span style={{ color: "#c0c0e0" }}>{formatMoney(productsUSDT, "USDT")}</span>
          </div>
          {supplierCommUSDT > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: "#6666aa", fontSize: 13 }}>Comisión proveedor</span>
            <span style={{ color: "#26de81" }}>{formatMoney(supplierCommUSDT, "USDT")}</span>
          </div>}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, paddingTop: supplierCommUSDT > 0 ? 4 : 0, borderTop: supplierCommUSDT > 0 ? "1px solid #1a1a30" : "none" }}>
            <span style={{ color: "#6666aa", fontSize: 13, fontWeight: supplierCommUSDT > 0 ? 600 : 400 }}>Total USDT transferido</span>
            <span style={{ color: "#c0c0e0", fontWeight: 600 }}>{formatMoney(totalUSDTwithComm, "USDT")} · ~{formatMoney(Math.round(totalUSDTwithComm * exchangeRate))}</span>
          </div>
          {paseroARS > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ color: "#6666aa", fontSize: 13 }}>Pasero</span><span style={{ color: "#fdcb6e" }}>{formatMoney(paseroARS)}</span></div>}
          {envioARS > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ color: "#6666aa", fontSize: 13 }}>Envío</span><span style={{ color: "#fdcb6e" }}>{formatMoney(envioARS)}</span></div>}
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #2a2a4a", paddingTop: 8, marginTop: 4 }}>
            <span style={{ color: "#e0e0ff", fontSize: 15, fontWeight: 700 }}>Costo total</span>
            <span style={{ color: "#e74c3c", fontSize: 18, fontWeight: 800 }}>{formatMoney(totalCostARS)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ color: "#6666aa", fontSize: 12 }}>Costo por unidad</span>
            <span style={{ color: "#8888aa", fontSize: 13 }}>{formatMoney(Math.round(totalCostARS / totalItems))} / ud</span>
          </div>
        </div>}

        <Input label="Notas" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Opcional..." />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => { setModal(false); setEditing(null); }}>Cancelar</Btn>
          <Btn onClick={save}>{editing ? "Guardar" : "Registrar Pedido"}</Btn>
        </div>
      </Modal>

      {/* Verify Modal */}
      <Modal open={!!verifyModal} onClose={() => setVerifyModal(null)} title="✅ Verificar Pedido">
        {verifyPurchase && (<div>
          <div style={{ color: "#8888aa", fontSize: 13, marginBottom: 16 }}>Pedido de <strong style={{ color: "#e0e0ff" }}>{verifyPurchase.supplier}</strong> del {formatDate(verifyPurchase.date)}</div>
          <div style={{ background: "#12122a", borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, color: "#00b894", marginBottom: 10, fontWeight: 700, textTransform: "uppercase" }}>Verificá que recibiste:</label>
            {(verifyPurchase.items || []).map((item, i) => {
              const prod = products.find(p => p.id === item.productId);
              return (<div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1a1a30" }}>
                <span style={{ color: "#c0c0e0", fontSize: 14 }}>{prod ? `${prod.brand} ${prod.model} - ${prod.flavor}` : "?"}</span>
                <Badge color="#00b894">x{item.qty}</Badge>
              </div>);
            })}
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10 }}>
              <span style={{ color: "#e0e0ff", fontWeight: 700 }}>Total</span>
              <span style={{ color: "#00b894", fontWeight: 700 }}>{(verifyPurchase.items||[]).reduce((s,i) => s + Number(i.qty), 0)} uds</span>
            </div>
          </div>
          <div style={{ background: "#00b89415", border: "1px solid #00b89433", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
            <span style={{ color: "#00b894", fontSize: 13 }}>⚠️ Al confirmar, se suma todo al stock.</span>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setVerifyModal(null)}>Cancelar</Btn>
            <Btn variant="success" onClick={() => updateStatus(verifyPurchase.id, "verificado")}>✅ Verificar</Btn>
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
