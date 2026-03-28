import { useState, useMemo } from "react";
import { useResponsive } from "../App.jsx";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { Modal, Card, Btn, Input, Select, Table, Badge, SearchBar } from "./UI.jsx";
import { BRANDS, BRAND_COLORS, CHANNELS, PAYMENT_METHODS, MP_ACCOUNTS, DISCOUNT_REASONS } from "../constants.js";

// -- SALES (v3 — inline client creation, delivery info, toggle payments) --

const emptyForm = () => ({
  items: [],
  clientId: "", clientName: "",
  channel: "", currency: "ARS",
  deliveryBarrio: "", deliveryAddress: "", deliveryRef: "",
  discountType: "none", discountValue: "", discountReason: "",
  extras: [],
  payments: [],
  creditApplied: 0,
  balanceAction: "none",
  balanceChangeAccount: "",
  notes: "",
  date: new Date().toISOString().slice(0, 10)
});

export const Sales = ({ sales, setSales, products, setProducts, clients, setClients, cashMovements, setCashMovements, logStock, exchangeRate, currentUser }) => {
  const { isMobile } = useResponsive();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [filterChannel, setFilterChannel] = useState("");
  const [filterPayment, setFilterPayment] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const [prodSearch, setProdSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [showProdPicker, setShowProdPicker] = useState(false);

  const [clientSearch, setClientSearch] = useState("");
  const [showClientPicker, setShowClientPicker] = useState(false);

  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientForm, setNewClientForm] = useState({ name: "", phone: "", instagram: "", barrio: "", notes: "" });

  // ---- helpers ----
  const getClientBalance = (cId) => {
    const c = (clients || []).find(x => x.id === cId);
    return c?.balance || 0;
  };

  const availableModels = useMemo(() => {
    if (!brandFilter) return [];
    return [...new Set(products.filter(p => p.brand === brandFilter && p.stock > 0).map(p => p.model))].sort();
  }, [products, brandFilter]);

  const filteredProducts = useMemo(() => {
    let list = products.filter(p => p.stock > 0);
    if (brandFilter) list = list.filter(p => p.brand === brandFilter);
    if (modelFilter) list = list.filter(p => p.model === modelFilter);
    if (prodSearch) {
      const q = prodSearch.toLowerCase();
      list = list.filter(p => `${p.brand} ${p.model} ${p.flavor} ${p.puffs}`.toLowerCase().includes(q));
    }
    return list.sort((a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model) || a.flavor.localeCompare(b.flavor));
  }, [products, brandFilter, modelFilter, prodSearch]);

  const filteredClients = useMemo(() => {
    if (!clientSearch) return clients || [];
    const q = clientSearch.toLowerCase();
    return (clients || []).filter(c => c.name.toLowerCase().includes(q) || (c.phone || "").includes(q) || (c.instagram || "").toLowerCase().includes(q));
  }, [clients, clientSearch]);

  const brandsWithStock = useMemo(() => {
    const bs = new Set(products.filter(p => p.stock > 0).map(p => p.brand));
    return BRANDS.filter(b => bs.has(b));
  }, [products]);

  // ---- item actions ----
  const addProduct = (product) => {
    setForm(f => {
      const existing = f.items.find(i => i.productId === product.id);
      if (existing) return { ...f, items: f.items.map(i => i.productId === product.id ? { ...i, qty: i.qty + 1 } : i) };
      return { ...f, items: [...f.items, { productId: product.id, qty: 1 }] };
    });
    setProdSearch("");
  };
  const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  const updateItemQty = (i, qty) => setForm(f => ({ ...f, items: f.items.map((item, idx) => idx === i ? { ...item, qty: Math.max(1, Number(qty) || 1) } : item) }));

  // ---- payment toggle ----
  const togglePaymentMethod = (method) => {
    setForm(f => {
      const existing = f.payments.find(p => p.method === method);
      if (existing) return { ...f, payments: f.payments.filter(p => p.method !== method) };
      return { ...f, payments: [...f.payments, { method, account: "", amount: "" }] };
    });
  };
  const updatePayment = (method, field, val) => {
    setForm(f => ({ ...f, payments: f.payments.map(p => p.method === method ? { ...p, [field]: val } : p) }));
  };

  // ---- inline client creation ----
  const createClientInline = () => {
    if (!newClientForm.name.trim()) return alert("El nombre es obligatorio");
    const nc = {
      id: uid(), name: newClientForm.name.trim(), phone: newClientForm.phone.trim(),
      instagram: newClientForm.instagram.trim().replace(/^@/, ""),
      barrio: newClientForm.barrio.trim(), notes: newClientForm.notes.trim(), balance: 0
    };
    setClients(prev => [nc, ...prev]);
    setForm(f => ({ ...f, clientId: nc.id, clientName: nc.name, deliveryBarrio: nc.barrio || f.deliveryBarrio, creditApplied: 0 }));
    setShowNewClient(false); setShowClientPicker(false);
    setNewClientForm({ name: "", phone: "", instagram: "", barrio: "", notes: "" });
  };

  // ---- calculations ----
  const totalQty = form.items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
  const getPrice = (prodId) => {
    const p = products.find(x => x.id === prodId);
    if (!p) return 0;
    return form.currency === "USD" ? (p.priceUSD || 0) : Math.round((p.priceUSD || 0) * exchangeRate);
  };
  const subtotal = form.items.reduce((s, i) => s + getPrice(i.productId) * (i.qty || 0), 0);
  const calcDiscount = (sub) => {
    if (form.discountType === "percent") return sub * (Number(form.discountValue) || 0) / 100;
    if (form.discountType === "fixed") return Number(form.discountValue) || 0;
    if (form.discountType === "per_unit") return (Number(form.discountValue) || 0) * totalQty;
    return 0;
  };
  const discountAmount = calcDiscount(subtotal);
  const extrasTotal = (form.extras || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const finalTotal = Math.max(0, subtotal - discountAmount + extrasTotal);
  const amountToPay = Math.max(0, finalTotal - (Number(form.creditApplied) || 0));
  const totalPaid = form.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const paymentDiff = totalPaid - amountToPay;
  const autoVolume = totalQty >= 3 && form.discountType === "none";
  const selectedClientBalance = getClientBalance(form.clientId);

  // ---- open / close ----
  const openNew = () => {
    setForm(emptyForm()); setEditing(null); setModal(true); setClientSearch("");
    setProdSearch(""); setBrandFilter(""); setModelFilter("");
    setShowProdPicker(false); setShowClientPicker(false); setShowNewClient(false);
  };
  const openEdit = (sale) => {
    setForm({
      items: sale.items || [], clientId: sale.clientId || "", clientName: sale.clientName || "",
      channel: sale.channel || "", currency: sale.currency || "ARS",
      deliveryBarrio: sale.deliveryBarrio || "", deliveryAddress: sale.deliveryAddress || "", deliveryRef: sale.deliveryRef || "",
      discountType: sale.discountType || "none", discountValue: sale.discountValue || "", discountReason: sale.discountReason || "",
      extras: sale.extras || [],
      payments: sale.payments || (sale.paymentMethod ? [{ method: sale.paymentMethod, account: sale.mpAccount || "", amount: sale.total || "" }] : []),
      creditApplied: sale.creditApplied || 0, balanceAction: sale.balanceAction || "none",
      balanceChangeAccount: sale.balanceChangeAccount || "", notes: sale.notes || "",
      date: sale.date ? sale.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
    });
    setEditing(sale.id); setModal(true);
  };

  // ---- save ----
  const save = () => {
    if (form.items.length === 0) return alert("Agrega al menos un producto");
    if (form.payments.length === 0) return alert("Selecciona al menos un metodo de pago");
    if (form.payments.some(p => !p.method)) return alert("Completa el metodo de pago en todos los pagos");
    const stockRestore = {};
    if (editing) { const orig = sales.find(s => s.id === editing); if (orig) (orig.items || []).forEach(it => { stockRestore[it.productId] = (stockRestore[it.productId] || 0) + it.qty; }); }
    for (const item of form.items) {
      const prod = products.find(p => p.id === item.productId);
      if (!prod) continue;
      const avail = (prod.stock || 0) + (stockRestore[item.productId] || 0);
      if (item.qty > avail) { alert(`Sin stock suficiente de ${prod.brand} ${prod.model} - ${prod.flavor}. Disponible: ${avail}`); return; }
    }
    if (Math.abs(paymentDiff) > 0.5 && finalTotal > 0 && form.balanceAction === "none") {
      if (paymentDiff > 0) { alert(`Sobran ${formatMoney(paymentDiff, form.currency)}. Elegi que hacer con el vuelto.`); return; }
      if (paymentDiff < 0 && form.clientId) { alert(`Faltan ${formatMoney(Math.abs(paymentDiff), form.currency)}. Registralo como deuda o completa el pago.`); return; }
      if (paymentDiff < 0 && !form.clientId) { alert(`Faltan ${formatMoney(Math.abs(paymentDiff), form.currency)}. Completa el pago.`); return; }
    }
    const saleId = editing || uid();
    const clientName = form.clientId ? ((clients || []).find(c => c.id === form.clientId)?.name || form.clientName) : form.clientName;
    const saleData = {
      ...form, clientName, total: finalTotal, subtotal, discountAmount, extrasTotal, totalPaid, paymentDiff,
      paymentMethod: form.payments[0]?.method || "", mpAccount: form.payments[0]?.account || "",
      date: form.date || new Date().toISOString(), createdBy: currentUser?.name || "", id: saleId,
    };
    // Update client barrio if new
    if (form.clientId && form.deliveryBarrio && setClients) {
      const cli = (clients || []).find(c => c.id === form.clientId);
      if (cli && !cli.barrio && form.deliveryBarrio.trim()) setClients(prev => prev.map(c => c.id === form.clientId ? { ...c, barrio: form.deliveryBarrio.trim() } : c));
    }
    // Stock updates
    if (editing) { const orig = sales.find(s => s.id === editing); if (orig) (orig.items || []).forEach(it => { setProducts(prev => prev.map(p => p.id === it.productId ? { ...p, stock: (p.stock || 0) + it.qty } : p)); }); }
    form.items.forEach(it => { setProducts(prev => prev.map(p => p.id === it.productId ? { ...p, stock: Math.max(0, (p.stock || 0) - it.qty) } : p)); });
    if (!editing) { form.items.forEach(it => { logStock({ productId: it.productId, type: "venta", qty: -it.qty, reason: `Venta a ${clientName || "sin nombre"}`, refId: saleId, date: form.date }); }); }
    // Client balance
    if (form.clientId && clients && setClients) {
      let balDelta = 0;
      if (form.creditApplied > 0) balDelta -= form.creditApplied;
      if (form.balanceAction === "credit" && paymentDiff > 0) balDelta += paymentDiff;
      if (form.balanceAction === "debt" && paymentDiff < 0) balDelta += paymentDiff;
      if (editing) {
        const orig = sales.find(s => s.id === editing);
        if (orig) {
          if (orig.creditApplied > 0) balDelta += orig.creditApplied;
          if (orig.balanceAction === "credit" && orig.paymentDiff > 0) balDelta -= orig.paymentDiff;
          if (orig.balanceAction === "debt" && orig.paymentDiff < 0) balDelta -= orig.paymentDiff;
        }
      }
      if (balDelta !== 0) setClients(prev => prev.map(c => c.id === form.clientId ? { ...c, balance: (c.balance || 0) + balDelta } : c));
      if ((form.balanceAction === "cash_change" || form.balanceAction === "transfer_change") && paymentDiff > 0 && setCashMovements) {
        const accId = form.balanceAction === "cash_change" ? "pesosCash" : (form.balanceChangeAccount === "Lemon" ? "lemonPesos" : form.balanceChangeAccount === "MP Diego" ? "mpDiego" : form.balanceChangeAccount === "MP Gustavo" ? "mpGustavo" : "pesosCash");
        setCashMovements(prev => [{ id: uid(), type: "withdrawal", from: accId, to: "", amount: paymentDiff, description: `Vuelto venta a ${clientName} (#${saleId.slice(-5)})`, date: form.date, createdBy: currentUser?.name || "", saleId }, ...prev]);
      }
    }
    if (editing) { setSales(prev => prev.map(s => s.id === editing ? saleData : s)); }
    else { setSales(prev => [saleData, ...prev]); }
    setModal(false); setForm(emptyForm()); setEditing(null);
  };

  // ---- delete ----
  const [confirmDel, setConfirmDel] = useState(null);
  const deleteSale = (sale) => {
    if (confirmDel !== sale.id) { setConfirmDel(sale.id); setTimeout(() => setConfirmDel(null), 3000); return; }
    setConfirmDel(null);
    (sale.items || []).forEach(it => { setProducts(prev => prev.map(p => p.id === it.productId ? { ...p, stock: (p.stock || 0) + it.qty } : p)); });
    if (sale.clientId && setClients) {
      let rev = 0;
      if (sale.creditApplied > 0) rev += sale.creditApplied;
      if (sale.balanceAction === "credit" && sale.paymentDiff > 0) rev -= sale.paymentDiff;
      if (sale.balanceAction === "debt" && sale.paymentDiff < 0) rev -= sale.paymentDiff;
      if (rev !== 0) setClients(prev => prev.map(c => c.id === sale.clientId ? { ...c, balance: (c.balance || 0) + rev } : c));
    }
    setSales(prev => prev.filter(s => s.id !== sale.id));
  };

  // ---- filtered list ----
  const filtered = sales.filter(s => {
    const names = (s.items || []).map(i => { const p = products.find(pr => pr.id === i.productId); return p ? `${p.brand} ${p.model} ${p.flavor}` : ""; }).join(" ");
    if (search && !names.toLowerCase().includes(search.toLowerCase()) && !(s.clientName || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (filterChannel && s.channel !== filterChannel) return false;
    if (filterPayment && !(s.payments || []).some(p => p.method === filterPayment) && s.paymentMethod !== filterPayment) return false;
    if (filterDateFrom && s.date < filterDateFrom) return false;
    if (filterDateTo && s.date > filterDateTo) return false;
    return true;
  });
  const hasActiveFilters = filterChannel || filterPayment || filterDateFrom || filterDateTo;
  const clearFilters = () => { setFilterChannel(""); setFilterPayment(""); setFilterDateFrom(""); setFilterDateTo(""); };
  const filteredRevenue = filtered.reduce((s, r) => s + (r.total || 0), 0);
  const totalDiscountsMonth = useMemo(() => {
    const now = new Date();
    return sales.filter(s => { const d = new Date(s.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && (s.discountAmount || 0) > 0; })
      .reduce((sum, s) => sum + (s.discountAmount || 0), 0);
  }, [sales]);

  // ============ RENDER ============
  const sec = { background: "#f7f8fa", border: "1px solid #e2e4e9", borderRadius: 10, padding: 14, marginBottom: 14 };
  const secLabel = (icon, text, color) => <label style={{ display: "block", fontSize: 12, color: color || "#6366f1", marginBottom: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{icon} {text}</label>;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", marginBottom: 16, gap: 12 }}>
        <div>
          <h2 style={{ color: "#1a1a2e", margin: 0, fontSize: isMobile ? 18 : 22 }}>Ventas ({filtered.length}{filtered.length !== sales.length ? `/${sales.length}` : ""})</h2>
          {filtered.length > 0 && <span style={{ color: "#6b7280", fontSize: 13 }}>Total filtrado: {formatMoney(filteredRevenue)}</span>}
        </div>
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10, alignItems: isMobile ? "stretch" : "center", width: isMobile ? "100%" : "auto" }}>
          <div style={{ width: isMobile ? "100%" : "auto" }}><SearchBar value={search} onChange={setSearch} placeholder="Buscar producto o cliente..." /></div>
          <div style={{ display: "flex", gap: 10, width: isMobile ? "100%" : "auto" }}>
            <Btn variant="secondary" onClick={() => setShowFilters(!showFilters)} style={{ padding: "10px 14px", border: hasActiveFilters ? "1px solid #6366f1" : undefined, flex: isMobile ? 1 : "auto" }}>Filtros {hasActiveFilters ? "●" : ""}</Btn>
            <Btn onClick={openNew} style={{ flex: isMobile ? 1 : "auto" }}>+ Nueva Venta</Btn>
          </div>
        </div>
      </div>

      {showFilters && (
        <Card style={{ marginBottom: 14, background: "#f7f8fa", border: "1px solid #e2e4e9" }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 12, alignItems: "flex-end" }}>
            <Input label="Desde" type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
            <Input label="Hasta" type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
            <Select label="Canal" options={CHANNELS} value={filterChannel} onChange={e => setFilterChannel(e.target.value)} />
            <Select label="Metodo de pago" options={PAYMENT_METHODS} value={filterPayment} onChange={e => setFilterPayment(e.target.value)} />
            {hasActiveFilters && <button onClick={clearFilters} style={{ background: "none", border: "1px solid #e74c3c55", color: "#e74c3c", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, gridColumn: isMobile ? "1 / -1" : "auto" }}>Limpiar</button>}
          </div>
        </Card>
      )}

      {totalDiscountsMonth > 0 && (
        <Card style={{ marginBottom: 14, background: "#fff", borderColor: "#fdcb6e33" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>🏷️</span>
            <span style={{ color: "#fdcb6e", fontSize: 13 }}>Descuentos este mes: <strong>{formatMoney(totalDiscountsMonth)}</strong></span>
          </div>
        </Card>
      )}

      {/* Sales Table */}
      <Card>
        <Table
          columns={[
            { key: "date", label: "Fecha", render: r => formatDate(r.date) },
            { key: "items", label: "Productos", render: r => (r.items || []).map(i => { const p = products.find(pr => pr.id === i.productId); return p ? `${p.brand} ${p.model} (x${i.qty})` : "?"; }).join(", ") },
            { key: "client", label: "Cliente", render: r => <div><span>{r.clientName || "-"}</span>{r.deliveryBarrio && <span style={{ display: "block", fontSize: 11, color: "#9ca3af" }}>{r.deliveryBarrio}</span>}</div> },
            { key: "channel", label: "Canal", render: r => <Badge>{r.channel || "-"}</Badge> },
            { key: "payment", label: "Pago", render: r => {
              if (r.payments && r.payments.length > 0) return r.payments.map((p, idx) => <span key={idx}>{idx > 0 ? " + " : ""}<Badge color="#6366f1">{p.method}{p.account ? ` (${p.account})` : ""}: {formatMoney(p.amount, r.currency)}</Badge></span>);
              return r.paymentMethod + (r.mpAccount ? ` (${r.mpAccount})` : "");
            }},
            { key: "balance", label: "Saldo", render: r => {
              if (r.balanceAction === "credit") return <Badge color="#00b894">+{formatMoney(r.paymentDiff)} credito</Badge>;
              if (r.balanceAction === "debt") return <Badge color="#e74c3c">{formatMoney(r.paymentDiff)} deuda</Badge>;
              if (r.creditApplied > 0) return <Badge color="#6366f1">-{formatMoney(r.creditApplied)} credito</Badge>;
              return <span style={{ color: "#9ca3af" }}>—</span>;
            }},
            { key: "total", label: "Total", render: r => <strong style={{ color: "#00b894" }}>{formatMoney(r.total, r.currency)}</strong> },
            { key: "actions", label: "", render: r => (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={e => { e.stopPropagation(); openEdit(r); }} style={{ background: "none", border: "none", color: "#6366f1", cursor: "pointer", fontSize: 16 }} title="Editar">✏️</button>
                {confirmDel === r.id
                  ? <button onClick={e => { e.stopPropagation(); deleteSale(r); }} style={{ background: "#e74c3c22", border: "1px solid #e74c3c55", color: "#e74c3c", padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Confirmar</button>
                  : <button onClick={e => { e.stopPropagation(); deleteSale(r); }} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 16 }} title="Eliminar">🗑️</button>
                }
              </div>
            )},
          ]}
          mobileColumns={isMobile ? ["date", "items", "total", "actions"] : undefined}
          data={filtered}
          emptyMsg="No hay ventas registradas"
        />
      </Card>

      {/* ============ SALE MODAL ============ */}
      <Modal open={modal} onClose={() => { setModal(false); setEditing(null); }} title={editing ? "Editar Venta" : "Nueva Venta"}>
        <Input label="Fecha" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />

        {/* ===== PRODUCTS ===== */}
        <div style={sec}>
          {secLabel("🛒", "Productos")}
          {form.items.map((item, i) => {
            const p = products.find(pr => pr.id === item.productId);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#fff", borderRadius: 8, marginBottom: 6, border: "1px solid #e2e4e9" }}>
                {p && <span style={{ width: 8, height: 8, borderRadius: "50%", background: BRAND_COLORS[p.brand] || "#6366f1", flexShrink: 0 }} />}
                <span style={{ flex: 1, fontSize: 13, color: "#1a1a2e" }}>{p ? `${p.brand} ${p.model} - ${p.flavor}` : "?"} <span style={{ color: "#9ca3af", fontSize: 11 }}>({p?.puffs}p)</span></span>
                <span style={{ color: "#00b894", fontSize: 13, fontWeight: 700, marginRight: 8 }}>{formatMoney(getPrice(item.productId) * item.qty, form.currency)}</span>
                <input type="number" value={item.qty} min={1} max={p?.stock || 99} onChange={e => updateItemQty(i, e.target.value)} style={{ width: 44, padding: "4px 6px", border: "1px solid #e2e4e9", borderRadius: 6, textAlign: "center", fontSize: 13 }} />
                <button onClick={() => removeItem(i)} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 16, padding: "2px 4px" }}>✕</button>
              </div>
            );
          })}
          <input type="text" value={prodSearch} onChange={e => { setProdSearch(e.target.value); setShowProdPicker(true); }} onFocus={() => setShowProdPicker(true)} placeholder="Buscar: marca, modelo, sabor..." style={{ width: "100%", padding: "10px 14px", border: "1px solid #e2e4e9", borderRadius: 8, fontSize: 14, background: "#fff", outline: "none", marginBottom: 8, boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {brandFilter && <button onClick={() => { setBrandFilter(""); setModelFilter(""); }} style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid #e74c3c55", background: "#fef2f2", color: "#e74c3c" }}>✕ Todas</button>}
            {brandsWithStock.map(b => (
              <button key={b} onClick={() => { setBrandFilter(brandFilter === b ? "" : b); setModelFilter(""); setShowProdPicker(true); }}
                style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", border: `1px solid ${brandFilter === b ? (BRAND_COLORS[b] || "#6366f1") : "#e2e4e9"}`, background: brandFilter === b ? `${BRAND_COLORS[b] || "#6366f1"}22` : "#fff", color: brandFilter === b ? (BRAND_COLORS[b] || "#6366f1") : "#6b7280" }}>{b}</button>
            ))}
          </div>
          {brandFilter && availableModels.length > 1 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {availableModels.map(m => (
                <button key={m} onClick={() => { setModelFilter(modelFilter === m ? "" : m); setShowProdPicker(true); }}
                  style={{ padding: "3px 8px", borderRadius: 14, fontSize: 11, fontWeight: 600, cursor: "pointer", border: `1px solid ${modelFilter === m ? "#6366f1" : "#e2e4e9"}`, background: modelFilter === m ? "#6366f122" : "#fff", color: modelFilter === m ? "#6366f1" : "#6b7280" }}>{m}</button>
              ))}
            </div>
          )}
          {showProdPicker && (
            <div style={{ maxHeight: 200, overflowY: "auto", background: "#fff", border: "1px solid #e2e4e9", borderRadius: 8 }}>
              {filteredProducts.length === 0
                ? <div style={{ padding: 16, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>No hay productos con stock</div>
                : filteredProducts.slice(0, 20).map(p => (
                  <div key={p.id} onClick={() => addProduct(p)} style={{ padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #f3f4f6", transition: "background .1s" }} onMouseEnter={e => e.currentTarget.style.background = "#f7f8fa"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: BRAND_COLORS[p.brand] || "#6366f1", flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, color: "#1a1a2e" }}><strong>{p.brand}</strong> {p.model} — {p.flavor} <span style={{ color: "#9ca3af", fontSize: 11 }}>({p.puffs}p)</span></span>
                    <span style={{ color: "#00b894", fontSize: 12, fontWeight: 700 }}>{formatMoney(form.currency === "USD" ? p.priceUSD : Math.round(p.priceUSD * exchangeRate), form.currency)}</span>
                    <Badge color={p.stock <= 2 ? "#e74c3c" : "#00b894"}>{p.stock}</Badge>
                  </div>
                ))}
              {filteredProducts.length > 20 && <div style={{ padding: 8, textAlign: "center", color: "#9ca3af", fontSize: 11 }}>+{filteredProducts.length - 20} mas...</div>}
            </div>
          )}
          {showProdPicker && <button onClick={() => setShowProdPicker(false)} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 11, marginTop: 4 }}>Cerrar buscador</button>}
        </div>

        {autoVolume && (
          <div style={{ background: "#fdcb6e15", border: "1px solid #fdcb6e33", borderRadius: 10, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 16 }}>💡</span>
            <span style={{ color: "#fdcb6e", fontSize: 13 }}>Comprando {totalQty} unidades — descuento por volumen?</span>
            <button onClick={() => setForm(f => ({ ...f, discountType: "percent", discountReason: "Volumen (3+)" }))} style={{ marginLeft: isMobile ? 0 : "auto", background: "#fdcb6e22", border: "1px solid #fdcb6e55", color: "#fdcb6e", padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>Aplicar</button>
          </div>
        )}

        {/* ===== CLIENT ===== */}
        <div style={sec}>
          {secLabel("👤", "Cliente")}
          {!showNewClient ? (
            <>
              <div style={{ position: "relative" }}>
                <input type="text" value={form.clientId ? ((clients || []).find(c => c.id === form.clientId)?.name || form.clientName) : clientSearch}
                  onChange={e => { setClientSearch(e.target.value); setForm(f => ({ ...f, clientId: "", clientName: e.target.value, creditApplied: 0 })); setShowClientPicker(true); }}
                  onFocus={() => { if (!form.clientId) setShowClientPicker(true); }}
                  placeholder="Buscar cliente por nombre, tel, IG..."
                  style={{ width: "100%", padding: "10px 14px", border: "1px solid #e2e4e9", borderRadius: 8, fontSize: 14, background: form.clientId ? "#eef2ff" : "#fff", outline: "none", boxSizing: "border-box" }} />
                {form.clientId && <button onClick={() => { setForm(f => ({ ...f, clientId: "", clientName: "", creditApplied: 0 })); setClientSearch(""); }} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 14 }}>✕</button>}
              </div>

              {/* Client info card */}
              {form.clientId && (() => {
                const cli = (clients || []).find(c => c.id === form.clientId);
                if (!cli) return null;
                return (
                  <div style={{ marginTop: 8, padding: "10px 12px", background: "#eef2ff", borderRadius: 8, border: "1px solid #6366f122" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#6366f1", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{cli.name.charAt(0).toUpperCase()}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e" }}>{cli.name}</div>
                        <div style={{ fontSize: 11, color: "#6b7280" }}>{[cli.phone, cli.instagram ? `@${cli.instagram}` : "", cli.barrio].filter(Boolean).join(" · ")}</div>
                      </div>
                      {(cli.balance || 0) !== 0 && <Badge color={(cli.balance || 0) > 0 ? "#00b894" : "#e74c3c"}>{(cli.balance || 0) > 0 ? `+${formatMoney(cli.balance)}` : formatMoney(cli.balance)}</Badge>}
                    </div>
                  </div>
                );
              })()}

              {/* Balance */}
              {form.clientId && selectedClientBalance !== 0 && (
                <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: selectedClientBalance > 0 ? "#ecfdf5" : "#fef2f2", border: `1px solid ${selectedClientBalance > 0 ? "#00b89433" : "#e74c3c33"}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontSize: 13, color: selectedClientBalance > 0 ? "#00b894" : "#e74c3c" }}>{selectedClientBalance > 0 ? `Saldo a favor: ${formatMoney(selectedClientBalance)}` : `Deuda pendiente: ${formatMoney(Math.abs(selectedClientBalance))}`}</span>
                  {selectedClientBalance > 0 && finalTotal > 0 && (
                    <button onClick={() => setForm(f => ({ ...f, creditApplied: Math.min(selectedClientBalance, finalTotal) }))} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid #00b89455", background: "#00b89422", color: "#00b894" }}>Aplicar {formatMoney(Math.min(selectedClientBalance, finalTotal))}</button>
                  )}
                </div>
              )}
              {form.creditApplied > 0 && (
                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                  <Badge color="#6366f1">Credito aplicado: -{formatMoney(form.creditApplied)}</Badge>
                  <button onClick={() => setForm(f => ({ ...f, creditApplied: 0 }))} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 12 }}>✕</button>
                </div>
              )}

              {/* Client dropdown */}
              {showClientPicker && !form.clientId && (
                <div style={{ maxHeight: 160, overflowY: "auto", background: "#fff", border: "1px solid #e2e4e9", borderRadius: 8, marginTop: 4 }}>
                  {filteredClients.length === 0
                    ? <div style={{ padding: 12, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>{clientSearch ? "Sin resultados" : "No hay clientes"}</div>
                    : filteredClients.slice(0, 10).map(c => (
                      <div key={c.id} onClick={() => { setForm(f => ({ ...f, clientId: c.id, clientName: c.name, deliveryBarrio: c.barrio || f.deliveryBarrio, creditApplied: 0 })); setShowClientPicker(false); setClientSearch(""); }}
                        style={{ padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #f3f4f6" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#f7f8fa"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>{c.name}</span>
                          {c.phone && <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 8 }}>{c.phone}</span>}
                          {c.barrio && <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 6 }}>({c.barrio})</span>}
                        </div>
                        {(c.balance || 0) !== 0 && <Badge color={(c.balance || 0) > 0 ? "#00b894" : "#e74c3c"}>{(c.balance || 0) > 0 ? `+${formatMoney(c.balance)}` : formatMoney(c.balance)}</Badge>}
                      </div>
                    ))}
                </div>
              )}
              {showClientPicker && !form.clientId && (
                <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
                  <button onClick={() => setShowClientPicker(false)} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 11 }}>Cerrar</button>
                  <button onClick={() => { setShowNewClient(true); setShowClientPicker(false); setNewClientForm(f => ({ ...f, name: clientSearch })); }}
                    style={{ background: "#6366f111", border: "1px solid #6366f133", color: "#6366f1", padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>+ Nuevo cliente</button>
                </div>
              )}
              {!showClientPicker && !form.clientId && (
                <button onClick={() => { setShowNewClient(true); setNewClientForm({ name: clientSearch || "", phone: "", instagram: "", barrio: "", notes: "" }); }}
                  style={{ marginTop: 6, background: "none", border: "1px dashed #6366f155", color: "#6366f1", padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, width: "100%" }}>+ Crear cliente nuevo</button>
              )}
            </>
          ) : (
            /* INLINE NEW CLIENT FORM */
            <div style={{ background: "#fff", border: "1px solid #6366f133", borderRadius: 10, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#6366f1" }}>Nuevo Cliente</span>
                <button onClick={() => setShowNewClient(false)} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <Input label="Nombre *" value={newClientForm.name} onChange={e => setNewClientForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre del cliente" />
                <Input label="Telefono" value={newClientForm.phone} onChange={e => setNewClientForm(f => ({ ...f, phone: e.target.value }))} placeholder="11 xxxx-xxxx" />
                <Input label="Barrio / Zona" value={newClientForm.barrio} onChange={e => setNewClientForm(f => ({ ...f, barrio: e.target.value }))} placeholder="Ej: Palermo, Belgrano..." />
                <Input label="Instagram" value={newClientForm.instagram} onChange={e => setNewClientForm(f => ({ ...f, instagram: e.target.value }))} placeholder="@usuario" />
              </div>
              <div style={{ marginTop: 8 }}><Input label="Notas" value={newClientForm.notes} onChange={e => setNewClientForm(f => ({ ...f, notes: e.target.value }))} placeholder="Opcional: referido por..." /></div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
                <button onClick={() => setShowNewClient(false)} style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid #e2e4e9", background: "#fff", color: "#6b7280" }}>Cancelar</button>
                <button onClick={createClientInline} style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none", background: "#6366f1", color: "#fff" }}>Crear y Asociar</button>
              </div>
            </div>
          )}
        </div>

        {/* ===== DELIVERY ===== */}
        {(form.clientId || form.deliveryBarrio || form.deliveryAddress) ? (
          <div style={sec}>
            {secLabel("📍", "Entrega", "#f59e0b")}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
              <Input label="Barrio / Zona" value={form.deliveryBarrio} onChange={e => setForm(f => ({ ...f, deliveryBarrio: e.target.value }))} placeholder="Ej: Belgrano, Recoleta..." />
              <Input label="Direccion" value={form.deliveryAddress} onChange={e => setForm(f => ({ ...f, deliveryAddress: e.target.value }))} placeholder="Calle y numero (opcional)" />
            </div>
            <div style={{ marginTop: 8 }}><Input label="Referencia" value={form.deliveryRef} onChange={e => setForm(f => ({ ...f, deliveryRef: e.target.value }))} placeholder="Ej: frente a la plaza, portero 4B..." /></div>
          </div>
        ) : (
          <button onClick={() => setForm(f => ({ ...f, deliveryBarrio: " " }))}
            style={{ width: "100%", background: "none", border: "1px dashed #f59e0b44", color: "#f59e0b", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, marginBottom: 14 }}>+ Agregar info de entrega</button>
        )}

        {/* Channel + Currency */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <Select label="Canal" options={CHANNELS} value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))} />
          <Select label="Moneda" options={["ARS", "USD", "USDT"]} value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} />
        </div>

        {/* ===== DISCOUNT ===== */}
        <div style={sec}>
          {secLabel("🏷️", "Descuento", "#fdcb6e")}
          <div style={{ display: "flex", gap: isMobile ? 4 : 8, marginBottom: 10, flexWrap: "wrap" }}>
            {[{ value: "none", label: "Sin desc." }, { value: "percent", label: "%" }, { value: "fixed", label: "$ Fijo" }, { value: "per_unit", label: "$/u" }].map(opt => (
              <button key={opt.value} onClick={() => setForm(f => ({ ...f, discountType: opt.value, discountValue: opt.value === "none" ? "" : f.discountValue }))}
                style={{ padding: isMobile ? "4px 8px" : "6px 12px", borderRadius: 8, fontSize: isMobile ? 11 : 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${form.discountType === opt.value ? "#fdcb6e" : "#e2e4e9"}`, background: form.discountType === opt.value ? "#fdcb6e22" : "transparent", color: form.discountType === opt.value ? "#fdcb6e" : "#6b7280" }}>{opt.label}</button>
            ))}
          </div>
          {form.discountType !== "none" && (
            <>
              <div style={{ display: "flex", gap: 12, flexDirection: isMobile ? "column" : "row" }}>
                <Input label={form.discountType === "percent" ? "%" : `Monto (${form.currency})`} type="number" value={form.discountValue} onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))} placeholder={form.discountType === "percent" ? "ej: 10" : "ej: 5000"} />
                <Select label="Motivo" options={DISCOUNT_REASONS} value={form.discountReason} onChange={e => setForm(f => ({ ...f, discountReason: e.target.value }))} />
              </div>
              {discountAmount > 0 && <div style={{ color: "#fdcb6e", fontSize: 13, marginTop: 4 }}>Descuento: <strong>-{formatMoney(discountAmount, form.currency)}</strong>{form.discountType === "percent" && ` (${form.discountValue}% de ${formatMoney(subtotal, form.currency)})`}</div>}
            </>
          )}
        </div>

        {/* ===== EXTRAS ===== */}
        <div style={sec}>
          {secLabel("➕", "Extras", "#00b894")}
          {(form.extras || []).map((extra, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-end", flexWrap: isMobile ? "wrap" : "nowrap" }}>
              <div style={{ flex: isMobile ? "1 100%" : 2 }}><Input placeholder="Concepto (envio, propina...)" value={extra.concept} onChange={e => setForm(f => ({ ...f, extras: f.extras.map((ex, j) => j === i ? { ...ex, concept: e.target.value } : ex) }))} /></div>
              <div style={{ flex: isMobile ? "1" : 0.7 }}><Input type="number" placeholder="Monto" value={extra.amount} onChange={e => setForm(f => ({ ...f, extras: f.extras.map((ex, j) => j === i ? { ...ex, amount: e.target.value } : ex) }))} /></div>
              <button onClick={() => setForm(f => ({ ...f, extras: f.extras.filter((_, j) => j !== i) }))} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 16, marginBottom: isMobile ? 0 : 14 }}>✕</button>
            </div>
          ))}
          <button onClick={() => setForm(f => ({ ...f, extras: [...(f.extras || []), { concept: "", amount: "" }] }))} style={{ background: "none", border: "1px dashed #00b89444", color: "#00b894", padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 11, width: "100%" }}>+ Agregar extra</button>
          {extrasTotal > 0 && <div style={{ color: "#00b894", fontSize: 13, marginTop: 6 }}>Extras: <strong>+{formatMoney(extrasTotal, form.currency)}</strong></div>}
        </div>

        {/* ===== TOTALS ===== */}
        <div style={{ background: "#f7f8fa", borderRadius: 10, padding: 14, marginBottom: 14, border: "1px solid #e2e4e9" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ color: "#6b7280", fontSize: 13 }}>Subtotal ({totalQty} ud.)</span>
            <span style={{ color: "#4b5563", fontSize: 14 }}>{formatMoney(subtotal, form.currency)}</span>
          </div>
          {discountAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ color: "#fdcb6e", fontSize: 13 }}>Descuento{form.discountReason ? ` (${form.discountReason})` : ""}</span><span style={{ color: "#fdcb6e", fontSize: 14 }}>-{formatMoney(discountAmount, form.currency)}</span></div>}
          {extrasTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ color: "#00b894", fontSize: 13 }}>Extras</span><span style={{ color: "#00b894", fontSize: 14 }}>+{formatMoney(extrasTotal, form.currency)}</span></div>}
          {form.creditApplied > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ color: "#6366f1", fontSize: 13 }}>Credito cliente</span><span style={{ color: "#6366f1", fontSize: 14 }}>-{formatMoney(form.creditApplied, form.currency)}</span></div>}
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #e2e4e9", paddingTop: 8 }}>
            <span style={{ color: "#1a1a2e", fontSize: 15, fontWeight: 700 }}>A cobrar</span>
            <span style={{ color: "#00b894", fontSize: 18, fontWeight: 800 }}>{formatMoney(amountToPay, form.currency)}</span>
          </div>
        </div>

        {/* ===== PAYMENTS (toggle checkboxes + amount) ===== */}
        <div style={{ background: "#f0f1f8", border: "1px solid #6366f133", borderRadius: 10, padding: 14, marginBottom: 14 }}>
          {secLabel("💳", "Metodo de Pago", "#6366f1")}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {PAYMENT_METHODS.map(method => {
              const isActive = form.payments.some(p => p.method === method);
              const colors = { "Mercado Pago": "#009ee3", "Lemon": "#00c853", "USD Cash": "#2ecc71", "USDT": "#26a17b", "Pesos Cash": "#f59e0b" };
              const color = colors[method] || "#6366f1";
              return (
                <button key={method} onClick={() => togglePaymentMethod(method)}
                  style={{ padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `2px solid ${isActive ? color : "#e2e4e9"}`, background: isActive ? `${color}18` : "#fff", color: isActive ? color : "#6b7280", display: "flex", alignItems: "center", gap: 6, transition: "all .15s ease" }}>
                  <span style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${isActive ? color : "#d1d5db"}`, background: isActive ? color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .15s ease" }}>
                    {isActive && <span style={{ color: "#fff", fontSize: 12, lineHeight: 1 }}>✓</span>}
                  </span>
                  {method}
                </button>
              );
            })}
          </div>

          {form.payments.map(pay => (
            <div key={pay.method} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-end", flexWrap: isMobile ? "wrap" : "nowrap", background: "#fff", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e4e9" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e", minWidth: isMobile ? "100%" : 130, marginBottom: isMobile ? 4 : 0 }}>{pay.method}</span>
              {pay.method === "Mercado Pago" && <div style={{ flex: isMobile ? "1 100%" : 1 }}><Select label="" options={MP_ACCOUNTS} value={pay.account} onChange={e => updatePayment(pay.method, "account", e.target.value)} /></div>}
              <div style={{ flex: 1 }}>
                <Input label="" type="number" value={pay.amount} onChange={e => updatePayment(pay.method, "amount", e.target.value)}
                  placeholder={amountToPay > 0 ? formatMoney(Math.max(0, amountToPay - form.payments.filter(p => p.method !== pay.method).reduce((s, p) => s + (Number(p.amount) || 0), 0)), form.currency) : "0"} />
              </div>
              <button onClick={() => togglePaymentMethod(pay.method)} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
          ))}

          {form.payments.length === 0 && finalTotal > 0 && <span style={{ color: "#e74c3c", fontSize: 12 }}>Selecciona al menos un metodo de pago</span>}

          {form.payments.length === 1 && !form.payments[0].amount && amountToPay > 0 && (
            <button onClick={() => updatePayment(form.payments[0].method, "amount", amountToPay)}
              style={{ marginTop: 6, background: "#6366f111", border: "1px solid #6366f133", color: "#6366f1", padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, width: "100%" }}>
              Completar con {formatMoney(amountToPay, form.currency)}
            </button>
          )}

          {form.payments.length > 0 && totalPaid > 0 && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: "#fff", borderRadius: 8, border: "1px solid #e2e4e9" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "#6b7280" }}>Total pagado</span>
                <span style={{ fontWeight: 700, color: totalPaid >= amountToPay ? "#00b894" : "#e74c3c" }}>{formatMoney(totalPaid, form.currency)}</span>
              </div>
              {Math.abs(paymentDiff) > 0.5 && finalTotal > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4 }}>
                  <span style={{ color: paymentDiff > 0 ? "#f59e0b" : "#e74c3c" }}>{paymentDiff > 0 ? "Sobra (vuelto)" : "Falta"}</span>
                  <span style={{ fontWeight: 700, color: paymentDiff > 0 ? "#f59e0b" : "#e74c3c" }}>{formatMoney(Math.abs(paymentDiff), form.currency)}</span>
                </div>
              )}
            </div>
          )}

          {/* Overpaid + client */}
          {paymentDiff > 0.5 && form.clientId && (
            <div style={{ marginTop: 10, padding: "10px 12px", background: "#fff7ed", borderRadius: 8, border: "1px solid #f59e0b33" }}>
              <div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 700, marginBottom: 8 }}>Que hacer con los {formatMoney(paymentDiff, form.currency)} de vuelto?</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[{ v: "cash_change", l: "💵 Vuelto efectivo" }, { v: "transfer_change", l: "📱 Vuelto transfer." }, { v: "credit", l: "⭐ Dejar como credito" }].map(o => (
                  <button key={o.v} onClick={() => setForm(f => ({ ...f, balanceAction: o.v }))} style={{ padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer", border: `1px solid ${form.balanceAction === o.v ? "#f59e0b" : "#e2e4e9"}`, background: form.balanceAction === o.v ? "#f59e0b22" : "#fff", color: form.balanceAction === o.v ? "#f59e0b" : "#6b7280" }}>{o.l}</button>
                ))}
              </div>
              {form.balanceAction === "transfer_change" && <div style={{ marginTop: 8 }}><Select label="Cuenta de salida" options={[...MP_ACCOUNTS, "Lemon"]} value={form.balanceChangeAccount} onChange={e => setForm(f => ({ ...f, balanceChangeAccount: e.target.value }))} /></div>}
            </div>
          )}
          {paymentDiff > 0.5 && !form.clientId && (
            <div style={{ marginTop: 10, padding: "10px 12px", background: "#fff7ed", borderRadius: 8, border: "1px solid #f59e0b33" }}>
              <div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 700, marginBottom: 6 }}>Vuelto: {formatMoney(paymentDiff, form.currency)}</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[{ v: "cash_change", l: "💵 Efectivo" }, { v: "transfer_change", l: "📱 Transferencia" }].map(o => (
                  <button key={o.v} onClick={() => setForm(f => ({ ...f, balanceAction: o.v }))} style={{ padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer", border: `1px solid ${form.balanceAction === o.v ? "#f59e0b" : "#e2e4e9"}`, background: form.balanceAction === o.v ? "#f59e0b22" : "#fff", color: form.balanceAction === o.v ? "#f59e0b" : "#6b7280" }}>{o.l}</button>
                ))}
              </div>
            </div>
          )}
          {paymentDiff < -0.5 && form.clientId && (
            <div style={{ marginTop: 10, padding: "10px 12px", background: "#fef2f2", borderRadius: 8, border: "1px solid #e74c3c33" }}>
              <div style={{ fontSize: 12, color: "#e74c3c", fontWeight: 700, marginBottom: 8 }}>Faltan {formatMoney(Math.abs(paymentDiff), form.currency)}</div>
              <button onClick={() => setForm(f => ({ ...f, balanceAction: "debt" }))}
                style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${form.balanceAction === "debt" ? "#e74c3c" : "#e2e4e9"}`, background: form.balanceAction === "debt" ? "#e74c3c22" : "#fff", color: form.balanceAction === "debt" ? "#e74c3c" : "#6b7280" }}>Registrar como deuda del cliente</button>
            </div>
          )}
        </div>

        <Input label="Notas" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Opcional..." />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16, flexWrap: isMobile ? "wrap" : "nowrap" }}>
          <Btn variant="secondary" onClick={() => { setModal(false); setEditing(null); }} style={{ flex: isMobile ? "1" : "auto" }}>Cancelar</Btn>
          <Btn variant="success" onClick={save} style={{ flex: isMobile ? "1" : "auto" }}>{editing ? "Guardar Cambios" : "Registrar Venta"}</Btn>
        </div>
      </Modal>
    </div>
  );
};
