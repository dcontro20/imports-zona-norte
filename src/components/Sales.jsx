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

const getLastChannel = () => { try { return localStorage.getItem("vapestock_lastChannel") || ""; } catch { return ""; } };

const emptyForm = () => ({
  items: [{ brand: "", model: "", productId: "", qty: 1 }],
  clientId: "", clientName: "", clientPhone: "", clientInstagram: "", isNewClient: false,
  channel: getLastChannel(), currency: "ARS",
  payments: [emptyPayment()],
  discountType: "none", discountValue: "", discountReason: "",
  extras: [],
  // Change (vuelto)
  changeAmount: 0, changeMethod: "", changeMpAccount: "",
  // Debt
  debtAmount: 0, debtDirection: "",
  debtConfirmed: false, debtReason: "", // "paga_despues" | "precio_acordado"
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [flavorSearch, setFlavorSearch] = useState("");
  const [editingRate, setEditingRate] = useState(null); // exchange rate locked from the sale being edited

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
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { brand: "", model: "", productId: "", qty: 1, customPrice: "" }] }));
  const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

  // ---- payment management ----
  const addPayment = () => setForm(f => ({ ...f, payments: [...f.payments, emptyPayment()] }));
  const removePayment = (i) => setForm(f => ({ ...f, payments: f.payments.filter((_, idx) => idx !== i) }));
  const updatePayment = (i, field, val) => {
    setForm(f => {
      const updated = f.payments.map((p, idx) => idx === i ? { ...p, [field]: val } : p);
      // Auto-fill amount when picking method on single payment with empty amount
      if (field === "method" && val && updated.length === 1 && !updated[0].amount) {
        updated[0] = { ...updated[0], amount: String(effectiveTotal || finalTotal) };
      }
      // Reset debt confirmation when amounts change (the difference may flip)
      const resetDebt = field === "amount" ? { debtConfirmed: false, debtReason: "" } : {};
      return { ...f, payments: updated, ...resetDebt };
    });
  };
  const fillFullAmount = (i) => {
    const remaining = (effectiveTotal || finalTotal) - form.payments.reduce((s, p, idx) => idx === i ? s : s + (Number(p.amount) || 0), 0);
    updatePayment(i, "amount", String(Math.max(0, Math.round(remaining))));
  };

  // ---- calculations ----
  // When editing, use the exchange rate from the original sale (locked at time of sale)
  const activeRate = editingRate || exchangeRate;

  const totalQty = form.items.reduce((s, i) => s + (Number(i.qty) || 0), 0);

  const getItemPrice = (item) => {
    if (item.customPrice !== "" && item.customPrice !== undefined) return Number(item.customPrice) || 0;
    const prod = products.find(p => p.id === item.productId);
    if (!prod) return 0;
    return form.currency === "USD" ? (prod.priceUSD || 0) : Math.round((prod.priceUSD || 0) * activeRate);
  };

  const calcSubtotal = () => {
    return form.items.reduce((total, item) => {
      if (!item.productId) return total;
      return total + getItemPrice(item) * (Number(item.qty) || 0);
    }, 0);
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
  const creditUsed = clientCredit > 0 ? Math.min(clientCredit, finalTotal) : 0;
  const effectiveTotal = Math.max(0, finalTotal - creditUsed);
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

  const repeatSale = (sale) => {
    const items = (sale.items || []).map(i => {
      const prod = products.find(p => p.id === i.productId);
      return { brand: prod?.brand || "", model: prod?.model || "", productId: i.productId || "", qty: i.qty || 1 };
    });
    setForm({
      ...emptyForm(),
      items: items.length > 0 ? items : [{ brand: "", model: "", productId: "", qty: 1 }],
      clientId: sale.clientId || "", clientName: sale.clientName || "",
      channel: sale.channel || getLastChannel(),
      currency: sale.currency || "ARS",
    });
    if (sale.clientName) setClientSearch(sale.clientName);
    setEditing(null);
    setStep(1);
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
    setEditingRate(sale.exchangeRate || null);
    setStep(1);
    setModal(true);
  };

  // ---- SAVE ----
  const save = () => {
    setValidationError("");
    // Validate: at least 1 product selected
    if (form.items.every(i => !i.productId)) { setValidationError("Seleccioná al menos un producto."); setStep(1); return; }
    const validItems = form.items.filter(i => i.productId);
    // Validate quantities
    const badQty = validItems.find(i => !Number(i.qty) || Number(i.qty) < 1);
    if (badQty) { setValidationError("La cantidad de cada producto debe ser al menos 1."); setStep(1); return; }

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
        setValidationError(`Stock insuficiente: ${prod.brand} ${prod.model} - ${prod.flavor}. Disponible: ${available}, pedido: ${item.qty}`);
        setStep(1); return;
      }
    }

    // Determine debt/change
    let changeAmt = 0, changeMethod = form.changeMethod, changeMpAccount = form.changeMpAccount;
    let debtAmt = 0, debtDir = "";
    if (difference > 0) {
      // Customer overpaid → change (vuelto)
      changeAmt = difference;
      if (!changeMethod) {
        setValidationError("El cliente pagó de más. Elegí cómo darle el vuelto.");
        setStep(2); return;
      }
    } else if (difference < 0) {
      if (!form.debtConfirmed) {
        setValidationError("Confirmá qué hacer con la diferencia que falta cobrar.");
        setStep(2); return;
      }
      if (form.debtReason === "paga_despues") {
        debtAmt = Math.abs(difference);
        debtDir = "clientOwes";
      }
      // If "precio_acordado", no debt — the sale total stays as computed but no balance impact
    }

    const saleId = editing || uid();
    const total = finalTotal;

    // Build sale data
    const saleData = {
      id: saleId,
      items: validItems.map(i => {
        const prod = products.find(p => p.id === i.productId);
        const unitPriceARS = getItemPrice(i);
        return {
          productId: i.productId, qty: Number(i.qty) || 1,
          priceUSD: prod?.priceUSD || 0,
          priceARS: unitPriceARS,
          name: prod ? `${prod.brand} ${prod.model} - ${prod.flavor}` : "",
          ...(i.customPrice !== "" && i.customPrice !== undefined ? { customPrice: Number(i.customPrice) } : {}),
        };
      }),
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
      debtReason: form.debtReason || "",
      totalPaid,
      notes: form.notes,
      date: form.date ? `${form.date}T${new Date().toTimeString().slice(0, 8)}` : new Date().toISOString(),
      exchangeRate: activeRate,
      createdBy: currentUser?.name || "",
    };

    // ---- Execute ----
    if (editing) {
      // Restore stock from original (only for non-deleted products)
      const original = sales.find(s => s.id === editing);
      if (original) {
        (original.items || []).forEach(item => {
          setProducts(prev => prev.map(p => p.id === item.productId && !p.isDeleted ? { ...p, stock: (p.stock || 0) + item.qty } : p));
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

    // ---- Helper: reverse a sale's balance impact on a client ----
    const reverseSaleBalance = (sale, clientId) => {
      if (!sale || !clientId) return;
      setClients(prev => prev.map(c => {
        if (c.id !== clientId) return c;
        let bal = c.balance || 0;
        if (sale.debtAmount > 0 && sale.debtDirection === "clientOwes") bal += sale.debtAmount;
        if (sale.creditUsed > 0) bal += sale.creditUsed;
        if (sale.changeAmount > 0 && sale.changeMethod === "credit") bal -= sale.changeAmount;
        return { ...c, balance: Math.round(bal * 100) / 100 };
      }));
    };

    // ---- If editing, reverse original sale's balance impact first ----
    if (editing) {
      const original = sales.find(s => s.id === editing);
      if (original && original.clientId) {
        reverseSaleBalance(original, original.clientId);
      }
    }

    // ---- Create/update client ----
    if (form.isNewClient && form.clientName) {
      const newClientId = uid();
      let initialBalance = 0;
      if (debtDir === "clientOwes") initialBalance = -(debtAmt);
      if (changeAmt > 0 && changeMethod === "credit") initialBalance = changeAmt;
      const newClient = {
        id: newClientId,
        name: form.clientName,
        phone: form.clientPhone || "",
        instagram: form.clientInstagram || "",
        notes: "",
        balance: initialBalance,
        balanceHistory: [],
      };
      // Add balance history entry
      if (initialBalance !== 0) {
        newClient.balanceHistory.push({
          id: uid(), type: initialBalance < 0 ? "sale_debt" : "sale_credit_given",
          amount: Math.abs(initialBalance), date: saleData.date, saleId,
          notes: initialBalance < 0 ? "Deuda por venta" : "Vuelto como crédito",
          balanceBefore: 0, balanceAfter: initialBalance,
        });
      }
      setClients(prev => [...prev, newClient]);
      setSales(prev => prev.map(s => s.id === saleId ? { ...s, clientId: newClientId } : s));
    } else if (form.clientId) {
      // Update existing client balance
      setClients(prev => prev.map(c => {
        if (c.id !== form.clientId) return c;
        const balBefore = c.balance || 0;
        let newBalance = balBefore;
        const history = [...(c.balanceHistory || [])];

        if (creditUsed > 0) {
          newBalance -= creditUsed;
          history.push({ id: uid(), type: "sale_credit_used", amount: creditUsed, notes: "Crédito usado en venta", date: saleData.date, saleId, balanceBefore: balBefore, balanceAfter: newBalance });
        }
        if (debtDir === "clientOwes" && debtAmt > 0) {
          const bb = newBalance;
          newBalance -= debtAmt;
          history.push({ id: uid(), type: "sale_debt", amount: debtAmt, notes: "Deuda por venta", date: saleData.date, saleId, balanceBefore: bb, balanceAfter: newBalance });
        }
        if (changeAmt > 0 && changeMethod === "credit") {
          const bb = newBalance;
          newBalance += changeAmt;
          history.push({ id: uid(), type: "sale_credit_given", amount: changeAmt, notes: "Vuelto como crédito", date: saleData.date, saleId, balanceBefore: bb, balanceAfter: newBalance });
        }
        return { ...c, balance: Math.round(newBalance * 100) / 100, balanceHistory: history };
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

    // Remember last channel
    if (form.channel) { try { localStorage.setItem("vapestock_lastChannel", form.channel); } catch {} }

    setModal(false);
    setForm(emptyForm());
    setEditing(null);
    setEditingRate(null);
    setStep(1);
    setClientSearch("");
    setValidationError("");
    setShowSaveSuccess(true);
    setTimeout(() => setShowSaveSuccess(false), 2000);
  };

  // ---- DELETE ----
  const [confirmDeleteSale, setConfirmDeleteSale] = useState(null);
  const deleteSale = (sale) => {
    if (confirmDeleteSale !== sale.id) { setConfirmDeleteSale(sale.id); setTimeout(() => setConfirmDeleteSale(null), 3000); return; }
    setConfirmDeleteSale(null);
    // Restore stock (only non-deleted products)
    (sale.items || []).forEach(item => {
      setProducts(prev => prev.map(p => p.id === item.productId && !p.isDeleted ? { ...p, stock: (p.stock || 0) + (item.qty || 1) } : p));
    });
    // Restore client balance: undo debt, credit used, and change-as-credit
    if (sale.clientId) {
      setClients(prev => prev.map(c => {
        if (c.id !== sale.clientId) return c;
        let bal = c.balance || 0;
        if (sale.debtAmount > 0) bal += sale.debtAmount; // undo debt
        if (sale.creditUsed > 0) bal += sale.creditUsed; // restore credit that was consumed
        if (sale.changeAmount > 0 && sale.changeMethod === "credit") bal -= sale.changeAmount; // undo credit given as change
        return { ...c, balance: Math.round(bal * 100) / 100 };
      }));
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
  }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));

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
    border: `1.5px solid ${active ? "#5E6AD2" : "#E8E7E3"}`,
    background: active ? "#5E6AD2" : "#FAFAF9",
    color: active ? "#fff" : "#555247",
    transition: "all .15s",
    whiteSpace: "nowrap",
  });

  // ---- Product picker (cascading) ----
  const renderProductPicker = () => (
    <div>
      <label style={{ display: "block", fontSize: 12, color: "#8C8A82", marginBottom: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
        Productos ({totalQty} {totalQty === 1 ? "unidad" : "unidades"})
      </label>

      {form.items.map((item, i) => {
        const modelsForBrand = item.brand ? getModels(item.brand) : [];
        const flavorsForModel = item.brand && item.model ? getFlavors(item.brand, item.model) : [];
        const selectedProd = item.productId ? products.find(p => p.id === item.productId) : null;
        const priceDisplay = selectedProd ? (form.currency === "USD" ? formatMoney(selectedProd.priceUSD, "USD") : formatMoney(Math.round(selectedProd.priceUSD * exchangeRate))) : "";

        return (
          <div key={i} style={{
            background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 12, padding: isMobile ? 12 : 14,
            marginBottom: 10, position: "relative",
          }}>
            {form.items.length > 1 && (
              <button onClick={() => removeItem(i)} style={{
                position: "absolute", top: 8, right: 8, background: "none", border: "none",
                color: "#E03E3E", cursor: "pointer", fontSize: 16, lineHeight: 1,
              }}>✕</button>
            )}

            {/* Row 1: Brand chips */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "#B1AFA7", marginBottom: 6, fontWeight: 600 }}>MARCA</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {brands.map(b => (
                  <button key={b} onClick={() => updateItem(i, "brand", b)}
                    style={{
                      ...chipStyle(item.brand === b),
                      ...(item.brand === b ? { background: BRAND_COLORS[b] || "#5E6AD2", borderColor: BRAND_COLORS[b] || "#5E6AD2" } : {}),
                    }}>
                    {b}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 2: Model chips */}
            {item.brand && modelsForBrand.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#B1AFA7", marginBottom: 6, fontWeight: 600 }}>MODELO</div>
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

            {/* Row 3: Flavor picker with search */}
            {item.brand && item.model && flavorsForModel.length > 0 && (() => {
              const filteredFlavors = flavorSearch
                ? flavorsForModel.filter(p => p.flavor.toLowerCase().includes(flavorSearch.toLowerCase()))
                : flavorsForModel;
              return (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: "#B1AFA7", marginBottom: 6, fontWeight: 600 }}>SABOR ({flavorsForModel.length})</div>
                  {flavorsForModel.length >= 8 && (
                    <input value={flavorSearch} onChange={e => setFlavorSearch(e.target.value)}
                      placeholder="Filtrar sabor..."
                      style={{ width: "100%", padding: "7px 10px", background: "#FFFFFF", border: "1px solid #E8E7E3", borderRadius: 8, fontSize: 13, outline: "none", marginBottom: 8, boxSizing: "border-box" }} />
                  )}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxHeight: 180, overflowY: "auto" }}>
                    {filteredFlavors.map(p => (
                      <button key={p.id} onClick={() => { updateItem(i, "productId", p.id); setFlavorSearch(""); }}
                        style={{
                          ...chipStyle(item.productId === p.id),
                          fontSize: 12,
                          padding: "5px 10px",
                        }}>
                        {p.flavor} <span style={{ opacity: 0.6, fontSize: 10, marginLeft: 2 }}>({p.stock})</span>
                      </button>
                    ))}
                    {filteredFlavors.length === 0 && <span style={{ color: "#B1AFA7", fontSize: 12 }}>Sin resultados</span>}
                  </div>
                </div>
              );
            })()}

            {/* Row 4: Qty + price */}
            {selectedProd && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => updateItem(i, "qty", Math.max(1, (item.qty || 1) - 1))}
                    style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #E8E7E3", background: "#FFFFFF", cursor: "pointer", fontSize: 16, fontWeight: 700 }}>−</button>
                  <span style={{ fontSize: 18, fontWeight: 800, minWidth: 28, textAlign: "center" }}>{item.qty || 1}</span>
                  <button onClick={() => updateItem(i, "qty", Math.min(selectedProd.stock, (item.qty || 1) + 1))}
                    style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #E8E7E3", background: "#FFFFFF", cursor: "pointer", fontSize: 16, fontWeight: 700 }}>+</button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="number" value={item.customPrice !== undefined && item.customPrice !== "" ? item.customPrice : ""}
                    onChange={e => updateItem(i, "customPrice", e.target.value)}
                    placeholder={String(priceDisplay.replace(/[^\d]/g, ""))}
                    style={{ width: 75, padding: "4px 6px", border: "1px solid #E8E7E3", borderRadius: 6, fontSize: 13, textAlign: "center", background: item.customPrice ? "#FBE3B3" : "#FAFAF9", color: "#37352F" }}
                  />
                  <span style={{ fontSize: 11, color: "#B1AFA7" }}>/u</span>
                </div>
                <span style={{ fontSize: 11, color: "#B1AFA7" }}>Stock: {selectedProd.stock}</span>
                <div style={{ marginLeft: "auto", fontSize: 16, fontWeight: 800, color: "#0F7B6C" }}>
                  {formatMoney(getItemPrice(item) * (item.qty || 1), form.currency)}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <button onClick={addItem} style={{
        background: "none", border: "2px dashed #E8E7E3", color: "#5E6AD2", padding: "10px 14px",
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
      <label style={{ display: "block", fontSize: 12, color: "#8C8A82", marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
        Cliente
      </label>

      {form.clientId ? (
        // Selected client
        <div style={{
          display: "flex", alignItems: "center", gap: 10, background: "#DDEDEA", border: "1px solid #B6D4CC",
          borderRadius: 10, padding: "10px 14px",
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%", background: "#0F7B6C", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flexShrink: 0,
          }}>{form.clientName.charAt(0).toUpperCase()}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#37352F" }}>{form.clientName}</div>
            {clientCredit !== 0 && (
              <div style={{ fontSize: 12, color: clientCredit > 0 ? "#0F7B6C" : "#E03E3E", fontWeight: 600 }}>
                {clientCredit > 0 ? `Saldo a favor: ${formatMoney(clientCredit)}` : `Deuda: ${formatMoney(Math.abs(clientCredit))}`}
              </div>
            )}
          </div>
          <button onClick={() => { setForm(f => ({ ...f, clientId: "", clientName: "", isNewClient: false })); setClientSearch(""); }}
            style={{ background: "none", border: "none", color: "#B1AFA7", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
      ) : form.isNewClient ? (
        // New client inline form
        <div style={{ background: "#EAECF9", border: "1px solid #D4D7F2", borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12, color: "#5E6AD2", fontWeight: 700, marginBottom: 10 }}>NUEVO CLIENTE</div>
          <Input placeholder="Nombre *" value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} />
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}><Input placeholder="Teléfono" value={form.clientPhone} onChange={e => setForm(f => ({ ...f, clientPhone: e.target.value }))} /></div>
            <div style={{ flex: 1 }}><Input placeholder="Instagram" value={form.clientInstagram} onChange={e => setForm(f => ({ ...f, clientInstagram: e.target.value }))} /></div>
          </div>
          <button onClick={() => setForm(f => ({ ...f, isNewClient: false, clientName: "", clientPhone: "", clientInstagram: "" }))}
            style={{ background: "none", border: "none", color: "#E03E3E", cursor: "pointer", fontSize: 12 }}>Cancelar</button>
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
              width: "100%", padding: "10px 14px", background: "#FAFAF9", border: "1px solid #E8E7E3",
              borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box",
            }}
          />
          {showClientDropdown && (clientSearch.length > 0) && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, background: "#FFFFFF",
              border: "1px solid #E8E7E3", borderRadius: 10, marginTop: 4, zIndex: 50,
              maxHeight: 250, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            }}>
              {filteredClients.map(c => (
                <button key={c.id} onClick={() => {
                  setForm(f => ({ ...f, clientId: c.id, clientName: c.name }));
                  setClientSearch(c.name);
                  setShowClientDropdown(false);
                }} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                  background: "none", border: "none", borderBottom: "1px solid #E8E7E3",
                  cursor: "pointer", width: "100%", textAlign: "left",
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", background: "#5E6AD2", color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0,
                  }}>{c.name.charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#37352F" }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: "#B1AFA7" }}>{c.phone || c.instagram || ""}</div>
                  </div>
                  {(c.balance || 0) !== 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: c.balance > 0 ? "#0F7B6C" : "#E03E3E" }}>
                      {c.balance > 0 ? `+${formatMoney(c.balance)}` : formatMoney(c.balance)}
                    </span>
                  )}
                </button>
              ))}
              {filteredClients.length === 0 && (
                <div style={{ padding: "14px", textAlign: "center", color: "#B1AFA7", fontSize: 13 }}>
                  No se encontró "{clientSearch}"
                </div>
              )}
              <button onClick={() => {
                setForm(f => ({ ...f, isNewClient: true, clientName: clientSearch }));
                setShowClientDropdown(false);
              }} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
                background: "#FAFAF9", border: "none", cursor: "pointer", width: "100%",
                color: "#5E6AD2", fontWeight: 600, fontSize: 13, borderTop: "1px solid #E8E7E3",
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
      <label style={{ display: "block", fontSize: 12, color: "#8C8A82", marginBottom: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
        Pago {form.payments.length > 1 ? "(Mixto)" : ""}
      </label>

      {/* Client credit notice */}
      {clientCredit > 0 && (
        <div style={{
          background: "#DDEDEA", border: "1px solid #B6D4CC", borderRadius: 10, padding: "8px 14px",
          marginBottom: 10, display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>💚</span>
          <span style={{ color: "#0F7B6C", fontSize: 13, fontWeight: 600 }}>
            {form.clientName} tiene saldo a favor: {formatMoney(clientCredit)} (se descuenta del total)
          </span>
        </div>
      )}

      {clientCredit < 0 && (
        <div style={{
          background: "#FBE4E4", border: "1px solid #F1B8B6", borderRadius: 10, padding: "8px 14px",
          marginBottom: 10, display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>⚠️</span>
          <span style={{ color: "#E03E3E", fontSize: 13, fontWeight: 600 }}>
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
          <div style={{ flex: 0.6, minWidth: 100, position: "relative" }}>
            <Input label={i === 0 ? "Monto" : ""} type="number" value={pay.amount}
              onChange={e => updatePayment(i, "amount", e.target.value)}
              placeholder={String(Math.round(effectiveTotal || finalTotal))} />
            {!pay.amount && (
              <button onClick={() => fillFullAmount(i)} style={{
                position: "absolute", right: 6, bottom: 18, background: "#5E6AD2", color: "#fff",
                border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 10, fontWeight: 700,
                cursor: "pointer", lineHeight: 1.3,
              }}>Total</button>
            )}
          </div>
          {form.payments.length > 1 && (
            <button onClick={() => removePayment(i)} style={{
              background: "none", border: "none", color: "#E03E3E", cursor: "pointer", fontSize: 16, marginBottom: 14,
            }}>✕</button>
          )}
        </div>
      ))}

      <button onClick={addPayment} style={{
        background: "none", border: "1px dashed #5E6AD233", color: "#5E6AD2", padding: "6px 14px",
        borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, width: "100%",
      }}>+ Agregar otro medio de pago (mixto)</button>

      {/* Payment summary */}
      {totalPaid > 0 && (
        <div style={{
          background: difference > 0 ? "#FDECC8" : difference < 0 ? "#FBE4E4" : "#DDEDEA",
          border: `1px solid ${difference > 0 ? "#F2D59A" : difference < 0 ? "#F1B8B6" : "#B6D4CC"}`,
          borderRadius: 10, padding: "10px 14px", marginTop: 10,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: "#8C8A82" }}>Total a cobrar</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#37352F" }}>{formatMoney(effectiveTotal, form.currency)}</span>
          </div>
          {creditUsed > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: "#0F7B6C" }}>Saldo a favor aplicado</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#0F7B6C" }}>-{formatMoney(creditUsed)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: "#8C8A82" }}>Pagó</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#37352F" }}>{formatMoney(totalPaid, form.currency)}</span>
          </div>

          {difference > 0 && (
            <div style={{ borderTop: "1px solid #F2D59A", paddingTop: 10, marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 14, color: "#ea580c", fontWeight: 700 }}>Vuelto a dar</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: "#ea580c" }}>{formatMoney(difference, form.currency)}</span>
              </div>
              <div style={{ fontSize: 12, color: "#8C8A82", marginBottom: 8, fontWeight: 600 }}>
                ¿Cómo le devolvés el vuelto?
              </div>

              {/* Two big action cards */}
              <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <button onClick={() => setForm(f => ({ ...f, changeMethod: f.changeMethod && f.changeMethod !== "credit" ? f.changeMethod : "Pesos Cash", changeMpAccount: "" }))}
                  style={{
                    flex: 1, padding: "14px 12px", borderRadius: 12, cursor: "pointer", border: "none",
                    background: form.changeMethod && form.changeMethod !== "credit" ? "#FDECC8" : "#FAFAF9",
                    outline: form.changeMethod && form.changeMethod !== "credit" ? "2px solid #ea580c" : "2px solid #E8E7E3",
                    textAlign: "center",
                  }}>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>💸</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: form.changeMethod && form.changeMethod !== "credit" ? "#ea580c" : "#555247" }}>Devolver vuelto</div>
                  <div style={{ fontSize: 11, color: "#B1AFA7" }}>Efectivo, transferencia, etc.</div>
                </button>
                <button onClick={() => setForm(f => ({ ...f, changeMethod: "credit", changeMpAccount: "" }))}
                  style={{
                    flex: 1, padding: "14px 12px", borderRadius: 12, cursor: "pointer", border: "none",
                    background: form.changeMethod === "credit" ? "#EAECF9" : "#FAFAF9",
                    outline: form.changeMethod === "credit" ? "2px solid #5E6AD2" : "2px solid #E8E7E3",
                    textAlign: "center",
                  }}>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>🏦</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: form.changeMethod === "credit" ? "#5E6AD2" : "#555247" }}>Dejar a favor</div>
                  <div style={{ fontSize: 11, color: "#B1AFA7" }}>Crédito para próxima compra</div>
                </button>
              </div>

              {/* Sub-picker: which payment method for return */}
              {form.changeMethod && form.changeMethod !== "credit" && (
                <div style={{ background: "#FDECC8", border: "1px solid #F2D59A", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, color: "#ea580c", fontWeight: 600, marginBottom: 8 }}>MEDIO DE DEVOLUCIÓN</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {PAYMENT_METHODS.map(m => (
                      <button key={m} onClick={() => setForm(f => ({ ...f, changeMethod: m, changeMpAccount: "" }))}
                        style={{
                          padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer",
                          border: `2px solid ${form.changeMethod === m ? "#ea580c" : "#E8E7E3"}`,
                          background: form.changeMethod === m ? "#ea580c" : "#FAFAF9",
                          color: form.changeMethod === m ? "#fff" : "#555247",
                        }}>{m}</button>
                    ))}
                  </div>
                  {form.changeMethod === "Mercado Pago" && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 11, color: "#ea580c", fontWeight: 600, marginBottom: 6 }}>¿DESDE QUÉ CUENTA?</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {MP_ACCOUNTS.map(acc => (
                          <button key={acc} onClick={() => setForm(f => ({ ...f, changeMpAccount: acc }))}
                            style={{
                              padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer",
                              border: `2px solid ${form.changeMpAccount === acc ? "#ea580c" : "#E8E7E3"}`,
                              background: form.changeMpAccount === acc ? "#ea580c" : "#FAFAF9",
                              color: form.changeMpAccount === acc ? "#fff" : "#555247",
                            }}>{acc}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {form.changeMethod === "credit" && (
                <div style={{ background: "#EAECF9", border: "1px solid #D4D7F2", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#5E6AD2", fontWeight: 600 }}>
                  Se guardará {formatMoney(difference)} como saldo a favor de {form.clientName || "este cliente"} para su próxima compra.
                </div>
              )}
            </div>
          )}

          {difference < 0 && (
            <div style={{ borderTop: "1px solid #F1B8B6", paddingTop: 10, marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 14, color: "#E03E3E", fontWeight: 700 }}>Falta cobrar</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: "#E03E3E" }}>{formatMoney(Math.abs(difference), form.currency)}</span>
              </div>

              {!form.debtConfirmed ? (
                <div style={{ background: "#FBE4E4", border: "2px solid #F1B8B6", borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 13, color: "#E03E3E", fontWeight: 600, marginBottom: 10 }}>
                    {form.clientName ? `${form.clientName} quedaría debiendo ${formatMoney(Math.abs(difference))}.` : `Faltan ${formatMoney(Math.abs(difference))} por cobrar.`}
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setForm(f => ({ ...f, debtConfirmed: true, debtReason: "paga_despues" }))}
                      style={{
                        flex: 1, padding: "12px", borderRadius: 10, cursor: "pointer",
                        border: "2px solid #E03E3E", background: "#FBE4E4", color: "#E03E3E",
                        fontWeight: 700, fontSize: 13,
                      }}>Paga el resto después</button>
                    <button onClick={() => setForm(f => ({ ...f, debtConfirmed: true, debtReason: "precio_acordado" }))}
                      style={{
                        flex: 1, padding: "12px", borderRadius: 10, cursor: "pointer",
                        border: "2px solid #CB912F", background: "#FDECC8", color: "#b8860b",
                        fontWeight: 700, fontSize: 13,
                      }}>Precio acordado</button>
                  </div>
                </div>
              ) : form.debtReason === "paga_despues" ? (
                <div style={{ background: "#FBE4E4", border: "1px solid #F1B8B6", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, color: "#E03E3E", fontWeight: 600 }}>
                    Se registra deuda de {formatMoney(Math.abs(difference))}
                  </span>
                  <button onClick={() => setForm(f => ({ ...f, debtConfirmed: false, debtReason: "" }))}
                    style={{ background: "none", border: "none", color: "#B1AFA7", cursor: "pointer", fontSize: 12 }}>Cambiar</button>
                </div>
              ) : (
                <div style={{ background: "#FDECC8", border: "1px solid #fcd34d", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, color: "#b8860b", fontWeight: 600 }}>
                    Sin deuda — precio final: {formatMoney(totalPaid)}
                  </span>
                  <button onClick={() => setForm(f => ({ ...f, debtConfirmed: false, debtReason: "" }))}
                    style={{ background: "none", border: "none", color: "#B1AFA7", cursor: "pointer", fontSize: 12 }}>Cambiar</button>
                </div>
              )}
            </div>
          )}

          {difference === 0 && totalPaid > 0 && (
            <div style={{ borderTop: "1px solid #B6D4CC", paddingTop: 6, marginTop: 6, textAlign: "center" }}>
              <span style={{ color: "#0F7B6C", fontSize: 13, fontWeight: 700 }}>✓ Pago exacto</span>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ---- Discount section ----
  const renderDiscountSection = () => (
    <div style={{ background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 10, padding: 14, marginBottom: 14 }}>
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
              border: `1px solid ${form.discountType === opt.value ? "#b8860b" : "#E8E7E3"}`,
              background: form.discountType === opt.value ? "#fdcb6e22" : "transparent",
              color: form.discountType === opt.value ? "#b8860b" : "#8C8A82",
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
    <div style={{ background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 10, padding: 14, marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, color: "#0F7B6C", marginBottom: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>➕ Extras</label>
      {(form.extras || []).map((extra, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-end" }}>
          <div style={{ flex: 2 }}><Input placeholder="Concepto" value={extra.concept} onChange={e => setForm(f => ({ ...f, extras: f.extras.map((ex, j) => j === i ? { ...ex, concept: e.target.value } : ex) }))} /></div>
          <div style={{ flex: 0.7 }}><Input type="number" placeholder="$" value={extra.amount} onChange={e => setForm(f => ({ ...f, extras: f.extras.map((ex, j) => j === i ? { ...ex, amount: e.target.value } : ex) }))} /></div>
          <button onClick={() => setForm(f => ({ ...f, extras: f.extras.filter((_, j) => j !== i) }))} style={{ background: "none", border: "none", color: "#E03E3E", cursor: "pointer", fontSize: 16, marginBottom: 14 }}>✕</button>
        </div>
      ))}
      <button onClick={() => setForm(f => ({ ...f, extras: [...(f.extras || []), { concept: "", amount: "" }] }))}
        style={{ background: "none", border: "1px dashed #0F7B6C33", color: "#0F7B6C", padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, width: "100%", fontWeight: 600 }}>
        + Agregar extra (envío, etc.)
      </button>
    </div>
  );

  // ---- Totals ----
  const renderTotals = () => (
    <div style={{ background: "#FAFAF9", borderRadius: 10, padding: 14, marginBottom: 14, border: "1px solid #E8E7E3" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ color: "#8C8A82", fontSize: 13 }}>Subtotal</span>
        <span style={{ color: "#555247", fontSize: 14 }}>{formatMoney(subtotal, form.currency)}</span>
      </div>
      {discountAmount > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ color: "#b8860b", fontSize: 13 }}>Descuento {form.discountReason ? `(${form.discountReason})` : ""}</span>
          <span style={{ color: "#b8860b", fontSize: 14 }}>-{formatMoney(discountAmount, form.currency)}</span>
        </div>
      )}
      {extrasTotal > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ color: "#0F7B6C", fontSize: 13 }}>Extras</span>
          <span style={{ color: "#0F7B6C", fontSize: 14 }}>+{formatMoney(extrasTotal, form.currency)}</span>
        </div>
      )}
      {clientCredit > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ color: "#0F7B6C", fontSize: 13 }}>Saldo a favor</span>
          <span style={{ color: "#0F7B6C", fontSize: 14 }}>-{formatMoney(Math.min(clientCredit, finalTotal))}</span>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #E8E7E3", paddingTop: 8 }}>
        <span style={{ color: "#37352F", fontSize: 15, fontWeight: 700 }}>Total</span>
        <span style={{ color: "#0F7B6C", fontSize: 20, fontWeight: 800 }}>{formatMoney(finalTotal, form.currency)}</span>
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
          <h2 style={{ color: "#37352F", margin: 0, fontSize: 22 }}>Ventas ({filtered.length})</h2>
          {filtered.length > 0 && <span style={{ color: "#8C8A82", fontSize: 13 }}>Total filtrado: {formatMoney(filteredRevenue)}</span>}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar producto o cliente..." />
          <Btn variant="secondary" onClick={() => setShowFilters(!showFilters)} style={{ padding: "10px 14px", border: hasActiveFilters ? "1px solid #5E6AD2" : undefined }}>
            🔍 Filtros {hasActiveFilters ? "●" : ""}
          </Btn>
          <Btn onClick={openNew}>+ Nueva Venta</Btn>
        </div>
      </div>

      {/* Success toast */}
      {showSaveSuccess && (
        <div style={{
          position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)", zIndex: 300,
          background: "#0F7B6C", color: "#fff", padding: "10px 24px", borderRadius: 10,
          fontSize: 14, fontWeight: 700, boxShadow: "0 4px 16px rgba(5,150,105,0.3)",
          animation: "fadeIn 0.2s ease",
        }}>✅ Venta registrada</div>
      )}

      {/* Filter bar */}
      {showFilters && (
        <Card style={{ marginBottom: 14, background: "#FAFAF9" }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 130 }}><Input label="Desde" type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} /></div>
            <div style={{ flex: 1, minWidth: 130 }}><Input label="Hasta" type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} /></div>
            <div style={{ flex: 1, minWidth: 130 }}><Select label="Canal" options={CHANNELS} value={filterChannel} onChange={e => setFilterChannel(e.target.value)} /></div>
            <div style={{ flex: 1, minWidth: 130 }}><Select label="Pago" options={PAYMENT_METHODS} value={filterPayment} onChange={e => setFilterPayment(e.target.value)} /></div>
            {hasActiveFilters && (
              <button onClick={clearFilters} style={{ background: "none", border: "1px solid #E03E3E55", color: "#E03E3E", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, marginBottom: 14 }}>
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

      {/* Sales list — rich cards */}
      {filtered.length === 0 ? (
        <Card><div style={{ textAlign: "center", padding: 40, color: "#B1AFA7" }}>No hay ventas registradas</div></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(r => {
            const payments = r.payments && r.payments.length > 0 ? r.payments : [{ method: r.paymentMethod, amount: r.total }];
            const itemCount = (r.items || []).reduce((s, i) => s + (i.qty || 1), 0);
            return (
              <Card key={r.id} style={{ padding: isMobile ? "12px" : "16px 20px" }}>
                {/* Top row: date + total + actions */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, color: "#8C8A82" }}>
                      {formatDate(r.date)}{r.channel ? ` · ${r.channel}` : ""}
                      {r.exchangeRate && <span style={{ color: "#B1AFA7" }}> · Blue: ${r.exchangeRate}</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                      {r.clientName && (
                        <span style={{ fontWeight: 700, fontSize: 15, color: "#37352F" }}>{r.clientName}</span>
                      )}
                      {r.createdBy && <Badge color={r.createdBy === "Diego" ? "#5E6AD2" : "#0F7B6C"}>{r.createdBy}</Badge>}
                      {r.quickSale && <Badge color="#CB912F">Rápida</Badge>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#0F7B6C" }}>{formatMoney(r.total, r.currency)}</div>
                    <div style={{ fontSize: 11, color: "#B1AFA7" }}>{itemCount} {itemCount === 1 ? "unidad" : "unidades"}</div>
                  </div>
                </div>

                {/* Products detail */}
                <div style={{ background: "#FAFAF9", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
                  {(r.items || []).map((item, idx) => {
                    const p = products.find(pr => pr.id === item.productId);
                    const prodName = item.name || (p ? `${p.brand} ${p.model} - ${p.flavor}` : "Producto eliminado");
                    const puffs = p?.puffs || "";
                    // Use saved priceARS (exact). Fallback: derive from sale total proportionally
                    const unitPrice = item.priceARS || item.customPrice || (() => {
                      const totalItems = (r.items || []).length;
                      if (totalItems === 1) return r.total / (item.qty || 1);
                      if (!p) return 0;
                      const saleRate = r.exchangeRate || exchangeRate;
                      return r.currency === "USD" ? p.priceUSD : Math.round(p.priceUSD * saleRate);
                    })();
                    return (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", borderBottom: idx < (r.items || []).length - 1 ? "1px solid #F0EFEB" : "none" }}>
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#37352F" }}>{prodName.split(" - ")[0]}</span>
                          {prodName.includes(" - ") && <span style={{ fontSize: 12, color: "#8C8A82" }}> — {prodName.split(" - ").slice(1).join(" - ")}</span>}
                          {puffs && <span style={{ fontSize: 11, color: "#B1AFA7" }}> · {puffs}p</span>}
                        </div>
                        <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <span style={{ fontSize: 12, color: "#555247" }}>x{item.qty}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#37352F", marginLeft: 8 }}>{formatMoney(unitPrice * item.qty, r.currency)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Bottom row: payment info + badges + actions */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {/* Payment methods */}
                    {payments.map((pay, i) => (
                      <span key={i} style={{ fontSize: 11, color: "#555247", background: "#E8E7E3", padding: "2px 8px", borderRadius: 6 }}>
                        {pay.method}{pay.mpAccount ? ` (${pay.mpAccount})` : ""}{payments.length > 1 ? `: ${formatMoney(Number(pay.amount) || 0)}` : ""}
                      </span>
                    ))}
                    {/* Discount badge */}
                    {(r.discountAmount || 0) > 0 && (
                      <Badge color="#b8860b">-{formatMoney(r.discountAmount)} desc.</Badge>
                    )}
                    {/* Debt/credit badges */}
                    {(r.debtAmount || 0) > 0 && (
                      <Badge color="#E03E3E">Debe {formatMoney(r.debtAmount)}</Badge>
                    )}
                    {(r.changeAmount || 0) > 0 && r.changeMethod === "credit" && (
                      <Badge color="#5E6AD2">Crédito {formatMoney(r.changeAmount)}</Badge>
                    )}
                    {(r.changeAmount || 0) > 0 && r.changeMethod && r.changeMethod !== "credit" && (
                      <Badge color="#ea580c">Vuelto {formatMoney(r.changeAmount)} ({r.changeMethod})</Badge>
                    )}
                    {r.notes && <span style={{ fontSize: 11, color: "#B1AFA7", fontStyle: "italic" }}>"{r.notes}"</span>}
                  </div>
                  {/* Action buttons */}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => repeatSale(r)} style={{ background: "#FDECC8", border: "1px solid #fcd34d", color: "#b8860b", cursor: "pointer", fontSize: 15, borderRadius: 8, padding: "6px 10px", minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center" }} title="Repetir">🔄</button>
                    <button onClick={() => openEdit(r)} style={{ background: "#EAECF9", border: "1px solid #D4D7F2", color: "#5E6AD2", cursor: "pointer", fontSize: 15, borderRadius: 8, padding: "6px 10px", minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center" }} title="Editar">✏️</button>
                    {confirmDeleteSale === r.id
                      ? <button onClick={() => deleteSale(r)} style={{ background: "#E03E3E", border: "none", color: "#fff", padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, minHeight: 36 }}>Eliminar</button>
                      : <button onClick={() => deleteSale(r)} style={{ background: "#FBE4E4", border: "1px solid #F1B8B6", color: "#E03E3E", cursor: "pointer", fontSize: 15, borderRadius: 8, padding: "6px 10px", minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center" }} title="Eliminar">🗑️</button>
                    }
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ============================================ */}
      {/* SALE MODAL */}
      {/* ============================================ */}
      <Modal open={modal} onClose={() => { setModal(false); setEditing(null); setEditingRate(null); setStep(1); }} title={editing ? "Editar Venta" : "Nueva Venta"}>

        {/* Exchange rate indicator */}
        {editing && editingRate && (
          <div style={{ background: "#DDEBF1", border: "1px solid #B1D4E8", borderRadius: 8, padding: "6px 12px", marginBottom: 12, fontSize: 12, color: "#2383E2", fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
            <span>Tipo de cambio de esta venta: ${editingRate}</span>
            {editingRate !== exchangeRate && <span style={{ color: "#B1AFA7", fontWeight: 400 }}>Actual: ${exchangeRate}</span>}
          </div>
        )}

        {/* Step indicator */}
        <div style={{ display: "flex", gap: 0, marginBottom: 18 }}>
          {[
            { n: 1, label: "Productos" },
            { n: 2, label: "Cliente & Pago" },
          ].map(s => (
            <button key={s.n} onClick={() => setStep(s.n)} style={{
              flex: 1, padding: "8px 0", border: "none", cursor: "pointer",
              background: step === s.n ? "#5E6AD2" : "#E8E7E3",
              color: step === s.n ? "#fff" : "#8C8A82",
              fontWeight: 700, fontSize: 13,
              borderRadius: s.n === 1 ? "8px 0 0 8px" : "0 8px 8px 0",
            }}>
              {s.n}. {s.label}
            </button>
          ))}
        </div>

        {/* Advanced options (fecha, moneda) — collapsed by default */}
        <button onClick={() => setShowAdvanced(!showAdvanced)} style={{
          background: "none", border: "none", color: "#5E6AD2", fontSize: 12, fontWeight: 600,
          cursor: "pointer", marginBottom: showAdvanced ? 8 : 14, display: "flex", alignItems: "center", gap: 4,
        }}>
          {showAdvanced ? "▾" : "▸"} Fecha y moneda
          {(form.currency !== "ARS" || form.date !== new Date().toISOString().slice(0, 10)) && (
            <span style={{ color: "#CB912F", fontSize: 10 }}>● modificado</span>
          )}
        </button>
        {showAdvanced && (
          <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1 }}><Input label="Fecha" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div style={{ flex: 1 }}><Select label="Moneda" options={["ARS", "USD", "USDT"]} value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} /></div>
          </div>
        )}

        {/* Validation error */}
        {validationError && (
          <div style={{ background: "#FBE4E4", border: "1px solid #F1B8B6", borderRadius: 8, padding: "8px 12px", marginBottom: 12, color: "#E03E3E", fontSize: 13, fontWeight: 600 }}>
            {validationError}
          </div>
        )}

        {/* Step 1: Products */}
        {step === 1 && (
          <>
            {renderProductPicker()}
            {renderDiscountSection()}
            {renderExtras()}
            {renderTotals()}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
              <Btn variant="secondary" onClick={() => { setModal(false); setEditing(null); }}>Cancelar</Btn>
              <Btn onClick={() => { setValidationError(""); setStep(2); }}
                disabled={form.items.every(i => !i.productId)}
                style={{ background: form.items.some(i => i.productId) ? "#5E6AD2" : "#c7c7c7" }}>
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
