import { useState, useMemo, useCallback } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Modal, Card, Btn, Input, Select, Table, Badge, StatCard } from "./UI.jsx";
import { WITHDRAW_PERSONS, WITHDRAW_TYPES, BRAND_COLORS, FAILURE_REASONS, FAILURE_REASON_CATEGORY, isGarantia } from "../constants.js";

// -- MERMAS: Consumo propio, Garantías, Canjes --
// Ventana de detección de duplicados (5 min)
const DUP_WINDOW_MS = 5 * 60 * 1000;
// Debounce visual del botón Registrar (3s)
const SUBMIT_DEBOUNCE_MS = 3000;

// Helper: muestra fecha + hora corta. Si el ISO no tiene hora, solo fecha.
function formatDateTime(iso) {
  if (!iso) return "—";
  const s = String(iso);
  const datePart = formatDate(s);
  const timeMatch = s.match(/T(\d{2}:\d{2})/);
  return timeMatch ? `${datePart} ${timeMatch[1]}` : datePart;
}

export const Withdrawals = ({ withdrawals, setWithdrawals, products, setProducts, sales, clients = [], logStock, exchangeRate, currentUser, logAudit }) => {
  const { isMobile } = useResponsive();
  const [modal, setModal] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [saleSearch, setSaleSearch] = useState("");
  const [showSaleDropdown, setShowSaleDropdown] = useState(false);
  const [confirmingDup, setConfirmingDup] = useState(null); // { mov, minutes }
  const [submitting, setSubmitting] = useState(false);
  // Filtros del listado
  const [filterPerson, setFilterPerson] = useState(""); // "", "Diego", "Gustavo"
  const [filterType, setFilterType] = useState("");     // "", tipo
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterProductSearch, setFilterProductSearch] = useState("");
  // Tab activo de la vista principal
  const [activeTab, setActiveTab] = useState("all"); // all | consumo | garantia | regalo
  // ID estable pre-generado al abrir el form. Se regenera al cerrar el modal o
  // después de un submit exitoso. Si el componente re-renderea o el botón se
  // toca dos veces antes del debounce, se reutiliza el mismo ID y `save()` lo
  // detecta como duplicado y aborta.
  const [draftId, setDraftId] = useState(() => uid());
  const [form, setForm] = useState({
    brand: "", model: "", productId: "", qty: 1,
    person: currentUser?.name || "", withdrawType: "Consumo propio",
    linkedSaleId: "", linkedSaleClient: "", linkedSaleDate: "",
    linkedClientId: "", linkedClientName: "",
    // Garantía: producto que falló (el cliente lo trajo)
    failedProductId: "", failureReason: "", failureNotes: "",
    reclamableProveedor: false,
    notes: "", date: new Date().toISOString().slice(0, 10),
  });

  // ---- Cascading picker data ----
  const availableProducts = useMemo(() => products.filter(p => !p.isDeleted && p.stock > 0), [products]);
  const brands = useMemo(() => [...new Set(availableProducts.map(p => p.brand))].sort(), [availableProducts]);

  const getModels = useCallback((brand) => {
    return [...new Set(availableProducts.filter(p => p.brand === brand).map(p => p.model))].sort();
  }, [availableProducts]);

  const getFlavors = useCallback((brand, model) => {
    return availableProducts.filter(p => p.brand === brand && p.model === model).sort((a, b) => a.flavor.localeCompare(b.flavor));
  }, [availableProducts]);

  const selectedProd = form.productId ? products.find(p => p.id === form.productId) : null;

  // Recent sales for warranty linking (last 60 days)
  const recentSales = useMemo(() => {
    const cutoff = new Date(Date.now() - 60 * 86400000).toISOString();
    return (sales || []).filter(s => s.date >= cutoff).sort((a, b) => b.date.localeCompare(a.date));
  }, [sales]);

  const filteredSales = useMemo(() => {
    if (!saleSearch || saleSearch.length < 1) return recentSales.slice(0, 10);
    const q = saleSearch.toLowerCase();
    return recentSales.filter(s => {
      const itemNames = (s.items || []).map(i => {
        const p = products.find(pr => pr.id === i.productId);
        return p ? `${p.brand} ${p.model} ${p.flavor}` : "";
      }).join(" ");
      return itemNames.toLowerCase().includes(q) || (s.clientName || "").toLowerCase().includes(q);
    }).slice(0, 10);
  }, [saleSearch, recentSales, products]);

  const updateField = (field, val) => {
    setForm(f => {
      const updated = { ...f, [field]: val };
      if (field === "brand") { updated.model = ""; updated.productId = ""; updated.qty = 1; }
      if (field === "model") { updated.productId = ""; updated.qty = 1; }
      return updated;
    });
  };

  // ---- chip style (same as Sales) ----
  const chipStyle = (active, color) => ({
    padding: "7px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer",
    border: `1.5px solid ${active ? (color || "#5E6AD2") : "#E8E7E3"}`,
    background: active ? (color || "#5E6AD2") : "#FAFAF9",
    color: active ? "#fff" : "#555247",
    transition: "all .15s", whiteSpace: "nowrap",
  });

  // ---- VALIDATE: devuelve string error o null ----
  const validate = () => {
    if (!form.productId) return "Seleccioná un producto";
    const prod = products.find(p => p.id === form.productId);
    if (!prod) return "El producto seleccionado no existe";
    if (!form.person) return "Indicá quién (Diego o Gustavo)";
    if (!form.withdrawType) return "Indicá el tipo de merma";
    const qty = Number(form.qty);
    if (!qty || qty <= 0) return "La cantidad debe ser mayor a 0";
    if (qty > (prod.stock || 0)) {
      return `Stock insuficiente: ${prod.brand} ${prod.model} - ${prod.flavor}. Disponible: ${prod.stock}`;
    }
    // Si tipo Garantía y se vinculó una venta, validar que la venta exista y esté activa
    if (isGarantia(form.withdrawType) && form.linkedSaleId) {
      const linkedSale = (sales || []).find(s => s.id === form.linkedSaleId && !s.isDeleted);
      if (!linkedSale) return "La venta vinculada no existe o fue eliminada";
    }
    // Validaciones específicas de Cambio por garantía
    if (isGarantia(form.withdrawType)) {
      if (!form.failedProductId) return "Indicá qué producto falló (el que trajo el cliente)";
      const failedProd = products.find(p => p.id === form.failedProductId);
      if (!failedProd) return "El producto fallido indicado no existe";
      if (!form.failureReason) return "Indicá la razón del fallo";
      if (form.failureReason === "Otro" && (form.failureNotes || "").trim().length < 5) {
        return "Describí brevemente qué pasó (mín. 5 caracteres)";
      }
    }
    // Si vinculó cliente, validar que exista
    if (form.linkedClientId) {
      const linkedClient = (clients || []).find(c => c.id === form.linkedClientId);
      if (!linkedClient) return "El cliente vinculado no existe";
    }
    if (form.date) {
      const today = new Date().toISOString().slice(0, 10);
      if (form.date > today) return "No se permiten fechas futuras";
    }
    return null;
  };

  // ---- DUP DETECTION: misma producto + qty + persona + tipo en últimos 5min ----
  const findRecentDuplicate = () => {
    const qty = Number(form.qty);
    const now = Date.now();
    return (withdrawals || []).find(w => {
      if (w.isDeleted) return false;
      if (w.productId !== form.productId) return false;
      if (Number(w.qty) !== qty) return false;
      if (w.person !== form.person) return false;
      if (w.withdrawType !== form.withdrawType) return false;
      const wTime = new Date(w.createdAtMs || w.date).getTime();
      return now - wTime <= DUP_WINDOW_MS;
    });
  };

  // ---- SUBMIT: orquesta validación → dup check → save ----
  const attemptSubmit = () => {
    const err = validate();
    if (err) { setValidationError(err); setConfirmingDup(null); return; }
    setValidationError("");

    // Duplicado en últimos 5min, salvo que el user ya haya confirmado
    if (!confirmingDup) {
      const dup = findRecentDuplicate();
      if (dup) {
        const minutes = Math.max(1, Math.round((Date.now() - new Date(dup.createdAtMs || dup.date).getTime()) / 60000));
        setConfirmingDup({ mov: dup, minutes });
        return;
      }
    }

    setSubmitting(true);
    persistWithdrawal();
    // Re-arm: nuevo draftId para próximo registro, debounce visual
    setTimeout(() => {
      setDraftId(uid());
      setSubmitting(false);
      setConfirmingDup(null);
    }, SUBMIT_DEBOUNCE_MS);
  };

  // ---- PERSIST: guarda en state (segunda barrera anti-duplicado vía draftId) ----
  const persistWithdrawal = () => {
    const prod = products.find(p => p.id === form.productId);
    if (!prod) return;
    const qty = Number(form.qty) || 1;

    // Segunda barrera: si ya existe un withdrawal con este draftId, abortar
    if ((withdrawals || []).some(w => w.id === draftId)) {
      console.warn(`[Withdrawals] draftId ${draftId} ya existe, ignorando doble submit`);
      return;
    }

    // Cálculo de costo REAL (igual que antes, ya con fallback a priceUSD * 0.55)
    const priceUSD = Number(prod.priceUSD) || 0;
    const costUSDTunit = Number(prod.costUSDT) || 0;
    const costPerUnitUSD = costUSDTunit > 0 ? costUSDTunit : priceUSD * 0.55;
    const costRealUSD = costPerUnitUSD * qty;
    const lucroCesanteUSD = Math.max(0, (priceUSD - costPerUnitUSD) * qty);
    const costRealARS = Math.round(costRealUSD * (exchangeRate || 0));
    const nowMs = Date.now();
    const dateISO = form.date ? `${form.date}T${new Date().toTimeString().slice(0, 8)}` : new Date().toISOString();

    const withdrawal = {
      id: draftId, productId: form.productId, qty, person: form.person,
      withdrawType: form.withdrawType, notes: form.notes || "",
      // Costos
      costRealUSD,
      lucroCesanteUSD,
      costEstimateUSD: costRealUSD, costEstimateARS: costRealARS,
      // Timestamp
      date: dateISO,
      createdAtMs: nowMs,
      createdAt: new Date(nowMs).toISOString(),
      createdBy: currentUser?.name || "",
      // Vínculos opcionales
      ...(form.linkedSaleId ? { linkedSaleId: form.linkedSaleId, linkedSaleClient: form.linkedSaleClient, linkedSaleDate: form.linkedSaleDate } : {}),
      ...(form.linkedClientId ? { linkedClientId: form.linkedClientId, linkedClientName: form.linkedClientName } : {}),
      ...(form.reclamableProveedor && isGarantia(form.withdrawType) ? { reclamableProveedor: true } : {}),
      // Campos específicos de Cambio por garantía
      ...(isGarantia(form.withdrawType) ? {
        failedProductId: form.failedProductId || form.productId,
        failureReason: form.failureReason || "",
        ...(form.failureNotes ? { failureNotes: form.failureNotes.trim() } : {}),
      } : {}),
    };

    setWithdrawals(prev => [withdrawal, ...prev]);

    // Descontar stock
    setProducts(prev => prev.map(p =>
      p.id === form.productId ? { ...p, stock: Math.max(0, (p.stock || 0) - qty) } : p
    ));

    // Log stock movement
    logStock({
      productId: form.productId, type: "consumo", qty: -qty,
      reason: `${form.withdrawType} — ${form.person}${form.notes ? `: ${form.notes}` : ""}`,
      refId: draftId, date: dateISO,
    });

    if (logAudit) {
      const linkedInfo = form.linkedSaleId ? ` · Garantía de venta a ${form.linkedSaleClient}` :
                        form.linkedClientId ? ` · Vinculado a ${form.linkedClientName}` : "";
      logAudit("create", "withdrawal", draftId,
        `Merma: ${qty}x ${prod.brand} ${prod.model} - ${prod.flavor} · ${form.withdrawType} · ${form.person} · ${formatMoney(costRealUSD, "USD")}${linkedInfo}`
      );
    }

    setModal(false);
    setForm({
      brand: "", model: "", productId: "", qty: 1,
      person: currentUser?.name || "", withdrawType: "Consumo propio",
      linkedSaleId: "", linkedSaleClient: "", linkedSaleDate: "",
      linkedClientId: "", linkedClientName: "",
      failedProductId: "", failureReason: "", failureNotes: "",
      reclamableProveedor: false,
      notes: "", date: new Date().toISOString().slice(0, 10),
    });
    setSaleSearch("");
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);
  };

  // Backwards-compat alias para código que usaba `save` directo
  const save = attemptSubmit;

  // ---- DELETE (soft) ----
  const deleteWithdrawal = (w) => {
    if (confirmDel !== w.id) { setConfirmDel(w.id); setTimeout(() => setConfirmDel(null), 3000); return; }
    // Restore stock
    setProducts(prev => prev.map(p =>
      p.id === w.productId && !p.isDeleted ? { ...p, stock: (p.stock || 0) + (w.qty || 1) } : p
    ));
    setWithdrawals(prev => prev.map(x =>
      x.id === w.id ? { ...x, isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: currentUser?.name || "?" } : x
    ));
    if (logAudit) {
      const prod = products.find(p => p.id === w.productId);
      logAudit("delete", "withdrawal", w.id, `Eliminó merma: ${prod ? `${prod.brand} ${prod.model}` : "?"} x${w.qty}`);
    }
    setConfirmDel(null);
  };

  // ---- Stats (only active) ----
  const active = withdrawals.filter(w => !w.isDeleted);
  const totalMine = active.filter(w => w.person === "Diego").reduce((s, w) => s + w.qty, 0);
  const totalBro = active.filter(w => w.person === "Gustavo").reduce((s, w) => s + w.qty, 0);
  const totalCostUSD = active.reduce((s, w) => s + Number(w.costRealUSD || w.costEstimateUSD || 0), 0);
  const totalConsumo = active.filter(w => !w.withdrawType || w.withdrawType === "Consumo propio").reduce((s, w) => s + w.qty, 0);
  const totalGarantia = active.filter(w => isGarantia(w.withdrawType)).reduce((s, w) => s + w.qty, 0);
  const totalRegalo = active.filter(w => w.withdrawType === "Regalo / Canje").reduce((s, w) => s + w.qty, 0);

  // Cascading picker data for current form
  const modelsForBrand = form.brand ? getModels(form.brand) : [];
  const flavorsForModel = form.brand && form.model ? getFlavors(form.brand, form.model) : [];

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: "#37352F", margin: 0, fontSize: 22 }}>Mermas</h2>
          <span style={{ color: "#8C8A82", fontSize: 13 }}>Consumo propio, garantías, canjes — {active.length} registros</span>
        </div>
        <Btn onClick={() => setModal(true)}>+ Registrar Merma</Btn>
      </div>

      {/* Success toast */}
      {showSuccess && (
        <div style={{
          position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)", zIndex: 300,
          background: "#e17055", color: "#fff", padding: "10px 24px", borderRadius: 10,
          fontSize: 14, fontWeight: 700, boxShadow: "0 4px 16px rgba(225,112,85,0.3)",
        }}>Merma registrada</div>
      )}

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(140px, 1fr))", gap: isMobile ? 8 : 14, marginBottom: 20 }}>
        <StatCard label="Diego" value={`${totalMine} uds`} icon="💜" color="#5E6AD2" />
        <StatCard label="Gustavo" value={`${totalBro} uds`} icon="💙" color="#00b894" />
        <StatCard label="Consumo" value={`${totalConsumo}`} icon="🚬" color="#e17055" />
        <StatCard label="Garantías" value={`${totalGarantia}`} icon="🔄" color="#fdcb6e" />
        <StatCard label="Regalos" value={`${totalRegalo}`} icon="🎁" color="#00cec9" />
        <StatCard label="Pérdida total" value={formatMoney(totalCostUSD, "USD")} sub={exchangeRate ? formatMoney(totalCostUSD * exchangeRate) : ""} icon="📉" color="#E03E3E" />
      </div>

      {/* ============================================ */}
      {/* TABS por tipo (PARTE 3)                       */}
      {/* ============================================ */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 14,
        borderBottom: "1px solid #E8E7E3", overflowX: "auto",
        WebkitOverflowScrolling: "touch",
      }}>
        {[
          { k: "all", label: "Todo", color: "#37352F", count: active.length },
          { k: "consumo", label: "Consumos", color: "#e17055", count: active.filter(w => !w.withdrawType || w.withdrawType === "Consumo propio").length },
          { k: "garantia", label: "Garantías", color: "#CB912F", count: active.filter(w => isGarantia(w.withdrawType)).length },
          { k: "regalo", label: "Regalos", color: "#00cec9", count: active.filter(w => w.withdrawType === "Regalo / Canje").length },
        ].map(t => {
          const isActive = activeTab === t.k;
          return (
            <button key={t.k} onClick={() => setActiveTab(t.k)} style={{
              padding: "10px 16px", background: "transparent", border: "none",
              borderBottom: `2px solid ${isActive ? t.color : "transparent"}`,
              color: isActive ? t.color : "#8C8A82",
              fontSize: 14, fontWeight: isActive ? 700 : 500,
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 6,
              whiteSpace: "nowrap",
              marginBottom: -1,
            }}>
              {t.label}
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                background: isActive ? `${t.color}22` : "#F0EFEB",
                color: isActive ? t.color : "#8C8A82",
              }}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {/* ============================================ */}
      {/* KPIs específicos por tab                       */}
      {/* ============================================ */}
      {activeTab === "consumo" && (() => {
        const consumo = active.filter(w => !w.withdrawType || w.withdrawType === "Consumo propio");
        const diegoC = consumo.filter(w => w.person === "Diego");
        const gustavoC = consumo.filter(w => w.person === "Gustavo");
        const diegoQty = diegoC.reduce((s, w) => s + (w.qty || 0), 0);
        const gustavoQty = gustavoC.reduce((s, w) => s + (w.qty || 0), 0);
        const diegoUSD = diegoC.reduce((s, w) => s + (Number(w.costRealUSD || w.costEstimateUSD) || 0), 0);
        const gustavoUSD = gustavoC.reduce((s, w) => s + (Number(w.costRealUSD || w.costEstimateUSD) || 0), 0);
        const totalQty = diegoQty + gustavoQty;
        const totalUSD = diegoUSD + gustavoUSD;
        const maxQty = Math.max(diegoQty, gustavoQty, 1);
        return (
          <Card style={{ marginBottom: 12, background: "#FAFAF9" }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto 1fr", gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: "#8C8A82", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>Consumos — total</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#e17055" }}>{totalQty} uds</div>
                <div style={{ fontSize: 12, color: "#8C8A82" }}>{formatMoney(totalUSD, "USD")}{exchangeRate ? ` · ${formatMoney(totalUSD * exchangeRate)}` : ""}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                {[
                  { name: "Diego", qty: diegoQty, usd: diegoUSD, color: "#5E6AD2", icon: "💜" },
                  { name: "Gustavo", qty: gustavoQty, usd: gustavoUSD, color: "#00b894", icon: "💙" },
                ].map(p => (
                  <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{p.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#37352F", minWidth: 70 }}>{p.name}</span>
                    <div style={{ flex: 1, height: 18, background: "#F0EFEB", borderRadius: 4, overflow: "hidden", minWidth: 60 }}>
                      <div style={{ width: `${(p.qty / maxQty) * 100}%`, height: "100%", background: p.color, borderRadius: 4, transition: "width 0.3s" }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: p.color, minWidth: 40, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.qty}</span>
                    <span style={{ fontSize: 11, color: "#8C8A82", minWidth: 60, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatMoney(p.usd, "USD")}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        );
      })()}

      {activeTab === "garantia" && (() => {
        const gList = active.filter(w => isGarantia(w.withdrawType));
        const totalCount = gList.length;
        const totalUSD = gList.reduce((s, w) => s + (Number(w.costRealUSD || w.costEstimateUSD) || 0), 0);
        // Modelo más cambiado (por failedProductId)
        const byFailed = {};
        gList.forEach(w => {
          const fid = w.failedProductId || w.productId;
          if (!fid) return;
          const p = products.find(pr => pr.id === fid);
          const key = p ? `${p.brand} ${p.model}` : fid;
          byFailed[key] = (byFailed[key] || 0) + 1;
        });
        const topFailed = Object.entries(byFailed).sort((a, b) => b[1] - a[1])[0];
        // Tasa de falla del mes (garantías del mes / ventas del mes)
        const now = new Date();
        const inMonth = (d) => { const dt = new Date(d); return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear(); };
        const gMonth = gList.filter(w => inMonth(w.date));
        const salesMonth = (sales || []).filter(s => !s.isDeleted && inMonth(s.date));
        const unitsSoldMonth = salesMonth.reduce((s, sale) => s + (sale.items || []).reduce((a, i) => a + (Number(i.qty) || 0), 0), 0);
        const failRate = unitsSoldMonth > 0 ? (gMonth.reduce((s, w) => s + (w.qty || 0), 0) / unitsSoldMonth) * 100 : 0;
        const reclamables = gList.filter(w => w.reclamableProveedor);
        const pctReclamables = totalCount > 0 ? (reclamables.length / totalCount) * 100 : 0;
        return (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
            <div style={{ background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#8C8A82", textTransform: "uppercase", letterSpacing: 0.5 }}>Total cambios</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#CB912F", marginTop: 2 }}>{totalCount}</div>
              <div style={{ fontSize: 11, color: "#8C8A82", marginTop: 2 }}>{formatMoney(totalUSD, "USD")} perdidos</div>
            </div>
            <div style={{ background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#8C8A82", textTransform: "uppercase", letterSpacing: 0.5 }}>Modelo más cambiado</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#37352F", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {topFailed ? topFailed[0] : "—"}
              </div>
              <div style={{ fontSize: 11, color: "#8C8A82", marginTop: 2 }}>
                {topFailed ? `${topFailed[1]} cambios` : "sin datos"}
              </div>
            </div>
            <div style={{ background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#8C8A82", textTransform: "uppercase", letterSpacing: 0.5 }}>Tasa falla mes</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: failRate > 3 ? "#E03E3E" : "#37352F", marginTop: 2 }}>{failRate.toFixed(1)}%</div>
              <div style={{ fontSize: 11, color: "#8C8A82", marginTop: 2 }}>{gMonth.length} / {unitsSoldMonth} vendidas</div>
            </div>
            <div style={{ background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#8C8A82", textTransform: "uppercase", letterSpacing: 0.5 }}>Reclamables prov.</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#6940A5", marginTop: 2 }}>{pctReclamables.toFixed(0)}%</div>
              <div style={{ fontSize: 11, color: "#8C8A82", marginTop: 2 }}>{reclamables.length} cambios</div>
            </div>
          </div>
        );
      })()}

      {activeTab === "regalo" && (() => {
        const regalos = active.filter(w => w.withdrawType === "Regalo / Canje");
        const totalCount = regalos.length;
        const totalUSD = regalos.reduce((s, w) => s + (Number(w.costRealUSD || w.costEstimateUSD) || 0), 0);
        // Top 3 clientes con más regalos
        const byClient = {};
        regalos.forEach(w => {
          if (!w.linkedClientId) return;
          const key = w.linkedClientName || w.linkedClientId;
          if (!byClient[key]) byClient[key] = { count: 0, usd: 0 };
          byClient[key].count++;
          byClient[key].usd += Number(w.costRealUSD || w.costEstimateUSD) || 0;
        });
        const top3 = Object.entries(byClient).sort((a, b) => b[1].count - a[1].count).slice(0, 3);
        return (
          <Card style={{ marginBottom: 12, background: "#FAFAF9" }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto 1fr", gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: "#8C8A82", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>Regalos — total</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#00cec9" }}>{totalCount}</div>
                <div style={{ fontSize: 12, color: "#8C8A82" }}>{formatMoney(totalUSD, "USD")}{exchangeRate ? ` · ${formatMoney(totalUSD * exchangeRate)}` : ""}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#8C8A82", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
                  Top 3 clientes con más regalos
                </div>
                {top3.length === 0 ? (
                  <div style={{ fontSize: 12, color: "#8C8A82", fontStyle: "italic" }}>Sin regalos a clientes todavía</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {top3.map(([name, v], i) => (
                      <div key={name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#8C8A82", minWidth: 16 }}>{i + 1}.</span>
                        <span style={{ fontSize: 13, color: "#37352F", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#00cec9", fontVariantNumeric: "tabular-nums" }}>{v.count}</span>
                        <span style={{ fontSize: 11, color: "#8C8A82", fontVariantNumeric: "tabular-nums", minWidth: 60, textAlign: "right" }}>{formatMoney(v.usd, "USD")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        );
      })()}

      {/* Filtros del listado */}
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Persona */}
          <div style={{ display: "inline-flex", background: "#FAFAF9", borderRadius: 8, padding: 3, border: "1px solid #E8E7E3" }}>
            {["", "Diego", "Gustavo"].map(p => (
              <button key={p || "all"} onClick={() => setFilterPerson(p)} style={{
                padding: "5px 10px", fontSize: 12, fontWeight: 600, border: "none", borderRadius: 6,
                background: filterPerson === p ? "#FFFFFF" : "transparent",
                color: filterPerson === p ? "#37352F" : "#8C8A82",
                boxShadow: filterPerson === p ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                cursor: "pointer", fontFamily: "inherit",
              }}>{p || "Todos"}</button>
            ))}
          </div>

          {/* Tipo */}
          <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{
            padding: "6px 10px", fontSize: 12, borderRadius: 7,
            border: `1px solid ${filterType ? "#5E6AD2" : "#E8E7E3"}`,
            background: filterType ? "#EEF0FC" : "#FFFFFF",
            color: filterType ? "#5E6AD2" : "#555247",
            fontFamily: "inherit", cursor: "pointer", outline: "none",
          }}>
            <option value="">Todos los tipos</option>
            {WITHDRAW_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Presets de fecha */}
          <div style={{ display: "inline-flex", background: "#FAFAF9", borderRadius: 8, padding: 3, border: "1px solid #E8E7E3" }}>
            {[
              { k: "all", l: "Todo" },
              { k: "today", l: "Hoy" },
              { k: "week", l: "7 días" },
              { k: "month", l: "Mes" },
            ].map(p => {
              const today = new Date().toISOString().slice(0, 10);
              const presetActive = (() => {
                if (p.k === "all") return !filterDateFrom && !filterDateTo;
                if (p.k === "today") return filterDateFrom === today && filterDateTo === today;
                if (p.k === "week") {
                  const d = new Date(); d.setDate(d.getDate() - 6);
                  return filterDateFrom === d.toISOString().slice(0, 10) && filterDateTo === today;
                }
                if (p.k === "month") {
                  const d = new Date(); d.setDate(1);
                  return filterDateFrom === d.toISOString().slice(0, 10) && filterDateTo === today;
                }
                return false;
              })();
              return (
                <button key={p.k} onClick={() => {
                  if (p.k === "all") { setFilterDateFrom(""); setFilterDateTo(""); }
                  else if (p.k === "today") { setFilterDateFrom(today); setFilterDateTo(today); }
                  else if (p.k === "week") { const d = new Date(); d.setDate(d.getDate() - 6); setFilterDateFrom(d.toISOString().slice(0, 10)); setFilterDateTo(today); }
                  else if (p.k === "month") { const d = new Date(); d.setDate(1); setFilterDateFrom(d.toISOString().slice(0, 10)); setFilterDateTo(today); }
                }} style={{
                  padding: "5px 10px", fontSize: 12, fontWeight: 600, border: "none", borderRadius: 6,
                  background: presetActive ? "#FFFFFF" : "transparent",
                  color: presetActive ? "#37352F" : "#8C8A82",
                  boxShadow: presetActive ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  cursor: "pointer", fontFamily: "inherit",
                }}>{p.l}</button>
              );
            })}
          </div>

          {/* Search producto */}
          <input value={filterProductSearch} onChange={e => setFilterProductSearch(e.target.value)}
            placeholder="Buscar producto..."
            style={{
              padding: "7px 10px", fontSize: 12, borderRadius: 7, flex: "1 1 140px", minWidth: 140,
              border: `1px solid ${filterProductSearch ? "#5E6AD2" : "#E8E7E3"}`,
              background: "#FAFAF9", color: "#37352F",
              fontFamily: "inherit", outline: "none", boxSizing: "border-box",
            }} />

          {/* Limpiar */}
          {(filterPerson || filterType || filterDateFrom || filterDateTo || filterProductSearch) && (
            <button onClick={() => { setFilterPerson(""); setFilterType(""); setFilterDateFrom(""); setFilterDateTo(""); setFilterProductSearch(""); }}
              style={{
                background: "none", border: "none", color: "#8C8A82", fontSize: 12, fontWeight: 500,
                cursor: "pointer", fontFamily: "inherit", padding: "5px 8px",
              }}>✕ Limpiar</button>
          )}
        </div>
      </Card>

      {/* Table */}
      <Card>
        {(() => {
          // Filtro base del tab activo
          const tabFilter = (w) => {
            if (activeTab === "all") return true;
            if (activeTab === "consumo") return !w.withdrawType || w.withdrawType === "Consumo propio";
            if (activeTab === "garantia") return isGarantia(w.withdrawType);
            if (activeTab === "regalo") return w.withdrawType === "Regalo / Canje";
            return true;
          };
          const tabScope = active.filter(tabFilter);

          // Aplicar filtros dentro del scope del tab
          const filtered = tabScope.filter(w => {
            if (filterPerson && w.person !== filterPerson) return false;
            if (filterType && w.withdrawType !== filterType) return false;
            const wDate = (w.date || "").slice(0, 10);
            if (filterDateFrom && wDate < filterDateFrom) return false;
            if (filterDateTo && wDate > filterDateTo) return false;
            if (filterProductSearch) {
              const prod = products.find(p => p.id === w.productId);
              const prodFailed = w.failedProductId ? products.find(p => p.id === w.failedProductId) : null;
              const pname = prod ? `${prod.brand} ${prod.model} ${prod.flavor}`.toLowerCase() : "";
              const fname = prodFailed ? `${prodFailed.brand} ${prodFailed.model} ${prodFailed.flavor}`.toLowerCase() : "";
              if (!pname.includes(filterProductSearch.toLowerCase()) && !fname.includes(filterProductSearch.toLowerCase())) return false;
            }
            return true;
          });

          const tabLabel = { all: "mermas", consumo: "consumos", garantia: "cambios por garantía", regalo: "regalos" }[activeTab];

          return (
            <>
              <div style={{ fontSize: 12, color: "#8C8A82", marginBottom: 8 }}>
                {filtered.length === tabScope.length ? `${filtered.length} ${tabLabel}` : `${filtered.length} de ${tabScope.length} ${tabLabel}`}
              </div>
              {(() => {
                // ============================================
                // Columnas dinámicas según tab activo
                // ============================================
                const reasonCatColor = {
                  electrico: "#E03E3E", liquido: "#2383E2",
                  fisico: "#CB912F", envio: "#6940A5", otro: "#8C8A82",
                };

                const colDate = { key: "date", label: "Fecha", render: r => (
                  <div style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{formatDateTime(r.date)}</div>
                )};

                // Columna Producto — adaptativa: 2 líneas si es garantía y entregado !== fallido
                const colProduct = { key: "product", label: "Producto", render: r => {
                  const entregado = products.find(p => p.id === r.productId);
                  const entregadoName = entregado ? `${entregado.brand} ${entregado.model} - ${entregado.flavor}` : "Producto eliminado";

                  if (isGarantia(r.withdrawType)) {
                    const failed = r.failedProductId ? products.find(p => p.id === r.failedProductId) : entregado;
                    const failedName = failed ? `${failed.brand} ${failed.model} - ${failed.flavor}` : (r.failedProductId || "?");
                    const sameModel = !r.failedProductId || r.failedProductId === r.productId;
                    const cat = FAILURE_REASON_CATEGORY[r.failureReason] || "otro";
                    const cColor = reasonCatColor[cat];
                    return (
                      <div style={{ lineHeight: 1.4 }}>
                        <div style={{ fontSize: 13, color: "#37352F" }}>
                          <span style={{ fontWeight: 600 }}>Entregado:</span> {entregadoName}
                        </div>
                        {!sameModel && (
                          <div style={{ fontSize: 12, color: "#8C8A82", marginTop: 2 }}>
                            ← Falló: {failedName}
                          </div>
                        )}
                        {r.failureReason && (
                          <div style={{ fontSize: 11, color: cColor, fontWeight: 600, marginTop: 2 }}>
                            ⚠️ {r.failureReason}
                            {r.failureNotes && <span style={{ color: "#8C8A82", fontWeight: 400 }}> — {r.failureNotes}</span>}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return <span>{entregadoName}</span>;
                }};

                // Columna Fallido — solo tab Garantías
                const colFailed = { key: "failed", label: "Producto fallido", render: r => {
                  const failed = r.failedProductId ? products.find(p => p.id === r.failedProductId) : null;
                  const p = failed || products.find(pr => pr.id === r.productId);
                  const cat = FAILURE_REASON_CATEGORY[r.failureReason] || "otro";
                  const cColor = reasonCatColor[cat];
                  return (
                    <div style={{ lineHeight: 1.4 }}>
                      <div style={{ fontSize: 13, color: "#37352F", fontWeight: 600 }}>
                        {p ? `${p.brand} ${p.model} - ${p.flavor}` : "—"}
                      </div>
                      {r.failureReason && (
                        <div style={{ fontSize: 11, color: cColor, fontWeight: 600, marginTop: 2 }}>
                          ⚠️ {r.failureReason}
                        </div>
                      )}
                    </div>
                  );
                }};

                // Columna Entregado — solo tab Garantías
                const colEntregado = { key: "entregado", label: "Entregado", render: r => {
                  const p = products.find(pr => pr.id === r.productId);
                  const sameModel = !r.failedProductId || r.failedProductId === r.productId;
                  return (
                    <div>
                      <div style={{ fontSize: 13, color: "#37352F" }}>
                        {p ? `${p.brand} ${p.model} - ${p.flavor}` : "?"}
                      </div>
                      {!sameModel && (
                        <div style={{ fontSize: 10, color: "#CB912F", fontWeight: 600, marginTop: 2 }}>
                          modelo diferente
                        </div>
                      )}
                    </div>
                  );
                }};

                const colQty = { key: "qty", label: "Cant.", render: r => <Badge color="#E03E3E">{r.qty}</Badge> };

                const colType = { key: "type", label: "Tipo", render: r => (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}>
                    <Badge color={isGarantia(r.withdrawType) ? "#CB912F" : r.withdrawType === "Regalo / Canje" ? "#00cec9" : "#e17055"}>{isGarantia(r.withdrawType) ? "Cambio por garantía" : (r.withdrawType || "Consumo")}</Badge>
                    {r.reclamableProveedor && (
                      <span style={{
                        fontSize: 9, padding: "1px 6px", borderRadius: 4,
                        background: "#FDECC8", color: "#CB912F", fontWeight: 700, textTransform: "uppercase",
                      }}>📦 Reclamable</span>
                    )}
                  </div>
                )};

                const colReclamable = { key: "reclamable", label: "Reclam.", render: r => (
                  r.reclamableProveedor
                    ? <Badge color="#6940A5">📦 Sí</Badge>
                    : <span style={{ fontSize: 11, color: "#B1AFA7" }}>—</span>
                )};

                const colPerson = { key: "person", label: "Quién", render: r => <Badge color={r.person === "Diego" ? "#a855f7" : "#00b894"}>{r.person}</Badge> };

                const colCost = { key: "cost", label: "Pérdida", render: r => {
                  const cost = Number(r.costRealUSD || r.costEstimateUSD) || 0;
                  return (
                    <div>
                      <div style={{ fontWeight: 600, color: "#E03E3E" }}>{formatMoney(cost, "USD")}</div>
                      {exchangeRate && <div style={{ fontSize: 11, color: "#B1AFA7" }}>{formatMoney(cost * exchangeRate)}</div>}
                    </div>
                  );
                }};

                const colClient = { key: "client", label: "Cliente", render: r => (
                  r.linkedClientId
                    ? <span style={{ fontSize: 12, fontWeight: 600, color: "#5E6AD2" }}>👤 {r.linkedClientName}</span>
                    : r.linkedSaleClient
                      ? <span style={{ fontSize: 12, color: "#8C8A82" }}>{r.linkedSaleClient}</span>
                      : <span style={{ fontSize: 11, color: "#B1AFA7" }}>—</span>
                )};

                const colNotes = { key: "notes", label: "Nota", render: r => (
                  <div>
                    {r.linkedSaleId && !isGarantia(r.withdrawType) && (
                      <div style={{ fontSize: 11, color: "#CB912F", fontWeight: 600, marginBottom: 2 }}>
                        🔄 Ref venta: {r.linkedSaleClient || "?"} ({formatDate(r.linkedSaleDate)})
                      </div>
                    )}
                    {r.linkedClientId && !r.linkedSaleId && !isGarantia(r.withdrawType) && (
                      <div style={{ fontSize: 11, color: "#5E6AD2", fontWeight: 600, marginBottom: 2 }}>
                        👤 {r.linkedClientName}
                      </div>
                    )}
                    {r.notes || (r.linkedSaleId || r.linkedClientId ? "" : "—")}
                  </div>
                )};

                const colActions = { key: "actions", label: "", render: r => (
                  confirmDel === r.id
                    ? <button onClick={() => deleteWithdrawal(r)} style={{ background: "#F7D7D6", border: "1px solid #E03E3E55", color: "#E03E3E", padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Confirmar</button>
                    : <button onClick={() => deleteWithdrawal(r)} style={{ background: "none", border: "none", color: "#E03E3E", cursor: "pointer", fontSize: 14 }}>🗑️</button>
                )};

                // Columnas por tab
                let columns, mobileColumns;
                if (activeTab === "garantia") {
                  columns = [colDate, colFailed, colEntregado, colQty, colClient, colReclamable, colCost, colActions];
                  mobileColumns = ["date", "failed", "entregado", "qty", "actions"];
                } else if (activeTab === "consumo") {
                  columns = [colDate, colProduct, colQty, colPerson, colCost, colNotes, colActions];
                  mobileColumns = ["date", "product", "qty", "person", "actions"];
                } else if (activeTab === "regalo") {
                  columns = [colDate, colProduct, colQty, colClient, colPerson, colCost, colNotes, colActions];
                  mobileColumns = ["date", "product", "qty", "client", "actions"];
                } else {
                  // "all"
                  columns = [colDate, colProduct, colQty, colType, colPerson, colCost, colNotes, colActions];
                  mobileColumns = ["date", "product", "qty", "person", "actions"];
                }

                const emptyMsg = tabScope.length === 0
                  ? (activeTab === "all" ? "No hay mermas registradas" : `No hay ${tabLabel} registrados`)
                  : "Sin resultados con esos filtros";

                return <Table columns={columns} data={filtered} emptyMsg={emptyMsg} mobileColumns={mobileColumns} />;
              })()}
            </>
          );
        })()}
      </Card>

      {/* ============================================ */}
      {/* MODAL — Cascading picker style */}
      {/* ============================================ */}
      <Modal open={modal} onClose={() => setModal(false)} title="Registrar Merma">

        {/* Validation error */}
        {validationError && (
          <div style={{ background: "#FBE4E4", border: "1px solid #F1B8B6", borderRadius: 8, padding: "8px 12px", marginBottom: 12, color: "#E03E3E", fontSize: 13, fontWeight: 600 }}>
            {validationError}
          </div>
        )}

        {/* Who consumed — big buttons */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#B1AFA7", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>QUIÉN</div>
          <div style={{ display: "flex", gap: 10 }}>
            {WITHDRAW_PERSONS.map(p => (
              <button key={p} onClick={() => setForm(f => ({ ...f, person: p }))}
                style={{
                  flex: 1, padding: "12px", borderRadius: 12, cursor: "pointer", textAlign: "center",
                  border: "none", outline: `2px solid ${form.person === p ? (p === "Diego" ? "#5E6AD2" : "#0F7B6C") : "#E8E7E3"}`,
                  background: form.person === p ? (p === "Diego" ? "#EAECF9" : "#DDEDEA") : "#FAFAF9",
                }}>
                <div style={{ fontSize: 22, marginBottom: 2 }}>{p === "Diego" ? "💜" : "💙"}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: form.person === p ? (p === "Diego" ? "#5E6AD2" : "#0F7B6C") : "#555247" }}>{p}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Type — chip buttons */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#B1AFA7", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>TIPO DE MERMA</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {WITHDRAW_TYPES.map(t => {
              const colors = { "Consumo propio": "#e17055", "Cambio por garantía": "#CB912F", "Regalo / Canje": "#00cec9" };
              const icons = { "Consumo propio": "🚬", "Cambio por garantía": "🛡️", "Regalo / Canje": "🎁" };
              const active = form.withdrawType === t;
              return (
                <button key={t} onClick={() => { setForm(f => ({ ...f, withdrawType: t, linkedSaleId: "", linkedSaleClient: "", linkedSaleDate: "" })); setSaleSearch(""); }}
                  style={{
                    ...chipStyle(active, colors[t]),
                    ...(active ? { background: colors[t], borderColor: colors[t] } : {}),
                  }}>
                  {icons[t]} {t}
                </button>
              );
            })}
          </div>
        </div>

        {/* Warranty: link to original sale */}
        {isGarantia(form.withdrawType) && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#CB912F", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
              🔄 VENTA ORIGINAL (¿qué vape salió fallido?)
            </div>

            {form.linkedSaleId ? (
              // Selected sale
              <div style={{ background: "#FDECC8", border: "1px solid #fcd34d", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#37352F" }}>
                    {form.linkedSaleClient || "Sin cliente"} — {formatDate(form.linkedSaleDate)}
                  </div>
                  <div style={{ fontSize: 12, color: "#8C8A82" }}>
                    {(() => {
                      const s = (sales || []).find(x => x.id === form.linkedSaleId);
                      if (!s) return "";
                      return (s.items || []).map(i => {
                        const p = products.find(pr => pr.id === i.productId);
                        return p ? `${p.brand} ${p.model} - ${p.flavor} x${i.qty}` : "?";
                      }).join(", ");
                    })()}
                  </div>
                </div>
                <button onClick={() => { setForm(f => ({ ...f, linkedSaleId: "", linkedSaleClient: "", linkedSaleDate: "" })); setSaleSearch(""); }}
                  style={{ background: "none", border: "none", color: "#B1AFA7", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>
            ) : (
              // Search for sale
              <div style={{ position: "relative" }}>
                <input value={saleSearch}
                  onChange={e => { setSaleSearch(e.target.value); setShowSaleDropdown(true); }}
                  onFocus={() => setShowSaleDropdown(true)}
                  placeholder="Buscar por cliente o producto..."
                  style={{
                    width: "100%", padding: "10px 14px", background: "#FDECC8", border: "1px solid #fcd34d",
                    borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box",
                  }} />
                {showSaleDropdown && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, background: "#FFFFFF",
                    border: "1px solid #E8E7E3", borderRadius: 10, marginTop: 4, zIndex: 50,
                    maxHeight: 280, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                  }}>
                    {filteredSales.length === 0 ? (
                      <div style={{ padding: 14, textAlign: "center", color: "#B1AFA7", fontSize: 13 }}>
                        {saleSearch ? `No se encontró "${saleSearch}"` : "No hay ventas recientes"}
                      </div>
                    ) : filteredSales.map(s => {
                      const itemsText = (s.items || []).map(i => {
                        const p = products.find(pr => pr.id === i.productId);
                        return p ? `${p.brand} ${p.model} - ${p.flavor}` : "?";
                      }).join(", ");
                      return (
                        <button key={s.id} onClick={() => {
                          // Si la venta tiene UN solo item, pre-llenamos failedProductId.
                          // Si tiene varios, dejamos el form pida cuál falló.
                          const singleItem = (s.items || []).length === 1 ? s.items[0] : null;
                          setForm(f => ({
                            ...f,
                            linkedSaleId: s.id,
                            linkedSaleClient: s.clientName || "Sin cliente",
                            linkedSaleDate: s.date,
                            // Auto-vincular cliente si la venta tiene clientId
                            ...(s.clientId ? { linkedClientId: s.clientId, linkedClientName: s.clientName || "" } : {}),
                            // Auto-vincular producto fallido si la venta tiene un único item
                            ...(isGarantia(f.withdrawType) && singleItem?.productId
                              ? { failedProductId: singleItem.productId }
                              : {}),
                          }));
                          setShowSaleDropdown(false);
                          setSaleSearch("");
                        }} style={{
                          display: "block", width: "100%", padding: "10px 14px", background: "none",
                          border: "none", borderBottom: "1px solid #E8E7E3", cursor: "pointer", textAlign: "left",
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "#37352F" }}>
                              {s.clientName || "Sin cliente"}
                            </div>
                            <span style={{ fontSize: 11, color: "#B1AFA7" }}>{formatDate(s.date)}</span>
                          </div>
                          <div style={{ fontSize: 12, color: "#8C8A82", marginTop: 2 }}>{itemsText}</div>
                          <div style={{ fontSize: 11, color: "#0F7B6C", fontWeight: 600 }}>{formatMoney(s.total, s.currency)}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <div style={{ fontSize: 11, color: "#B1AFA7", marginTop: 6 }}>
              Opcional — vinculá esta garantía con la venta original del vape fallido
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* GARANTÍA — ¿Qué falló? + ¿Qué le entregás?    */}
        {/* ============================================ */}
        {isGarantia(form.withdrawType) && (() => {
          const failedProd = form.failedProductId ? products.find(p => p.id === form.failedProductId) : null;
          const saleItems = form.linkedSaleId
            ? ((sales || []).find(s => s.id === form.linkedSaleId)?.items || [])
            : [];
          const multiItemSale = saleItems.length > 1;
          const reason = form.failureReason;
          const reasonCat = FAILURE_REASON_CATEGORY[reason] || "otro";
          const reasonColor = {
            electrico: "#E03E3E", liquido: "#2383E2",
            fisico: "#CB912F", envio: "#6940A5", otro: "#8C8A82",
          }[reasonCat];

          return (
            <>
              {/* SECCIÓN: ¿Qué falló? */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: "#B1AFA7", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  ¿Qué falló? (lo que trajo el cliente)
                </div>

                {/* Dropdown "cuál falló" si la venta tiene varios items */}
                {multiItemSale && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: "#8C8A82", marginBottom: 4, fontWeight: 600 }}>
                      La venta tiene {saleItems.length} items — ¿cuál falló?
                    </div>
                    <select
                      value={form.failedProductId}
                      onChange={e => setForm(f => ({ ...f, failedProductId: e.target.value }))}
                      style={{
                        width: "100%", padding: "10px 12px", background: "#FAFAF9",
                        border: "1px solid #E8E7E3", borderRadius: 8,
                        fontSize: 14, fontFamily: "inherit", color: "#37352F",
                      }}>
                      <option value="">Elegí cuál...</option>
                      {saleItems.map((it, i) => {
                        const p = products.find(pr => pr.id === it.productId);
                        const label = p ? `${p.brand} ${p.model} - ${p.flavor}` : `Item #${i + 1}`;
                        return <option key={i} value={it.productId}>{label} (x{it.qty})</option>;
                      })}
                    </select>
                  </div>
                )}

                {/* Card del producto fallido */}
                {failedProd ? (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "12px 14px",
                    background: "#FBE4E4", border: "1px solid #F1B8B6", borderRadius: 10,
                    marginBottom: 10,
                  }}>
                    <span style={{ fontSize: 22 }}>⚠️</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#E03E3E" }}>
                        {failedProd.brand} {failedProd.model} - {failedProd.flavor}
                      </div>
                      <div style={{ fontSize: 11, color: "#8C8A82" }}>
                        {failedProd.puffs}p · producto fallido que trajo el cliente
                      </div>
                    </div>
                    <button onClick={() => setForm(f => ({ ...f, failedProductId: "" }))}
                      style={{
                        background: "none", border: "none", color: "#8C8A82",
                        cursor: "pointer", fontSize: 12, padding: "4px 8px",
                      }}>Cambiar</button>
                  </div>
                ) : (
                  <div style={{
                    padding: "10px 12px", background: "#FAFAF9",
                    border: "1px dashed #E8E7E3", borderRadius: 10,
                    marginBottom: 10,
                    fontSize: 12, color: "#8C8A82", fontStyle: "italic",
                  }}>
                    Vinculá la venta original arriba o elegí manualmente el producto fallido más abajo.
                  </div>
                )}

                {/* Dropdown razón */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: "#8C8A82", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Razón del fallo *
                  </div>
                  <select
                    value={reason}
                    onChange={e => {
                      const r = e.target.value;
                      setForm(f => ({
                        ...f,
                        failureReason: r,
                        // Auto-activar reclamable a proveedor si es daño de envío
                        reclamableProveedor: r === "Daño de envío Paraguay" ? true : f.reclamableProveedor,
                      }));
                    }}
                    style={{
                      width: "100%", padding: "10px 12px", background: "#FAFAF9",
                      border: `1px solid ${reason ? reasonColor : "#E8E7E3"}`, borderRadius: 8,
                      fontSize: 14, fontFamily: "inherit", color: reason ? reasonColor : "#8C8A82",
                      fontWeight: 600,
                    }}>
                    <option value="">Elegí una razón...</option>
                    {FAILURE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>

                {/* Campo notas de falla (obligatorio si razón=Otro) */}
                {reason && (
                  <input
                    value={form.failureNotes}
                    onChange={e => setForm(f => ({ ...f, failureNotes: e.target.value }))}
                    placeholder={reason === "Otro" ? "Describí qué pasó (obligatorio, mín. 5 chars)" : "Detalle adicional (opcional)"}
                    style={{
                      width: "100%", padding: "10px 12px", background: "#FAFAF9",
                      border: `1px solid ${reason === "Otro" && (form.failureNotes || "").trim().length < 5 ? "#E03E3E" : "#E8E7E3"}`,
                      borderRadius: 8,
                      fontSize: 14, fontFamily: "inherit", boxSizing: "border-box",
                    }} />
                )}
              </div>

              {/* SECCIÓN: ¿Qué le entregás? */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: "#B1AFA7", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  ¿Qué le entregás de reemplazo?
                </div>

                {/* Botón "Mismo modelo" — el 90% de los casos */}
                {failedProd && (() => {
                  const sameSelected = form.productId === failedProd.id;
                  const stock = failedProd.stock || 0;
                  return (
                    <button
                      onClick={() => {
                        if (stock > 0) {
                          setForm(f => ({
                            ...f,
                            brand: failedProd.brand,
                            model: failedProd.model,
                            productId: failedProd.id,
                          }));
                        }
                      }}
                      disabled={stock === 0}
                      style={{
                        width: "100%", padding: "14px 16px",
                        background: sameSelected ? "#DDEDEA" : stock > 0 ? "#EEF0FC" : "#FAFAF9",
                        border: `2px solid ${sameSelected ? "#0F7B6C" : stock > 0 ? "#5E6AD2" : "#E8E7E3"}`,
                        borderRadius: 12, cursor: stock > 0 ? "pointer" : "not-allowed",
                        textAlign: "left", fontFamily: "inherit",
                        marginBottom: 10,
                        opacity: stock === 0 ? 0.6 : 1,
                      }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 22 }}>{sameSelected ? "✅" : "💡"}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: sameSelected ? "#0F7B6C" : "#5E6AD2" }}>
                            {sameSelected ? "Mismo modelo seleccionado" : `Entregar mismo modelo`}
                          </div>
                          <div style={{ fontSize: 12, color: "#555247" }}>
                            {failedProd.brand} {failedProd.model} - {failedProd.flavor}
                            {stock > 0
                              ? ` · ${stock} ${stock === 1 ? "ud" : "uds"} disponibles`
                              : " · sin stock"}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })()}

                {/* Badge si entregado !== fallido */}
                {failedProd && form.productId && form.productId !== form.failedProductId && (
                  <div style={{
                    padding: "8px 12px", borderRadius: 8, marginBottom: 10,
                    background: "#FDECC8", border: "1px solid #F2D59A",
                    fontSize: 12, color: "#CB912F",
                  }}>
                    ⓘ Reemplazo por equivalente (no había stock del original o preferiste cambiar el modelo)
                  </div>
                )}

                <div style={{ fontSize: 11, color: "#8C8A82", textAlign: "center", margin: "6px 0" }}>
                  — o elegir otro modelo —
                </div>
              </div>
            </>
          );
        })()}

        {/* Brand chips */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#B1AFA7", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {isGarantia(form.withdrawType) ? "PRODUCTO DE REEMPLAZO" : "MARCA"}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {brands.map(b => (
              <button key={b} onClick={() => updateField("brand", b)}
                style={{
                  ...chipStyle(form.brand === b),
                  ...(form.brand === b ? { background: BRAND_COLORS[b] || "#5E6AD2", borderColor: BRAND_COLORS[b] || "#5E6AD2" } : {}),
                }}>{b}</button>
            ))}
          </div>
        </div>

        {/* Model chips */}
        {form.brand && modelsForBrand.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#B1AFA7", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>MODELO</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {modelsForBrand.map(m => {
                const stockForModel = availableProducts.filter(p => p.brand === form.brand && p.model === m).reduce((s, p) => s + p.stock, 0);
                return (
                  <button key={m} onClick={() => updateField("model", m)}
                    style={chipStyle(form.model === m)}>
                    {m} <span style={{ opacity: 0.6, fontSize: 11 }}>({stockForModel})</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Flavor chips */}
        {form.brand && form.model && flavorsForModel.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#B1AFA7", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>SABOR ({flavorsForModel.length})</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxHeight: 200, overflowY: "auto" }}>
              {flavorsForModel.map(p => {
                const stock = Number(p.stock) || 0;
                const noStock = stock === 0;
                const lowStock = stock > 0 && stock <= 1;
                const selected = form.productId === p.id;
                const stockColor = noStock ? "#B1AFA7" : lowStock ? "#CB912F" : "#0F7B6C";
                const stockBg = noStock ? "#F0EFEB" : lowStock ? "#FDECC8" : "#DDEDEA";
                return (
                  <button key={p.id}
                    disabled={noStock}
                    onClick={() => !noStock && setForm(f => ({ ...f, productId: p.id }))}
                    style={{
                      ...chipStyle(selected),
                      fontSize: 12, padding: "6px 4px 6px 10px",
                      opacity: noStock ? 0.45 : 1,
                      cursor: noStock ? "not-allowed" : "pointer",
                      display: "inline-flex", alignItems: "center", gap: 6,
                    }}
                    title={noStock ? "Sin stock" : lowStock ? "Stock bajo" : ""}>
                    <span>{p.flavor}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      padding: "1px 6px", borderRadius: 999,
                      background: selected ? "#FFFFFF" : stockBg,
                      color: stockColor,
                      lineHeight: 1.4,
                    }}>{stock} {stock === 1 ? "ud" : "uds"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Selected product + qty */}
        {selectedProd && (
          <div style={{ background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#37352F" }}>{selectedProd.brand} {selectedProd.model} - {selectedProd.flavor}</div>
                <div style={{ fontSize: 12, color: "#8C8A82" }}>{selectedProd.puffs}p · Stock: {selectedProd.stock}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#8C8A82", fontWeight: 600 }}>Costo</div>
                {(() => {
                  const c = Number(selectedProd.costUSDT) || (Number(selectedProd.priceUSD) || 0) * 0.55;
                  return <div style={{ fontSize: 13, fontWeight: 700, color: "#37352F" }}>{formatMoney(c, "USD")}/u</div>;
                })()}
              </div>
            </div>

            {/* Quantity picker */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 12, color: "#8C8A82", fontWeight: 600 }}>CANTIDAD</div>
              <button onClick={() => setForm(f => ({ ...f, qty: Math.max(1, (Number(f.qty) || 1) - 1) }))}
                style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid #E8E7E3", background: "#FFFFFF", cursor: "pointer", fontSize: 18, fontWeight: 700 }}>−</button>
              <span style={{ fontSize: 22, fontWeight: 800, minWidth: 32, textAlign: "center" }}>{form.qty}</span>
              <button onClick={() => setForm(f => ({ ...f, qty: Math.min(selectedProd.stock, (Number(f.qty) || 1) + 1) }))}
                style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid #E8E7E3", background: "#FFFFFF", cursor: "pointer", fontSize: 18, fontWeight: 700 }}>+</button>
            </div>
          </div>
        )}

        {/* Client picker — visible para Regalo/Canje (encouraged) y Garantía (si no hay venta vinculada) */}
        {(form.withdrawType === "Regalo / Canje" ||
          (isGarantia(form.withdrawType) && !form.linkedSaleId)) && (
          <ClientPicker
            clients={clients}
            sales={sales}
            value={form.linkedClientId}
            valueName={form.linkedClientName}
            onChange={(id, name) => setForm(f => ({ ...f, linkedClientId: id, linkedClientName: name }))}
            label={form.withdrawType === "Regalo / Canje" ? "Cliente que recibió el regalo (recomendado)" : "Cliente (opcional)"}
            isMobile={isMobile}
          />
        )}

        {/* Auto-link info para Garantía con venta vinculada */}
        {isGarantia(form.withdrawType) && form.linkedSaleId && form.linkedClientId && (
          <div style={{
            padding: "8px 12px", borderRadius: 8, marginBottom: 14,
            background: "#EEF0FC", border: "1px solid #5E6AD233",
            fontSize: 12, color: "#5E6AD2",
          }}>
            ✓ Vinculado a <strong>{form.linkedClientName}</strong> automáticamente desde la venta seleccionada
          </div>
        )}

        {/* Toggle "Imputable a proveedor" — solo Garantía */}
        {isGarantia(form.withdrawType) && (
          <label style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 12px", borderRadius: 10, marginBottom: 14, cursor: "pointer",
            background: form.reclamableProveedor ? "#FDECC8" : "#FAFAF9",
            border: `1px solid ${form.reclamableProveedor ? "#F2D59A" : "#E8E7E3"}`,
          }}>
            <input
              type="checkbox"
              checked={!!form.reclamableProveedor}
              onChange={e => setForm(f => ({ ...f, reclamableProveedor: e.target.checked }))}
              style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#CB912F" }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: form.reclamableProveedor ? "#CB912F" : "#37352F" }}>
                Reclamable al proveedor
              </div>
              <div style={{ fontSize: 11, color: "#8C8A82", lineHeight: 1.4 }}>
                Si el producto vino defectuoso y querés contemplarlo en el próximo pedido al proveedor
              </div>
            </div>
          </label>
        )}

        {/* Notes + date */}
        <Input label="Nota (opcional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="ej: para probar sabor nuevo, defectuoso, regalo a cliente..." />

        <button onClick={() => document.getElementById("merma-date-toggle")?.click()} style={{ display: "none" }} />
        <details style={{ marginBottom: 14 }}>
          <summary id="merma-date-toggle" style={{ fontSize: 12, color: "#5E6AD2", cursor: "pointer", fontWeight: 600, marginBottom: 4 }}>
            Cambiar fecha ({form.date})
          </summary>
          <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        </details>

        {/* Cost preview — costo real perdido vs lucro cesante */}
        {selectedProd && (() => {
          const qty = Number(form.qty) || 1;
          const priceUSD = Number(selectedProd.priceUSD) || 0;
          const costUSDTunit = Number(selectedProd.costUSDT) || 0;
          const costPerUnitUSD = costUSDTunit > 0 ? costUSDTunit : priceUSD * 0.55;
          const costRealUSD = costPerUnitUSD * qty;
          const lucroCesanteUSD = Math.max(0, (priceUSD - costPerUnitUSD) * qty);
          const totalImpactoUSD = costRealUSD + lucroCesanteUSD; // = priceUSD * qty
          const usingFallback = costUSDTunit <= 0;
          return (
            <div style={{
              background: "#FFFFFF", border: "1px solid #E8E7E3", borderRadius: 12,
              padding: "14px 16px", marginBottom: 14,
              display: "flex", flexDirection: "column", gap: 10,
            }}>
              <div style={{ fontSize: 11, color: "#8C8A82", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>
                Impacto de esta merma
              </div>

              {/* Línea 1: Costo real */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, color: "#37352F", fontWeight: 600 }}>Costo real perdido</div>
                  <div style={{ fontSize: 11, color: "#8C8A82" }}>
                    Lo que pagaste al proveedor por estas {qty} unidad{qty === 1 ? "" : "es"}
                    {usingFallback && " · estimado (sin costUSDT cargado)"}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#E03E3E" }}>{formatMoney(costRealUSD, "USD")}</div>
                  {exchangeRate > 0 && (
                    <div style={{ fontSize: 12, color: "#8C8A82" }}>≈ {formatMoney(Math.round(costRealUSD * exchangeRate))} ARS</div>
                  )}
                </div>
              </div>

              {/* Línea 2: Lucro cesante */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, paddingTop: 8, borderTop: "1px solid #F0EFEB" }}>
                <div>
                  <div style={{ fontSize: 13, color: "#37352F", fontWeight: 600 }}>Lucro cesante</div>
                  <div style={{ fontSize: 11, color: "#8C8A82" }}>Lo que dejás de ganar al no venderlo</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#CB912F" }}>{formatMoney(lucroCesanteUSD, "USD")}</div>
                  {exchangeRate > 0 && (
                    <div style={{ fontSize: 11, color: "#8C8A82" }}>≈ {formatMoney(Math.round(lucroCesanteUSD * exchangeRate))} ARS</div>
                  )}
                </div>
              </div>

              {/* Línea 3: Total impacto */}
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10,
                paddingTop: 10, borderTop: "1px solid #E8E7E3",
              }}>
                <div style={{ fontSize: 13, color: "#37352F", fontWeight: 700 }}>Total impacto</div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#37352F" }}>{formatMoney(totalImpactoUSD, "USD")}</div>
                  {exchangeRate > 0 && (
                    <div style={{ fontSize: 12, color: "#8C8A82" }}>≈ {formatMoney(Math.round(totalImpactoUSD * exchangeRate))} ARS</div>
                  )}
                </div>
              </div>

              {/* Aviso clave: solo el costo real entra en KPIs */}
              <div style={{
                fontSize: 11, color: "#8C8A82", fontStyle: "italic",
                paddingTop: 6,
              }}>
                Solo el <strong>costo real</strong> se registra en los KPIs financieros.
                {form.withdrawType === "Consumo propio" && form.person && (
                  <span> Como es consumo propio, se imputa 100% a {form.person}, no al pozo común.</span>
                )}
                {isGarantia(form.withdrawType) && (
                  <span> El producto fallido que trajo el cliente <strong>no suma costo</strong> porque
                  ya estaba vendido y cobrado. Solo perdés el costo del que entregás de reemplazo.</span>
                )}
              </div>
            </div>
          );
        })()}

        {/* Duplicate warning */}
        {confirmingDup && (() => {
          const dupProd = products.find(p => p.id === confirmingDup.mov.productId);
          const dupName = dupProd ? `${dupProd.brand} ${dupProd.model} - ${dupProd.flavor}` : "Producto desconocido";
          return (
            <div style={{
              padding: "12px 14px", borderRadius: 10, marginBottom: 10,
              background: "#FDECC8", border: "1px solid #F2D59A",
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#CB912F", marginBottom: 4 }}>
                ⚠️ ¿Estás seguro? Cargaste algo parecido hace {confirmingDup.minutes} min
              </div>
              <div style={{ fontSize: 12, color: "#555247", marginBottom: 8, lineHeight: 1.4 }}>
                <strong>{confirmingDup.mov.qty}× {dupName}</strong><br />
                {confirmingDup.mov.withdrawType} · {confirmingDup.mov.person} · por {confirmingDup.mov.createdBy || "?"}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Btn variant="secondary" onClick={() => setConfirmingDup(null)} style={{ fontSize: 12, padding: "6px 12px" }}>
                  Cancelar y revisar
                </Btn>
                <button onClick={attemptSubmit} style={{
                  padding: "6px 12px", borderRadius: 8, border: "none",
                  background: "#CB912F", color: "#fff", fontSize: 12, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                }}>Sí, registrarlo igual</button>
              </div>
            </div>
          );
        })()}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="secondary" onClick={() => setModal(false)} style={{ flex: 1 }}>Cancelar</Btn>
          <Btn variant="danger" onClick={attemptSubmit} style={{ flex: 2 }}
            disabled={submitting || !form.productId || !form.person || !form.withdrawType || !(Number(form.qty) > 0)}>
            {submitting ? "Registrando..." : "Registrar Merma"}
          </Btn>
        </div>
      </Modal>
    </div>
  );
};

// ============================================
// ClientPicker — para vincular un cliente a una merma
// ============================================
const ClientPicker = ({ clients = [], sales = [], value, valueName, onChange, label, isMobile }) => {
  const [search, setSearch] = useState("");

  // Clientes recientes: los que tienen ventas más recientes (top 5)
  const recentClients = useMemo(() => {
    const lastDate = {};
    sales.forEach(s => {
      if (s.isDeleted || !s.clientId) return;
      const d = s.date || "";
      if (!lastDate[s.clientId] || d > lastDate[s.clientId]) lastDate[s.clientId] = d;
    });
    return clients
      .filter(c => lastDate[c.id])
      .sort((a, b) => (lastDate[b.id] || "").localeCompare(lastDate[a.id] || ""))
      .slice(0, 5);
  }, [clients, sales]);

  const filtered = useMemo(() => {
    if (!search) return [];
    const q = search.toLowerCase();
    return clients
      .filter(c => c.name?.toLowerCase().includes(q) || (c.phone || "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [clients, search]);

  const selected = value ? clients.find(c => c.id === value) : null;

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: "block", fontSize: 11, fontWeight: 700, color: "#8C8A82",
        textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6,
      }}>{label}</label>

      {/* Estado actual */}
      {selected ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px", borderRadius: 10,
          background: "#EEF0FC", border: "1px solid #5E6AD244",
        }}>
          <span style={{ fontSize: 18 }}>👤</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#5E6AD2" }}>{valueName || selected.name}</div>
            {selected.phone && <div style={{ fontSize: 11, color: "#8C8A82" }}>{selected.phone}</div>}
          </div>
          <button onClick={() => onChange("", "")} style={{
            background: "none", border: "none", color: "#8C8A82", cursor: "pointer",
            fontSize: 14, padding: "4px 8px",
          }} title="Quitar vínculo">✕</button>
        </div>
      ) : (
        <>
          {/* Chips de clientes recientes */}
          {recentClients.length > 0 && !search && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {recentClients.map(c => (
                <button key={c.id} onClick={() => onChange(c.id, c.name)} style={{
                  padding: "6px 12px", borderRadius: 999, border: "1px solid #E8E7E3",
                  background: "#FFFFFF", color: "#37352F", fontSize: 12, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit", minHeight: 36,
                }}>👤 {c.name}</button>
              ))}
              <button onClick={() => onChange("", "Sin cliente específico")} style={{
                padding: "6px 12px", borderRadius: 999, border: "1px dashed #E8E7E3",
                background: "transparent", color: "#8C8A82", fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit", minHeight: 36,
              }}>Sin cliente</button>
            </div>
          )}

          {/* Buscador */}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o teléfono..."
            style={{
              width: "100%", padding: "10px 14px",
              background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 10,
              color: "#37352F", fontSize: isMobile ? 16 : 14, outline: "none",
              boxSizing: "border-box", fontFamily: "inherit",
            }} />

          {/* Resultados de búsqueda */}
          {filtered.length > 0 && (
            <div style={{
              marginTop: 6, border: "1px solid #E8E7E3", borderRadius: 10,
              background: "#FFFFFF", overflow: "hidden",
            }}>
              {filtered.map((c, i) => (
                <button key={c.id} onClick={() => { onChange(c.id, c.name); setSearch(""); }}
                  style={{
                    display: "block", width: "100%", padding: "10px 14px",
                    background: "none", border: "none",
                    borderBottom: i < filtered.length - 1 ? "1px solid #F0EFEB" : "none",
                    cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                  }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#37352F" }}>{c.name}</div>
                  {c.phone && <div style={{ fontSize: 11, color: "#8C8A82" }}>{c.phone}</div>}
                </button>
              ))}
            </div>
          )}
          {search.length >= 2 && filtered.length === 0 && (
            <div style={{ marginTop: 6, fontSize: 12, color: "#8C8A82", padding: "6px 10px" }}>
              Sin resultados para "{search}"
            </div>
          )}
        </>
      )}
    </div>
  );
};
