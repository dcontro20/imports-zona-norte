import { useState, useMemo, useCallback } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Modal, Card, Btn, Input, Select, Table, Badge, StatCard } from "./UI.jsx";
import { WITHDRAW_PERSONS, WITHDRAW_TYPES, BRAND_COLORS } from "../constants.js";

// -- MERMAS: Consumo propio, Garantías, Canjes --
export const Withdrawals = ({ withdrawals, setWithdrawals, products, setProducts, sales, logStock, exchangeRate, currentUser, logAudit }) => {
  const { isMobile } = useResponsive();
  const [modal, setModal] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [saleSearch, setSaleSearch] = useState("");
  const [showSaleDropdown, setShowSaleDropdown] = useState(false);
  const [form, setForm] = useState({
    brand: "", model: "", productId: "", qty: 1,
    person: currentUser?.name || "", withdrawType: "Consumo propio",
    linkedSaleId: "", linkedSaleClient: "", linkedSaleDate: "",
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
    border: `1.5px solid ${active ? (color || "#6366f1") : "#334155"}`,
    background: active ? (color || "#6366f1") : "#0F172A",
    color: active ? "#fff" : "#CBD5E1",
    transition: "all .15s", whiteSpace: "nowrap",
  });

  // ---- SAVE ----
  const save = () => {
    setValidationError("");
    if (!form.productId) { setValidationError("Seleccioná un producto."); return; }
    if (!form.person) { setValidationError("Seleccioná quién consumió."); return; }
    const prod = products.find(p => p.id === form.productId);
    if (!prod) return;
    const qty = Number(form.qty) || 1;
    if (qty > (prod.stock || 0)) {
      setValidationError(`Stock insuficiente: ${prod.brand} ${prod.model} - ${prod.flavor}. Disponible: ${prod.stock}`);
      return;
    }

    const costPerUnitUSD = Number(prod.priceUSD) || 0;
    const costTotalUSD = costPerUnitUSD * qty;
    const costTotalARS = Math.round(costTotalUSD * (exchangeRate || 0));
    const newId = uid();
    const dateISO = form.date ? `${form.date}T${new Date().toTimeString().slice(0, 8)}` : new Date().toISOString();

    const withdrawal = {
      id: newId, productId: form.productId, qty, person: form.person,
      withdrawType: form.withdrawType, notes: form.notes || "",
      costEstimateUSD: costTotalUSD, costEstimateARS: costTotalARS,
      date: dateISO, createdBy: currentUser?.name || "",
      ...(form.linkedSaleId ? { linkedSaleId: form.linkedSaleId, linkedSaleClient: form.linkedSaleClient, linkedSaleDate: form.linkedSaleDate } : {}),
    };

    setWithdrawals(prev => [withdrawal, ...prev]);

    // Deduct stock
    setProducts(prev => prev.map(p =>
      p.id === form.productId ? { ...p, stock: Math.max(0, (p.stock || 0) - qty) } : p
    ));

    // Log stock movement
    logStock({
      productId: form.productId, type: "consumo", qty: -qty,
      reason: `${form.withdrawType} — ${form.person}${form.notes ? `: ${form.notes}` : ""}`,
      refId: newId, date: dateISO,
    });

    if (logAudit) {
      const linkedInfo = form.linkedSaleId ? ` · Garantía de venta a ${form.linkedSaleClient}` : "";
      logAudit("create", "withdrawal", newId,
        `Merma: ${qty}x ${prod.brand} ${prod.model} - ${prod.flavor} · ${form.withdrawType} · ${form.person} · ${formatMoney(costTotalUSD, "USD")}${linkedInfo}`
      );
    }

    setModal(false);
    setForm({
      brand: "", model: "", productId: "", qty: 1,
      person: currentUser?.name || "", withdrawType: "Consumo propio",
      linkedSaleId: "", linkedSaleClient: "", linkedSaleDate: "",
      notes: "", date: new Date().toISOString().slice(0, 10),
    });
    setSaleSearch("");
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);
  };

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
  const totalCostUSD = active.reduce((s, w) => s + (w.costEstimateUSD || 0), 0);
  const totalConsumo = active.filter(w => !w.withdrawType || w.withdrawType === "Consumo propio").reduce((s, w) => s + w.qty, 0);
  const totalGarantia = active.filter(w => w.withdrawType === "Garantía / Devolución").reduce((s, w) => s + w.qty, 0);
  const totalRegalo = active.filter(w => w.withdrawType === "Regalo / Canje").reduce((s, w) => s + w.qty, 0);

  // Cascading picker data for current form
  const modelsForBrand = form.brand ? getModels(form.brand) : [];
  const flavorsForModel = form.brand && form.model ? getFlavors(form.brand, form.model) : [];

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: "#F8FAFC", margin: 0, fontSize: 22 }}>Mermas</h2>
          <span style={{ color: "#94A3B8", fontSize: 13 }}>Consumo propio, garantías, canjes — {active.length} registros</span>
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
        <StatCard label="Diego" value={`${totalMine} uds`} icon="💜" color="#6366f1" />
        <StatCard label="Gustavo" value={`${totalBro} uds`} icon="💙" color="#00b894" />
        <StatCard label="Consumo" value={`${totalConsumo}`} icon="🚬" color="#e17055" />
        <StatCard label="Garantías" value={`${totalGarantia}`} icon="🔄" color="#fdcb6e" />
        <StatCard label="Regalos" value={`${totalRegalo}`} icon="🎁" color="#00cec9" />
        <StatCard label="Pérdida total" value={formatMoney(totalCostUSD, "USD")} sub={exchangeRate ? formatMoney(totalCostUSD * exchangeRate) : ""} icon="📉" color="#EF4444" />
      </div>

      {/* Table */}
      <Card>
        <Table
          columns={[
            { key: "date", label: "Fecha", render: r => formatDate(r.date) },
            { key: "product", label: "Producto", render: r => {
              const p = products.find(pr => pr.id === r.productId);
              return p ? `${p.brand} ${p.model} - ${p.flavor}` : "?";
            }},
            { key: "qty", label: "Cant.", render: r => <Badge color="#EF4444">{r.qty}</Badge> },
            { key: "type", label: "Tipo", render: r => <Badge color={r.withdrawType === "Garantía / Devolución" ? "#fdcb6e" : r.withdrawType === "Regalo / Canje" ? "#00cec9" : "#e17055"}>{r.withdrawType || "Consumo"}</Badge> },
            { key: "person", label: "Quién", render: r => <Badge color={r.person === "Diego" ? "#a855f7" : "#00b894"}>{r.person}</Badge> },
            { key: "cost", label: "Pérdida", render: r => (
              <div>
                <div style={{ fontWeight: 600, color: "#EF4444" }}>{formatMoney(r.costEstimateUSD || 0, "USD")}</div>
                {exchangeRate && <div style={{ fontSize: 11, color: "#64748B" }}>{formatMoney((r.costEstimateUSD || 0) * exchangeRate)}</div>}
              </div>
            )},
            { key: "notes", label: "Nota", render: r => (
              <div>
                {r.linkedSaleId && (
                  <div style={{ fontSize: 11, color: "#F59E0B", fontWeight: 600, marginBottom: 2 }}>
                    🔄 Garantía: {r.linkedSaleClient || "?"} ({formatDate(r.linkedSaleDate)})
                  </div>
                )}
                {r.notes || (r.linkedSaleId ? "" : "—")}
              </div>
            )},
            { key: "actions", label: "", render: r => (
              confirmDel === r.id
                ? <button onClick={() => deleteWithdrawal(r)} style={{ background: "#EF444422", border: "1px solid #EF444455", color: "#EF4444", padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Confirmar</button>
                : <button onClick={() => deleteWithdrawal(r)} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 14 }}>🗑️</button>
            )},
          ]}
          data={active}
          emptyMsg="No hay mermas registradas"
          mobileColumns={["date", "product", "qty", "person", "actions"]}
        />
      </Card>

      {/* ============================================ */}
      {/* MODAL — Cascading picker style */}
      {/* ============================================ */}
      <Modal open={modal} onClose={() => setModal(false)} title="Registrar Merma">

        {/* Validation error */}
        {validationError && (
          <div style={{ background: "#EF444418", border: "1px solid #EF444440", borderRadius: 8, padding: "8px 12px", marginBottom: 12, color: "#EF4444", fontSize: 13, fontWeight: 600 }}>
            {validationError}
          </div>
        )}

        {/* Who consumed — big buttons */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>QUIÉN</div>
          <div style={{ display: "flex", gap: 10 }}>
            {WITHDRAW_PERSONS.map(p => (
              <button key={p} onClick={() => setForm(f => ({ ...f, person: p }))}
                style={{
                  flex: 1, padding: "12px", borderRadius: 12, cursor: "pointer", textAlign: "center",
                  border: "none", outline: `2px solid ${form.person === p ? (p === "Diego" ? "#6366f1" : "#22C55E") : "#334155"}`,
                  background: form.person === p ? (p === "Diego" ? "#6366f122" : "#22C55E18") : "#0F172A",
                }}>
                <div style={{ fontSize: 22, marginBottom: 2 }}>{p === "Diego" ? "💜" : "💙"}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: form.person === p ? (p === "Diego" ? "#6366f1" : "#22C55E") : "#CBD5E1" }}>{p}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Type — chip buttons */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>TIPO DE MERMA</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {WITHDRAW_TYPES.map(t => {
              const colors = { "Consumo propio": "#e17055", "Garantía / Devolución": "#F59E0B", "Regalo / Canje": "#00cec9" };
              const icons = { "Consumo propio": "🚬", "Garantía / Devolución": "🔄", "Regalo / Canje": "🎁" };
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
        {form.withdrawType === "Garantía / Devolución" && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#F59E0B", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
              🔄 VENTA ORIGINAL (¿qué vape salió fallido?)
            </div>

            {form.linkedSaleId ? (
              // Selected sale
              <div style={{ background: "#F59E0B18", border: "1px solid #fcd34d", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#F8FAFC" }}>
                    {form.linkedSaleClient || "Sin cliente"} — {formatDate(form.linkedSaleDate)}
                  </div>
                  <div style={{ fontSize: 12, color: "#94A3B8" }}>
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
                  style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>
            ) : (
              // Search for sale
              <div style={{ position: "relative" }}>
                <input value={saleSearch}
                  onChange={e => { setSaleSearch(e.target.value); setShowSaleDropdown(true); }}
                  onFocus={() => setShowSaleDropdown(true)}
                  placeholder="Buscar por cliente o producto..."
                  style={{
                    width: "100%", padding: "10px 14px", background: "#F59E0B18", border: "1px solid #fcd34d",
                    borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box",
                  }} />
                {showSaleDropdown && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, background: "#1E293B",
                    border: "1px solid #334155", borderRadius: 10, marginTop: 4, zIndex: 50,
                    maxHeight: 280, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                  }}>
                    {filteredSales.length === 0 ? (
                      <div style={{ padding: 14, textAlign: "center", color: "#64748B", fontSize: 13 }}>
                        {saleSearch ? `No se encontró "${saleSearch}"` : "No hay ventas recientes"}
                      </div>
                    ) : filteredSales.map(s => {
                      const itemsText = (s.items || []).map(i => {
                        const p = products.find(pr => pr.id === i.productId);
                        return p ? `${p.brand} ${p.model} - ${p.flavor}` : "?";
                      }).join(", ");
                      return (
                        <button key={s.id} onClick={() => {
                          setForm(f => ({ ...f, linkedSaleId: s.id, linkedSaleClient: s.clientName || "Sin cliente", linkedSaleDate: s.date }));
                          setShowSaleDropdown(false);
                          setSaleSearch("");
                        }} style={{
                          display: "block", width: "100%", padding: "10px 14px", background: "none",
                          border: "none", borderBottom: "1px solid #334155", cursor: "pointer", textAlign: "left",
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "#F8FAFC" }}>
                              {s.clientName || "Sin cliente"}
                            </div>
                            <span style={{ fontSize: 11, color: "#64748B" }}>{formatDate(s.date)}</span>
                          </div>
                          <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{itemsText}</div>
                          <div style={{ fontSize: 11, color: "#22C55E", fontWeight: 600 }}>{formatMoney(s.total, s.currency)}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <div style={{ fontSize: 11, color: "#64748B", marginTop: 6 }}>
              Opcional — vinculá esta garantía con la venta original del vape fallido
            </div>
          </div>
        )}

        {/* Brand chips */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {form.withdrawType === "Garantía / Devolución" ? "PRODUCTO DE REEMPLAZO" : "MARCA"}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {brands.map(b => (
              <button key={b} onClick={() => updateField("brand", b)}
                style={{
                  ...chipStyle(form.brand === b),
                  ...(form.brand === b ? { background: BRAND_COLORS[b] || "#6366f1", borderColor: BRAND_COLORS[b] || "#6366f1" } : {}),
                }}>{b}</button>
            ))}
          </div>
        </div>

        {/* Model chips */}
        {form.brand && modelsForBrand.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>MODELO</div>
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
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>SABOR ({flavorsForModel.length})</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxHeight: 180, overflowY: "auto" }}>
              {flavorsForModel.map(p => (
                <button key={p.id} onClick={() => setForm(f => ({ ...f, productId: p.id }))}
                  style={{ ...chipStyle(form.productId === p.id), fontSize: 12, padding: "5px 10px" }}>
                  {p.flavor} <span style={{ opacity: 0.6, fontSize: 10, marginLeft: 2 }}>({p.stock})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Selected product + qty */}
        {selectedProd && (
          <div style={{ background: "#0F172A", border: "1px solid #334155", borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#F8FAFC" }}>{selectedProd.brand} {selectedProd.model} - {selectedProd.flavor}</div>
                <div style={{ fontSize: 12, color: "#94A3B8" }}>{selectedProd.puffs}p · Stock: {selectedProd.stock}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#EF4444" }}>{formatMoney(selectedProd.priceUSD, "USD")}/u</div>
                {exchangeRate && <div style={{ fontSize: 11, color: "#64748B" }}>{formatMoney(selectedProd.priceUSD * exchangeRate)}/u</div>}
              </div>
            </div>

            {/* Quantity picker */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 12, color: "#94A3B8", fontWeight: 600 }}>CANTIDAD</div>
              <button onClick={() => setForm(f => ({ ...f, qty: Math.max(1, (Number(f.qty) || 1) - 1) }))}
                style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid #334155", background: "#1E293B", cursor: "pointer", fontSize: 18, fontWeight: 700 }}>−</button>
              <span style={{ fontSize: 22, fontWeight: 800, minWidth: 32, textAlign: "center" }}>{form.qty}</span>
              <button onClick={() => setForm(f => ({ ...f, qty: Math.min(selectedProd.stock, (Number(f.qty) || 1) + 1) }))}
                style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid #334155", background: "#1E293B", cursor: "pointer", fontSize: 18, fontWeight: 700 }}>+</button>
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#EF4444" }}>{formatMoney(selectedProd.priceUSD * (Number(form.qty) || 1), "USD")}</div>
                {exchangeRate && <div style={{ fontSize: 12, color: "#64748B" }}>{formatMoney(selectedProd.priceUSD * (Number(form.qty) || 1) * exchangeRate)}</div>}
              </div>
            </div>
          </div>
        )}

        {/* Notes + date */}
        <Input label="Nota (opcional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="ej: para probar sabor nuevo, defectuoso, regalo a cliente..." />

        <button onClick={() => document.getElementById("merma-date-toggle")?.click()} style={{ display: "none" }} />
        <details style={{ marginBottom: 14 }}>
          <summary id="merma-date-toggle" style={{ fontSize: 12, color: "#6366f1", cursor: "pointer", fontWeight: 600, marginBottom: 4 }}>
            Cambiar fecha ({form.date})
          </summary>
          <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        </details>

        {/* Cost preview */}
        {selectedProd && (
          <div style={{ background: "#EF444418", border: "1px solid #EF444440", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, color: "#EF4444", fontWeight: 600, textTransform: "uppercase" }}>Pérdida estimada</div>
                <div style={{ fontSize: 11, color: "#64748B" }}>Se descuenta del stock y se registra como pérdida</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#EF4444" }}>{formatMoney(selectedProd.priceUSD * (Number(form.qty) || 1), "USD")}</div>
                {exchangeRate && <div style={{ fontSize: 13, color: "#EF4444" }}>{formatMoney(selectedProd.priceUSD * (Number(form.qty) || 1) * exchangeRate)}</div>}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="secondary" onClick={() => setModal(false)} style={{ flex: 1 }}>Cancelar</Btn>
          <Btn variant="danger" onClick={save} style={{ flex: 2 }} disabled={!form.productId || !form.person}>
            Registrar Merma
          </Btn>
        </div>
      </Modal>
    </div>
  );
};
