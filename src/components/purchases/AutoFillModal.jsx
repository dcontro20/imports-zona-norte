import { useState, useMemo } from "react";
import { Modal, Btn } from "../UI.jsx";
import { useResponsive } from "../../App.jsx";
import { buildProductSalesStats, suggestPurchaseQty } from "../../productIntelligence.js";

// Modal de "Auto-fill con reposición sugerida".
// Llama a suggestPurchaseQty(velocity × leadtime) y muestra todos los productos
// que necesitan reposición, con qty calculada editable. Diego marca cuáles
// agregar al pedido y aplica.
export function AutoFillModal({
  open,
  onClose,
  products,
  sales,
  exchangeRate,
  defaultLeadDays = 30,
  onApply,
}) {
  const { isMobile } = useResponsive();
  const [leadDays, setLeadDays] = useState(defaultLeadDays);
  const [coverDays, setCoverDays] = useState(30);
  const [selected, setSelected] = useState(new Set());
  const [editedQty, setEditedQty] = useState({});

  const suggestions = useMemo(() => {
    if (!open) return [];
    const stats = buildProductSalesStats(products, sales, exchangeRate);
    const sugs = suggestPurchaseQty(stats, { leadTimeDays: leadDays, coverDays, safetyDays: 7 });
    return sugs.filter(s => s.suggestedQty > 0);
  }, [open, products, sales, exchangeRate, leadDays, coverDays]);

  const toggle = (productId) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const updateQty = (productId, qty) => {
    setEditedQty(prev => ({ ...prev, [productId]: Math.max(0, Number(qty) || 0) }));
  };

  const selectAll = () => {
    setSelected(new Set(suggestions.map(s => s.productId)));
  };

  const selectNone = () => setSelected(new Set());

  const totals = useMemo(() => {
    const items = suggestions.filter(s => selected.has(s.productId));
    const totalUnits = items.reduce((acc, s) => acc + (editedQty[s.productId] ?? s.suggestedQty), 0);
    const totalUSDT = items.reduce((acc, s) => {
      const qty = editedQty[s.productId] ?? s.suggestedQty;
      return acc + qty * (Number(s.product?.costUSDT) || 0);
    }, 0);
    return { totalUnits, totalUSDT, count: items.length };
  }, [suggestions, selected, editedQty]);

  const handleApply = () => {
    const items = suggestions
      .filter(s => selected.has(s.productId))
      .map(s => ({
        product: s.product,
        qty: editedQty[s.productId] ?? s.suggestedQty,
        priceUSD: Number(s.product?.costUSDT) || 0,
      }));
    if (items.length === 0) return;
    onApply?.(items);
    setSelected(new Set());
    setEditedQty({});
    onClose?.();
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="🪄 Auto-fill con reposición sugerida">
      <p style={{ fontSize: 12, color: "#6B7794", margin: "0 0 12px", lineHeight: 1.5 }}>
        Productos que necesitan reposición según velocity × (lead time + cobertura + 7d safety).
        Ajustá qty si querés, después agregalos al pedido.
      </p>

      {/* Controles */}
      <div style={{
        display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap",
        padding: "10px 12px", background: "#F1E9D6",
        borderRadius: 10, border: "1px solid #E5DAC2", alignItems: "center",
      }}>
        <label style={{ fontSize: 12, color: "#3A4868", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          Lead time
          <input
            type="number" min={1} max={120}
            value={leadDays}
            onChange={e => setLeadDays(Math.max(1, Number(e.target.value) || 30))}
            style={miniInputStyle()}
          />d
        </label>
        <label style={{ fontSize: 12, color: "#3A4868", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          Cobertura
          <input
            type="number" min={1} max={180}
            value={coverDays}
            onChange={e => setCoverDays(Math.max(1, Number(e.target.value) || 30))}
            style={miniInputStyle()}
          />d
        </label>
        <span style={{ fontSize: 11, color: "#6B7794" }}>
          horizonte total <strong>{leadDays + coverDays + 7}d</strong>
        </span>
      </div>

      {suggestions.length === 0 ? (
        <div style={{
          padding: 40, textAlign: "center", color: "#9AA2B3",
          background: "#F8F2E7", border: "1px solid #E5DAC2", borderRadius: 10,
        }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1E2B4A", marginBottom: 4 }}>
            No hay reposición necesaria
          </div>
          <div style={{ fontSize: 12 }}>
            Todos los productos con demanda tienen stock para los próximos {leadDays + coverDays + 7} días.
          </div>
        </div>
      ) : (
        <>
          {/* Bulk actions */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            <button onClick={selectAll} style={pillBtnStyle("#1E2B4A")}>Seleccionar todos ({suggestions.length})</button>
            <button onClick={selectNone} style={pillBtnStyle()}>Ninguno</button>
          </div>

          {/* List */}
          <div style={{ maxHeight: 380, overflowY: "auto", marginBottom: 14 }}>
            {suggestions.map(s => {
              const isSel = selected.has(s.productId);
              const qty = editedQty[s.productId] ?? s.suggestedQty;
              const daysOfStock = s.velocity30dPerDay > 0
                ? Math.floor(s.stockActual / s.velocity30dPerDay)
                : null;
              const urgentColor = daysOfStock !== null && daysOfStock <= 7 ? "#B83232" : daysOfStock <= 14 ? "#B07A1F" : "#0F6B5C";
              return (
                <div
                  key={s.productId}
                  onClick={() => toggle(s.productId)}
                  style={{
                    background: isSel ? "#E8EBF2" : "#FFFFFF",
                    border: `1px solid ${isSel ? "#C5CADE" : "#E5DAC2"}`,
                    borderRadius: 8, padding: "8px 10px", marginBottom: 6,
                    cursor: "pointer",
                    display: "grid",
                    gridTemplateColumns: isMobile ? "auto 1fr auto" : "auto 1fr auto auto",
                    gap: 10, alignItems: "center",
                  }}
                >
                  <input
                    type="checkbox" checked={isSel} readOnly
                    style={{ width: 18, height: 18, accentColor: "#1E2B4A" }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 700, color: "#1E2B4A",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {s.product?.brand} {s.product?.model} · {s.product?.flavor}
                    </div>
                    <div style={{ fontSize: 10, color: "#6B7794", marginTop: 2 }}>
                      Stock {s.stockActual}u · Vel {s.velocity30dPerDay}/d
                      {daysOfStock !== null && <> · <span style={{ color: urgentColor, fontWeight: 700 }}>{daysOfStock}d restantes</span></>}
                    </div>
                  </div>
                  {!isMobile && (
                    <div style={{ fontSize: 11, color: "#9AA2B3", textAlign: "right" }}>
                      ${Number(s.product?.costUSDT) || 0} USDT
                    </div>
                  )}
                  <input
                    type="number" min={0}
                    value={qty}
                    onClick={e => e.stopPropagation()}
                    onChange={e => updateQty(s.productId, e.target.value)}
                    style={{
                      width: 60, padding: "5px 8px",
                      border: "1px solid #E5DAC2", borderRadius: 6,
                      fontSize: 13, textAlign: "center", fontWeight: 700,
                      fontFamily: "inherit", outline: "none",
                      background: "#FFFFFF", color: "#1E2B4A",
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* Totals + actions */}
          {totals.count > 0 && (
            <div style={{
              padding: "10px 12px",
              background: "linear-gradient(135deg, #D9E8E4 0%, #FFFFFF 100%)",
              border: "1px solid #A8C8BE",
              borderRadius: 10, marginBottom: 14,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: "#6B7794", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>
                    Listo para agregar
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#1E2B4A" }}>
                    {totals.count} productos · {totals.totalUnits}u · USDT {totals.totalUSDT.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={handleApply} disabled={totals.count === 0}>
          ✨ Agregar al pedido ({totals.count})
        </Btn>
      </div>
    </Modal>
  );
}

function pillBtnStyle(color = "#6B7794") {
  return {
    background: "transparent",
    border: "1px solid #E5DAC2",
    color,
    padding: "5px 12px",
    borderRadius: 999,
    fontSize: 11, fontWeight: 700,
    cursor: "pointer", fontFamily: "inherit",
  };
}

function miniInputStyle() {
  return {
    width: 56, padding: "4px 8px",
    border: "1px solid #E5DAC2", borderRadius: 6,
    fontSize: 12, textAlign: "center",
    fontFamily: "inherit", outline: "none",
    background: "#FFFFFF", color: "#1E2B4A",
  };
}
