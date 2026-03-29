import { useState, useMemo, useCallback } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Modal, Card, Btn, Input, Select, Table, Badge, SearchBar, StatCard } from "./UI.jsx";
import { CHANNELS, PAYMENT_METHODS, MP_ACCOUNTS, DISCOUNT_REASONS, BRAND_COLORS } from "../constants.js";

// ============================================
// SALES v2 — Full rewrite
// Features:
//   - Cascading product picker: Brand → Model → Flavor (with stock)
//   - Mixed payment (split across multiple methods)
//   - Client selector with inline creation
//   - Debt tracking (client owes / store owes)
//   - Change (vuelto) with account selection
//   - Mobile-first responsive
// ============================================

// ---- helpers ----
const ACCOUNT_MAP = {
  "Pesos Cash": "pesosCash",
  "Mercado Pago": null, // depends on mpAccount
  "Lemon": "lemonPesos",
  "USD Cash": "usdCash",
  "USDT": "lemonUSDT",
};
const resolveAccount = (method, mpAccount) => {
  if (method === "Mercado Pago") return mpAccount === "MP Diego" ? "mpDiego" : mpAccount === "MP Gustavo" ? "mpGustavo" : "";
  return ACCOUNT_MAP[method] || "";
};

const emptyPayment = () => ({ method: "", mpAccount: "", amount: "" });

const emptyForm = () => ({
  items: [{ brand: "", model: "", productId: "", qty: 1 }],
  clientId: "", clientName: "", clientPhone: "", clientInstagram: "", isNewClient: false,
  channel: "", currency: "ARS",
  payments: [emptyPayment()],
  discountType: "none", discountValue: "", discountReason: "",
  extras: [],
  // Change (vuelto)
  changeAmount: 0, changeMethod: "", changeMpAccount: "",
  // Debt
  debtAmount: 0, debtDirection: "", // "clientOwes" | "storeOwes"
  notes: "", date: new Date().toISOString().slice(0, 10),
});

export const Sales = ({
  sales, setSales, products, setProducts, logStock, exchangeRate, currentUser, logAudit,
  clients, setClients, cashMovements, setCashMovements,
}) => {
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
  const [step, setStep] = useState(1); // 1=products, 2=client+payment, 3=review
  const [clientSearch, setClientSearch] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  // ---- derived data from products ----
  const availableProducts = useMemo(() => products.filter(p => !p.isDeleted && p.stock > 0), [products]);
  const brands = useMemo(() => [...new Set(availableProducts.map(p => p.brand))].sort(), [availableProducts]);

  const getModels = useCallback((brand) => {
    return [...new Set(availableProducts.filter(p => p.brand === brand).map(p => p.model))].sort();
  }, [availableProducts]);

  const getFlavors = useCallback((brand, model) => {
    return availableProducts.filter(p => p.brand === brand && p.model === model).sort((a, b) => a.flavor.localeCompare(b.flavor));
  }, [availableProducts]);

  // ---- item management ----
  const updateItem = (i, field, val) => {
    setForm(f => {
      const items = [...f.items];
      items[i] = { ...items[i], [field]: val };
      // Cascade: clear downstream when upstream changes
      if (field === "brand") { items[i].model = ""; items[i].productId = ""; items[i].qty = 1; }
      if (field === "model") { items[i].productId = ""; items[i].qty = 1; }
      return { ...f, items };
    });
  };
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { brand: "", model: "", productId: "", qty: 1 }] }));
  const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

  // ---- payment management ----
  const addPayment = () => setForm(f => ({ ...f, payments: [...f.payments, emptyPayment()] }));
  const removePayment = (i) => setForm(f => ({ ...f, payments: f.payments.filter((_, idx) => idx !== i) }));
  const updatePayment = (i, field, val) => {
    setForm(f => ({ ...f, payments: f.payments.map((p, idx) => idx === i ? { ...p, [field]: val } : p) }));
  };

  // ---- calculations ----
  const totalQty = form.items.reduce((s, i) => s + (Number(i.qty) || 0), 0);

  const calcSubtotal = () => {
    let total = 0;
    form.items.forEach(item => {
      const prod = products.find(p => p.id === item.productId);
      if (prod) {
        const price = form.currency === "USD" ? (prod.priceUSD || 0) : Math.round((prod.priceUSD || 0) * exchangeRate);
        total += price * (Number(item.qty) || 0);
      }
    });
    return total;
  };

  const calcDiscount = (sub) => {
    if (form.discountType === "percent") return sub * (Number(form.discountValue) || 0) / 100;
    if (form.discountType === "fixed") return Number(form.discountValue) || 0;
    if (form.discountType === "per_unit") return (Number(form.discountValue) || 0) * totalQty;
    return 0;
  };

  const subtotal = calcSubtotal();
  const discountAmount = calcDiscount(subtotal);
  const extrasTotal = (form.extras || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const finalTotal = Math.max(0, subtotal - discountAmount + extrasTotal);

  // ---- client credit: check if client has a balance (positive = store owes them) ----
  const clientCredit = useMemo(() => {
    if (!form.clientId) return 0;
    const c = (clients || []).find(cl => cl.id === form.clientId);
    return c?.balance || 0;
  }, [form.clientId, clients]);

  // ---- payment totals ----
  const totalPaid = form.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const effectiveTotal = finalTotal - (clientCredit > 0 ? Math.min(clientCredit, finalTotal) : 0);
  const difference = totalPaid - effectiveTotal; // positive = overpaid (change), negative = underpaid (debt)

  const autoVolume = totalQty >= 3 && form.discountType === "none";

  // ---- client search ----
  const filteredClients = useMemo(() => {
    if (!clientSearch || clientSearch.length < 1) return [];
    const q = clientSearch.toLowerCase();
    return (clients || []).filter(c =>
      c.name?.toLowerCase().includes(q) ||
      (c.phone || "").includes(q) ||
      (c.instagram || "").toLowerCase().includes(q)
    ).slice(0, 8);
  }, [clientSearch, clients]);

  // ---- open / close ----
  const openNew = () => {
    setForm(emptyForm());
    setEditing(null);
    setStep(1);
    setClientSearch("");
    setModal(true);
  };

  const openEdit = (sale) => {
    // Reconstruct form from saved sale
    const items = (sale.items || []).map(i => {
      const prod = products.find(p => p.id === i.productId);
      return {
        brand: prod?.brand || "",
        model: prod?.model || "",
        productId: i.productId || "",
        qty: i.qty || 1,
      };
    });
    const payments = (sale.payments || []).length > 0 ? sale.payments : [{ method: sale.paymentMethod || "", mpAccount: sale.mpAccount || "", amount: String(sale.total || "") }];
    setForm({
      items: items.length > 0 ? items : [{ brand: "", model: "", productId: "", qty: 1 }],
      clientId: sale.clientId || "",
      clientName: sale.clientName || "",
      clientPhone: "", clientInstagram: "", isNewClient: false,
      channel: sale.channel || "",
      currency: sale.currency || "ARS",
      payments,
      discountType: sale.discountType || "none",
      discountValue: sale.discountValue ? String(sale.discountValue) : "",
      discountReason: sale.discountReason || "",
      extras: sale.extras || [],
      changeAmount: sale.changeAmount || 0,
      changeMethod: sale.changeMethod || "",
      changeMpAccount: sale.changeMpAccount || "",
      debtAmount: sale.debtAmount || 0,
      debtDirection: sale.debtDirection || "",
      notes: sale.notes || "",
      date: sale.date ? sale.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    });
    if (sale.clientName) setClientSearch(sale.clientName);
    setEditing(sale.id);
    setStep(1);
    setModal(true);
  };

  // ---- SAVE ----
  const save = () => {
    // Validate: at least 1 product selected
    if (form.items.every(i => !i.productId)) return alert("Seleccioná al menos un producto.");
    const validItems = form.items.filter(i => i.productId);

    // Validate stock
    const stockCheck = {};
    if (editing) {
      const original = sales.find(s => s.id === editing);
      if (original) (original.items || []).forEach(item => { stockCheck[item.productId] = (stockCheck[item.productId] || 0) + item.qty; });
    }
    for (const item of validItems) {
      const prod = products.find(p => p.id === item.productId);
      if (!prod) continue;
      const available = (prod.stock || 0) + (stockCheck[item.productId] || 0);
      if (item.qty > available) {
        alert(`No hay suficiente stock de ${prod.brand} ${prod.model} - ${prod.flavor}. Disponible: ${available}, pedido: ${item.qty}`);
        return;
      }
    }

    // Determine debt/change
    let changeAmt = 0, changeMethod = form.changeMethod, changeMpAccount = form.changeMpAccount;
    let debtAmt = 0, debtDir = "";
    const creditUsed = clientCredit > 0 ? Math.min(clientCredit, finalTotal) : 0;

    if (difference > 0) {
      // Customer overpaid → change (vuelto)
      changeAmt = difference;
      if (!changeMethod) {
        alert("El cliente pagó de más. Elegí cómo darle el vuelto.");
        return;
      }
    } else if (difference < 0) {
      // Underpaid → debt
      debtAmt = Math.abs(difference);
      debtDir = "clientOwes";
    }

    const saleId = editing || uid();
    const total = finalTotal;

    // Build sale data
    const saleData = {
      id: saleId,
      items: validItems.map(i => ({ productId: i.productId, qty: Number(i.qty) || 1 })),
      clientId: form.clientId || "",
      clientName: form.clientName || "",
      channel: form.channel,
      currency: form.currency,
      payments: form.payments.filter(p => p.method && Number(p.amount) > 0),
      // Keep legacy fields for CashBox compatibility
      paymentMethod: form.payments[0]?.method || "",
      mpAccount: form.payments[0]?.mpAccount || "",
      total,
      subtotal,
      discountType: form.discountType,
      discountValue: Number(form.discountValue) || 0,
      discountAmount,
      discountReason: form.discountReason,
      extrasTotal,
      extras: form.extras,
      creditUsed,
      changeAmount: changeAmt,
      changeMethod,
      changeMpAccount,
      debtAmount: debtAmt,
      debtDirection: debtDir,
      totalPaid,
      notes: form.notes,
      date: form.date || new Date().toISOString(),
      createdBy: currentUser?.name || "",
    };

    // ---- Execute ----
    if (editing) {
      // Restore stock from original
      const original = sales.find(s => s.id === editing);
      if (original) {
        (original.items || []).forEach(item => {
          setProducts(prev => prev.map(p => p.id === item.productId ? { ...p, stock: (p.stock || 0) + item.qty } : p));
        });
      }
    }

    // Deduct stock
    validItems.forEach(item => {
      setProducts(prev => prev.map(p => p.id === item.productId ? { ...p, stock: Math.max(0, (p.stock || 0) - (Number(item.qty) || 1)) } : p));
    });

    if (editing) {
      setSales(prev => prev.map(s => s.id === editing ? saleData : s));
      if (logAudit) logAudit("update", "sale", editing, `Editó venta: ${form.clientName || "sin nombre"} · ${formatMoney(total, form.currency)}`);
    } else {
      // Log stock
      validItems.forEach(item => {
        logStock({ productId: item.productId, type: "venta", qty: -(Number(item.qty) || 1), reason: `Venta a ${form.clientName || "sin nombre"}`, refId: saleId, date: form.date });
      });
      setSales(prev => [saleData, ...prev]);
      if (logAudit) logAudit("create", "sale", saleId, `Creó venta: ${form.clientName || "sin nombre"} · ${formatMoney(total, form.currency)}`);
    }

    // ---- Create/update client ----
    if (form.isNewClient && form.clientName) {
      const newClientId = uid();
      const newClient = {
        id: newClientId,
        name: form.clientName,
        phone: form.clientPhone || "",
        instagram: form.clientInstagram || "",
        notes: "",
        balance: debtDir === "clientOwes" ? -(debtAmt) : changeAmt > 0 ? changeAmt : 0,
      };
      // If change given as store credit → store owes client
      if (changeAmt > 0 && changeMethod === "credit") {
        newClient.balance = changeAmt;
      }
      setClients(prev => [...prev, newClient]);
      // Update the sale with the new client ID
      setSales(prev => prev.map(s => s.id === saleId ? { ...s, clientId: newClientId } : s));
    } else if (form.clientId) {
      // Update existing client balance
      setClients(prev => prev.map(c => {
        if (c.id !== form.clientId) return c;
        let newBalance = (c.balance || 0);
        // Subtract credit used
        if (creditUsed > 0) newBalance -= creditUsed;
        // Add debt (client owes → negative balance)
        if (debtDir === "clientOwes") newBalance -= debtAmt;
        // Add change as credit if method is "credit"
        if (changeAmt > 0 && changeMethod === "credit") newBalance += changeAmt;
        return { ...c, balance: Math.round(newBalance * 100) / 100 };
      }));
    }

    // ---- Register change (vuelto) as cash movement ----
    if (changeAmt > 0 && changeMethod && changeMethod !== "credit") {
      const fromAccount = resolveAccount(changeMethod, changeMpAccount);
      if (fromAccount) {
        const movId = uid();
        const movement = {
          id: movId,
          type: "withdrawal",
          from: fromAccount,
          to: "",
          amount: changeAmt,
          amountUSDT: 0,
          description: `Vuelto venta a ${form.clientName || "cliente"} (ref: ${saleId.slice(-6)})`,
          date: form.date || new Date().toISOString().slice(0, 10),
          saleRef: saleId,
          createdBy: currentUser?.name || "",
        };
        setCashMovements(prev => [movement, ...prev]);
      }
    }

    setModal(false);
    setForm(emptyForm());
    setEditing(null);
    setStep(1);
    setClientSearch("");
  };

  // ---- DELETE ----
  const [confirmDeleteSale, setConfirmDeleteSale] = useState(null);
  const deleteSale = (sale) => {
    if (confirmDeleteSale !== sale.id) { setConfirmDeleteSale(sale.id); setTimeout(() => setConfirmDeleteSale(null), 3000); return; }
    setConfirmDeleteSale(null);
    // Restore stock
    (sale.items || []).forEach(item => {
      setProducts(prev => prev.map(p => p.id === item.productId ? { ...p, stock: (p.stock || 0) + (item.qty || 1) } : p));
    });
    // Restore client balance if there was debt
    if (sale.clientId && sale.debtAmount > 0) {
      setClients(prev => prev.map(c => c.id === sale.clientId ? { ...c, balance: (c.balance || 0) + sale.debtAmount } : c));
    }
    setSales(prev => prev.map(s => s.id === sale.id ? { ...s, isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: currentUser?.name || "?" } : s));
    if (logAudit) logAudit("delete", "sale", sale.id, `Eliminó venta: ${sale.clientName || "sin nombre"} · ${formatMoney(sale.total, sale.currency)}`);
  };

  // ---- list / filter ----
  const activeSales = sales.filter(s => !s.isDeleted);
  const filtered = activeSales.filter(s => {
    const itemNames = (s.items || []).map(i => {
      const p = products.find(pr => pr.id === i.productId);
      return p ? `${p.brand} ${p.model} ${p.flavor}` : "";
    }).join(" ");
    const matchSearch = !search || itemNames.toLowerCase().includes(search.toLowerCase()) || (s.clientName || "").toLowerCase().includes(search.toLowerCase());
    const matchChannel = !filterChannel || s.channel === filterChannel;
    const matchPayment = !filterPayment || (s.payments || []).some(p => p.method === filterPayment) || s.paymentMethod === filterPayment;
    const matchDateFrom = !filterDateFrom || s.date >= filterDateFrom;
    const matchDateTo = !filterDateTo || s.date <= filterDateTo;
    return matchSearch && matchChannel && matchPayment && matchDateFrom && matchDateTo;
  });

  const hasActiveFilters = filterChannel || filterPayment || filterDateFrom || filterDateTo;
  const clearFilters = () => { setFilterChannel(""); setFilterPayment(""); setFilterDateFrom(""); setFilterDateTo(""); };
  const filteredRevenue = filtered.reduce((s, sale) => s + (sale.total || 0), 0);

  const totalDiscountsMonth = useMemo(() => {
    const now = new Date();
    return activeSales.filter(s => {
      const d = new Date(s.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && (s.discountAmount || 0) > 0;
    }).reduce((sum, s) => sum + (s.discountAmount || 0), 0);
  }, [activeSales]);

  // ============================================
  // RENDER
  // ============================================

  const chipStyle = (active) => ({
    padding: "7px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer",
    border: `1.5px solid ${active ? "#6366f1" : "#e2e4e9"}`,
    background: active ? "#6366f1" : "#fff",
    color: active ? "#fff" : "#4b5563",
    transition: "all .15s",
    whiteSpace: "nowrap",
  });

  // ---- Product picker (cascading) ----
  const renderProductPicker = () => (
    <div>
      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
        Productos ({totalQty} {totalQty === 1 ? "unidad" : "unidades"})
      </label>

      {form.items.map((item, i) => {
        const modelsForBrand = item.brand ? getModels(item.brand) : [];
        const flavorsForModel = item.brand && item.model ? getFlavors(item.brand, item.model) : [];
        const selectedProd = item.productId ? products.find(p => p.id === item.productId) : null;
        const priceDisplay = selectedProd ? (form.currency === "USD" ? formatMoney(selectedProd.priceUSD, "USD") : formatMoney(Math.round(selectedProd.priceUSD * exchangeRate))) : "";

        return (
          <div key={i} style={{
            background: "#f9fafb", border: "1px solid #e2e4e9", borderRadius: 12, padding: isMobile ? 12 : 14,
            marginBottom: 10, position: "relative",
          }}>
            {form.items.length > 1 && (
              <button onClick={() => removeItem(i)} style={{
                position: "absolute", top: 8, right: 8, background: "none", border: "none",
                color: "#e74c3c", cursor: "pointer", fontSize: 16, lineHeight: 1,
              }}>✕</button>
            )}

            {/* Row 1: Brand chips */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6, fontWeight: 600 }}>MARCA</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {brands.map(b => (
                  <button key={b} onClick={() => updateItem(i, "brand", b)}
                    style={{
                      ...chipStyle(item.brand === b),
                      ...(item.brand === b ? { background: BRAND_COLORS[b] || "#6366f1", borderColor: BRAND_COLORS[b] || "#6366f1" } : {}),
                    }}>
                    {b}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 2: Model chips */}
            {item.brand && modelsForBrand.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6, fontWeight: 600 }}>MODELO</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {modelsForBrand.map(m => {
                    const stockForModel = availableProducts.filter(p => p.brand === item.brand && p.model === m).reduce((s, p) => s + p.stock, 0);
                    return (
                      <button key={m} onClick={() => updateItem(i, "model", m)}
                        style={chipStyle(item.model === m)}>
                        {m} <span style={{ opacity: 0.6, fontSize: 11 }}>({stockForModel})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Row 3: Flavor picker */}
            {item.brand && item.model && flavorsForModel.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6, fontWeight: 600 }}>SABOR</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {flavorsForModel.map(p => (
                    <button key={p.id} onClick={() => updateItem(i, "productId", p.id)}
                      style={{
                        ...chipStyle(item.productId === p.id),
                        fontSize: 12,
                        padding: "5px 10px",
                      }}>
                      {p.flavor} <span style={{ opacity: 0.6, fontSize: 10, marginLeft: 2 }}>({p.stock})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Row 4: Qty + price */}
            {selectedProd && (
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => updateItem(i, "qty", Math.max(1, (item.qty || 1) - 1))}
                    style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #e2e4e9", background: "#fff", cursor: "pointer", fontSize: 16, fontWeight: 700 }}>−</button>
                  <span style={{ fontSize: 18, fontWeight: 800, minWidth: 28, textAlign: "center" }}>{item.qty || 1}</span>
                  <button onClick={() => updateItem(i, "qty", Math.min(selectedProd.stock, (item.qty || 1) + 1))}
                    style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #e2e4e9", background: "#fff", cursor: "pointer", fontSize: 16, fontWeight: 700 }}>+</button>
                </div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  {priceDisplay}/u · Stock: <strong>{selectedProd.stock}</strong> · {selectedProd.puffs}p
                </div>
                <div style={{ marginLeft: "auto", fontSize: 16, fontWeight: 800, color: "#10b981" }}>
                  {form.currency === "USD"
                    ? formatMoney(selectedProd.priceUSD * (item.qty || 1), "USD")
                    : formatMoney(Math.round(selectedProd.priceUSD * exchangeRate) * (item.qty || 1))
                  }
                </div>
              </div>
            )}
          </div>
        );
      })}

      <button onClick={addItem} style={{
        background: "none", border: "2px dashed #e2e4e9", color: "#6366f1", padding: "10px 14px",
        borderRadius: 10, cursor: "pointer", fontSize: 13, width: "100%", fontWeight: 600,
        transition: "border-color .15s",
      }}>+ Agregar otro producto</button>

      {/* Volume discount suggestion */}
      {autoVolume && (
        <div style={{
          background: "#fdcb6e15", border: "1px solid #fdcb6e33", borderRadius: 10, padding: "10px 14px",
          marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 16 }}>💡</span>
          <span style={{ color: "#b8860b", fontSize: 13 }}>Comprando {totalQty} unidades — ¿aplicar descuento por volumen?</span>
          <button onClick={() => setForm(f => ({ ...f, discountType: "percent", discountReason: "Volumen (3+)" }))}
            style={{ marginLeft: "auto", background: "#fdcb6e22", border: "1px solid #fdcb6e55", color: "#b8860b", padding: "5px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
            Aplicar
          </button>
        </div>
      )}
    </div>
  );

  // ---- Client selector ----
  const renderClientSelector = () => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
        Cliente
      </label>

      {form.clientId ? (
        // Selected client
        <div style={{
          display: "flex", alignItems: "center", gap: 10, background: "#f0fdf4", border: "1px solid #bbf7d0",
          borderRadius: 10, padding: "10px 14px",
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%", background: "#10b981", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flexShrink: 0,
          }}>{form.clientName.charAt(0).toUpperCase()}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a2e" }}>{form.clientName}</div>
            {clientCredit !== 0 && (
              <div style={{ fontSize: 12, color: clientCredit > 0 ? "#10b981" : "#e74c3c", fontWeight: 600 }}>
                {clientCredit > 0 ? `Saldo a favor: ${formatMoney(clientCredit)}` : `Deuda: ${formatMoney(Math.abs(clientCredit))}`}
              </div>
            )}
          </div>
          <button onClick={() => { setForm(f => ({ ...f, clientId: "", clientName: "", isNewClient: false })); setClientSearch(""); }}
            style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
      ) : form.isNewClient ? (
        // New client inline form
        <div style={{ background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12, color: "#6366f1", fontWeight: 700, marginBottom: 10 }}>NUEVO CLIENTE</div>
          <Input placeholder="Nombre *" value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} />
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}><Input placeholder="Teléfono" value={form.clientPhone} onChange={e => setForm(f => ({ ...f, clientPhone: e.target.value }))} /></div>
            <div style={{ flex: 1 }}><Input placeholder="Instagram" value={form.clientInstagram} onChange={e => setForm(f => ({ ...f, clientInstagram: e.target.value }))} /></div>
          </div>
          <button onClick={() => setForm(f => ({ ...f, isNewClient: false, clientName: "", clientPhone: "", clientInstagram: "" }))}
            style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 12 }}>Cancelar</button>
        </div>
      ) : (
        // Search / select
        <div style={{ position: "relative" }}>
          <input
            value={clientSearch}
            onChange={e => { setClientSearch(e.target.value); setShowClientDropdown(true); }}
            onFocus={() => setShowClientDropdown(true)}
            placeholder="Buscar cliente por nombre, tel o IG..."
            style={{
              width: "100%", padding: "10px 14px", background: "#f7f8fa", border: "1px solid #e2e4e9",
              borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box",
            }}
          />
          {showClientDropdown && (clientSearch.length > 0) && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, background: "#fff",
              border: "1px solid #e2e4e9", borderRadius: 10, marginTop: 4, zIndex: 50,
              maxHeight: 250, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            }}>
              {filteredClients.map(c => (
                <button key={c.id} onClick={() => {
                  setForm(f => ({ ...f, clientId: c.id, clientName: c.name }));
                  setClientSearch(c.name);
                  setShowClientDropdown(false);
                }} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                  background: "none", border: "none", borderBottom: "1px solid #f3f4f6",
                  cursor: "pointer", width: "100%", textAlign: "left",
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", background: "#6366f1", color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0,
                  }}>{c.name.charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1a2e" }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>{c.phone || c.instagram || ""}</div>
                  </div>
                  {(c.balance || 0) !== 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: c.balance > 0 ? "#10b981" : "#e74c3c" }}>
                      {c.balance > 0 ? `+${formatMoney(c.balance)}` : formatMoney(c.balance)}
                    </span>
                  )}
                </button>
              ))}
              {filteredClients.length === 0 && (
                <div style={{ padding: "14px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                  No se encontró "{clientSearch}"
                </div>
              )}
              <button onClick={() => {
                setForm(f => ({ ...f, isNewClient: true, clientName: clientSearch }));
                setShowClientDropdown(false);
              }} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
                background: "#f7f8fa", border: "none", cursor: "pointer", width: "100%",
                color: "#6366f1", fontWeight: 600, fontSize: 13, borderTop: "1px solid #e2e4e9",
              }}>
                + Registrar nuevo cliente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ---- Payment section ----
  const renderPaymentSection = () => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
        Pago {form.payments.length > 1 ? "(Mixto)" : ""}
      </label>

      {/* Client credit notice */}
      {clientCredit > 0 && (
        <div style={{
          background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: 10, padding: "8px 14px",
          marginBottom: 10, display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>💚</span>
          <span style={{ color: "#10b981", fontSize: 13, fontWeight: 600 }}>
            {form.clientName} tiene saldo a favor: {formatMoney(clientCredit)} (se descuenta del total)
          </span>
        </div>
      )}

      {clientCredit < 0 && (
        <div style={{
          background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "8px 14px",
          marginBottom: 10, display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>⚠️</span>
          <span style={{ color: "#e74c3c", fontSize: 13, fontWeight: 600 }}>
            {form.clientName} tiene una deuda de {formatMoney(Math.abs(clientCredit))}
          </span>
        </div>
      )}

      {form.payments.map((pay, i) => (
        <div key={i} style={{
          display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-end", flexWrap: "wrap",
        }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <Select label={i === 0 ? "Método" : ""} options={PAYMENT_METHODS} value={pay.method} onChange={e => updatePayment(i, "method", e.target.value)} />
          </div>
          {pay.method === "Mercado Pago" && (
            <div style={{ flex: 0.8, minWidth: 120 }}>
              <Select label={i === 0 ? "Cuenta" : ""} options={MP_ACCOUNTS} value={pay.mpAccount} onChange={e => updatePayment(i, "mpAccount", e.target.value)} />
            </div>
          )}
          <div style={{ flex: 0.6, minWidth: 100 }}>
            <Input label={i === 0 ? "Monto" : ""} type="number" value={pay.amount}
              onChange={e => updatePayment(i, "amount", e.target.value)}
              placeholder={i === 0 && form.payments.length === 1 ? String(effectiveTotal) : ""} />
          </div>
          {form.payments.length > 1 && (
            <button onClick={() => removePayment(i)} style={{
              background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 16, marginBottom: 14,
            }}>✕</button>
          )}
        </div>
      ))}

      <button onClick={addPayment} style={{
        background: "none", border: "1px dashed #6366f133", color: "#6366f1", padding: "6px 14px",
        borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, width: "100%",
      }}>+ Agregar otro medio de pago (mixto)</button>

      {/* Payment summary */}
      {totalPaid > 0 && (
        <div style={{
          background: difference > 0 ? "#fff7ed" : difference < 0 ? "#fef2f2" : "#ecfdf5",
          border: `1px solid ${difference > 0 ? "#fdba74" : difference < 0 ? "#fecaca" : "#bbf7d0"}`,
          borderRadius: 10, padding: "10px 14px", marginTop: 10,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: "#6b7280" }}>Total a cobrar</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a2e" }}>{formatMoney(effectiveTotal, form.currency)}</span>
          </div>
          {creditUsed > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: "#10b981" }}>Saldo a favor aplicado</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#10b981" }}>-{formatMoney(creditUsed)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: "#6b7280" }}>Pagó</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a2e" }}>{formatMoney(totalPaid, form.currency)}</span>
          </div>

          {difference > 0 && (
            <div style={{ borderTop: "1px solid #fdba74", paddingTop: 8, marginTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 14, color: "#ea580c", fontWeight: 700 }}>Vuelto a dar</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#ea580c" }}>{formatMoney(difference, form.currency)}</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[...PAYMENT_METHODS, "A favor (crédito)"].map(m => {
                  const val = m === "A favor (crédito)" ? "credit" : m;
                  return (
                    <button key={m} onClick={() => setForm(f => ({
                      ...f, changeMethod: val, changeMpAccount: "",
                    }))} style={{
                      ...chipStyle(form.changeMethod === val),
                      fontSize: 12, padding: "5px 10px",
                    }}>{m}</button>
                  );
                })}
              </div>
              {form.changeMethod === "Mercado Pago" && (
                <div style={{ marginTop: 8 }}>
                  <Select label="Cuenta MP para vuelto" options={MP_ACCOUNTS} value={form.changeMpAccount} onChange={e => setForm(f => ({ ...f, changeMpAccount: e.target.value }))} />
                </div>
              )}
              {form.changeMethod === "credit" && (
                <div style={{ marginTop: 6, fontSize: 12, color: "#6366f1", fontWeight: 600 }}>
                  Se guardará como saldo a favor de {form.clientName || "este cliente"} para su próxima compra.
                </div>
              )}
            </div>
          )}

          {difference < 0 && (
            <div style={{ borderTop: "1px solid #fecaca", paddingTop: 8, marginTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 14, color: "#dc2626", fontWeight: 700 }}>Queda debiendo</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#dc2626" }}>{formatMoney(Math.abs(difference), form.currency)}</span>
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
                Se registrará como deuda del cliente.
              </div>
            </div>
          )}

          {difference === 0 && totalPaid > 0 && (
            <div style={{ borderTop: "1px solid #bbf7d0", paddingTop: 6, marginTop: 6, textAlign: "center" }}>
              <span style={{ color: "#10b981", fontSize: 13, fontWeight: 700 }}>✓ Pago exacto</span>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ---- Discount section ----
  const renderDiscountSection = () => (
    <div style={{ background: "#f7f8fa", border: "1px solid #e2e4e9", borderRadius: 10, padding: 14, marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, color: "#b8860b", marginBottom: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>🏷️ Descuento</label>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {[
          { value: "none", label: "Sin descuento" },
          { value: "percent", label: "% Porcentaje" },
          { value: "fixed", label: "$ Monto fijo" },
          { value: "per_unit", label: "$/u Por unidad" },
        ].map(opt => (
          <button key={opt.value} onClick={() => setForm(f => ({ ...f, discountType: opt.value, discountValue: opt.value === "none" ? "" : f.discountValue }))}
            style={{
              padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${form.discountType === opt.value ? "#b8860b" : "#e2e4e9"}`,
              background: form.discountType === opt.value ? "#fdcb6e22" : "transparent",
              color: form.discountType === opt.value ? "#b8860b" : "#6b7280",
            }}>{opt.label}</button>
        ))}
      </div>
      {form.discountType !== "none" && (
        <>
          <div style={{ display: "flex", gap: 12 }}>
            <Input label={form.discountType === "percent" ? "%" : form.discountType === "per_unit" ? `$/unidad` : `$ Fijo`}
              type="number" value={form.discountValue}
              onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))}
              placeholder={form.discountType === "percent" ? "ej: 10" : "ej: 5000"} />
            <Select label="Motivo" options={DISCOUNT_REASONS} value={form.discountReason}
              onChange={e => setForm(f => ({ ...f, discountReason: e.target.value }))} />
          </div>
          {discountAmount > 0 && (
            <div style={{ color: "#b8860b", fontSize: 13, marginTop: 4 }}>
              Descuento: <strong>-{formatMoney(discountAmount, form.currency)}</strong>
              {form.discountType === "percent" && ` (${form.discountValue}% de ${formatMoney(subtotal, form.currency)})`}
            </div>
          )}
        </>
      )}
    </div>
  );

  // ---- Extras ----
  const renderExtras = () => (
    <div style={{ background: "#f7f8fa", border: "1px solid #e2e4e9", borderRadius: 10, padding: 14, marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, color: "#10b981", marginBottom: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>➕ Extras</label>
      {(form.extras || []).map((extra, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-end" }}>
          <div style={{ flex: 2 }}><Input placeholder="Concepto" value={extra.concept} onChange={e => setForm(f => ({ ...f, extras: f.extras.map((ex, j) => j === i ? { ...ex, concept: e.target.value } : ex) }))} /></div>
          <div style={{ flex: 0.7 }}><Input type="number" placeholder="$" value={extra.amount} onChange={e => setForm(f => ({ ...f, extras: f.extras.map((ex, j) => j === i ? { ...ex, amount: e.target.value } : ex) }))} /></div>
          <button onClick={() => setForm(f => ({ ...f, extras: f.extras.filter((_, j) => j !== i) }))} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 16, marginBottom: 14 }}>✕</button>
        </div>
      ))}
      <button onClick={() => setForm(f => ({ ...f, extras: [...(f.extras || []), { concept: "", amount: "" }] }))}
        style={{ background: "none", border: "1px dashed #10b98133", color: "#10b981", padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, width: "100%", fontWeight: 600 }}>
        + Agregar extra (envío, etc.)
      </button>
    </div>
  );

  // ---- Totals ----
  const renderTotals = () => (
    <div style={{ background: "#f7f8fa", borderRadius: 10, padding: 14, marginBottom: 14, border: "1px solid #e2e4e9" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ color: "#6b7280", fontSize: 13 }}>Subtotal</span>
        <span style={{ color: "#4b5563", fontSize: 14 }}>{formatMoney(subtotal, form.currency)}</span>
      </div>
      {discountAmount > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ color: "#b8860b", fontSize: 13 }}>Descuento {form.discountReason ? `(${form.discountReason})` : ""}</span>
          <span style={{ color: "#b8860b", fontSize: 14 }}>-{formatMoney(discountAmount, form.currency)}</span>
        </div>
      )}
      {extrasTotal > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ color: "#10b981", fontSize: 13 }}>Extras</span>
          <span style={{ color: "#10b981", fontSize: 14 }}>+{formatMoney(extrasTotal, form.currency)}</span>
        </div>
      )}
      {clientCredit > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ color: "#10b981", fontSize: 13 }}>Saldo a favor</span>
          <span style={{ color: "#10b981", fontSize: 14 }}>-{formatMoney(Math.min(clientCredit, finalTotal))}</span>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #e2e4e9", paddingTop: 8 }}>
        <span style={{ color: "#1a1a2e", fontSize: 15, fontWeight: 700 }}>Total</span>
        <span style={{ color: "#10b981", fontSize: 20, fontWeight: 800 }}>{formatMoney(finalTotal, form.currency)}</span>
      </div>
    </div>
  );

  // ============================================
  // MAIN RETURN
  // ============================================
  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: "#1a1a2e", margin: 0, fontSize: 22 }}>Ventas ({filtered.length})</h2>
          {filtered.length > 0 && <span style={{ color: "#6b7280", fontSize: 13 }}>Total filtrado: {formatMoney(filteredRevenue)}</span>}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar producto o cliente..." />
          <Btn variant="secondary" onClick={() => setShowFilters(!showFilters)} style={{ padding: "10px 14px", border: hasActiveFilters ? "1px solid #6366f1" : undefined }}>
            🔍 Filtros {hasActiveFilters ? "●" : ""}
          </Btn>
          <Btn onClick={openNew}>+ Nueva Venta</Btn>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <Card style={{ marginBottom: 14, background: "#f7f8fa" }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 130 }}><Input label="Desde" type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} /></div>
            <div style={{ flex: 1, minWidth: 130 }}><Input label="Hasta" type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} /></div>
            <div style={{ flex: 1, minWidth: 130 }}><Select label="Canal" options={CHANNELS} value={filterChannel} onChange={e => setFilterChannel(e.target.value)} /></div>
            <div style={{ flex: 1, minWidth: 130 }}><Select label="Pago" options={PAYMENT_METHODS} value={filterPayment} onChange={e => setFilterPayment(e.target.value)} /></div>
            {hasActiveFilters && (
              <button onClick={clearFilters} style={{ background: "none", border: "1px solid #e74c3c55", color: "#e74c3c", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, marginBottom: 14 }}>
                ✕ Limpiar
              </button>
            )}
          </div>
        </Card>
      )}

      {totalDiscountsMonth > 0 && (
        <Card style={{ marginBottom: 14, borderColor: "#fdcb6e33" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>🏷️</span>
            <span style={{ color: "#b8860b", fontSize: 13 }}>Descuentos este mes: <strong>{formatMoney(totalDiscountsMonth)}</strong></span>
          </div>
        </Card>
      )}

      {/* Sales table */}
      <Card>
        <Table
          columns={[
            { key: "date", label: "Fecha", render: r => formatDate(r.date) },
            { key: "items", label: "Productos", render: r => (r.items || []).map(i => {
              const p = products.find(pr => pr.id === i.productId);
              return p ? `${p.brand} ${p.model} (x${i.qty})` : "?";
            }).join(", ") },
            { key: "client", label: "Cliente", render: r => (
              <div>
                <span>{r.clientName || "-"}</span>
                {(r.debtAmount || 0) > 0 && <Badge color="#e74c3c">Debe {formatMoney(r.debtAmount)}</Badge>}
                {(r.changeAmount || 0) > 0 && r.changeMethod === "credit" && <Badge color="#10b981">Crédito {formatMoney(r.changeAmount)}</Badge>}
              </div>
            )},
            { key: "payment", label: "Pago", render: r => {
              const payments = r.payments || [{ method: r.paymentMethod, amount: r.total }];
              return payments.map((p, i) => (
                <div key={i} style={{ fontSize: 12, lineHeight: 1.4 }}>
                  {p.method}{p.mpAccount ? ` (${p.mpAccount})` : ""}: {formatMoney(Number(p.amount) || 0)}
                </div>
              ));
            }},
            { key: "total", label: "Total", render: r => (
              <span style={{ fontWeight: 700, color: "#10b981" }}>{formatMoney(r.total, r.currency)}</span>
            )},
            { key: "actions", label: "", render: r => (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} style={{ background: "none", border: "none", color: "#6366f1", cursor: "pointer", fontSize: 16 }} title="Editar">✏️</button>
                {confirmDeleteSale === r.id
                  ? <button onClick={(e) => { e.stopPropagation(); deleteSale(r); }} style={{ background: "#e74c3c22", border: "1px solid #e74c3c55", color: "#e74c3c", padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Confirmar</button>
                  : <button onClick={(e) => { e.stopPropagation(); deleteSale(r); }} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 16 }} title="Eliminar">🗑️</button>
                }
              </div>
            )},
          ]}
          data={filtered}
          emptyMsg="No hay ventas registradas"
          mobileColumns={["date", "items", "total", "actions"]}
        />
      </Card>

      {/* ============================================ */}
      {/* SALE MODAL */}
      {/* ============================================ */}
      <Modal open={modal} onClose={() => { setModal(false); setEditing(null); setStep(1); }} title={editing ? "Editar Venta" : "Nueva Venta"}>

        {/* Step indicator */}
        <div style={{ display: "flex", gap: 0, marginBottom: 18 }}>
          {[
            { n: 1, label: "Productos" },
            { n: 2, label: "Cliente & Pago" },
          ].map(s => (
            <button key={s.n} onClick={() => setStep(s.n)} style={{
              flex: 1, padding: "8px 0", border: "none", cursor: "pointer",
              background: step === s.n ? "#6366f1" : "#f3f4f6",
              color: step === s.n ? "#fff" : "#6b7280",
              fontWeight: 700, fontSize: 13,
              borderRadius: s.n === 1 ? "8px 0 0 8px" : "0 8px 8px 0",
            }}>
              {s.n}. {s.label}
            </button>
          ))}
        </div>

        <Input label="Fecha" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />

        <Select label="Moneda" options={["ARS", "USD", "USDT"]} value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} />

        {/* Step 1: Products */}
        {step === 1 && (
          <>
            {renderProductPicker()}
            {renderDiscountSection()}
            {renderExtras()}
            {renderTotals()}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
              <Btn variant="secondary" onClick={() => { setModal(false); setEditing(null); }}>Cancelar</Btn>
              <Btn onClick={() => setStep(2)} style={{ background: "#6366f1" }}>
                Siguiente: Cliente & Pago →
              </Btn>
            </div>
          </>
        )}

        {/* Step 2: Client + Payment */}
        {step === 2 && (
          <>
            {renderTotals()}
            {renderClientSelector()}
            <Select label="Canal de venta" options={CHANNELS} value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))} />
            {renderPaymentSection()}
            <Input label="Notas" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Opcional..." />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
              <Btn variant="secondary" onClick={() => setStep(1)}>← Productos</Btn>
              <Btn variant="success" onClick={save}>{editing ? "Guardar Cambios" : "Registrar Venta"}</Btn>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
};
