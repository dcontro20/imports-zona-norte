import { useState, useMemo, useCallback } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Modal, Card, Btn, Input, Select, Table, Badge, SearchBar, StatCard } from "./UI.jsx";
import { CHANNELS, PAYMENT_METHODS, MP_ACCOUNTS, DISCOUNT_REASONS, BRAND_COLORS } from "../constants.js";
import { reverseSaleBalanceDelta, isDateInClosedMonth } from "../calcs.js";
import {
  findCouponByCode, validateCoupon, calcCouponDiscount,
  resolveChannelPrice, hasChannelPriceOverride,
  calcVolumeDiscountPct, calcTierDiscountPct, calcLoyaltyDiscountPct,
} from "../pricing.js";
import { T, pickAvatarColor } from "../theme.js";
import SaleCard from "./sales/SaleCard.jsx";
import { getClientInsights } from "../lib/clientInsights.js";
import { calcSaleMargin } from "../finance.js";
import { generateSaleReceipt } from "../lib/saleReceipt.js";
import { crossSellPairs } from "../lib/smartOffers.js";
import { extractOffersFromAuditLog, offersForClient, recentGroupOffers } from "../lib/offerHistory.js";

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
  if (method === "Mercado Pago") return mpAccount === "MP Gustavo" ? "mpGustavo" : "mpDiego";
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
  // S16.1 — cupón aplicado
  couponCode: "", couponDiscount: 0,
  extras: [],
  // Change (vuelto)
  changeAmount: 0, changeMethod: "", changeMpAccount: "",
  // Debt
  debtAmount: 0, debtDirection: "",
  debtConfirmed: false, debtReason: "", // "paga_despues" | "precio_acordado"
  notes: "", date: new Date().toISOString().slice(0, 10),
  linkedOfferId: "",
});

export const Sales = ({
  sales, setSales, products, setProducts, logStock, exchangeRate, currentUser, logAudit,
  clients, setClients, cashMovements, setCashMovements, monthlyClosures = [],
  coupons = [], setCoupons, auditLog = [],
}) => {
  const { isMobile, isTablet } = useResponsive();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [filterChannel, setFilterChannel] = useState("");
  const [filterPayment, setFilterPayment] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterPresets, setFilterPresets] = useState(() => {
    try { return JSON.parse(localStorage.getItem("vapestock_filterPresets") || "[]"); } catch { return []; }
  });
  const [selectedSaleIds, setSelectedSaleIds] = useState([]); // multi-select para bulk actions
  const [viewMode, setViewMode] = useState("cards"); // "cards" | "timeline"
  const [form, setForm] = useState(emptyForm());
  const [step, setStep] = useState(1); // 1=products, 2=client+payment, 3=review
  const [clientSearch, setClientSearch] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  // Paginación simple: arranca con 50 ventas visibles, botón "Mostrar más" suma 50.
  // Evita renderear cientos de SaleCards al abrir Sales; el usuario los pide si los necesita.
  const [visibleCount, setVisibleCount] = useState(50);
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
    // S16.2 — Si el producto tiene override de precio para el canal, lo usamos.
    // Sino, fallback al priceUSD default. resolveChannelPrice maneja ambos casos.
    const priceUSD = resolveChannelPrice(prod, form.channel, "USD");
    return form.currency === "USD" ? priceUSD : Math.round(priceUSD * activeRate);
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

  // S16.1 — Cupón aplicado al subtotal después del descuento manual.
  // Se evalúa el cupón en cada render para validar (vigencia, audiencia, etc).
  const couponState = useMemo(() => {
    if (!form.couponCode) return { applied: null, discount: 0, error: null };
    const coupon = findCouponByCode(coupons, form.couponCode);
    if (!coupon) return { applied: null, discount: 0, error: "Cupón no encontrado" };
    const client = (clients || []).find(c => c.id === form.clientId);
    const isFirstPurchase = client
      ? !(sales || []).some(s => !s.isDeleted && s.clientId === client.id && s.id !== editing)
      : true;
    const subAfterDiscount = Math.max(0, subtotal - discountAmount);
    const validation = validateCoupon(coupon, {
      subtotalARS: subAfterDiscount,
      client,
      isFirstPurchase,
    });
    if (!validation.ok) return { applied: null, discount: 0, error: validation.reason };
    const discount = calcCouponDiscount(coupon, subAfterDiscount);
    return { applied: coupon, discount, error: null };
  }, [form.couponCode, form.clientId, coupons, clients, sales, subtotal, discountAmount, editing]);
  const couponDiscount = couponState.discount;

  const finalTotal = Math.max(0, subtotal - discountAmount - couponDiscount + extrasTotal);

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

  // ----- Inteligencia del cliente (panel en el modal) -----
  const clientInsights = useMemo(() => {
    if (!form.clientId) return null;
    const client = (clients || []).find(c => c.id === form.clientId);
    if (!client) return null;
    return getClientInsights(client, sales, products, { exchangeRate });
  }, [form.clientId, clients, sales, products, exchangeRate]);

  // ----- Ofertas candidatas para linkear esta venta -----
  // Cliente seleccionado en últimos 14d + grupales en últimos 7d.
  // Si no hay candidatos, el dropdown no aparece.
  const candidateOffers = useMemo(() => {
    const allOffers = extractOffersFromAuditLog(auditLog);
    const personal = form.clientId ? offersForClient(allOffers, form.clientId) : [];
    const group = recentGroupOffers(allOffers);
    return [...personal, ...group];
  }, [auditLog, form.clientId]);

  // ----- Margen de la venta en curso (ganancia con costo real) -----
  const saleMargin = useMemo(() => {
    const items = form.items.filter(i => i.productId).map(i => ({
      productId: i.productId,
      qty: Number(i.qty) || 1,
      customPrice: i.customPrice !== "" && i.customPrice !== undefined ? Number(i.customPrice) : undefined,
    }));
    if (items.length === 0) return null;
    const pseudoSale = { items, total: finalTotal, currency: form.currency, exchangeRate };
    return calcSaleMargin(pseudoSale, products, exchangeRate);
  }, [form.items, finalTotal, form.currency, products, exchangeRate]);

  // ----- Upsell: cross-sell según lo ya agregado -----
  const upsellSuggestions = useMemo(() => {
    const inCart = new Set(form.items.map(i => i.productId).filter(Boolean));
    if (inCart.size === 0) return [];
    const pairs = crossSellPairs(sales, { minTogether: 2, limit: 30 });
    const suggestedIds = new Set();
    pairs.forEach(pair => {
      if (inCart.has(pair.a) && !inCart.has(pair.b)) suggestedIds.add(pair.b);
      if (inCart.has(pair.b) && !inCart.has(pair.a)) suggestedIds.add(pair.a);
    });
    return Array.from(suggestedIds)
      .map(id => products.find(p => p.id === id))
      .filter(p => p && !p.isDeleted && (Number(p.stock) || 0) > 0)
      .slice(0, 4);
  }, [form.items, sales, products]);

  // Agrega un producto sugerido al carrito (upsell)
  const addSuggestedProduct = useCallback((product) => {
    setForm(f => {
      // Reusar un item vacío si existe, sino agregar uno nuevo
      const emptyIdx = f.items.findIndex(i => !i.productId);
      const newItem = { brand: product.brand, model: product.model, productId: product.id, qty: 1, customPrice: "" };
      if (emptyIdx >= 0) {
        const items = [...f.items];
        items[emptyIdx] = newItem;
        return { ...f, items };
      }
      return { ...f, items: [...f.items, newItem] };
    });
  }, []);

  // S16.3 — Descuento automático por volumen
  // S16.9 — Descuento automático por tier
  // S16.19 — Descuento por fidelización (compras del mes)
  const autoDiscounts = useMemo(() => {
    const client = (clients || []).find(c => c.id === form.clientId);
    const volumePct = calcVolumeDiscountPct(totalQty);
    const tierPct = calcTierDiscountPct(client);
    const loyaltyPct = calcLoyaltyDiscountPct(client, sales);
    return {
      volumePct,
      tierPct,
      loyaltyPct,
      maxPct: Math.max(volumePct, tierPct, loyaltyPct),
      total: volumePct + tierPct + loyaltyPct,
    };
  }, [totalQty, form.clientId, clients, sales]);

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
    // Repetir copia datos editables (pagos, descuentos, extras, notas)
    // como nueva venta — fecha de hoy, sin deuda, sin vuelto.
    const payments = (sale.payments || []).length > 0
      ? sale.payments.map(p => ({ ...p }))
      : [{ method: sale.paymentMethod || "", mpAccount: sale.mpAccount || "", amount: "" }];
    setForm({
      ...emptyForm(),
      items: items.length > 0 ? items : [{ brand: "", model: "", productId: "", qty: 1 }],
      clientId: sale.clientId || "",
      clientName: sale.clientName || "",
      channel: sale.channel || getLastChannel(),
      currency: sale.currency || "ARS",
      payments,
      discountType: sale.discountType || "none",
      discountValue: sale.discountValue ? String(sale.discountValue) : "",
      discountReason: sale.discountReason || "",
      extras: sale.extras || [],
      notes: sale.notes || "",
    });
    if (sale.clientName) setClientSearch(sale.clientName);
    setEditing(null);
    setStep(1);
    setModal(true);
  };

  const openEdit = (sale) => {
    // S14.5 — Congelar closures: advertir si la venta cae en un mes ya cerrado.
    // No bloqueamos duro porque puede haber casos legítimos de corrección, pero
    // dejamos al usuario decidir conscientemente.
    if (isDateInClosedMonth(monthlyClosures, sale.date)) {
      const proceed = confirm(
        `⚠️ Esta venta es de un mes YA CERRADO (${(sale.date || "").slice(0, 7)}).\n\n` +
        `Si la editás, los números del cierre snapshot seguirán mostrando el dato VIEJO ` +
        `mientras que Reports y Dashboard mostrarán el NUEVO. Vas a tener inconsistencia.\n\n` +
        `Si necesitás corregir, considerá hacer un ajuste contable en el mes corriente.\n\n` +
        `¿Editar de todos modos?`
      );
      if (!proceed) return;
    }
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
      linkedOfferId: sale.linkedOfferId || "",
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
      // Guard: si el vuelto se deja como crédito del cliente, debe haber cliente.
      // Sin clientId ni cliente nuevo, el crédito queda registrado en la venta
      // pero sin destino → plata "fantasma" (el cliente nunca podrá usarlo).
      if (changeMethod === "credit" && !form.clientId && !(form.isNewClient && form.clientName)) {
        setValidationError("El vuelto como crédito necesita un cliente. Seleccioná uno o creá uno nuevo.");
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
        // Snapshot del costo real al momento de la venta (avgCost ponderado o
        // costUSDT manual). Fija el COGS de esta venta aunque el costo cambie después.
        const costSnapshot = prod
          ? (Number(prod.avgCostUSDT) > 0 ? Number(prod.avgCostUSDT)
            : Number(prod.costUSDT) > 0 ? Number(prod.costUSDT) : 0)
          : 0;
        return {
          productId: i.productId, qty: Number(i.qty) || 1,
          priceUSD: prod?.priceUSD || 0,
          priceARS: unitPriceARS,
          name: prod ? `${prod.brand} ${prod.model} - ${prod.flavor}` : "",
          ...(costSnapshot > 0 ? { costUSDTAtSale: costSnapshot } : {}),
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
      // S16.1 — cupón aplicado (puede ser null si no se usó)
      couponCode: couponState.applied ? couponState.applied.code : "",
      couponDiscount: couponState.discount || 0,
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
      linkedOfferId: form.linkedOfferId || "",
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
      const originalSale = sales.find(s => s.id === editing);
      setSales(prev => prev.map(s => s.id === editing ? saleData : s));
      if (logAudit) logAudit("update", "sale", editing, `Editó venta: ${form.clientName || "sin nombre"} · ${formatMoney(total, form.currency)}`);
      // S16.1 BUG-FIX — al editar, ajustar usedCount si cambió el cupón.
      // Antes: solo se incrementaba en ventas nuevas → al cambiar cupón en edit
      // los counts quedaban drift (ROI falso, posible bloqueo por maxUses fantasma).
      if (setCoupons) {
        const oldCode = originalSale?.couponCode || "";
        const newCode = couponState.applied?.code || "";
        if (oldCode !== newCode) {
          setCoupons(prev => prev.map(c => {
            if (oldCode && c.code === oldCode) {
              return { ...c, usedCount: Math.max(0, (c.usedCount || 0) - 1) };
            }
            if (newCode && c.id === couponState.applied?.id) {
              return { ...c, usedCount: (c.usedCount || 0) + 1 };
            }
            return c;
          }));
        }
      }
    } else {
      // Log stock
      validItems.forEach(item => {
        logStock({ productId: item.productId, type: "venta", qty: -(Number(item.qty) || 1), reason: `Venta a ${form.clientName || "sin nombre"}`, refId: saleId, date: form.date });
      });
      setSales(prev => [saleData, ...prev]);
      if (logAudit) logAudit("create", "sale", saleId, `Creó venta: ${form.clientName || "sin nombre"} · ${formatMoney(total, form.currency)}`);
      // S16.1 — incrementar usedCount del cupón solo en ventas nuevas
      if (couponState.applied && setCoupons) {
        const couponId = couponState.applied.id;
        setCoupons(prev => prev.map(c => c.id === couponId ? { ...c, usedCount: (c.usedCount || 0) + 1 } : c));
      }
    }

    // ---- Helper: reverse a sale's balance impact on a client ----
    // Usa reverseSaleBalanceDelta de calcs.js (función pura testeada)
    const reverseSaleBalance = (sale, clientId) => {
      if (!sale || !clientId) return;
      const delta = reverseSaleBalanceDelta(sale);
      if (delta === 0) return;
      setClients(prev => prev.map(c => {
        if (c.id !== clientId) return c;
        return { ...c, balance: Math.round(((c.balance || 0) + delta) * 100) / 100 };
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

    // NOTA: NO crear cashMovement automático por el vuelto.
    // El vuelto está declarado en sale.changeAmount + sale.changeMethod y es
    // procesado tanto por el ledger (visualización) como por calcBalance (saldo real)
    // en CashBox.jsx. Crear un cashMovement adicional acá causaba doble contabilización
    // (ver caso Maggie Gos del 21/04/2026).

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
    // S14.5 — guard de mes cerrado en delete
    if (isDateInClosedMonth(monthlyClosures, sale.date) && confirmDeleteSale !== sale.id) {
      const proceed = confirm(
        `⚠️ Esta venta es de un mes YA CERRADO. Borrarla descuadrara el snapshot del cierre.\n\n` +
        `¿Borrar de todos modos?`
      );
      if (!proceed) return;
    }
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
    // S16.1 BUG-FIX — decrementar usedCount del cupón si la venta tenía uno.
    // Trash.restore lo vuelve a incrementar simétricamente.
    if (sale.couponCode && setCoupons) {
      setCoupons(prev => prev.map(c =>
        c.code === sale.couponCode ? { ...c, usedCount: Math.max(0, (c.usedCount || 0) - 1) } : c
      ));
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

  // ---- Filter presets (localStorage) ----
  const persistPresets = (next) => {
    setFilterPresets(next);
    try { localStorage.setItem("vapestock_filterPresets", JSON.stringify(next)); } catch {}
  };
  const saveCurrentPreset = () => {
    const name = prompt("Nombre del filtro guardado (ej: 'WhatsApp con deuda'):");
    if (!name || !name.trim()) return;
    const next = [...filterPresets, {
      id: Date.now().toString(36),
      name: name.trim(),
      filterChannel, filterPayment, filterDateFrom, filterDateTo,
      search,
    }];
    persistPresets(next);
  };
  const applyPreset = (p) => {
    setFilterChannel(p.filterChannel || "");
    setFilterPayment(p.filterPayment || "");
    setFilterDateFrom(p.filterDateFrom || "");
    setFilterDateTo(p.filterDateTo || "");
    setSearch(p.search || "");
  };
  const deletePreset = (id) => {
    if (!confirm("¿Eliminar este filtro guardado?")) return;
    persistPresets(filterPresets.filter(p => p.id !== id));
  };

  // ---- Multi-select helpers ----
  const toggleSelectSale = (id) => {
    setSelectedSaleIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const clearSelection = () => setSelectedSaleIds([]);
  const bulkDelete = () => {
    if (selectedSaleIds.length === 0) return;
    if (!confirm(`¿Eliminar ${selectedSaleIds.length} ventas seleccionadas? Se moverán a Papelera, se restaurará el stock y se revertirán los balances de clientes.`)) return;
    const salesToDelete = sales.filter(s => selectedSaleIds.includes(s.id) && !s.isDeleted);
    // 1. Restaurar stock de cada item de cada venta
    const stockDeltas = {}; // productId -> qty a sumar
    salesToDelete.forEach(sale => {
      (sale.items || []).forEach(item => {
        if (!item.productId) return;
        stockDeltas[item.productId] = (stockDeltas[item.productId] || 0) + (item.qty || 1);
      });
    });
    setProducts(prev => prev.map(p => stockDeltas[p.id] && !p.isDeleted ? { ...p, stock: (p.stock || 0) + stockDeltas[p.id] } : p));
    // 2. Restaurar balance de clientes (undo debt, credit used, change-as-credit)
    const balanceDeltas = {}; // clientId -> ARS a sumar al balance
    salesToDelete.forEach(sale => {
      if (!sale.clientId) return;
      let delta = 0;
      if (sale.debtAmount > 0) delta += sale.debtAmount;
      if (sale.creditUsed > 0) delta += sale.creditUsed;
      if (sale.changeAmount > 0 && sale.changeMethod === "credit") delta -= sale.changeAmount;
      if (delta !== 0) balanceDeltas[sale.clientId] = (balanceDeltas[sale.clientId] || 0) + delta;
    });
    if (Object.keys(balanceDeltas).length > 0) {
      setClients(prev => prev.map(c => {
        if (!balanceDeltas[c.id]) return c;
        return { ...c, balance: Math.round(((c.balance || 0) + balanceDeltas[c.id]) * 100) / 100 };
      }));
    }
    // 3. Soft-delete las ventas
    setSales(prev => prev.map(s => selectedSaleIds.includes(s.id)
      ? { ...s, isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: currentUser?.name || "?" }
      : s
    ));
    // 4. Audit log con detalle del bulk
    if (logAudit) selectedSaleIds.forEach(id => logAudit("delete", "sale", id, `Borrado masivo (${salesToDelete.length} ventas) — stock y balances restaurados`));
    clearSelection();
  };
  const filteredRevenue = filtered.reduce((s, sale) => s + (sale.total || 0), 0);

  const totalDiscountsMonth = useMemo(() => {
    const now = new Date();
    return activeSales.filter(s => {
      const d = new Date(s.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && (s.discountAmount || 0) > 0;
    }).reduce((sum, s) => sum + (s.discountAmount || 0), 0);
  }, [activeSales]);

  // ---- month stats for header ----
  const monthStats = useMemo(() => {
    const now = new Date();
    const monthSales = activeSales.filter(s => {
      const d = new Date(s.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const revenue = monthSales.reduce((s, sale) => s + (sale.total || 0), 0);
    const units = monthSales.reduce((s, sale) => s + (sale.items || []).reduce((a, i) => a + (i.qty || 1), 0), 0);
    const avgTicket = monthSales.length > 0 ? Math.round(revenue / monthSales.length) : 0;
    const debtors = monthSales.filter(s => (s.debtAmount || 0) > 0);
    const totalDebt = debtors.reduce((s, sale) => s + (sale.debtAmount || 0), 0);
    return { count: monthSales.length, revenue, units, avgTicket, debtCount: debtors.length, totalDebt };
  }, [activeSales]);

  // ---- quick date presets ----
  const applyDatePreset = (preset) => {
    const today = new Date().toISOString().slice(0, 10);
    const toDate = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    if (preset === "today") { setFilterDateFrom(today); setFilterDateTo(today); }
    else if (preset === "week") { setFilterDateFrom(toDate(7)); setFilterDateTo(today); }
    else if (preset === "month") {
      const d = new Date(); d.setDate(1);
      setFilterDateFrom(d.toISOString().slice(0, 10)); setFilterDateTo(today);
    }
    else { setFilterDateFrom(""); setFilterDateTo(""); }
  };
  const activeDatePreset = (() => {
    const today = new Date().toISOString().slice(0, 10);
    const toDate = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    if (filterDateFrom === today && filterDateTo === today) return "today";
    if (filterDateFrom === toDate(7) && filterDateTo === today) return "week";
    const firstDay = (() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); })();
    if (filterDateFrom === firstDay && filterDateTo === today) return "month";
    if (!filterDateFrom && !filterDateTo) return "all";
    return "custom";
  })();

  // ============================================
  // RENDER
  // ============================================

  const chipStyle = (active) => ({
    padding: "7px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer",
    border: `1.5px solid ${active ? "#1E2B4A" : "#E5DAC2"}`,
    background: active ? "#1E2B4A" : "#F8F2E7",
    color: active ? "#fff" : "#3A4868",
    transition: "all .15s",
    whiteSpace: "nowrap",
  });

  // ---- Product picker (cascading) ----
  const renderProductPicker = () => (
    <div>
      <label style={{ display: "block", fontSize: 12, color: "#6B7794", marginBottom: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
        Productos ({totalQty} {totalQty === 1 ? "unidad" : "unidades"})
      </label>

      {form.items.map((item, i) => {
        const modelsForBrand = item.brand ? getModels(item.brand) : [];
        const flavorsForModel = item.brand && item.model ? getFlavors(item.brand, item.model) : [];
        const selectedProd = item.productId ? products.find(p => p.id === item.productId) : null;
        const priceDisplay = selectedProd ? (form.currency === "USD" ? formatMoney(selectedProd.priceUSD, "USD") : formatMoney(Math.round(selectedProd.priceUSD * exchangeRate))) : "";

        return (
          <div key={i} style={{
            background: "#F8F2E7", border: "1px solid #E5DAC2", borderRadius: 12, padding: isMobile ? 12 : 14,
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
              <div style={{ fontSize: 11, color: "#9AA2B3", marginBottom: 6, fontWeight: 600 }}>MARCA</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {brands.map(b => (
                  <button key={b} onClick={() => updateItem(i, "brand", b)}
                    style={{
                      ...chipStyle(item.brand === b),
                      ...(item.brand === b ? { background: BRAND_COLORS[b] || "#1E2B4A", borderColor: BRAND_COLORS[b] || "#1E2B4A" } : {}),
                    }}>
                    {b}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 2: Model chips */}
            {item.brand && modelsForBrand.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#9AA2B3", marginBottom: 6, fontWeight: 600 }}>MODELO</div>
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
                  <div style={{ fontSize: 11, color: "#9AA2B3", marginBottom: 6, fontWeight: 600 }}>SABOR ({flavorsForModel.length})</div>
                  {flavorsForModel.length >= 8 && (
                    <input value={flavorSearch} onChange={e => setFlavorSearch(e.target.value)}
                      placeholder="Filtrar sabor..."
                      style={{ width: "100%", padding: isMobile ? "10px 12px" : "7px 10px", background: "#FFFFFF", border: "1px solid #E5DAC2", borderRadius: 8, fontSize: isMobile ? 16 : 13, outline: "none", marginBottom: 8, boxSizing: "border-box" }} />
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
                    {filteredFlavors.length === 0 && <span style={{ color: "#9AA2B3", fontSize: 12 }}>Sin resultados</span>}
                  </div>
                </div>
              );
            })()}

            {/* Row 4: Qty + price */}
            {selectedProd && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => updateItem(i, "qty", Math.max(1, (item.qty || 1) - 1))}
                    style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #E5DAC2", background: "#FFFFFF", cursor: "pointer", fontSize: 16, fontWeight: 700 }}>−</button>
                  <span style={{ fontSize: 18, fontWeight: 800, minWidth: 28, textAlign: "center" }}>{item.qty || 1}</span>
                  <button onClick={() => updateItem(i, "qty", Math.min(selectedProd.stock, (item.qty || 1) + 1))}
                    style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #E5DAC2", background: "#FFFFFF", cursor: "pointer", fontSize: 16, fontWeight: 700 }}>+</button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="number" value={item.customPrice !== undefined && item.customPrice !== "" ? item.customPrice : ""}
                    onChange={e => updateItem(i, "customPrice", e.target.value)}
                    placeholder={String(priceDisplay.replace(/[^\d]/g, ""))}
                    style={{ width: isMobile ? 90 : 75, padding: isMobile ? "8px 6px" : "4px 6px", minHeight: isMobile ? 36 : "auto", border: "1px solid #E5DAC2", borderRadius: 6, fontSize: isMobile ? 16 : 13, textAlign: "center", background: item.customPrice ? "#FBE3B3" : "#F8F2E7", color: "#1E2B4A" }}
                  />
                  <span style={{ fontSize: 11, color: "#9AA2B3" }}>/u</span>
                </div>
                <span style={{ fontSize: 11, color: "#9AA2B3" }}>Stock: {selectedProd.stock}</span>
                <div style={{ marginLeft: "auto", fontSize: 16, fontWeight: 800, color: "#0F7B6C" }}>
                  {formatMoney(getItemPrice(item) * (item.qty || 1), form.currency)}
                </div>
              </div>
            )}
            {/* S16.7/16.11 — Sugerencias de descuento en el item */}
            {selectedProd && (() => {
              const tips = [];
              // Última unidad (16.11)
              if (selectedProd.stock === 1) {
                tips.push({ icon: "🎯", color: "#1E2B4A", text: "Última unidad — sugerí -10% para cerrar venta" });
              }
              // Vencimiento próximo (16.7)
              if (selectedProd.expiryDate) {
                const days = Math.floor((new Date(selectedProd.expiryDate) - new Date()) / 86400000);
                if (days < 0) tips.push({ icon: "⚠️", color: "#E03E3E", text: `Vencido hace ${Math.abs(days)} días — liquidar urgente -40%` });
                else if (days < 7) tips.push({ icon: "⏰", color: "#E03E3E", text: `Vence en ${days}d — sugerí -25%` });
                else if (days < 14) tips.push({ icon: "⏰", color: "#CB912F", text: `Vence en ${days}d — sugerí -15%` });
                else if (days < 30) tips.push({ icon: "⏰", color: "#CB912F", text: `Vence en ${days}d — sugerí -5%` });
              }
              // Override de canal (16.2)
              if (hasChannelPriceOverride(selectedProd, form.channel)) {
                tips.push({ icon: "🛒", color: "#0F7B6C", text: `Precio especial para canal "${form.channel}" aplicado` });
              }
              if (tips.length === 0) return null;
              return (
                <div style={{ marginTop: 6 }}>
                  {tips.map((t, idx) => (
                    <div key={idx} style={{
                      padding: "4px 8px", marginTop: 4, fontSize: 11, fontWeight: 600,
                      background: `${t.color}15`, color: t.color, borderRadius: 6,
                      border: `1px solid ${t.color}33`,
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      <span>{t.icon}</span><span>{t.text}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        );
      })}

      <button onClick={addItem} style={{
        background: "none", border: "2px dashed #E5DAC2", color: "#1E2B4A", padding: "10px 14px",
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
      <label style={{ display: "block", fontSize: 12, color: "#6B7794", marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
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
            <div style={{ fontWeight: 700, fontSize: 14, color: "#1E2B4A" }}>{form.clientName}</div>
            {clientCredit !== 0 && (
              <div style={{ fontSize: 12, color: clientCredit > 0 ? "#0F7B6C" : "#E03E3E", fontWeight: 600 }}>
                {clientCredit > 0 ? `Saldo a favor: ${formatMoney(clientCredit)}` : `Deuda: ${formatMoney(Math.abs(clientCredit))}`}
              </div>
            )}
          </div>
          <button onClick={() => { setForm(f => ({ ...f, clientId: "", clientName: "", isNewClient: false })); setClientSearch(""); }}
            style={{ background: "none", border: "none", color: "#9AA2B3", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
      ) : form.isNewClient ? (
        // New client inline form
        <div style={{ background: "#EAECF9", border: "1px solid #D4D7F2", borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12, color: "#1E2B4A", fontWeight: 700, marginBottom: 10 }}>NUEVO CLIENTE</div>
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
              width: "100%", padding: "10px 14px", background: "#F8F2E7", border: "1px solid #E5DAC2",
              borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box",
            }}
          />
          {showClientDropdown && (clientSearch.length > 0) && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, background: "#FFFFFF",
              border: "1px solid #E5DAC2", borderRadius: 10, marginTop: 4, zIndex: 50,
              maxHeight: 250, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            }}>
              {filteredClients.map(c => (
                <button key={c.id} onClick={() => {
                  if (c.isBlocked) {
                    const proceed = confirm(`⚠️ Cliente bloqueado: ${c.name}\n\nRazón: ${c.blockReason || "(sin razón)"}\n\n¿Cargar venta de todos modos?`);
                    if (!proceed) return;
                  }
                  setForm(f => ({ ...f, clientId: c.id, clientName: c.name }));
                  setClientSearch(c.name);
                  setShowClientDropdown(false);
                }} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                  background: "none", border: "none", borderBottom: "1px solid #E5DAC2",
                  cursor: "pointer", width: "100%", textAlign: "left",
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", background: "#1E2B4A", color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0,
                  }}>{c.name.charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#1E2B4A" }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: "#9AA2B3" }}>{c.phone || c.instagram || ""}</div>
                  </div>
                  {(c.balance || 0) !== 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: c.balance > 0 ? "#0F7B6C" : "#E03E3E" }}>
                      {c.balance > 0 ? `+${formatMoney(c.balance)}` : formatMoney(c.balance)}
                    </span>
                  )}
                </button>
              ))}
              {filteredClients.length === 0 && (
                <div style={{ padding: "14px", textAlign: "center", color: "#9AA2B3", fontSize: 13 }}>
                  No se encontró "{clientSearch}"
                </div>
              )}
              <button onClick={() => {
                setForm(f => ({ ...f, isNewClient: true, clientName: clientSearch }));
                setShowClientDropdown(false);
              }} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
                background: "#F8F2E7", border: "none", cursor: "pointer", width: "100%",
                color: "#1E2B4A", fontWeight: 600, fontSize: 13, borderTop: "1px solid #E5DAC2",
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
      <label style={{ display: "block", fontSize: 12, color: "#6B7794", marginBottom: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
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
          <div style={{ flex: isMobile ? "1 1 100%" : 1, minWidth: 0 }}>
            <Select label={i === 0 ? "Método" : ""} options={PAYMENT_METHODS} value={pay.method} onChange={e => updatePayment(i, "method", e.target.value)} />
          </div>
          {pay.method === "Mercado Pago" && (
            <div style={{ flex: isMobile ? "1 1 100%" : 0.8, minWidth: 0 }}>
              <Select label={i === 0 ? "Cuenta" : ""} options={MP_ACCOUNTS} value={pay.mpAccount} onChange={e => updatePayment(i, "mpAccount", e.target.value)} />
            </div>
          )}
          <div style={{ flex: isMobile ? "1 1 100%" : 0.6, minWidth: 0, position: "relative" }}>
            <Input label={i === 0 ? "Monto" : ""} type="number" value={pay.amount}
              onChange={e => updatePayment(i, "amount", e.target.value)}
              placeholder={String(Math.round(effectiveTotal || finalTotal))} />
            {!pay.amount && (
              <button onClick={() => fillFullAmount(i)} style={{
                position: "absolute", right: 6, bottom: 18, background: "#1E2B4A", color: "#fff",
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
        background: "none", border: "1px dashed #1E2B4A33", color: "#1E2B4A", padding: "6px 14px",
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
            <span style={{ fontSize: 13, color: "#6B7794" }}>Total a cobrar</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#1E2B4A" }}>{formatMoney(effectiveTotal, form.currency)}</span>
          </div>
          {creditUsed > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: "#0F7B6C" }}>Saldo a favor aplicado</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#0F7B6C" }}>-{formatMoney(creditUsed)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: "#6B7794" }}>Pagó</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#1E2B4A" }}>{formatMoney(totalPaid, form.currency)}</span>
          </div>

          {difference > 0 && (
            <div style={{ borderTop: "1px solid #F2D59A", paddingTop: 10, marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 14, color: "#ea580c", fontWeight: 700 }}>Vuelto a dar</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: "#ea580c" }}>{formatMoney(difference, form.currency)}</span>
              </div>
              <div style={{ fontSize: 12, color: "#6B7794", marginBottom: 8, fontWeight: 600 }}>
                ¿Cómo le devolvés el vuelto?
              </div>

              {/* Two big action cards */}
              <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <button onClick={() => setForm(f => ({ ...f, changeMethod: f.changeMethod && f.changeMethod !== "credit" ? f.changeMethod : "Pesos Cash", changeMpAccount: "" }))}
                  style={{
                    flex: 1, padding: "14px 12px", borderRadius: 12, cursor: "pointer", border: "none",
                    background: form.changeMethod && form.changeMethod !== "credit" ? "#FDECC8" : "#F8F2E7",
                    outline: form.changeMethod && form.changeMethod !== "credit" ? "2px solid #ea580c" : "2px solid #E5DAC2",
                    textAlign: "center",
                  }}>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>💸</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: form.changeMethod && form.changeMethod !== "credit" ? "#ea580c" : "#3A4868" }}>Devolver vuelto</div>
                  <div style={{ fontSize: 11, color: "#9AA2B3" }}>Efectivo, transferencia, etc.</div>
                </button>
                <button onClick={() => setForm(f => ({ ...f, changeMethod: "credit", changeMpAccount: "" }))}
                  style={{
                    flex: 1, padding: "14px 12px", borderRadius: 12, cursor: "pointer", border: "none",
                    background: form.changeMethod === "credit" ? "#EAECF9" : "#F8F2E7",
                    outline: form.changeMethod === "credit" ? "2px solid #1E2B4A" : "2px solid #E5DAC2",
                    textAlign: "center",
                  }}>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>🏦</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: form.changeMethod === "credit" ? "#1E2B4A" : "#3A4868" }}>Dejar a favor</div>
                  <div style={{ fontSize: 11, color: "#9AA2B3" }}>Crédito para próxima compra</div>
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
                          border: `2px solid ${form.changeMethod === m ? "#ea580c" : "#E5DAC2"}`,
                          background: form.changeMethod === m ? "#ea580c" : "#F8F2E7",
                          color: form.changeMethod === m ? "#fff" : "#3A4868",
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
                              border: `2px solid ${form.changeMpAccount === acc ? "#ea580c" : "#E5DAC2"}`,
                              background: form.changeMpAccount === acc ? "#ea580c" : "#F8F2E7",
                              color: form.changeMpAccount === acc ? "#fff" : "#3A4868",
                            }}>{acc}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {form.changeMethod === "credit" && (
                <div style={{ background: "#EAECF9", border: "1px solid #D4D7F2", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#1E2B4A", fontWeight: 600 }}>
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
                    style={{ background: "none", border: "none", color: "#9AA2B3", cursor: "pointer", fontSize: 12 }}>Cambiar</button>
                </div>
              ) : (
                <div style={{ background: "#FDECC8", border: "1px solid #fcd34d", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, color: "#b8860b", fontWeight: 600 }}>
                    Sin deuda — precio final: {formatMoney(totalPaid)}
                  </span>
                  <button onClick={() => setForm(f => ({ ...f, debtConfirmed: false, debtReason: "" }))}
                    style={{ background: "none", border: "none", color: "#9AA2B3", cursor: "pointer", fontSize: 12 }}>Cambiar</button>
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
    <div style={{ background: "#F8F2E7", border: "1px solid #E5DAC2", borderRadius: 10, padding: 14, marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, color: "#b8860b", marginBottom: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>🏷️ Descuento</label>

      {/* S16.3+9+19 — Sugerencias automáticas según volumen, tier y fidelización */}
      {(autoDiscounts.volumePct > 0 || autoDiscounts.tierPct > 0 || autoDiscounts.loyaltyPct > 0) && (
        <div style={{
          padding: "8px 10px", marginBottom: 10,
          background: "#EAECF9", border: "1px solid #D4D7F2", borderRadius: 8,
          fontSize: 12,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#1E2B4A", marginBottom: 6 }}>
            💡 Descuentos sugeridos automáticos:
          </div>
          {autoDiscounts.volumePct > 0 && (
            <div style={{ color: "#1E2B4A", marginBottom: 3 }}>
              📦 Volumen ({totalQty} uds): <strong>-{autoDiscounts.volumePct}%</strong>
            </div>
          )}
          {autoDiscounts.tierPct > 0 && (
            <div style={{ color: "#1E2B4A", marginBottom: 3 }}>
              ⭐ Tier cliente: <strong>-{autoDiscounts.tierPct}%</strong>
            </div>
          )}
          {autoDiscounts.loyaltyPct > 0 && (
            <div style={{ color: "#1E2B4A", marginBottom: 3 }}>
              🤝 Fidelización (10+ compras este mes): <strong>-{autoDiscounts.loyaltyPct}%</strong>
            </div>
          )}
          <button
            onClick={() => setForm(f => ({
              ...f,
              discountType: "percent",
              discountValue: String(autoDiscounts.maxPct),
              discountReason: autoDiscounts.tierPct === autoDiscounts.maxPct ? "tier" :
                              autoDiscounts.loyaltyPct === autoDiscounts.maxPct ? "fidelizacion" :
                              "volumen",
            }))}
            style={{
              marginTop: 4, padding: "4px 10px", borderRadius: 6,
              background: "#1E2B4A", color: "#fff",
              border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Aplicar mejor descuento ({autoDiscounts.maxPct}%)
          </button>
        </div>
      )}
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
              border: `1px solid ${form.discountType === opt.value ? "#b8860b" : "#E5DAC2"}`,
              background: form.discountType === opt.value ? "#fdcb6e22" : "transparent",
              color: form.discountType === opt.value ? "#b8860b" : "#6B7794",
            }}>{opt.label}</button>
        ))}
      </div>
      {form.discountType !== "none" && (
        <>
          <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
            <div style={{ flex: 1 }}>
              <Input label={form.discountType === "percent" ? "%" : form.discountType === "per_unit" ? `$/unidad` : `$ Fijo`}
                type="number" value={form.discountValue}
                onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))}
                placeholder={form.discountType === "percent" ? "ej: 10" : "ej: 5000"} />
            </div>
            <div style={{ flex: 1 }}>
              <Select label="Motivo" options={DISCOUNT_REASONS} value={form.discountReason}
                onChange={e => setForm(f => ({ ...f, discountReason: e.target.value }))} />
            </div>
          </div>
          {discountAmount > 0 && (
            <div style={{ color: "#b8860b", fontSize: 13, marginTop: 4 }}>
              Descuento: <strong>-{formatMoney(discountAmount, form.currency)}</strong>
              {form.discountType === "percent" && ` (${form.discountValue}% de ${formatMoney(subtotal, form.currency)})`}
            </div>
          )}
        </>
      )}

      {/* S16.1 — Input de cupón */}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed #E5DAC2" }}>
        <label style={{ display: "block", fontSize: 12, color: "#1E2B4A", marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
          🎟️ Cupón (opcional)
        </label>
        <Input
          placeholder="Código (ej: BIENVENIDO10)"
          value={form.couponCode || ""}
          onChange={e => setForm(f => ({ ...f, couponCode: e.target.value.toUpperCase() }))}
          style={{ fontFamily: "monospace", fontWeight: 600 }}
        />
        {form.couponCode && couponState.error && (
          <div style={{
            marginTop: 6, padding: "6px 10px",
            background: "#FBE4E4", color: "#E03E3E",
            borderRadius: 6, fontSize: 12, fontWeight: 600,
          }}>
            ⚠️ {couponState.error}
          </div>
        )}
        {form.couponCode && couponState.applied && (
          <div style={{
            marginTop: 6, padding: "6px 10px",
            background: "#DDEDEA", color: "#0F7B6C",
            borderRadius: 6, fontSize: 12, fontWeight: 600,
          }}>
            ✓ <strong>{couponState.applied.code}</strong> aplicado:
            {couponState.applied.discountType === "percent"
              ? ` -${couponState.applied.discountValue}%`
              : ` -${formatMoney(couponState.applied.discountValue, form.currency)}`}
            <span style={{ float: "right" }}>-{formatMoney(couponDiscount, form.currency)}</span>
          </div>
        )}
      </div>
    </div>
  );

  // ---- Extras ----
  const renderExtras = () => (
    <div style={{ background: "#F8F2E7", border: "1px solid #E5DAC2", borderRadius: 10, padding: 14, marginBottom: 14 }}>
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
    <div style={{ background: "#F8F2E7", borderRadius: 10, padding: 14, marginBottom: 14, border: "1px solid #E5DAC2" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ color: "#6B7794", fontSize: 13 }}>Subtotal</span>
        <span style={{ color: "#3A4868", fontSize: 14 }}>{formatMoney(subtotal, form.currency)}</span>
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
      <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #E5DAC2", paddingTop: 8 }}>
        <span style={{ color: "#1E2B4A", fontSize: 15, fontWeight: 700 }}>Total</span>
        <span style={{ color: "#0F7B6C", fontSize: 20, fontWeight: 800 }}>{formatMoney(finalTotal, form.currency)}</span>
      </div>
      {/* Margen de la venta (ganancia con costo real) */}
      {saleMargin && saleMargin.cogsARS > 0 && (
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginTop: 8, paddingTop: 8, borderTop: "1px dashed #E5DAC2",
        }}>
          <span style={{ fontSize: 11, color: "#6B7794", fontWeight: 600 }}>
            💎 Ganás <strong style={{ color: saleMargin.profitARS >= 0 ? "#0F6B5C" : "#B83232" }}>{formatMoney(saleMargin.profitARS)}</strong>
          </span>
          <span style={{
            fontSize: 11, fontWeight: 800,
            color: saleMargin.marginPct >= 30 ? "#0F6B5C" : saleMargin.marginPct >= 15 ? "#CB912F" : "#B83232",
            padding: "2px 8px", borderRadius: 6,
            background: saleMargin.marginPct >= 30 ? "#D9E8E4" : saleMargin.marginPct >= 15 ? "#F5E4C2" : "#F7DEDE",
          }}>
            margen {saleMargin.marginPct}%
          </span>
        </div>
      )}
    </div>
  );

  // ============================================
  // MAIN RETURN
  // ============================================
  return (
    <div style={{ fontFamily: T.font }}>
      {/* ===== HEADER ===== */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: isMobile ? 26 : 32, fontWeight: 800, color: T.text, margin: 0, letterSpacing: "-0.02em", fontFamily: T.fontDisplay }}>
            Ventas
          </h1>
          <p style={{ color: T.textMuted, fontSize: 14, margin: "6px 0 0" }}>
            {filtered.length === activeSales.length
              ? `${activeSales.length} ventas totales`
              : `${filtered.length} de ${activeSales.length} ventas`
            }
            {filtered.length > 0 && ` · ${formatMoney(filteredRevenue)}`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", borderRadius: 8, border: `1px solid ${T.border}`, overflow: "hidden" }}>
            <button onClick={() => setViewMode("cards")} style={{
              padding: "7px 12px", border: "none",
              background: viewMode === "cards" ? T.primary : "transparent",
              color: viewMode === "cards" ? "#fff" : T.textSub,
              fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }} title="Vista cards">▦</button>
            <button onClick={() => setViewMode("timeline")} style={{
              padding: "7px 12px", border: "none",
              background: viewMode === "timeline" ? T.primary : "transparent",
              color: viewMode === "timeline" ? "#fff" : T.textSub,
              fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }} title="Vista cronológica">☰</button>
          </div>
          <button
            onClick={() => {
              if (selectedSaleIds.length > 0) clearSelection();
              else if (filtered.length > 0) toggleSelectSale(filtered[0].id);
            }}
            style={{
              padding: "8px 12px", borderRadius: 8,
              border: `1px solid ${selectedSaleIds.length > 0 ? T.primary : T.border}`,
              background: selectedSaleIds.length > 0 ? `${T.primary}15` : "transparent",
              color: selectedSaleIds.length > 0 ? T.primary : T.textSub,
              fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}
            title="Modo selección múltiple"
          >
            {selectedSaleIds.length > 0 ? `✕ ${selectedSaleIds.length} sel.` : "☐ Seleccionar"}
          </button>
          <button onClick={openNew} style={{
            padding: "10px 20px", borderRadius: 10, border: "none",
            background: T.primary, color: "#fff", fontSize: 14, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit", boxShadow: T.shadowSm,
          }}>+ Nueva venta</button>
        </div>
      </div>

      {/* ===== MONTH STATS ===== */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr 1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
        gap: isMobile ? 10 : 14, marginBottom: 20,
      }}>
        <MonthStat label="Ventas del mes" value={monthStats.count} sub={`${monthStats.units} unidades`} accent={T.primary} />
        <MonthStat label="Facturado" value={formatMoney(monthStats.revenue)} sub="este mes" accent={T.green} />
        <MonthStat label="Ticket promedio" value={formatMoney(monthStats.avgTicket)} sub="por venta" accent={T.amber} />
        <MonthStat
          label="Deudas pendientes"
          value={monthStats.debtCount > 0 ? formatMoney(monthStats.totalDebt) : "—"}
          sub={monthStats.debtCount > 0 ? `${monthStats.debtCount} ventas impagas` : "todo cobrado"}
          accent={monthStats.debtCount > 0 ? T.red : T.textMuted}
        />
      </div>

      {/* Success toast */}
      {showSaveSuccess && (
        <div style={{
          position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)", zIndex: 300,
          background: T.green, color: "#fff", padding: "10px 24px", borderRadius: 10,
          fontSize: 14, fontWeight: 700, boxShadow: T.shadow,
          animation: "fadeIn 0.2s ease",
        }}>✓ Venta registrada</div>
      )}

      {/* ===== SEARCH + FILTERS ===== */}
      <div style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radiusLg, padding: isMobile ? 12 : 16,
        marginBottom: 14, boxShadow: T.shadowXs,
      }}>
        <div style={{ position: "relative", marginBottom: 12 }}>
          <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: T.textMuted, pointerEvents: "none" }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar producto o cliente..."
            style={{
              width: "100%", padding: "12px 14px 12px 40px", background: T.surface2,
              border: `1px solid ${T.borderSoft}`, borderRadius: 10, color: T.text,
              fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
              transition: "border-color .15s",
            }}
            onFocus={e => e.currentTarget.style.borderColor = T.primary}
            onBlur={e => e.currentTarget.style.borderColor = T.borderSoft}
          />
        </div>
        {/* Filter pills */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {[
            { key: "all", label: "Todas" },
            { key: "today", label: "Hoy" },
            { key: "week", label: "7 días" },
            { key: "month", label: "Este mes" },
          ].map(p => (
            <SalesPill key={p.key} active={activeDatePreset === p.key} onClick={() => applyDatePreset(p.key)}>
              {p.label}
            </SalesPill>
          ))}
          <span style={{ width: 1, height: 18, background: T.border, margin: "0 2px" }} />
          <select value={filterChannel} onChange={e => setFilterChannel(e.target.value)} style={selectStyle(!!filterChannel)}>
            <option value="">Todos los canales</option>
            {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterPayment} onChange={e => setFilterPayment(e.target.value)} style={selectStyle(!!filterPayment)}>
            <option value="">Cualquier pago</option>
            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {(hasActiveFilters || activeDatePreset !== "all") && (
            <button onClick={() => { clearFilters(); }} style={{
              padding: "7px 12px", borderRadius: 999, border: "none",
              background: "transparent", color: T.textMuted, fontSize: 12, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
            }}>✕ Limpiar</button>
          )}
          {hasActiveFilters && (
            <button onClick={saveCurrentPreset} style={{
              padding: "7px 12px", borderRadius: 999,
              border: `1px solid ${T.greenBorder}`, background: T.greenBg, color: T.green,
              fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}>★ Guardar filtro</button>
          )}
        </div>
        {filterPresets.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 600, alignSelf: "center", marginRight: 4 }}>
              Guardados:
            </span>
            {filterPresets.map(p => (
              <span key={p.id} style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 8px 5px 10px", borderRadius: 999,
                background: T.surface2, border: `1px solid ${T.borderSoft}`,
                fontSize: 12, color: T.textSub, fontWeight: 500,
              }}>
                <button onClick={() => applyPreset(p)} style={{
                  background: "transparent", border: "none", color: T.text,
                  cursor: "pointer", fontSize: 12, padding: 0, fontFamily: "inherit", fontWeight: 600,
                }}>{p.name}</button>
                <button onClick={() => deletePreset(p.id)} aria-label="Eliminar filtro" style={{
                  background: "transparent", border: "none", color: T.textMuted,
                  cursor: "pointer", fontSize: 14, padding: "0 2px", lineHeight: 1,
                }}>×</button>
              </span>
            ))}
          </div>
        )}
        <div style={{ display: "none" }}>{/* anchor to keep next chunk valid */}
        </div>
      </div>

      {/* Discount banner */}
      {totalDiscountsMonth > 0 && (
        <div style={{
          marginBottom: 14, padding: "10px 14px",
          background: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: 10,
          display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: T.text,
        }}>
          <span>🏷️</span>
          <span>Descuentos este mes: <strong style={{ color: T.amber, fontFamily: T.fontDisplay }}>{formatMoney(totalDiscountsMonth)}</strong></span>
        </div>
      )}

      {/* ===== SALE CARDS LIST ===== */}
      {filtered.length === 0 ? (
        <div style={{
          background: T.card, border: `1px solid ${T.borderSoft}`, borderRadius: T.radiusLg,
          padding: 60, textAlign: "center", boxShadow: T.shadowXs,
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🛒</div>
          <p style={{ color: T.textMuted, fontSize: 14, margin: 0 }}>
            {activeSales.length === 0 ? "Todavía no hay ventas registradas" : "No hay ventas con esos filtros"}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {selectedSaleIds.length > 0 && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
              padding: "10px 14px", background: `${T.primary}10`,
              border: `1px solid ${T.primary}40`, borderRadius: 10, flexWrap: "wrap",
            }}>
              <span style={{ color: T.primary, fontSize: 13, fontWeight: 600 }}>
                {selectedSaleIds.length} venta{selectedSaleIds.length !== 1 ? "s" : ""} seleccionada{selectedSaleIds.length !== 1 ? "s" : ""}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setSelectedSaleIds(filtered.map(s => s.id))} style={{
                  padding: "6px 12px", borderRadius: 8, border: `1px solid ${T.border}`,
                  background: "transparent", color: T.textSub, fontSize: 12, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit",
                }}>Seleccionar todas ({filtered.length})</button>
                <button onClick={bulkDelete} style={{
                  padding: "6px 12px", borderRadius: 8, border: "none",
                  background: T.red, color: "#fff", fontSize: 12, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                }}>🗑️ Eliminar</button>
                <button onClick={clearSelection} style={{
                  padding: "6px 12px", borderRadius: 8, border: `1px solid ${T.border}`,
                  background: "transparent", color: T.textSub, fontSize: 12, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit",
                }}>Cancelar</button>
              </div>
            </div>
          )}
          {viewMode === "timeline"
            ? <TimelineView sales={filtered.slice(0, visibleCount)} clients={clients} products={products} onEdit={openEdit} />
            : filtered.slice(0, visibleCount).map(r => (
              <SaleCard
                key={r.id}
                sale={r}
                products={products}
                clients={clients}
                exchangeRate={exchangeRate}
                isMobile={isMobile}
                onEdit={() => openEdit(r)}
                onRepeat={() => repeatSale(r)}
                onDelete={() => deleteSale(r)}
                onReceiptPdf={() => generateSaleReceipt(r, products, { exchangeRate })}
                confirmDelete={confirmDeleteSale === r.id}
                selectionMode={selectedSaleIds.length > 0}
                selected={selectedSaleIds.includes(r.id)}
                onToggleSelect={toggleSelectSale}
              />
            ))
          }
          {filtered.length > visibleCount && (
            <button onClick={() => setVisibleCount(c => c + 50)} style={{
              marginTop: 10, padding: "12px 18px", minHeight: 44,
              background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
              color: T.primary, fontSize: 13, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit",
            }}>
              Mostrar más ({filtered.length - visibleCount} restantes)
            </button>
          )}
        </div>
      )}

      {/* ============================================ */}
      {/* SALE MODAL */}
      {/* ============================================ */}
      <Modal open={modal} onClose={() => { setModal(false); setEditing(null); setEditingRate(null); setStep(1); }} title={editing ? "Editar Venta" : "Nueva Venta"}>

        {/* B3 — Exchange rate locked indicator (S14 mejorado).
            Cuando se edita una venta, se preserva su rate original para no
            revaluar el revenue históricamente. El banner ahora es explícito. */}
        {editing && editingRate && (
          <div style={{
            background: editingRate !== exchangeRate ? "#FFF7E0" : "#DDEBF1",
            border: `1px solid ${editingRate !== exchangeRate ? "#F2D59A" : "#B1D4E8"}`,
            borderRadius: 8, padding: "8px 12px", marginBottom: 12,
            fontSize: 12, fontWeight: 600,
            color: editingRate !== exchangeRate ? "#A65800" : "#2383E2",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: editingRate !== exchangeRate ? 4 : 0 }}>
              🔒 <span>Tasa lockeada: ${editingRate}</span>
              {editingRate !== exchangeRate && (
                <span style={{ marginLeft: "auto", fontWeight: 500, fontSize: 11 }}>
                  Blue actual: ${exchangeRate}
                </span>
              )}
            </div>
            {editingRate !== exchangeRate && (
              <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.85 }}>
                El cambio de la venta se mantiene al rate original para preservar la
                contabilidad histórica. No se revalúa con el blue de hoy.
              </div>
            )}
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
              background: step === s.n ? "#1E2B4A" : "#E5DAC2",
              color: step === s.n ? "#fff" : "#6B7794",
              fontWeight: 700, fontSize: 13,
              borderRadius: s.n === 1 ? "8px 0 0 8px" : "0 8px 8px 0",
            }}>
              {s.n}. {s.label}
            </button>
          ))}
        </div>

        {/* Advanced options (fecha, moneda) — collapsed by default */}
        <button onClick={() => setShowAdvanced(!showAdvanced)} style={{
          background: "none", border: "none", color: "#1E2B4A", fontSize: 12, fontWeight: 600,
          cursor: "pointer", marginBottom: showAdvanced ? 8 : 14, display: "flex", alignItems: "center", gap: 4,
        }}>
          {showAdvanced ? "▾" : "▸"} Fecha y moneda
          {(form.currency !== "ARS" || form.date !== new Date().toISOString().slice(0, 10)) && (
            <span style={{ color: "#CB912F", fontSize: 10 }}>● modificado</span>
          )}
        </button>
        {showAdvanced && (
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexDirection: isMobile ? "column" : "row" }}>
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
            {/* Upsell: productos que se compran junto a lo del carrito */}
            {upsellSuggestions.length > 0 && (
              <div style={{
                background: "#EEF0FC", border: "1px solid #C5CADE", borderRadius: 10,
                padding: "10px 12px", marginBottom: 14,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#5B3592", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
                  🔗 Suelen llevarse juntos
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {upsellSuggestions.map(p => (
                    <button key={p.id} onClick={() => addSuggestedProduct(p)} style={{
                      padding: "5px 10px", fontSize: 11, fontWeight: 600,
                      background: "#FFFFFF", color: "#1E2B4A",
                      border: "1px solid #C5CADE", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
                    }}>+ {p.brand} {p.flavor}</button>
                  ))}
                </div>
              </div>
            )}
            {renderDiscountSection()}
            {renderExtras()}
            {renderTotals()}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
              <Btn variant="secondary" onClick={() => { setModal(false); setEditing(null); }}>Cancelar</Btn>
              <Btn onClick={() => { setValidationError(""); setStep(2); }}
                disabled={form.items.every(i => !i.productId)}
                style={{ background: form.items.some(i => i.productId) ? "#1E2B4A" : "#c7c7c7" }}>
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
            {/* Inteligencia del cliente */}
            {clientInsights && !clientInsights.isNew && (
              <div style={{
                background: "#FFFFFF", border: "1px solid #E5DAC2", borderRadius: 10,
                padding: "10px 12px", marginBottom: 14,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#1E2B4A", textTransform: "uppercase", letterSpacing: 0.4 }}>
                    🧠 {form.clientName}
                  </span>
                  {clientInsights.tier && clientInsights.tier !== "regular" && (
                    <span style={{ fontSize: 9, fontWeight: 800, color: "#5B3592", background: "#E4D8F0", padding: "1px 7px", borderRadius: 5, textTransform: "uppercase" }}>{clientInsights.tier}</span>
                  )}
                  {clientInsights.isDue && (
                    <span style={{ fontSize: 9, fontWeight: 800, color: "#B07A1F", background: "#F5E4C2", padding: "1px 7px", borderRadius: 5 }}>⏰ le toca comprar</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11, color: "#6B7794" }}>
                  <span>{clientInsights.orderCount} compras · ticket <strong style={{ color: "#1E2B4A" }}>{formatMoney(clientInsights.avgTicketARS)}</strong></span>
                  <span>Última hace <strong style={{ color: clientInsights.daysSinceLast > 30 ? "#B83232" : "#1E2B4A" }}>{clientInsights.daysSinceLast}d</strong></span>
                  {clientInsights.avgDaysBetween && <span>compra c/<strong style={{ color: "#1E2B4A" }}>{clientInsights.avgDaysBetween}d</strong></span>}
                </div>
                {clientInsights.topProducts.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontSize: 10, color: "#9AA2B3", fontWeight: 600 }}>Suele llevar: </span>
                    {clientInsights.topProducts.map((tp, i) => (
                      <button key={tp.product.id} onClick={() => addSuggestedProduct(tp.product)} style={{
                        padding: "2px 8px", fontSize: 10, fontWeight: 600, margin: "2px 3px 0 0",
                        background: "#F8F2E7", color: "#1E2B4A", border: "1px dashed #C5CADE",
                        borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
                      }}>+ {tp.product.flavor}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {candidateOffers.length > 0 && (
              <div style={{
                background: "#FFFFFF", border: "1px solid #E5DAC2", borderRadius: 10,
                padding: "10px 12px", marginBottom: 14,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#1E2B4A", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
                  🎯 ¿Esta venta vino de una oferta?
                </div>
                <select
                  value={form.linkedOfferId || ""}
                  onChange={e => setForm(f => ({ ...f, linkedOfferId: e.target.value }))}
                  style={{
                    width: "100%", padding: "10px 12px", minHeight: isMobile ? 44 : "auto",
                    background: "#F8F2E7", border: "1px solid #E5DAC2", borderRadius: 8,
                    color: "#1E2B4A", fontSize: isMobile ? 16 : 13, outline: "none",
                    fontFamily: "inherit", boxSizing: "border-box",
                  }}
                >
                  <option value="">— No, venta independiente —</option>
                  {candidateOffers.map(o => {
                    const when = new Date(o.timestamp);
                    const daysAgo = Math.floor((Date.now() - when.getTime()) / 86400000);
                    const label = `${o.description?.slice(0, 60) || o.category} · hace ${daysAgo}d`;
                    return <option key={o.id} value={o.id}>{label}</option>;
                  })}
                </select>
                <div style={{ fontSize: 10, color: "#9AA2B3", marginTop: 6 }}>
                  Linkear ayuda a trackear qué tipo de oferta te rinde más en Ofertas → Historial.
                </div>
              </div>
            )}
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

// ============================================
// UI primitives for the Sales list
// ============================================

const MonthStat = ({ label, value, sub, accent }) => (
  <div style={{
    background: T.card, borderRadius: T.radiusLg, padding: 14,
    border: `1px solid ${T.borderSoft}`, boxShadow: T.shadowXs,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent }} />
      <span style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.7 }}>{label}</span>
    </div>
    <div style={{
      fontSize: 20, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay,
      lineHeight: 1, letterSpacing: "-0.02em",
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>{sub}</div>}
  </div>
);

const SalesPill = ({ active, onClick, children, color = T.primary }) => (
  <button onClick={onClick} style={{
    padding: "7px 14px", borderRadius: 999, border: `1px solid ${active ? color : T.border}`,
    background: active ? `${color}15` : T.card, color: active ? color : T.textSub,
    fontSize: 13, fontWeight: active ? 600 : 500, cursor: "pointer",
    transition: "all .15s", fontFamily: "inherit", whiteSpace: "nowrap",
  }}>{children}</button>
);

// TimelineView — vista cronológica agrupada por día con totales.
// Pensada para revisar la jornada de ventas de un vistazo.
const TimelineView = ({ sales, clients, products, onEdit }) => {
  const grouped = useMemo(() => {
    const map = {};
    sales.forEach(s => {
      const day = (s.date || "").slice(0, 10);
      if (!map[day]) map[day] = [];
      map[day].push(s);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [sales]);

  if (sales.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: T.textMuted, fontSize: 13 }}>
        Sin ventas para mostrar en este rango.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {grouped.map(([day, daySales]) => {
        const dayTotal = daySales.reduce((s, sale) => s + (sale.total || 0), 0);
        const dayUnits = daySales.reduce((s, sale) => s + (sale.items || []).reduce((a, i) => a + (i.qty || 1), 0), 0);
        return (
          <div key={day} style={{
            border: `1px solid ${T.borderSoft}`, borderRadius: T.radiusLg, overflow: "hidden",
            background: T.card,
          }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
              padding: "10px 14px", background: T.surface2, borderBottom: `1px solid ${T.borderSoft}`,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                  {new Date(day + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
                </div>
                <div style={{ fontSize: 11, color: T.textMuted }}>
                  {daySales.length} venta{daySales.length !== 1 ? "s" : ""} · {dayUnits} uds
                </div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay }}>
                {formatMoney(dayTotal)}
              </div>
            </div>
            <div>
              {daySales.map((s, i) => {
                const itemSummary = (s.items || []).map(it => {
                  const p = products.find(pr => pr.id === it.productId);
                  return `${it.qty || 1}× ${p ? `${p.brand} ${p.model}` : "?"}`;
                }).join(", ");
                const hasDebt = (s.debtAmount || 0) > 0;
                return (
                  <div
                    key={s.id}
                    onClick={() => onEdit(s)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 14px",
                      borderBottom: i < daySales.length - 1 ? `1px solid ${T.borderSoft}` : "none",
                      cursor: "pointer",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = T.surface2; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: s.channel === "WhatsApp" ? "#25D366" : s.channel === "Instagram" ? "#E1306C" : s.channel === "Delivery" ? T.amber : T.primary,
                      flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, color: T.text, fontWeight: 600,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {s.clientName || "Cliente s/n"} {hasDebt && <span style={{ color: T.red, fontWeight: 700 }}>· DEBE</span>}
                      </div>
                      <div style={{
                        fontSize: 11, color: T.textMuted,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {itemSummary}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay }}>
                        {formatMoney(s.total || 0, s.currency || "ARS")}
                      </div>
                      <div style={{ fontSize: 10, color: T.textMuted }}>
                        {s.channel || "?"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const selectStyle = (active) => ({
  padding: "7px 12px", borderRadius: 999, border: `1px solid ${active ? T.primary : T.border}`,
  background: active ? `${T.primary}15` : T.card, color: active ? T.primary : T.textSub,
  fontSize: 13, fontFamily: "inherit", cursor: "pointer", outline: "none",
});

