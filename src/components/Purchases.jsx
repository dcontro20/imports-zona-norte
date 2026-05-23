import { useState, useMemo } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { isDateInClosedMonth } from "../calcs.js";
import { Modal, Card, Btn, Input, Select, Badge, StatCard } from "./UI.jsx";
import { BRAND_COLORS } from "../constants.js";
import { useResponsive } from "../App.jsx";
import {
  PURCHASE_STATUSES,
  aggregatePurchaseStats,
  resolvePurchaseProfile,
} from "./purchases/purchaseHelpers.js";
import { activeProfiles } from "../lib/supplierProfiles.js";
import { applyPurchaseCosts } from "../finance.js";
import { ListView } from "./purchases/ListView.jsx";
import { KanbanBoard } from "./purchases/KanbanBoard.jsx";
import { BulkPasteModal } from "./purchases/BulkPasteModal.jsx";
import { AutoFillModal } from "./purchases/AutoFillModal.jsx";
import { QuickAddSearch } from "./purchases/QuickAddSearch.jsx";

// Vacío del form para crear/editar un Pedido.
const emptyPurchaseForm = () => ({
  supplier: "", supplierProfileId: "", loteNumber: "", groups: [],
  supplierCommPercent: "", supplierCommUSDT: "",
  paseroPercent: "", paseroCostARS: "", envioCostARS: "",
  notes: "", date: new Date().toISOString().slice(0, 10), status: "pedido",
  invoiceUrl: "",
  statusHistory: [],
});

export const Purchases = ({
  purchases, setPurchases, products, setProducts, exchangeRate, logStock,
  currentUser, logAudit, monthlyClosures = [], sales = [],
  supplierProfiles = [], setSupplierProfiles,
  supplierAliases = [], supplierLists = [],
  embedded = false,
}) => {
  const { isMobile } = useResponsive();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [verifyModal, setVerifyModal] = useState(null);
  const [costsModal, setCostsModal] = useState(null);
  const [costsForm, setCostsForm] = useState({ supplierCommPercent: "", supplierCommUSDT: "", paseroPercent: "", paseroCostARS: "", envioCostARS: "" });
  const [form, setForm] = useState(emptyPurchaseForm());
  const [verifyNote, setVerifyNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Sub-modales del modal Nuevo Pedido
  const [bulkPasteOpen, setBulkPasteOpen] = useState(false);
  const [autoFillOpen, setAutoFillOpen] = useState(false);

  // Vista: list | kanban (auto-fuerza list en mobile)
  const [view, setView] = useState("list");
  // Filtro por status (null = todos)
  const [statusFilter, setStatusFilter] = useState(null);

  const profiles = useMemo(() => activeProfiles(supplierProfiles), [supplierProfiles]);

  // Stats globales (KPIs del header)
  const stats = useMemo(() => aggregatePurchaseStats(purchases), [purchases]);

  // Lista filtrada que vamos a pasar a ListView / KanbanBoard
  const filteredPurchases = useMemo(() => {
    const active = (purchases || []).filter(p => p && !p.isDeleted);
    return statusFilter ? active.filter(p => p.status === statusFilter) : active;
  }, [purchases, statusFilter]);

  // Modelos únicos del catálogo (para el modal nuevo/edit)
  const modelOptions = useMemo(() => {
    const map = {};
    products.forEach(p => {
      const key = `${p.brand}|||${p.model}|||${p.puffs}`;
      if (!map[key]) map[key] = { brand: p.brand, model: p.model, puffs: p.puffs };
    });
    return Object.values(map).sort((a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model));
  }, [products]);

  const getFlavorsForModel = (brand, model) => {
    return products.filter(p => p.brand === brand && p.model === model)
      .map(p => ({ id: p.id, name: p.flavor }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  // ----- Form group helpers -----
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

  // ----- Cálculos vivos del form -----
  const allItems = form.groups.flatMap(g => g.flavors.map(fl => ({ ...fl, unitCostUSDT: g.unitCostUSDT, brand: g.brand, model: g.model, puffs: g.puffs })));
  const totalItems = allItems.reduce((s, i) => s + (Number(i.qty) || 0), 0);
  const productsUSDT = allItems.reduce((s, i) => s + (Number(i.unitCostUSDT) || 0) * (Number(i.qty) || 0), 0);
  const supplierCommUSDT = form.supplierCommPercent
    ? Math.round(productsUSDT * (Number(form.supplierCommPercent) / 100) * 100) / 100
    : (Number(form.supplierCommUSDT) || 0);
  const totalUSDTwithComm = productsUSDT + supplierCommUSDT;
  const paseroARS = form.paseroPercent
    ? Math.round(totalUSDTwithComm * exchangeRate * (Number(form.paseroPercent) / 100))
    : (Number(form.paseroCostARS) || 0);
  const envioARS = Number(form.envioCostARS) || 0;
  const totalCostARS = Math.round(totalUSDTwithComm * exchangeRate) + paseroARS + envioARS;

  // ----- Reordenar: clonar un pedido existente como nuevo borrador -----
  const handleReorder = (purchase) => {
    // Clonar todos los items y costos en un nuevo form
    let groups = purchase.groups || [];
    if (groups.length === 0 && purchase.items) {
      const gmap = {};
      purchase.items.forEach(item => {
        const prod = products.find(pr => pr.id === item.productId);
        if (prod) {
          const key = `${prod.brand}|||${prod.model}|||${prod.puffs}`;
          if (!gmap[key]) gmap[key] = { brand: prod.brand, model: prod.model, puffs: prod.puffs, modelKey: key, unitCostUSDT: item.unitCostUSDT || "", flavors: [] };
          gmap[key].flavors.push({ name: prod.flavor, qty: item.qty, productId: item.productId, isNew: false });
        }
      });
      groups = Object.values(gmap);
    } else {
      // Deep clone para no mutar el original
      groups = groups.map(g => ({ ...g, flavors: (g.flavors || []).map(f => ({ ...f })) }));
    }
    const matchedProfile = resolvePurchaseProfile(purchase, profiles);
    setForm({
      ...emptyPurchaseForm(),
      supplier: purchase.supplier || "",
      supplierProfileId: matchedProfile?.id || "",
      loteNumber: "",
      groups,
      supplierCommPercent: purchase.supplierCommPercent || "",
      supplierCommUSDT: "",
      paseroPercent: purchase.paseroPercent || "",
      paseroCostARS: "",
      envioCostARS: purchase.envioCostARS || "",
      notes: `Reorden de pedido del ${formatDate(purchase.date)}`,
      date: new Date().toISOString().slice(0, 10),
      status: "pedido",
      invoiceUrl: "",
    });
    setEditing(null); // es un nuevo pedido, no edit
    setModal(true);
  };

  // ----- Quick add: agregar producto desde el buscador autocomplete -----
  const handleQuickAdd = (product) => {
    setForm(f => {
      const key = `${product.brand}|||${product.model}|||${product.puffs}`;
      const existingIdx = f.groups.findIndex(g => g.modelKey === key || (g.brand === product.brand && g.model === product.model && String(g.puffs) === String(product.puffs)));
      if (existingIdx >= 0) {
        // Agregar al grupo existente
        const existingGroup = f.groups[existingIdx];
        const alreadyHas = existingGroup.flavors.some(fl => fl.productId === product.id);
        if (alreadyHas) return f; // no duplicar
        return {
          ...f,
          groups: f.groups.map((g, i) => i === existingIdx
            ? { ...g, flavors: [...g.flavors, { name: product.flavor, qty: 1, productId: product.id, isNew: false }] }
            : g),
        };
      }
      // Crear nuevo grupo
      return {
        ...f,
        groups: [
          ...f.groups,
          {
            brand: product.brand, model: product.model, puffs: product.puffs,
            modelKey: key, unitCostUSDT: product.costUSDT || "",
            flavors: [{ name: product.flavor, qty: 1, productId: product.id, isNew: false }],
          },
        ],
      };
    });
  };

  // ----- Bulk paste apply -----
  const handleBulkApply = (items) => {
    // items: [{ product, qty, priceUSD }]
    items.forEach(({ product, qty, priceUSD }) => {
      handleQuickAdd(product);
      // Después actualizar qty + priceUSD en el group recién agregado
      setForm(f => {
        const key = `${product.brand}|||${product.model}|||${product.puffs}`;
        return {
          ...f,
          groups: f.groups.map(g => {
            if (g.modelKey !== key) return g;
            return {
              ...g,
              unitCostUSDT: priceUSD || g.unitCostUSDT,
              flavors: g.flavors.map(fl =>
                fl.productId === product.id ? { ...fl, qty } : fl
              ),
            };
          }),
        };
      });
    });
  };

  // ----- Auto-fill apply (similar a bulk pero items vienen de suggestPurchaseQty) -----
  const handleAutoFillApply = (items) => {
    handleBulkApply(items);
  };

  // ----- Picker proveedor: al elegir perfil, autocompleta costos defaults -----
  const handleProfileChange = (profileId) => {
    setForm(f => {
      if (!profileId) {
        return { ...f, supplierProfileId: "", supplier: "" };
      }
      const profile = profiles.find(p => p.id === profileId);
      if (!profile) return f;
      return {
        ...f,
        supplierProfileId: profileId,
        supplier: profile.name,
        // Autocompletar solo si el form todavía no tiene valores
        supplierCommPercent: f.supplierCommPercent || (profile.defaultSupplierCommPercent || "").toString(),
        paseroPercent: f.paseroPercent || (profile.defaultPaseroPercent || "").toString(),
        envioCostARS: f.envioCostARS || (profile.defaultEnvioCostARS ? profile.defaultEnvioCostARS.toString() : ""),
      };
    });
  };

  // ----- Acciones principales -----
  const openNew = () => {
    setForm(emptyPurchaseForm());
    setEditing(null);
    setModal(true);
  };

  const openEdit = (p) => {
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
    const matchedProfile = resolvePurchaseProfile(p, profiles);
    setForm({
      ...emptyPurchaseForm(),
      supplier: p.supplier || "",
      supplierProfileId: matchedProfile?.id || "",
      loteNumber: p.loteNumber || "",
      groups,
      supplierCommPercent: p.supplierCommPercent || "",
      supplierCommUSDT: p.supplierCommUSDT || "",
      paseroPercent: p.paseroPercent || "",
      paseroCostARS: p.paseroCostARS || "",
      envioCostARS: p.envioCostARS || "",
      notes: p.notes || "",
      date: p.date ? p.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      status: p.status || "pedido",
      invoiceUrl: p.invoiceUrl || "",
    });
    setEditing(p.id);
    setModal(true);
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
          newProducts.push({
            id: pid, brand: g.brand, model: g.model, flavor: fl.name, puffs: g.puffs,
            priceUSD: ref?.priceUSD || 0,
            priceARS: Math.round((ref?.priceUSD || 0) * exchangeRate),
            stock: 0,
          });
        }
        if (pid) finalItems.push({ productId: pid, qty: Number(fl.qty) || 1, unitCostUSDT: g.unitCostUSDT });
      });
    });
    if (newProducts.length > 0) setProducts(prev => [...prev, ...newProducts]);

    const purchaseData = {
      ...form, items: finalItems,
      totalUSDT: productsUSDT, supplierCommUSDT, totalUSDTpaid: totalUSDTwithComm,
      paseroCostARS: paseroARS, envioCostARS: envioARS, totalCostARS,
      totalItems, createdBy: currentUser?.name || "",
    };
    if (editing) {
      const original = purchases.find(p => p.id === editing);
      // Si el pedido YA estaba verificado, editar las cantidades debe reajustar
      // el stock por el delta (sino queda descuadrado). Calculamos viejo vs nuevo.
      if (original && original.status === "verificado") {
        const oldQty = {};
        (original.items || []).forEach(it => {
          if (it.productId) oldQty[it.productId] = (oldQty[it.productId] || 0) + (Number(it.qty) || 0);
        });
        const newQty = {};
        finalItems.forEach(it => {
          if (it.productId) newQty[it.productId] = (newQty[it.productId] || 0) + (Number(it.qty) || 0);
        });
        const allPids = new Set([...Object.keys(oldQty), ...Object.keys(newQty)]);
        allPids.forEach(pid => {
          const delta = (newQty[pid] || 0) - (oldQty[pid] || 0);
          if (delta !== 0) {
            setProducts(pr => pr.map(prod => prod.id === pid
              ? { ...prod, stock: Math.max(0, (prod.stock || 0) + delta) }
              : prod));
            logStock({
              productId: pid, type: "ajuste", qty: delta,
              reason: `Edición de pedido verificado - ${form.supplier || ""}`, refId: editing,
            });
          }
        });
      }
      setPurchases(prev => prev.map(p => p.id === editing
        ? {
            ...purchaseData,
            id: editing,
            // Preservar el historial y status reales del pedido — el form no los trackea
            status: p.status,
            statusHistory: p.statusHistory || [],
          }
        : p));
      if (logAudit) logAudit("update", "purchase", editing, `Editó compra: ${form.supplier} · ${totalItems} items`);
    } else {
      const newId = uid();
      const newPurchase = {
        ...purchaseData,
        id: newId,
        statusHistory: [{
          status: "pedido",
          timestamp: new Date().toISOString(),
          note: "",
          user: currentUser?.name || "?",
        }],
      };
      setPurchases(prev => [newPurchase, ...prev]);
      if (logAudit) logAudit("create", "purchase", newId, `Creó compra: ${form.supplier} · ${totalItems} items · ${productsUSDT} USDT`);
    }
    setModal(false); setEditing(null); setForm(emptyPurchaseForm());
  };

  const updateStatus = (purchaseId, newStatus, note = "") => {
    setPurchases(prev => prev.map(p => {
      if (p.id !== purchaseId) return p;
      if (newStatus === "verificado" && p.status !== "verificado") {
        // Actualizar costo promedio ponderado (con stock VIEJO) y luego sumar stock.
        // El orden importa: el promedio usa el stock previo a la entrada.
        setProducts(pr => {
          let updated = applyPurchaseCosts(pr, p.items || []);
          (p.items || []).forEach(item => {
            if (!item.productId) return;
            updated = updated.map(prod => prod.id === item.productId
              ? { ...prod, stock: (prod.stock || 0) + Number(item.qty) }
              : prod);
          });
          return updated;
        });
        (p.items || []).forEach(item => {
          if (item.productId) {
            logStock({
              productId: item.productId, type: "compra", qty: Number(item.qty),
              reason: `Pedido verificado - ${p.supplier || ""}`, refId: p.id,
            });
          }
        });
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

  const deletePurchase = (purchase) => {
    if (confirmDelete !== purchase.id && isDateInClosedMonth(monthlyClosures, purchase.date)) {
      const proceed = confirm(
        `⚠️ Esta compra es de un mes YA CERRADO. Borrarla descuadrara el snapshot del cierre.\n\n¿Borrar de todos modos?`
      );
      if (!proceed) return;
    }
    if (confirmDelete !== purchase.id) { setConfirmDelete(purchase.id); return; }
    if (purchase.status === "verificado") {
      (purchase.items || []).forEach(item => {
        if (!item.productId) return;
        setProducts(prev => prev.map(p => p.id === item.productId
          ? { ...p, stock: Math.max(0, (p.stock || 0) - Number(item.qty)) }
          : p));
        // Registrar la reversa en el StockLog para que el log cuadre con el stock físico
        logStock({
          productId: item.productId, type: "ajuste", qty: -Number(item.qty),
          reason: `Pedido verificado eliminado - ${purchase.supplier || ""}`, refId: purchase.id,
        });
      });
    }
    setPurchases(prev => prev.map(p => p.id === purchase.id
      ? { ...p, isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: currentUser?.name || "?" }
      : p));
    if (logAudit) logAudit("delete", "purchase", purchase.id, `Eliminó compra: ${purchase.supplier || ""} · ${purchase.totalItems || 0} items`);
    setConfirmDelete(null);
  };

  const openCosts = (purchase) => {
    setCostsForm({
      supplierCommPercent: purchase.supplierCommPercent || "",
      supplierCommUSDT: purchase.supplierCommUSDT || "",
      paseroPercent: purchase.paseroPercent || "",
      paseroCostARS: purchase.paseroCostARS || "",
      envioCostARS: purchase.envioCostARS || "",
    });
    setCostsModal(purchase.id);
  };

  const saveCosts = () => {
    const purchase = purchases.find(p => p.id === costsModal);
    if (!purchase) return;
    const prodUSDT = purchase.totalUSDT || 0;
    const suppComm = costsForm.supplierCommPercent
      ? Math.round(prodUSDT * (Number(costsForm.supplierCommPercent) / 100) * 100) / 100
      : (Number(costsForm.supplierCommUSDT) || 0);
    const totalPaid = prodUSDT + suppComm;
    const pasero = costsForm.paseroPercent
      ? Math.round(totalPaid * exchangeRate * (Number(costsForm.paseroPercent) / 100))
      : (Number(costsForm.paseroCostARS) || 0);
    const envio = Number(costsForm.envioCostARS) || 0;
    const totalCost = Math.round(totalPaid * exchangeRate) + pasero + envio;
    setPurchases(prev => prev.map(p => p.id === costsModal ? {
      ...p,
      supplierCommPercent: costsForm.supplierCommPercent,
      supplierCommUSDT: suppComm,
      totalUSDTpaid: totalPaid,
      paseroPercent: costsForm.paseroPercent,
      paseroCostARS: pasero,
      envioCostARS: envio,
      totalCostARS: totalCost,
    } : p));
    setCostsModal(null);
  };

  // Calcula margen real (modal verify)
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
  const costsPurchase = purchases.find(p => p.id === costsModal);

  return (
    <div>
      {/* Header con título + nuevo (oculto el título si está embebido en el hub) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        {!embedded ? (
          <div>
            <h2 style={{ color: "#1E2B4A", margin: 0, fontSize: isMobile ? 22 : 26, fontWeight: 800, letterSpacing: "-0.4px" }}>
              🚚 Compras / Importaciones
            </h2>
            <p style={{ color: "#6B7794", fontSize: 12, margin: "4px 0 0" }}>
              {stats.totalPending} pedidos en curso · {formatMoney(stats.totalUSDTinTransit, "USDT")} en tránsito
            </p>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "#6B7794", fontWeight: 600 }}>
            {stats.totalPending} en curso · {formatMoney(stats.totalUSDTinTransit, "USDT")} en tránsito
          </div>
        )}
        <Btn onClick={openNew}>➕ Nuevo Pedido</Btn>
      </div>

      {/* KPIs por status */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {PURCHASE_STATUSES.map(s => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(statusFilter === s.value ? null : s.value)}
            style={{
              background: "transparent", border: "none", padding: 0,
              cursor: "pointer", flex: "1 1 140px",
              opacity: statusFilter && statusFilter !== s.value ? 0.5 : 1,
              transition: "opacity 0.15s, transform 0.05s",
            }}
            onMouseDown={e => e.currentTarget.style.transform = "scale(0.98)"}
            onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
            onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
          >
            <div style={{
              background: "#FFFFFF",
              border: `1px solid ${statusFilter === s.value ? s.color : "#E5DAC2"}`,
              borderRadius: 12, padding: "12px 14px",
              borderTop: `3px solid ${s.color}`,
              textAlign: "left",
              boxShadow: statusFilter === s.value ? `0 4px 12px ${s.color}33` : "0 1px 3px rgba(30,43,74,0.05)",
            }}>
              <div style={{
                fontSize: 10, color: "#6B7794", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4,
              }}>{s.emoji} {s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>
                {stats.byStatus[s.value] || 0}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Overdue alert */}
      {stats.overdueCount > 0 && (
        <Card style={{ marginBottom: 12, background: "#F7DEDE", border: "1px solid #E5A8A8" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>⚠️</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#B83232" }}>
                {stats.overdueCount} pedido{stats.overdueCount > 1 ? "s" : ""} muy atrasado{stats.overdueCount > 1 ? "s" : ""}
              </div>
              <div style={{ fontSize: 11, color: "#6B7794", marginTop: 2 }}>
                Llevan más del doble del límite en su estado actual. Revisalos para destrabar.
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Toolbar: view toggle + filter chip */}
      {!isMobile && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: "#6B7794" }}>
            {filteredPurchases.length} {filteredPurchases.length === 1 ? "pedido" : "pedidos"}
            {statusFilter && (
              <button
                onClick={() => setStatusFilter(null)}
                style={{
                  marginLeft: 8, padding: "2px 8px", background: "#E8EBF2",
                  border: "1px solid #C5CADE", borderRadius: 6, cursor: "pointer",
                  fontSize: 11, fontWeight: 600, color: "#1E2B4A", fontFamily: "inherit",
                }}
              >Filtro: {PURCHASE_STATUSES.find(s => s.value === statusFilter)?.label} ✕</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 4, padding: 3, background: "#F1E9D6", borderRadius: 10 }}>
            {[
              { key: "list", label: "📃 Lista" },
              { key: "kanban", label: "🗂 Kanban" },
            ].map(v => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                style={{
                  padding: "6px 14px", border: "none", borderRadius: 8,
                  background: view === v.key ? "#FFFFFF" : "transparent",
                  color: view === v.key ? "#1E2B4A" : "#6B7794",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                  fontFamily: "inherit",
                  boxShadow: view === v.key ? "0 1px 3px rgba(30,43,74,0.08)" : "none",
                }}
              >{v.label}</button>
            ))}
          </div>
        </div>
      )}

      {/* Content: List or Kanban */}
      {(isMobile || view === "list") ? (
        <ListView
          purchases={filteredPurchases}
          supplierProfiles={supplierProfiles}
          products={products}
          exchangeRate={exchangeRate}
          onOpenEdit={openEdit}
          onAdvance={(id, status) => updateStatus(id, status)}
          onVerify={setVerifyModal}
          onOpenCosts={openCosts}
          onDelete={deletePurchase}
          onReorder={handleReorder}
          confirmDeleteId={confirmDelete}
        />
      ) : (
        <KanbanBoard
          purchases={filteredPurchases}
          supplierProfiles={supplierProfiles}
          products={products}
          exchangeRate={exchangeRate}
          onOpenEdit={openEdit}
          onAdvance={(id, status) => updateStatus(id, status)}
          onVerify={setVerifyModal}
          onOpenCosts={openCosts}
          onDelete={deletePurchase}
          onReorder={handleReorder}
          confirmDeleteId={confirmDelete}
        />
      )}

      {/* New/Edit Modal */}
      <Modal open={modal} onClose={() => { setModal(false); setEditing(null); }} title={editing ? "Editar Pedido" : "Nuevo Pedido"}>
        <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
          <div style={{ flex: 1 }}>
            <Input label="Fecha" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div style={{ flex: 1 }}>
            {/* Picker de perfiles + opción manual */}
            <label style={{ display: "block", fontSize: 11, color: "#6B7794", marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Proveedor</label>
            {profiles.length > 0 ? (
              <select
                value={form.supplierProfileId}
                onChange={e => handleProfileChange(e.target.value)}
                style={{
                  width: "100%", padding: isMobile ? "12px 14px" : "10px 12px",
                  minHeight: isMobile ? 44 : 38,
                  background: "#FFFFFF", border: "1px solid #E5DAC2",
                  borderRadius: 10, color: "#1E2B4A",
                  fontSize: isMobile ? 16 : 14, outline: "none", boxSizing: "border-box",
                  fontFamily: "inherit", marginBottom: 8,
                }}
              >
                <option value="">— Elegir proveedor —</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name}{p.country ? ` (${p.country})` : ""}</option>
                ))}
              </select>
            ) : null}
            <Input
              placeholder={profiles.length > 0 ? "O escribilo a mano..." : "Nombre del proveedor..."}
              value={form.supplier}
              onChange={e => setForm(f => ({ ...f, supplier: e.target.value, supplierProfileId: "" }))}
            />
            {form.supplierProfileId && (
              <div style={{ fontSize: 11, color: "#0F6B5C", marginTop: -8, marginBottom: 10, fontWeight: 600 }}>
                ✨ Costos defaults precargados del perfil
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
          <div style={{ flex: 1 }}>
            <Input label="N° de lote (opcional)" placeholder="ej: LOTE-042" value={form.loteNumber} onChange={e => setForm(f => ({ ...f, loteNumber: e.target.value }))} />
          </div>
        </div>

        {/* Atajos de carga rápida */}
        <div style={{
          padding: "10px 12px", marginBottom: 14,
          background: "linear-gradient(135deg, #EEF0FC 0%, #FFFFFF 100%)",
          border: "1px solid #C5CADE", borderRadius: 10,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: "#6B7794",
            textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8,
          }}>⚡ Carga rápida</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <button
              onClick={() => setBulkPasteOpen(true)}
              style={quickBtnStyle("#5B3592", "#E4D8F0")}
            >📝 Pegar lista</button>
            <button
              onClick={() => setAutoFillOpen(true)}
              style={quickBtnStyle("#0F6B5C", "#D9E8E4")}
            >🪄 Auto-fill reposición</button>
          </div>
          <div style={{ marginTop: 10 }}>
            <QuickAddSearch
              products={products}
              onPick={handleQuickAdd}
              placeholder="🔍 O buscá producto y agregalo (Enter)..."
            />
          </div>
        </div>

        {/* Product Groups */}
        {form.groups.map((group, gi) => {
          const availFlavors = group.brand ? getFlavorsForModel(group.brand, group.model) : [];
          const bc = BRAND_COLORS[group.brand] || "#1E2B4A";
          return (
            <div key={gi} style={{ background: "#F8F2E7", border: `1px solid ${bc}33`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ color: bc, fontSize: 13, fontWeight: 700 }}>{group.brand ? `${group.brand} ${group.model}` : "Seleccioná modelo"}</span>
                <button onClick={() => removeGroup(gi)} style={{ background: "none", border: "none", color: "#B83232", cursor: "pointer", fontSize: 16 }}>✕</button>
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
                <label style={{ display: "block", fontSize: 11, color: "#6B7794", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>Sabores</label>
                {group.flavors.map((fl, fi) => (
                  <div key={fi} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "flex-end" }}>
                    <div style={{ flex: 2 }}>
                      {fl.isNew ? <Input placeholder="Sabor nuevo..." value={fl.name} onChange={e => updateFlavor(gi, fi, "name", e.target.value)} />
                      : <Select options={[...availFlavors.map(f => ({ value: f.id, label: f.name })), { value: "__new__", label: "➕ Sabor nuevo..." }]} value={fl.productId || ""} onChange={e => updateFlavor(gi, fi, "productId", e.target.value)} />}
                    </div>
                    <div style={{ flex: 0.4 }}><Input type="number" placeholder="Cant" value={fl.qty} min={1} onChange={e => updateFlavor(gi, fi, "qty", Number(e.target.value))} /></div>
                    <button onClick={() => removeFlavor(gi, fi)} style={{ background: "none", border: "none", color: "#B83232", cursor: "pointer", fontSize: 16, marginBottom: 14 }}>✕</button>
                  </div>
                ))}
                <button onClick={() => addFlavor(gi)} style={{ background: "none", border: `1px dashed ${bc}44`, color: bc, padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 11, width: "100%" }}>+ Agregar sabor</button>
                {group.flavors.length > 0 && <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #EFE5CE", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#6B7794", fontSize: 12 }}>{group.flavors.reduce((s, f) => s + (Number(f.qty) || 0), 0)} uds</span>
                  <span style={{ color: "#3A4868", fontSize: 12, fontWeight: 600 }}>{formatMoney(group.flavors.reduce((s, f) => s + (Number(f.qty) || 0), 0) * (Number(group.unitCostUSDT) || 0), "USDT")}</span>
                </div>}
              </>)}
            </div>
          );
        })}
        <button onClick={addGroup} style={{ background: "#FFFFFF", border: "2px dashed #E5DAC2", color: "#1E2B4A", padding: "12px", borderRadius: 12, cursor: "pointer", fontSize: 13, fontWeight: 600, width: "100%", marginBottom: 14 }}>+ Agregar marca/modelo al pedido</button>

        {/* Costs */}
        <div style={{ background: "#F8F2E7", border: "1px solid #E5DAC2", borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 12, color: "#B83232", marginBottom: 10, fontWeight: 700, textTransform: "uppercase" }}>💰 Costos extra</label>

          <label style={{ display: "block", fontSize: 11, color: "#6B7794", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>Comisión proveedor (USDT)</label>
          <div style={{ display: "flex", gap: 10, marginBottom: 4, flexDirection: isMobile ? "column" : "row" }}>
            <div style={{ flex: 1 }}>
              <Input label="% del total" type="number" placeholder="ej: 1" value={form.supplierCommPercent} onChange={e => setForm(f => ({ ...f, supplierCommPercent: e.target.value, supplierCommUSDT: "" }))} />
            </div>
            <div style={{ flex: 1 }}>
              <Input label="O monto fijo (USDT)" type="number" placeholder="ej: 6" value={form.supplierCommPercent ? "" : form.supplierCommUSDT} onChange={e => setForm(f => ({ ...f, supplierCommUSDT: e.target.value, supplierCommPercent: "" }))} />
            </div>
          </div>
          {supplierCommUSDT > 0 && <div style={{ color: "#0F6B5C", fontSize: 12, marginBottom: 10 }}>
            Comisión: {formatMoney(supplierCommUSDT, "USDT")} · Total a transferir: {formatMoney(totalUSDTwithComm, "USDT")}
            {form.supplierCommPercent ? ` (${form.supplierCommPercent}% de ${formatMoney(productsUSDT, "USDT")})` : ""}
          </div>}

          <div style={{ borderTop: "1px solid #EFE5CE", paddingTop: 10, marginTop: 6 }}>
            <label style={{ display: "block", fontSize: 11, color: "#6B7794", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>Pasero + Envío (Pesos)</label>
            <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
              <div style={{ flex: 1 }}>
                <Input label="Pasero (%)" type="number" placeholder="ej: 5" value={form.paseroPercent} onChange={e => setForm(f => ({ ...f, paseroPercent: e.target.value, paseroCostARS: "" }))} />
              </div>
              <div style={{ flex: 1 }}>
                <Input label="O monto fijo ($)" type="number" value={form.paseroPercent ? "" : form.paseroCostARS} onChange={e => setForm(f => ({ ...f, paseroCostARS: e.target.value, paseroPercent: "" }))} />
              </div>
            </div>
            {paseroARS > 0 && <div style={{ color: "#B07A1F", fontSize: 12, marginBottom: 8 }}>Pasero: {formatMoney(paseroARS)}</div>}
            <Input label="Envío Vía Cargo ($)" type="number" placeholder="ej: 15000" value={form.envioCostARS} onChange={e => setForm(f => ({ ...f, envioCostARS: e.target.value }))} />
          </div>
        </div>

        {/* Total */}
        {totalItems > 0 && <div style={{ background: "#F8F2E7", borderRadius: 10, padding: 14, marginBottom: 14, border: "1px solid #E5DAC2" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: "#6B7794", fontSize: 13 }}>Vapes ({totalItems} uds)</span>
            <span style={{ color: "#3A4868" }}>{formatMoney(productsUSDT, "USDT")}</span>
          </div>
          {supplierCommUSDT > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: "#6B7794", fontSize: 13 }}>Comisión proveedor</span>
            <span style={{ color: "#0F6B5C" }}>{formatMoney(supplierCommUSDT, "USDT")}</span>
          </div>}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, paddingTop: supplierCommUSDT > 0 ? 4 : 0, borderTop: supplierCommUSDT > 0 ? "1px solid #EFE5CE" : "none" }}>
            <span style={{ color: "#6B7794", fontSize: 13, fontWeight: supplierCommUSDT > 0 ? 600 : 400 }}>Total USDT transferido</span>
            <span style={{ color: "#3A4868", fontWeight: 600 }}>{formatMoney(totalUSDTwithComm, "USDT")} · ~{formatMoney(Math.round(totalUSDTwithComm * exchangeRate))}</span>
          </div>
          {paseroARS > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ color: "#6B7794", fontSize: 13 }}>Pasero</span><span style={{ color: "#B07A1F" }}>{formatMoney(paseroARS)}</span></div>}
          {envioARS > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ color: "#6B7794", fontSize: 13 }}>Envío</span><span style={{ color: "#B07A1F" }}>{formatMoney(envioARS)}</span></div>}
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #E5DAC2", paddingTop: 8, marginTop: 4 }}>
            <span style={{ color: "#1E2B4A", fontSize: 15, fontWeight: 700 }}>Costo total</span>
            <span style={{ color: "#B83232", fontSize: 18, fontWeight: 800 }}>{formatMoney(totalCostARS)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ color: "#6B7794", fontSize: 12 }}>Costo por unidad</span>
            <span style={{ color: "#6B7794", fontSize: 13 }}>{formatMoney(Math.round(totalCostARS / totalItems))} / ud</span>
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
          <div style={{ color: "#6B7794", fontSize: 13, marginBottom: 16 }}>Pedido de <strong style={{ color: "#1E2B4A" }}>{verifyPurchase.supplier}</strong> del {formatDate(verifyPurchase.date)}</div>
          <div style={{ background: "#F8F2E7", borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, color: "#0F6B5C", marginBottom: 10, fontWeight: 700, textTransform: "uppercase" }}>Verificá que recibiste:</label>
            {(verifyPurchase.items || []).map((item, i) => {
              const prod = products.find(p => p.id === item.productId);
              return (<div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #EFE5CE" }}>
                <span style={{ color: "#3A4868", fontSize: 14 }}>{prod ? `${prod.brand} ${prod.model} - ${prod.flavor}` : "?"}</span>
                <Badge color="#0F6B5C">x{item.qty}</Badge>
              </div>);
            })}
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10 }}>
              <span style={{ color: "#1E2B4A", fontWeight: 700 }}>Total</span>
              <span style={{ color: "#0F6B5C", fontWeight: 700 }}>{(verifyPurchase.items||[]).reduce((s,i) => s + Number(i.qty), 0)} uds</span>
            </div>
          </div>
          <div style={{ background: "#D9E8E4", border: "1px solid #A8C8BE", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
            <span style={{ color: "#0F6B5C", fontSize: 13 }}>⚠️ Al confirmar, se suma todo al stock.</span>
          </div>
          {(() => {
            const margin = calcRealMargin(verifyPurchase);
            if (!margin) return null;
            const positive = margin.profit > 0;
            return (
              <div style={{
                background: positive ? "#D9E8E4" : "#F7DEDE",
                border: `1px solid ${positive ? "#A8C8BE" : "#E5A8A8"}`,
                borderRadius: 10, padding: 14, marginBottom: 14,
              }}>
                <div style={{
                  fontSize: 12, fontWeight: 700, color: positive ? "#0F6B5C" : "#B83232",
                  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8,
                }}>📊 Margen real proyectado</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                  <div>
                    <div style={{ color: "#6B7794" }}>Costo / unidad</div>
                    <div style={{ fontWeight: 700, color: "#1E2B4A" }}>{formatMoney(margin.costPerUnitARS)}</div>
                  </div>
                  <div>
                    <div style={{ color: "#6B7794" }}>Revenue esperado</div>
                    <div style={{ fontWeight: 700, color: "#1E2B4A" }}>{formatMoney(margin.expectedRevenueARS)}</div>
                  </div>
                  <div>
                    <div style={{ color: "#6B7794" }}>Ganancia bruta</div>
                    <div style={{ fontWeight: 700, color: positive ? "#0F6B5C" : "#B83232" }}>{formatMoney(margin.profit)}</div>
                  </div>
                  <div>
                    <div style={{ color: "#6B7794" }}>Margen</div>
                    <div style={{ fontWeight: 700, color: positive ? "#0F6B5C" : "#B83232" }}>
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
          <div style={{ color: "#6B7794", fontSize: 13, marginBottom: 12 }}>
            Pedido de <strong style={{ color: "#1E2B4A" }}>{costsPurchase.supplier}</strong> del {formatDate(costsPurchase.date)} · {formatMoney(costsPurchase.totalUSDT, "USDT")} en vapes
          </div>

          <label style={{ display: "block", fontSize: 11, color: "#0F6B5C", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>Comisión proveedor (USDT)</label>
          <div style={{ display: "flex", gap: 12 }}>
            <Input label="% del total" type="number" placeholder="ej: 1" value={costsForm.supplierCommPercent} onChange={e => setCostsForm(f => ({ ...f, supplierCommPercent: e.target.value, supplierCommUSDT: "" }))} />
            <Input label="O monto fijo (USDT)" type="number" placeholder="ej: 6" value={costsForm.supplierCommPercent ? "" : costsForm.supplierCommUSDT} onChange={e => setCostsForm(f => ({ ...f, supplierCommUSDT: e.target.value, supplierCommPercent: "" }))} />
          </div>
          {(costsForm.supplierCommPercent || costsForm.supplierCommUSDT) ? (
            <div style={{ color: "#0F6B5C", fontSize: 12, marginBottom: 10 }}>
              Comisión: {formatMoney(costsForm.supplierCommPercent ? Math.round((costsPurchase.totalUSDT || 0) * (Number(costsForm.supplierCommPercent) / 100) * 100) / 100 : Number(costsForm.supplierCommUSDT), "USDT")}
              {costsForm.supplierCommPercent ? ` (${costsForm.supplierCommPercent}% de ${formatMoney(costsPurchase.totalUSDT, "USDT")})` : ""}
              {" · Total transferido: "}{formatMoney((costsPurchase.totalUSDT || 0) + (costsForm.supplierCommPercent ? Math.round((costsPurchase.totalUSDT || 0) * (Number(costsForm.supplierCommPercent) / 100) * 100) / 100 : Number(costsForm.supplierCommUSDT) || 0), "USDT")}
            </div>
          ) : null}

          <div style={{ borderTop: "1px solid #EFE5CE", paddingTop: 10, marginTop: 6 }}>
            <label style={{ display: "block", fontSize: 11, color: "#B07A1F", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>Pasero + Envío (Pesos)</label>
            <div style={{ display: "flex", gap: 12 }}>
              <Input label="Pasero (%)" type="number" placeholder="ej: 5" value={costsForm.paseroPercent} onChange={e => setCostsForm(f => ({ ...f, paseroPercent: e.target.value, paseroCostARS: "" }))} />
              <Input label="O monto fijo ($)" type="number" placeholder="ej: 50000" value={costsForm.paseroPercent ? "" : costsForm.paseroCostARS} onChange={e => setCostsForm(f => ({ ...f, paseroCostARS: e.target.value, paseroPercent: "" }))} />
            </div>
            {(costsForm.paseroPercent || costsForm.paseroCostARS) ? (
              <div style={{ color: "#B07A1F", fontSize: 12, marginBottom: 8 }}>
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

      {/* Bulk Paste Modal */}
      <BulkPasteModal
        open={bulkPasteOpen}
        onClose={() => setBulkPasteOpen(false)}
        products={products}
        supplierAliases={supplierAliases}
        supplierProfileId={form.supplierProfileId || null}
        onApply={handleBulkApply}
      />

      {/* Auto-fill Modal */}
      <AutoFillModal
        open={autoFillOpen}
        onClose={() => setAutoFillOpen(false)}
        products={products}
        sales={sales}
        exchangeRate={exchangeRate}
        defaultLeadDays={profiles.find(p => p.id === form.supplierProfileId)?.defaultLeadDays || 30}
        onApply={handleAutoFillApply}
      />
    </div>
  );
};

function quickBtnStyle(color, bg) {
  return {
    background: bg,
    border: `1px solid ${color}40`,
    color,
    padding: "7px 12px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}
