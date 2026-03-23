import { useState, useMemo } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { Modal, Card, Btn, Input, Select, Table, Badge, SearchBar, StatCard } from "./UI.jsx";
import { CHANNELS, PAYMENT_METHODS, MP_ACCOUNTS, DISCOUNT_REASONS } from "../constants.js";

// -- SALES --

const emptyForm = () => ({
  items: [{ productId: "", qty: 1 }],
  clientName: "", channel: "", paymentMethod: "", mpAccount: "", currency: "ARS", total: "",
  discountType: "none", discountValue: "", discountReason: "",
  extras: [],
  notes: "", date: new Date().toISOString().slice(0, 10)
});

export const Sales = ({ sales, setSales, products, setProducts, logStock, exchangeRate, currentUser }) => {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [filterChannel, setFilterChannel] = useState("");
  const [filterPayment, setFilterPayment] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { productId: "", qty: 1 }] }));
  const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  const updateItem = (i, field, val) => setForm(f => ({
    ...f, items: f.items.map((item, idx) => idx === i ? { ...item, [field]: val } : item)
  }));

  const totalQty = form.items.reduce((s, i) => s + (Number(i.qty) || 0), 0);

  const calcSubtotal = () => {
    let total = 0;
    form.items.forEach(item => {
      const prod = products.find(p => p.id === item.productId);
      if (prod) {
        const price = form.currency === "USD" ? (prod.priceUSD || 0) : Math.round((prod.priceUSD || 0) * exchangeRate);
        total += price * item.qty;
      }
    });
    return total;
  };

  const calcDiscount = (subtotal) => {
    if (form.discountType === "percent") return subtotal * (Number(form.discountValue) || 0) / 100;
    if (form.discountType === "fixed") return Number(form.discountValue) || 0;
    if (form.discountType === "per_unit") return (Number(form.discountValue) || 0) * totalQty;
    return 0;
  };

  const subtotal = calcSubtotal();
  const discountAmount = calcDiscount(subtotal);
  const extrasTotal = (form.extras || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const finalTotal = Math.max(0, subtotal - discountAmount + extrasTotal);

  // Auto-suggest volume discount
  const autoVolume = totalQty >= 3 && form.discountType === "none";

  const openNew = () => { setForm(emptyForm()); setEditing(null); setModal(true); };

  const openEdit = (sale) => {
    setForm({
      items: sale.items || [{ productId: "", qty: 1 }],
      clientName: sale.clientName || "",
      channel: sale.channel || "",
      paymentMethod: sale.paymentMethod || "",
      mpAccount: sale.mpAccount || "",
      currency: sale.currency || "ARS",
      total: sale.total || "",
      discountType: sale.discountType || "none",
      discountValue: sale.discountValue || "",
      discountReason: sale.discountReason || "",
      notes: sale.notes || "",
      date: sale.date ? sale.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
    });
    setEditing(sale.id);
    setModal(true);
  };

  const save = () => {
    if (form.items.some(i => !i.productId)) return;
    
    // Validate stock availability
    const stockCheck = {};
    // If editing, account for restored stock from original sale
    if (editing) {
      const original = sales.find(s => s.id === editing);
      if (original) (original.items || []).forEach(item => { stockCheck[item.productId] = (stockCheck[item.productId] || 0) + item.qty; });
    }
    for (const item of form.items) {
      const prod = products.find(p => p.id === item.productId);
      if (!prod) continue;
      const available = (prod.stock || 0) + (stockCheck[item.productId] || 0);
      if (item.qty > available) {
        alert(`No hay suficiente stock de ${prod.brand} ${prod.model} - ${prod.flavor}. Disponible: ${available}, pedido: ${item.qty}`);
        return;
      }
    }
    const total = form.total ? Number(form.total) : finalTotal;
    const saleData = {
      ...form, total, subtotal, discountAmount, extrasTotal,
      discountType: form.discountType, discountValue: Number(form.discountValue) || 0,
      discountReason: form.discountReason,
      date: form.date || new Date().toISOString(),
      createdBy: currentUser?.name || ""
    };

    if (editing) {
      // Restore stock from original sale
      const original = sales.find(s => s.id === editing);
      if (original) {
        (original.items || []).forEach(item => {
          setProducts(prev => prev.map(p => p.id === item.productId ? { ...p, stock: (p.stock || 0) + item.qty } : p));
        });
      }
      // Decrease stock with new items
      form.items.forEach(item => {
        setProducts(prev => prev.map(p => p.id === item.productId ? { ...p, stock: Math.max(0, (p.stock || 0) - item.qty) } : p));
      });
      setSales(prev => prev.map(s => s.id === editing ? { ...saleData, id: editing } : s));
    } else {
      // New sale
      form.items.forEach(item => {
        setProducts(prev => prev.map(p => p.id === item.productId ? { ...p, stock: Math.max(0, (p.stock || 0) - item.qty) } : p));
      });
      const saleId = uid();
      form.items.forEach(item => {
        logStock({ productId: item.productId, type: "venta", qty: -item.qty, reason: `Venta a ${form.clientName || "sin nombre"}`, refId: saleId, date: form.date });
      });
      setSales(prev => [{ ...saleData, id: saleId }, ...prev]);
    }

    setModal(false);
    setForm(emptyForm());
    setEditing(null);
  };

  const [confirmDeleteSale, setConfirmDeleteSale] = useState(null);
  const deleteSale = (sale) => {
    if (confirmDeleteSale !== sale.id) { setConfirmDeleteSale(sale.id); setTimeout(() => setConfirmDeleteSale(null), 3000); return; }
    setConfirmDeleteSale(null);
    // Restore stock
    (sale.items || []).forEach(item => {
      setProducts(prev => prev.map(p => p.id === item.productId ? { ...p, stock: (p.stock || 0) + item.qty } : p));
    });
    setSales(prev => prev.filter(s => s.id !== sale.id));
  };

  const filtered = sales.filter(s => {
    const itemNames = (s.items || []).map(i => {
      const p = products.find(pr => pr.id === i.productId);
      return p ? `${p.brand} ${p.model} ${p.flavor}` : "";
    }).join(" ");
    const matchSearch = !search || itemNames.toLowerCase().includes(search.toLowerCase()) || (s.clientName || "").toLowerCase().includes(search.toLowerCase());
    const matchChannel = !filterChannel || s.channel === filterChannel;
    const matchPayment = !filterPayment || s.paymentMethod === filterPayment;
    const matchDateFrom = !filterDateFrom || s.date >= filterDateFrom;
    const matchDateTo = !filterDateTo || s.date <= filterDateTo;
    return matchSearch && matchChannel && matchPayment && matchDateFrom && matchDateTo;
  });

  const hasActiveFilters = filterChannel || filterPayment || filterDateFrom || filterDateTo;
  const clearFilters = () => { setFilterChannel(""); setFilterPayment(""); setFilterDateFrom(""); setFilterDateTo(""); };

  const filteredRevenue = filtered.reduce((s, sale) => s + (sale.total || 0), 0);

  const totalDiscountsMonth = useMemo(() => {
    const now = new Date();
    return sales.filter(s => {
      const d = new Date(s.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && (s.discountAmount || 0) > 0;
    }).reduce((sum, s) => sum + (s.discountAmount || 0), 0);
  }, [sales]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: "#e0e0ff", margin: 0, fontSize: 22 }}>Ventas ({filtered.length}{filtered.length !== sales.length ? `/${sales.length}` : ""})</h2>
          {filtered.length > 0 && <span style={{ color: "#6666aa", fontSize: 13 }}>Total filtrado: {formatMoney(filteredRevenue)}</span>}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar producto o cliente..." />
          <Btn variant="secondary" onClick={() => setShowFilters(!showFilters)} style={{ padding: "10px 14px", border: hasActiveFilters ? "1px solid #a855f7" : undefined }}>
            🔍 Filtros {hasActiveFilters ? "●" : ""}
          </Btn>
          <Btn onClick={openNew}>+ Nueva Venta</Btn>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <Card style={{ marginBottom: 14, background: "#12122a", border: "1px solid #2a2a4a" }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 130 }}>
              <Input label="Desde" type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <Input label="Hasta" type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <Select label="Canal" options={CHANNELS} value={filterChannel} onChange={e => setFilterChannel(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <Select label="Método de pago" options={PAYMENT_METHODS} value={filterPayment} onChange={e => setFilterPayment(e.target.value)} />
            </div>
            {hasActiveFilters && (
              <button onClick={clearFilters} style={{ background: "none", border: "1px solid #e74c3c55", color: "#e74c3c", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, marginBottom: 14 }}>
                ✕ Limpiar
              </button>
            )}
          </div>
        </Card>
      )}

      {totalDiscountsMonth > 0 && (
        <Card style={{ marginBottom: 14, background: "#1a1a2e", borderColor: "#fdcb6e33" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>🏷️</span>
            <span style={{ color: "#fdcb6e", fontSize: 13 }}>Descuentos otorgados este mes: <strong>{formatMoney(totalDiscountsMonth)}</strong></span>
          </div>
        </Card>
      )}

      <Card>
        <Table
          columns={[
            { key: "date", label: "Fecha", render: r => formatDate(r.date) },
            { key: "items", label: "Productos", render: r => (r.items || []).map(i => {
              const p = products.find(pr => pr.id === i.productId);
              return p ? `${p.brand} ${p.model} (x${i.qty})` : "?";
            }).join(", ") },
            { key: "client", label: "Cliente", render: r => r.clientName || "-" },
            { key: "channel", label: "Canal", render: r => <Badge>{r.channel || "-"}</Badge> },
            { key: "payment", label: "Pago", render: r => r.paymentMethod + (r.mpAccount ? ` (${r.mpAccount})` : "") },
            { key: "discount", label: "Desc.", render: r => (r.discountAmount || 0) > 0
              ? <Badge color="#fdcb6e">-{formatMoney(r.discountAmount, r.currency)}</Badge>
              : <span style={{ color: "#444" }}>—</span>
            },
            { key: "total", label: "Total", render: r => formatMoney(r.total, r.currency) },
            { key: "actions", label: "", render: r => (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} style={{ background: "none", border: "none", color: "#a855f7", cursor: "pointer", fontSize: 16 }} title="Editar">✏️</button>
                {confirmDeleteSale === r.id
                ? <button onClick={(e) => { e.stopPropagation(); deleteSale(r); }} style={{ background: "#e74c3c22", border: "1px solid #e74c3c55", color: "#e74c3c", padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Confirmar</button>
                : <button onClick={(e) => { e.stopPropagation(); deleteSale(r); }} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 16 }} title="Eliminar">🗑️</button>
              }
              </div>
            )},
          ]}
          data={filtered}
          emptyMsg="No hay ventas registradas"
        />
      </Card>

      <Modal open={modal} onClose={() => { setModal(false); setEditing(null); }} title={editing ? "Editar Venta" : "Nueva Venta"}>
        <Input label="Fecha" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        
        <label style={{ display: "block", fontSize: 12, color: "#8888aa", marginBottom: 8, fontWeight: 600, textTransform: "uppercase" }}>Productos</label>
        {form.items.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-end" }}>
            <div style={{ flex: 2 }}>
              <Select options={[...products].filter(p => p.stock > 0).sort((a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model) || a.flavor.localeCompare(b.flavor)).map(p => ({ value: p.id, label: `${p.brand} ${p.model} - ${p.flavor} (${p.puffs}p) [${p.stock}]` }))}
                value={item.productId} onChange={e => updateItem(i, "productId", e.target.value)} />
            </div>
            <div style={{ flex: 0.5 }}>
              <Input type="number" value={item.qty} min={1} onChange={e => updateItem(i, "qty", Number(e.target.value))} />
            </div>
            {form.items.length > 1 && <button onClick={() => removeItem(i)} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 18, marginBottom: 14 }}>✕</button>}
          </div>
        ))}
        <button onClick={addItem} style={{ background: "none", border: "1px dashed #2a2a4a", color: "#a855f7", padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, marginBottom: 14 }}>+ Agregar producto</button>

        {autoVolume && (
          <div style={{
            background: "#fdcb6e15", border: "1px solid #fdcb6e33", borderRadius: 10, padding: "10px 14px",
            marginBottom: 14, display: "flex", alignItems: "center", gap: 8
          }}>
            <span style={{ fontSize: 16 }}>💡</span>
            <span style={{ color: "#fdcb6e", fontSize: 13 }}>Comprando {totalQty} unidades — ¿aplicar descuento por volumen?</span>
            <button onClick={() => setForm(f => ({ ...f, discountType: "percent", discountReason: "Volumen (3+)" }))}
              style={{ marginLeft: "auto", background: "#fdcb6e22", border: "1px solid #fdcb6e55", color: "#fdcb6e", padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
              Aplicar
            </button>
          </div>
        )}

        <Input label="Cliente" placeholder="Nombre del cliente..." value={form.clientName || ""} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} />
        <Select label="Canal" options={CHANNELS} value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))} />

        <div style={{ display: "flex", gap: 12 }}>
          <Select label="Forma de pago" options={PAYMENT_METHODS} value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))} />
          {form.paymentMethod === "Mercado Pago" && (
            <Select label="Cuenta MP" options={MP_ACCOUNTS} value={form.mpAccount} onChange={e => setForm(f => ({ ...f, mpAccount: e.target.value }))} />
          )}
        </div>

        <Select label="Moneda" options={["ARS", "USD", "USDT"]} value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} />

        {/* DISCOUNT SECTION */}
        <div style={{
          background: "#12122a", border: "1px solid #2a2a4a", borderRadius: 10, padding: 14, marginBottom: 14
        }}>
          <label style={{ display: "block", fontSize: 12, color: "#fdcb6e", marginBottom: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>🏷️ Descuento</label>
          
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            {[
              { value: "none", label: "Sin descuento" },
              { value: "percent", label: "% Porcentaje" },
              { value: "fixed", label: "$ Monto fijo" },
              { value: "per_unit", label: "$/u Por unidad" },
            ].map(opt => (
              <button key={opt.value} onClick={() => setForm(f => ({ ...f, discountType: opt.value, discountValue: opt.value === "none" ? "" : f.discountValue }))}
                style={{
                  padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  border: `1px solid ${form.discountType === opt.value ? "#fdcb6e" : "#2a2a4a"}`,
                  background: form.discountType === opt.value ? "#fdcb6e22" : "transparent",
                  color: form.discountType === opt.value ? "#fdcb6e" : "#6666aa"
                }}>{opt.label}</button>
            ))}
          </div>

          {form.discountType !== "none" && (
            <>
              <div style={{ display: "flex", gap: 12 }}>
                <Input
                  label={form.discountType === "percent" ? "Porcentaje (%)" : form.discountType === "per_unit" ? `Descuento por unidad (${form.currency})` : `Monto fijo (${form.currency})`}
                  type="number" value={form.discountValue}
                  onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))}
                  placeholder={form.discountType === "percent" ? "ej: 10" : "ej: 5000"}
                />
                <Select label="Motivo" options={DISCOUNT_REASONS} value={form.discountReason}
                  onChange={e => setForm(f => ({ ...f, discountReason: e.target.value }))} />
              </div>
              {discountAmount > 0 && (
                <div style={{ color: "#fdcb6e", fontSize: 13, marginTop: 4 }}>
                  Descuento: <strong>-{formatMoney(discountAmount, form.currency)}</strong>
                  {form.discountType === "percent" && ` (${form.discountValue}% de ${formatMoney(subtotal, form.currency)})`}
                  {form.discountType === "per_unit" && ` (${formatMoney(form.discountValue, form.currency)} x ${totalQty} uds)`}
                </div>
              )}
            </>
          )}
        </div>

        {/* EXTRAS SECTION */}
        <div style={{
          background: "#12122a", border: "1px solid #2a2a4a", borderRadius: 10, padding: 14, marginBottom: 14
        }}>
          <label style={{ display: "block", fontSize: 12, color: "#00b894", marginBottom: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>➕ Extras</label>
          {(form.extras || []).map((extra, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-end" }}>
              <div style={{ flex: 2 }}>
                <Input placeholder="Concepto (envío, propina, etc.)" value={extra.concept} onChange={e => setForm(f => ({ ...f, extras: f.extras.map((ex, j) => j === i ? { ...ex, concept: e.target.value } : ex) }))} />
              </div>
              <div style={{ flex: 0.7 }}>
                <Input type="number" placeholder="Monto" value={extra.amount} onChange={e => setForm(f => ({ ...f, extras: f.extras.map((ex, j) => j === i ? { ...ex, amount: e.target.value } : ex) }))} />
              </div>
              <button onClick={() => setForm(f => ({ ...f, extras: f.extras.filter((_, j) => j !== i) }))} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 16, marginBottom: 14 }}>✕</button>
            </div>
          ))}
          <button onClick={() => setForm(f => ({ ...f, extras: [...(f.extras || []), { concept: "", amount: "" }] }))}
            style={{ background: "none", border: "1px dashed #00b89444", color: "#00b894", padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 11, width: "100%" }}>
            + Agregar extra
          </button>
          {extrasTotal > 0 && <div style={{ color: "#00b894", fontSize: 13, marginTop: 6 }}>Extras: <strong>+{formatMoney(extrasTotal, form.currency)}</strong></div>}
        </div>

        {/* TOTALS */}
        <div style={{
          background: "#0d0d1a", borderRadius: 10, padding: 14, marginBottom: 14,
          border: "1px solid #2a2a4a"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ color: "#6666aa", fontSize: 13 }}>Subtotal</span>
            <span style={{ color: "#c0c0e0", fontSize: 14 }}>{formatMoney(subtotal, form.currency)}</span>
          </div>
          {discountAmount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ color: "#fdcb6e", fontSize: 13 }}>Descuento {form.discountReason ? `(${form.discountReason})` : ""}</span>
              <span style={{ color: "#fdcb6e", fontSize: 14 }}>-{formatMoney(discountAmount, form.currency)}</span>
            </div>
          )}
          {extrasTotal > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ color: "#00b894", fontSize: 13 }}>Extras ({(form.extras || []).filter(e => Number(e.amount) > 0).map(e => e.concept || "extra").join(", ")})</span>
              <span style={{ color: "#00b894", fontSize: 14 }}>+{formatMoney(extrasTotal, form.currency)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #2a2a4a", paddingTop: 8 }}>
            <span style={{ color: "#e0e0ff", fontSize: 15, fontWeight: 700 }}>Total</span>
            <span style={{ color: "#00b894", fontSize: 18, fontWeight: 800 }}>{formatMoney(finalTotal, form.currency)}</span>
          </div>
        </div>

        <Input label="Notas" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Opcional..." />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => { setModal(false); setEditing(null); }}>Cancelar</Btn>
          <Btn variant="success" onClick={save}>{editing ? "Guardar Cambios" : "Registrar Venta"}</Btn>
        </div>
      </Modal>
    </div>
  );
};
