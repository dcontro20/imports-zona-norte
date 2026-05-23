import { useState, useMemo } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { Modal, Card, Btn, Input, Select, Table, Badge } from "./UI.jsx";
import { T } from "../theme.js";
import { useResponsive } from "../App.jsx";
import {
  normalizeCouponCode,
  validateCoupon,
  analyzePromoHistory,
  COUPON_AUDIENCES,
} from "../pricing.js";

// S16.1 + S16.13 — CRUD de cupones + analytics de uso
//
// Cupones se guardan en colección `coupons` (Firestore + localStorage).
// Las ventas que usaron un cupón guardan { couponCode, couponDiscount }
// directamente en el documento de la sale, lo que permite reconstruir
// historial sin joins.

const emptyCoupon = () => ({
  code: "",
  description: "",
  discountType: "percent",
  discountValue: 10,
  validFrom: "",
  validTo: "",
  maxUses: "",
  usedCount: 0,
  audience: "all",
  audienceClientIds: [],
  minSubtotalARS: "",
  onlyFirstPurchase: false,
});

// S16.10 — Bundle: grupo de productos con precio especial.
// Schema:
//   { id, name, items: [{ productId, qty }], specialPriceUSD, isDeleted }
const emptyBundle = () => ({
  name: "",
  description: "",
  items: [{ productId: "", qty: 1 }],
  specialPriceUSD: "",
});

export const Coupons = ({
  coupons = [], setCoupons,
  bundles = [], setBundles,
  products = [],
  sales = [], clients = [], currentUser, logAudit,
}) => {
  const { isMobile } = useResponsive();
  const [tab, setTab] = useState("coupons"); // "coupons" | "bundles"
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyCoupon());
  const [confirmDel, setConfirmDel] = useState(null);
  // Bundles
  const [bundleModal, setBundleModal] = useState(false);
  const [editingBundle, setEditingBundle] = useState(null);
  const [bundleForm, setBundleForm] = useState(emptyBundle());
  const [confirmDelBundle, setConfirmDelBundle] = useState(null);

  const activeBundles = (bundles || []).filter(b => !b.isDeleted);

  const openNewBundle = () => {
    setBundleForm(emptyBundle());
    setEditingBundle(null);
    setBundleModal(true);
  };
  const openEditBundle = (b) => {
    setBundleForm({
      name: b.name || "",
      description: b.description || "",
      items: b.items && b.items.length > 0 ? b.items : [{ productId: "", qty: 1 }],
      specialPriceUSD: b.specialPriceUSD || "",
    });
    setEditingBundle(b.id);
    setBundleModal(true);
  };
  const saveBundle = () => {
    if (!bundleForm.name.trim()) { alert("El nombre es obligatorio"); return; }
    const validItems = bundleForm.items.filter(i => i.productId && Number(i.qty) > 0);
    if (validItems.length < 2) { alert("Un bundle debe tener al menos 2 items"); return; }
    if (!bundleForm.specialPriceUSD || Number(bundleForm.specialPriceUSD) <= 0) {
      alert("Definí el precio especial del bundle"); return;
    }
    const data = {
      name: bundleForm.name.trim(),
      description: (bundleForm.description || "").trim(),
      items: validItems.map(i => ({ productId: i.productId, qty: Number(i.qty) || 1 })),
      specialPriceUSD: Number(bundleForm.specialPriceUSD),
    };
    if (editingBundle) {
      setBundles(prev => prev.map(b => b.id === editingBundle ? { ...b, ...data } : b));
      if (logAudit) logAudit("update", "bundle", editingBundle, `Editó bundle ${data.name}`);
    } else {
      const newId = uid();
      setBundles(prev => [{
        ...data, id: newId,
        createdAt: new Date().toISOString(),
        createdBy: currentUser?.name || "?",
      }, ...prev]);
      if (logAudit) logAudit("create", "bundle", newId, `Creó bundle ${data.name}`);
    }
    setBundleModal(false);
    setEditingBundle(null);
  };
  const removeBundle = (id) => {
    if (confirmDelBundle !== id) {
      setConfirmDelBundle(id);
      setTimeout(() => setConfirmDelBundle(null), 3000);
      return;
    }
    setBundles(prev => prev.map(b => b.id === id ? { ...b, isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: currentUser?.name || "?" } : b));
    if (logAudit) logAudit("delete", "bundle", id, `Eliminó bundle`);
    setConfirmDelBundle(null);
  };
  const calcBundleRetailPrice = (bundle) => {
    return (bundle.items || []).reduce((sum, it) => {
      const p = (products || []).find(x => x.id === it.productId);
      return sum + (p ? Number(p.priceUSD) || 0 : 0) * (Number(it.qty) || 0);
    }, 0);
  };

  // S16.13 — Histórico/analytics
  const promoHistory = useMemo(
    () => analyzePromoHistory(sales, coupons),
    [sales, coupons]
  );

  const activeCoupons = (coupons || []).filter(c => !c.isDeleted);

  const openNew = () => {
    setForm(emptyCoupon());
    setEditing(null);
    setModal(true);
  };

  const openEdit = (c) => {
    setForm({
      code: c.code || "",
      description: c.description || "",
      discountType: c.discountType || "percent",
      discountValue: c.discountValue || 0,
      validFrom: c.validFrom ? c.validFrom.slice(0, 10) : "",
      validTo: c.validTo ? c.validTo.slice(0, 10) : "",
      maxUses: c.maxUses || "",
      usedCount: c.usedCount || 0,
      audience: c.audience || "all",
      audienceClientIds: c.audienceClientIds || [],
      minSubtotalARS: c.minSubtotalARS || "",
      onlyFirstPurchase: !!c.onlyFirstPurchase,
    });
    setEditing(c.id);
    setModal(true);
  };

  const save = () => {
    const code = normalizeCouponCode(form.code);
    if (!code) { alert("El código es obligatorio"); return; }
    if (!form.discountValue || Number(form.discountValue) <= 0) {
      alert("El descuento debe ser mayor a 0"); return;
    }
    // Verificar duplicado de código (solo en create o si cambió)
    const existing = (coupons || []).find(c =>
      !c.isDeleted &&
      normalizeCouponCode(c.code) === code &&
      c.id !== editing
    );
    if (existing) { alert(`Ya existe un cupón activo con código "${code}"`); return; }

    const data = {
      code,
      description: (form.description || "").trim(),
      discountType: form.discountType,
      discountValue: Number(form.discountValue) || 0,
      validFrom: form.validFrom ? new Date(form.validFrom).toISOString() : null,
      validTo: form.validTo ? new Date(form.validTo + "T23:59:59").toISOString() : null,
      maxUses: form.maxUses ? Number(form.maxUses) : null,
      audience: form.audience,
      audienceClientIds: form.audience === "specific" ? (form.audienceClientIds || []) : [],
      minSubtotalARS: form.minSubtotalARS ? Number(form.minSubtotalARS) : null,
      onlyFirstPurchase: !!form.onlyFirstPurchase,
    };

    if (editing) {
      setCoupons(prev => prev.map(c => c.id === editing ? { ...c, ...data } : c));
      if (logAudit) logAudit("update", "coupon", editing, `Editó cupón ${code}`);
    } else {
      const newId = uid();
      const newCoupon = {
        ...data,
        id: newId,
        usedCount: 0,
        createdAt: new Date().toISOString(),
        createdBy: currentUser?.name || "?",
      };
      setCoupons(prev => [newCoupon, ...prev]);
      if (logAudit) logAudit("create", "coupon", newId, `Creó cupón ${code}`);
    }
    setModal(false);
    setEditing(null);
  };

  const remove = (id) => {
    if (confirmDel !== id) {
      setConfirmDel(id);
      setTimeout(() => setConfirmDel(null), 3000);
      return;
    }
    const c = coupons.find(x => x.id === id);
    setCoupons(prev => prev.map(x => x.id === id ? { ...x, isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: currentUser?.name || "?" } : x));
    if (logAudit && c) logAudit("delete", "coupon", id, `Eliminó cupón ${c.code}`);
    setConfirmDel(null);
  };

  const couponStatusBadge = (c) => {
    const v = validateCoupon(c, { today: new Date().toISOString() });
    if (!v.ok) return <Badge color="#E03E3E">{v.reason}</Badge>;
    if (c.maxUses && (c.usedCount || 0) >= c.maxUses) return <Badge color="#E03E3E">Agotado</Badge>;
    return <Badge color="#0F7B6C">Activo</Badge>;
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <div>
          <h2 style={{ color: "#1E2B4A", margin: 0, fontSize: 22, fontWeight: 800 }}>Promociones</h2>
          <p style={{ color: "#6B7794", margin: "4px 0 0", fontSize: 13 }}>
            Cupones ({activeCoupons.length}) y bundles ({activeBundles.length})
          </p>
        </div>
        {tab === "coupons" ? (
          <Btn onClick={openNew}>+ Nuevo cupón</Btn>
        ) : (
          <Btn onClick={openNewBundle}>+ Nuevo bundle</Btn>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, borderBottom: "1px solid #E5DAC2" }}>
        {[
          { key: "coupons", label: "🎟️ Cupones", count: activeCoupons.length },
          { key: "bundles", label: "📦 Bundles", count: activeBundles.length },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "10px 16px", border: "none", background: "transparent",
              color: tab === t.key ? "#1E2B4A" : "#6B7794",
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              borderBottom: tab === t.key ? "2px solid #1E2B4A" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {tab === "bundles" && (
        <>
          {/* Lista de bundles */}
          <Card style={{ marginBottom: 14 }}>
            {activeBundles.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "#9AA2B3", fontSize: 13 }}>
                Aún no creaste bundles. Click en "Nuevo bundle" para armar combos con precio especial.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {activeBundles.map(b => {
                  const retail = calcBundleRetailPrice(b);
                  const savings = retail - (b.specialPriceUSD || 0);
                  const savingsPct = retail > 0 ? Math.round((savings / retail) * 100) : 0;
                  return (
                    <div key={b.id} style={{ background: "#F8F2E7", border: "1px solid #E5DAC2", borderRadius: 8, padding: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#1E2B4A" }}>{b.name}</div>
                          {b.description && <div style={{ fontSize: 12, color: "#6B7794", marginTop: 2 }}>{b.description}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => openEditBundle(b)} style={{ background: "none", border: "none", color: "#1E2B4A", cursor: "pointer", fontSize: 14 }}>✏️</button>
                          {confirmDelBundle === b.id ? (
                            <button onClick={() => removeBundle(b.id)} style={{ background: "#F7D7D6", border: "1px solid #E03E3E55", color: "#E03E3E", padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>¿Borrar?</button>
                          ) : (
                            <button onClick={() => removeBundle(b.id)} style={{ background: "none", border: "none", color: "#E03E3E", cursor: "pointer", fontSize: 14 }}>🗑️</button>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10, paddingLeft: 8, borderLeft: "2px solid #E5DAC2" }}>
                        {(b.items || []).map((it, i) => {
                          const p = (products || []).find(x => x.id === it.productId);
                          return (
                            <div key={i} style={{ fontSize: 12, color: "#3A4868" }}>
                              {it.qty}× {p ? `${p.brand} ${p.model}${p.flavor ? ` · ${p.flavor}` : ""}` : "(producto eliminado)"}
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", gap: 14, fontSize: 12, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ color: "#6B7794" }}>
                          Suelto: <s style={{ color: "#9AA2B3" }}>{formatMoney(retail, "USD")}</s>
                        </span>
                        <span style={{ color: "#0F7B6C", fontWeight: 700, fontSize: 14 }}>
                          Bundle: {formatMoney(b.specialPriceUSD, "USD")}
                        </span>
                        {savings > 0 && (
                          <Badge color="#0F7B6C">Ahorro {savingsPct}%</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}

      {tab === "coupons" && (<>
      {/* Lista de cupones */}
      <Card style={{ marginBottom: 14 }}>
        {activeCoupons.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "#9AA2B3", fontSize: 13 }}>
            Aún no creaste cupones. Click en "Nuevo cupón" para empezar.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["Código", "Descripción", "Descuento", "Vigencia", "Audiencia", "Usos", "Estado", ""].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, color: "#6B7794", textTransform: "uppercase", borderBottom: "1px solid #E5DAC2", fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeCoupons.map(c => {
                  const usesText = c.maxUses ? `${c.usedCount || 0}/${c.maxUses}` : `${c.usedCount || 0}`;
                  return (
                    <tr key={c.id}>
                      <td style={{ padding: "8px 10px", fontFamily: "monospace", fontWeight: 700, color: "#1E2B4A", borderBottom: "1px solid #EFE5CE" }}>
                        {c.code}
                      </td>
                      <td style={{ padding: "8px 10px", color: "#3A4868", borderBottom: "1px solid #EFE5CE", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {c.description || <span style={{ color: "#9AA2B3" }}>—</span>}
                      </td>
                      <td style={{ padding: "8px 10px", color: "#0F7B6C", fontWeight: 700, borderBottom: "1px solid #EFE5CE" }}>
                        {c.discountType === "percent" ? `${c.discountValue}%` : formatMoney(c.discountValue)}
                      </td>
                      <td style={{ padding: "8px 10px", color: "#3A4868", borderBottom: "1px solid #EFE5CE", fontSize: 11 }}>
                        {c.validFrom ? formatDate(c.validFrom) : "Ya"} → {c.validTo ? formatDate(c.validTo) : "Sin fin"}
                      </td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid #EFE5CE" }}>
                        <Badge color={c.audience === "vip" ? "#CB912F" : c.audience === "specific" ? "#1E2B4A" : "#6B7794"}>
                          {c.audience === "all" ? "Todos" : c.audience === "vip" ? "VIP" : `${c.audienceClientIds.length} clientes`}
                        </Badge>
                      </td>
                      <td style={{ padding: "8px 10px", color: "#3A4868", borderBottom: "1px solid #EFE5CE" }}>{usesText}</td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid #EFE5CE" }}>{couponStatusBadge(c)}</td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid #EFE5CE", display: "flex", gap: 4 }}>
                        <button onClick={() => openEdit(c)} style={{ background: "none", border: "none", color: "#1E2B4A", cursor: "pointer", fontSize: 14 }}>✏️</button>
                        {confirmDel === c.id ? (
                          <button onClick={() => remove(c.id)} style={{ background: "#F7D7D6", border: "1px solid #E03E3E55", color: "#E03E3E", padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>¿Borrar?</button>
                        ) : (
                          <button onClick={() => remove(c.id)} style={{ background: "none", border: "none", color: "#E03E3E", cursor: "pointer", fontSize: 14 }}>🗑️</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* S16.13 — Analytics de uso */}
      {promoHistory.length > 0 && (
        <Card>
          <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "#1E2B4A" }}>
            📊 Uso de cupones (analytics)
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["Código", "Veces usado", "Descuento total", "Revenue generado", "ROI promedio"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, color: "#6B7794", textTransform: "uppercase", borderBottom: "1px solid #E5DAC2", fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {promoHistory.map(h => {
                  const ratio = h.totalDiscountARS > 0 ? (h.totalRevenueARS / h.totalDiscountARS).toFixed(1) : "—";
                  return (
                    <tr key={h.code}>
                      <td style={{ padding: "8px 10px", fontFamily: "monospace", fontWeight: 700, color: "#1E2B4A", borderBottom: "1px solid #EFE5CE" }}>{h.code}</td>
                      <td style={{ padding: "8px 10px", color: "#1E2B4A", borderBottom: "1px solid #EFE5CE" }}>
                        <Badge color={h.usedCount > 0 ? "#0F7B6C" : "#6B7794"}>{h.usedCount}</Badge>
                      </td>
                      <td style={{ padding: "8px 10px", color: "#E03E3E", borderBottom: "1px solid #EFE5CE" }}>{formatMoney(h.totalDiscountARS)}</td>
                      <td style={{ padding: "8px 10px", color: "#0F7B6C", fontWeight: 700, borderBottom: "1px solid #EFE5CE" }}>{formatMoney(h.totalRevenueARS)}</td>
                      <td style={{ padding: "8px 10px", color: "#3A4868", borderBottom: "1px solid #EFE5CE" }}>
                        {ratio !== "—" ? `${ratio}x` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "#6B7794" }}>
            ROI = Revenue generado / Descuento dado. Cuanto más alto, mejor (5x = por cada $1 de descuento, generaste $5 de revenue).
          </div>
        </Card>
      )}
      </>)}

      {/* Modal de cupón */}
      <Modal open={modal} onClose={() => { setModal(false); setEditing(null); }} title={editing ? "Editar cupón" : "Nuevo cupón"}>
        <Input
          label="Código (case-insensitive)"
          value={form.code}
          onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
          placeholder="ej: BIENVENIDO10"
          style={{ fontFamily: "monospace", fontWeight: 700 }}
        />
        <Input
          label="Descripción (opcional)"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="ej: 10% off para nuevos clientes"
        />
        <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
          <div style={{ flex: 1 }}>
            <Select
              label="Tipo descuento"
              options={[{ value: "percent", label: "Porcentaje (%)" }, { value: "fixed", label: "Monto fijo ($)" }]}
              value={form.discountType}
              onChange={e => setForm(f => ({ ...f, discountType: e.target.value }))}
            />
          </div>
          <div style={{ flex: 1 }}>
            <Input
              label={form.discountType === "percent" ? "Valor (%)" : "Valor ($ ARS)"}
              type="number"
              value={form.discountValue}
              onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))}
              placeholder={form.discountType === "percent" ? "10" : "5000"}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
          <div style={{ flex: 1 }}>
            <Input label="Válido desde" type="date" value={form.validFrom} onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))} />
          </div>
          <div style={{ flex: 1 }}>
            <Input label="Válido hasta" type="date" value={form.validTo} onChange={e => setForm(f => ({ ...f, validTo: e.target.value }))} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
          <div style={{ flex: 1 }}>
            <Input label="Máximo de usos (opcional)" type="number" value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))} placeholder="ilimitado" />
          </div>
          <div style={{ flex: 1 }}>
            <Input label="Mínimo de compra ($ ARS)" type="number" value={form.minSubtotalARS} onChange={e => setForm(f => ({ ...f, minSubtotalARS: e.target.value }))} placeholder="sin mínimo" />
          </div>
        </div>
        <Select
          label="Audiencia"
          options={[
            { value: "all", label: "Todos los clientes" },
            { value: "vip", label: "Solo VIPs" },
            { value: "specific", label: "Clientes específicos" },
          ]}
          value={form.audience}
          onChange={e => setForm(f => ({ ...f, audience: e.target.value }))}
        />
        {form.audience === "specific" && (
          <div style={{ padding: 10, background: "#F8F2E7", borderRadius: 8, marginBottom: 10, maxHeight: 180, overflowY: "auto" }}>
            <div style={{ fontSize: 11, color: "#6B7794", marginBottom: 6, fontWeight: 700 }}>
              Seleccionar clientes ({form.audienceClientIds.length} elegidos):
            </div>
            {(clients || []).filter(c => !c.isDeleted).map(c => (
              <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: 12, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.audienceClientIds.includes(c.id)}
                  onChange={(e) => {
                    setForm(f => ({
                      ...f,
                      audienceClientIds: e.target.checked
                        ? [...f.audienceClientIds, c.id]
                        : f.audienceClientIds.filter(x => x !== c.id),
                    }));
                  }}
                />
                {c.name || "Sin nombre"}
              </label>
            ))}
          </div>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", fontSize: 13, color: "#1E2B4A", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={form.onlyFirstPurchase}
            onChange={e => setForm(f => ({ ...f, onlyFirstPurchase: e.target.checked }))}
          />
          Solo válido para primera compra del cliente
        </label>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => { setModal(false); setEditing(null); }}>Cancelar</Btn>
          <Btn onClick={save}>{editing ? "Guardar" : "Crear cupón"}</Btn>
        </div>
      </Modal>

      {/* Modal de bundle */}
      <Modal open={bundleModal} onClose={() => { setBundleModal(false); setEditingBundle(null); }} title={editingBundle ? "Editar bundle" : "Nuevo bundle"}>
        <Input
          label="Nombre del bundle"
          value={bundleForm.name}
          onChange={e => setBundleForm(f => ({ ...f, name: e.target.value }))}
          placeholder="ej: Combo Verano · 5 sabores"
        />
        <Input
          label="Descripción (opcional)"
          value={bundleForm.description}
          onChange={e => setBundleForm(f => ({ ...f, description: e.target.value }))}
          placeholder="ej: Pack para clientes nuevos"
        />
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: "block", fontSize: 11, color: "#1E2B4A", marginBottom: 6, fontWeight: 700, textTransform: "uppercase" }}>Items del bundle</label>
          {bundleForm.items.map((it, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
              <select
                value={it.productId}
                onChange={e => setBundleForm(f => ({
                  ...f, items: f.items.map((x, j) => j === i ? { ...x, productId: e.target.value } : x),
                }))}
                style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: "1px solid #E5DAC2", fontSize: 12 }}
              >
                <option value="">Seleccionar producto…</option>
                {(products || []).filter(p => !p.isDeleted).map(p => (
                  <option key={p.id} value={p.id}>{p.brand} {p.model} · {p.flavor}</option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={it.qty}
                onChange={e => setBundleForm(f => ({
                  ...f, items: f.items.map((x, j) => j === i ? { ...x, qty: e.target.value } : x),
                }))}
                style={{ width: 70, padding: "6px 8px", borderRadius: 6, border: "1px solid #E5DAC2", fontSize: 12, textAlign: "center" }}
              />
              <button
                onClick={() => setBundleForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}
                style={{ background: "none", border: "none", color: "#E03E3E", cursor: "pointer", fontSize: 14 }}
              >✕</button>
            </div>
          ))}
          <button
            onClick={() => setBundleForm(f => ({ ...f, items: [...f.items, { productId: "", qty: 1 }] }))}
            style={{
              padding: "5px 10px", borderRadius: 6, border: "1px dashed #1E2B4A",
              background: "transparent", color: "#1E2B4A", fontSize: 11, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >+ Agregar item</button>
        </div>
        <Input
          label="Precio especial del bundle (USD)"
          type="number" step="0.01"
          value={bundleForm.specialPriceUSD}
          onChange={e => setBundleForm(f => ({ ...f, specialPriceUSD: e.target.value }))}
          placeholder="ej: 45"
        />
        {/* Preview ahorro */}
        {bundleForm.specialPriceUSD > 0 && (() => {
          const tempBundle = { items: bundleForm.items, specialPriceUSD: Number(bundleForm.specialPriceUSD) };
          const retail = calcBundleRetailPrice(tempBundle);
          const savings = retail - tempBundle.specialPriceUSD;
          if (retail <= 0) return null;
          const pct = Math.round((savings / retail) * 100);
          return (
            <div style={{
              padding: "8px 12px", marginBottom: 12,
              background: savings > 0 ? "#DDEDEA" : "#FEF6E4",
              border: `1px solid ${savings > 0 ? "#0F7B6C33" : "#F2D59A"}`,
              borderRadius: 8, fontSize: 12, fontWeight: 600,
              color: savings > 0 ? "#0F7B6C" : "#A65800",
            }}>
              {savings > 0
                ? `📊 Ahorro vs comprar suelto: ${formatMoney(savings, "USD")} (${pct}%)`
                : `⚠️ Bundle más caro que comprar suelto`
              }
            </div>
          );
        })()}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => { setBundleModal(false); setEditingBundle(null); }}>Cancelar</Btn>
          <Btn onClick={saveBundle}>{editingBundle ? "Guardar" : "Crear bundle"}</Btn>
        </div>
      </Modal>
    </div>
  );
};

export default Coupons;
