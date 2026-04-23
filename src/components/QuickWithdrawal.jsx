import { useState, useMemo } from "react";
import { uid, formatMoney } from "../helpers.js";
import { Modal, Btn, Badge } from "./UI.jsx";
import { WITHDRAW_PERSONS, BRAND_COLORS } from "../constants.js";

// ============================================
// QuickWithdrawal — registrar consumo propio en 2 toques desde mobile
// Asume tipo = "Consumo propio" y persona = currentUser por default.
// Sugiere los 5 productos más consumidos por currentUser últimamente.
// Mismo patrón anti-duplicado que CashBox.MovementForm y Withdrawals.
// ============================================

const DUP_WINDOW_MS = 5 * 60 * 1000;
const SUBMIT_DEBOUNCE_MS = 3000;

export const QuickWithdrawal = ({
  open, onClose,
  withdrawals = [], setWithdrawals,
  products = [], setProducts,
  exchangeRate, currentUser, logStock, logAudit,
}) => {
  const personDefault = currentUser?.name || WITHDRAW_PERSONS[0];
  const [selected, setSelected] = useState(null); // product object
  const [qty, setQty] = useState(1);
  const [search, setSearch] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingDup, setConfirmingDup] = useState(null);
  const [draftId, setDraftId] = useState(() => uid());

  // ---- productos disponibles (con stock) ----
  const available = useMemo(() => products.filter(p => !p.isDeleted && (p.stock || 0) > 0), [products]);

  // ---- top 5 productos más consumidos por currentUser ----
  const topForUser = useMemo(() => {
    const counts = {};
    (withdrawals || []).forEach(w => {
      if (w.isDeleted) return;
      if (w.person !== personDefault) return;
      if (w.withdrawType !== "Consumo propio") return;
      counts[w.productId] = (counts[w.productId] || 0) + (w.qty || 0);
    });
    return Object.entries(counts)
      .map(([pid, qty]) => ({ prod: products.find(p => p.id === pid), qty }))
      .filter(x => x.prod && (x.prod.stock || 0) > 0)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [withdrawals, products, personDefault]);

  // ---- buscar ----
  const filtered = useMemo(() => {
    if (!search) return [];
    const q = search.toLowerCase();
    return available
      .filter(p => `${p.brand} ${p.model} ${p.flavor}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [available, search]);

  // ---- costo del producto seleccionado ----
  const priceUSD = selected ? Number(selected.priceUSD) || 0 : 0;
  const costUSDTunit = selected ? Number(selected.costUSDT) || 0 : 0;
  const costPerUnitUSD = costUSDTunit > 0 ? costUSDTunit : priceUSD * 0.55;
  const costRealUSD = costPerUnitUSD * qty;
  const costRealARS = Math.round(costRealUSD * (exchangeRate || 0));

  // ---- duplicado en últimos 5min ----
  const findRecentDuplicate = () => {
    if (!selected) return null;
    const now = Date.now();
    return (withdrawals || []).find(w => {
      if (w.isDeleted) return false;
      if (w.productId !== selected.id) return false;
      if (Number(w.qty) !== qty) return false;
      if (w.person !== personDefault) return false;
      if (w.withdrawType !== "Consumo propio") return false;
      const wTime = new Date(w.createdAtMs || w.date).getTime();
      return now - wTime <= DUP_WINDOW_MS;
    });
  };

  const close = () => {
    setSelected(null); setQty(1); setSearch("");
    setSuccess(false); setSubmitting(false); setConfirmingDup(null);
    setDraftId(uid());
    onClose();
  };

  const attemptSubmit = () => {
    if (!selected || qty <= 0 || qty > (selected.stock || 0)) return;

    if (!confirmingDup) {
      const dup = findRecentDuplicate();
      if (dup) {
        const minutes = Math.max(1, Math.round((Date.now() - new Date(dup.createdAtMs || dup.date).getTime()) / 60000));
        setConfirmingDup({ mov: dup, minutes });
        return;
      }
    }

    setSubmitting(true);
    persist();
    setTimeout(() => {
      setDraftId(uid());
      setSubmitting(false);
      setConfirmingDup(null);
    }, SUBMIT_DEBOUNCE_MS);
  };

  const persist = () => {
    if (!selected) return;
    if ((withdrawals || []).some(w => w.id === draftId)) {
      console.warn(`[QuickWithdrawal] draftId ${draftId} ya existe, ignorando doble submit`);
      return;
    }

    const nowMs = Date.now();
    const dateISO = new Date(nowMs).toISOString();
    const lucroCesanteUSD = Math.max(0, (priceUSD - costPerUnitUSD) * qty);

    const withdrawal = {
      id: draftId,
      productId: selected.id,
      qty,
      person: personDefault,
      withdrawType: "Consumo propio",
      notes: "",
      costRealUSD,
      lucroCesanteUSD,
      costEstimateUSD: costRealUSD,
      costEstimateARS: costRealARS,
      date: dateISO,
      createdAtMs: nowMs,
      createdAt: dateISO,
      createdBy: personDefault,
      quickSource: "QuickWithdrawal",
    };

    setWithdrawals(prev => [withdrawal, ...prev]);
    setProducts(prev => prev.map(p =>
      p.id === selected.id ? { ...p, stock: Math.max(0, (p.stock || 0) - qty) } : p
    ));

    if (logStock) {
      logStock({
        productId: selected.id, type: "consumo", qty: -qty,
        reason: `Consumo propio rápido — ${personDefault}`,
        refId: draftId, date: dateISO,
      });
    }
    if (logAudit) {
      logAudit("create", "withdrawal", draftId,
        `Consumo rápido: ${qty}x ${selected.brand} ${selected.model} - ${selected.flavor} · ${personDefault} · ${formatMoney(costRealUSD, "USD")}`);
    }

    setSuccess(true);
    setTimeout(() => close(), 1400);
  };

  if (!open) return null;

  // ---- Success ----
  if (success) {
    return (
      <Modal open={true} onClose={close} title="Consumo registrado">
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
          <p style={{ fontSize: 17, fontWeight: 700, color: "#0F7B6C", marginBottom: 4 }}>Anotado</p>
          <p style={{ color: "#8C8A82", fontSize: 14 }}>
            {qty}× {selected?.brand} {selected?.model} - {selected?.flavor}
          </p>
          <p style={{ color: "#E03E3E", fontSize: 18, fontWeight: 800, marginTop: 6 }}>
            −{formatMoney(costRealUSD, "USD")}
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={true} onClose={close} title={`📉 Consumo propio · ${personDefault}`}>
      {/* Suggested top 5 — solo si no hay nada seleccionado y no se está buscando */}
      {!selected && !search && topForUser.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#8C8A82", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Lo que más fumás últimamente
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {topForUser.map(({ prod, qty: prevQty }) => (
              <button key={prod.id} onClick={() => setSelected(prod)} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", background: "#FAFAF9",
                border: "1px solid #E8E7E3", borderRadius: 10,
                cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                minHeight: 48,
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: BRAND_COLORS[prod.brand] || "#5E6AD2", flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#37352F" }}>
                    {prod.brand} {prod.model}
                  </div>
                  <div style={{ fontSize: 11, color: "#8C8A82" }}>{prod.flavor}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <Badge color={(prod.stock || 0) <= 1 ? "#CB912F" : "#0F7B6C"}>{prod.stock} uds</Badge>
                  <div style={{ fontSize: 10, color: "#8C8A82", marginTop: 2 }}>{prevQty}× consumido</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search — solo si no hay seleccionado */}
      {!selected && (
        <div style={{ marginBottom: 14 }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="O buscar otro producto..."
            style={{
              width: "100%", padding: "12px 14px",
              background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 10,
              color: "#37352F", fontSize: 16, outline: "none",
              boxSizing: "border-box", fontFamily: "inherit",
            }} />
          {filtered.length > 0 && (
            <div style={{
              marginTop: 6, border: "1px solid #E8E7E3", borderRadius: 10,
              background: "#FFFFFF", overflow: "hidden",
              maxHeight: 280, overflowY: "auto",
            }}>
              {filtered.map((p, i) => (
                <button key={p.id} onClick={() => { setSelected(p); setSearch(""); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    width: "100%", padding: "10px 14px",
                    background: "none", border: "none",
                    borderBottom: i < filtered.length - 1 ? "1px solid #F0EFEB" : "none",
                    cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    minHeight: 48,
                  }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#37352F" }}>{p.brand} {p.model}</div>
                    <div style={{ fontSize: 11, color: "#8C8A82" }}>{p.flavor}</div>
                  </div>
                  <Badge color={(p.stock || 0) <= 1 ? "#CB912F" : "#0F7B6C"}>{p.stock}</Badge>
                </button>
              ))}
            </div>
          )}
          {search.length >= 2 && filtered.length === 0 && (
            <div style={{ marginTop: 6, fontSize: 12, color: "#8C8A82", padding: "6px 10px" }}>
              Sin resultados para "{search}"
            </div>
          )}
        </div>
      )}

      {/* Selected — qty picker + cost preview + submit */}
      {selected && (
        <>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 14px", background: "#EEF0FC", border: "1px solid #5E6AD244",
            borderRadius: 10, marginBottom: 14,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#37352F" }}>
                {selected.brand} {selected.model}
              </div>
              <div style={{ fontSize: 12, color: "#8C8A82" }}>{selected.flavor} · {selected.puffs}p · stock {selected.stock}</div>
            </div>
            <button onClick={() => { setSelected(null); setQty(1); }} style={{
              background: "none", border: "none", color: "#8C8A82", cursor: "pointer",
              fontSize: 14, padding: "4px 8px",
            }}>✕</button>
          </div>

          {/* qty picker */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 14 }}>
            <button onClick={() => setQty(Math.max(1, qty - 1))} disabled={qty <= 1} style={{
              width: 48, height: 48, borderRadius: 12,
              border: "1px solid #E8E7E3", background: "#FFFFFF",
              cursor: qty <= 1 ? "not-allowed" : "pointer",
              fontSize: 24, fontWeight: 700, color: qty <= 1 ? "#B1AFA7" : "#37352F",
            }}>−</button>
            <div style={{ minWidth: 64, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#8C8A82", fontWeight: 700, textTransform: "uppercase" }}>cantidad</div>
              <div style={{ fontSize: 36, fontWeight: 800, color: "#37352F", lineHeight: 1 }}>{qty}</div>
            </div>
            <button onClick={() => setQty(Math.min(selected.stock, qty + 1))} disabled={qty >= selected.stock} style={{
              width: 48, height: 48, borderRadius: 12,
              border: "1px solid #E8E7E3", background: "#FFFFFF",
              cursor: qty >= selected.stock ? "not-allowed" : "pointer",
              fontSize: 24, fontWeight: 700, color: qty >= selected.stock ? "#B1AFA7" : "#37352F",
            }}>+</button>
          </div>

          {/* Costo */}
          <div style={{
            padding: "12px 14px", borderRadius: 10, marginBottom: 14,
            background: "#FAFAF9", border: "1px solid #E8E7E3",
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
          }}>
            <div>
              <div style={{ fontSize: 11, color: "#8C8A82", fontWeight: 700, textTransform: "uppercase" }}>Costo perdido</div>
              <div style={{ fontSize: 11, color: "#B1AFA7" }}>Se imputa 100% a {personDefault}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#E03E3E" }}>{formatMoney(costRealUSD, "USD")}</div>
              {exchangeRate > 0 && <div style={{ fontSize: 12, color: "#8C8A82" }}>≈ {formatMoney(costRealARS)} ARS</div>}
            </div>
          </div>

          {/* Duplicate warning */}
          {confirmingDup && (
            <div style={{
              padding: "12px 14px", borderRadius: 10, marginBottom: 12,
              background: "#FDECC8", border: "1px solid #F2D59A",
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#CB912F", marginBottom: 4 }}>
                ⚠️ Ya cargaste algo igual hace {confirmingDup.minutes} min
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setConfirmingDup(null)} style={{
                  flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #E8E7E3",
                  background: "#FFFFFF", color: "#555247", fontSize: 12, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit",
                }}>Cancelar</button>
                <button onClick={attemptSubmit} style={{
                  flex: 2, padding: "8px 12px", borderRadius: 8, border: "none",
                  background: "#CB912F", color: "#fff", fontSize: 12, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                }}>Sí, registrarlo igual</button>
              </div>
            </div>
          )}

          {/* Submit */}
          <Btn variant="danger" onClick={attemptSubmit}
            disabled={submitting || qty <= 0 || qty > (selected.stock || 0)}
            style={{ width: "100%", padding: "14px", fontSize: 15 }}>
            {submitting ? "Registrando..." : `Registrar consumo de ${qty} uds`}
          </Btn>
        </>
      )}

      {/* Empty state si no hay nada */}
      {!selected && !search && topForUser.length === 0 && (
        <div style={{ textAlign: "center", padding: "20px 0", color: "#8C8A82", fontSize: 13 }}>
          Empezá buscando un producto arriba.
        </div>
      )}
    </Modal>
  );
};
