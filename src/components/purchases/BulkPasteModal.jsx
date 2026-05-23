import { useState, useMemo, useEffect } from "react";
import { Modal, Btn } from "../UI.jsx";
import { useResponsive } from "../../App.jsx";
import { parseTextLines } from "../../lib/supplierParser.js";
import { matchProduct, confidenceMeta } from "../../lib/fuzzyMatch.js";
import { findAlias } from "../../lib/supplierProfiles.js";

// Modal de "Pegar lista cruda" para armar un pedido en segundos.
// El usuario pega texto tipo:
//   Watermelon Ice x20 USDT 7
//   Cherry Cola x15 USDT 8
// Y el sistema parsea + matchea contra catálogo, muestra preview con qty/precio
// editables, y al confirmar arma el pedido completo (groups + items).
export function BulkPasteModal({
  open,
  onClose,
  products,
  supplierAliases = [],
  supplierProfileId = null,
  onApply,
}) {
  const { isMobile } = useResponsive();
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState([]);

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setRawText("");
      setParsed([]);
    }
  }, [open]);

  const knownBrands = useMemo(
    () => Array.from(new Set(products.map(p => p.brand).filter(Boolean))),
    [products]
  );

  const activeProducts = useMemo(() => products.filter(p => !p.isDeleted), [products]);

  const handleParse = () => {
    if (!rawText.trim()) return;
    const items = parseTextLines(rawText, { knownBrands });
    const enriched = items.map(it => {
      // 1ra prioridad: alias aprendido
      const alias = findAlias(supplierAliases, it.raw, supplierProfileId);
      if (alias) {
        const product = activeProducts.find(p => p.id === alias.productId);
        if (product) {
          return {
            ...it,
            product,
            confidence: "high",
            fromAlias: true,
          };
        }
      }
      // 2da prioridad: fuzzy match
      const topMatches = matchProduct(it, activeProducts, { topN: 3 });
      const best = topMatches[0] || null;
      return {
        ...it,
        product: best?.product || null,
        confidence: best?.confidence || "low",
        fromAlias: false,
        alternatives: topMatches.slice(1),
      };
    });
    setParsed(enriched);
  };

  const updateQty = (idx, qty) => {
    setParsed(p => p.map((it, i) => i === idx ? { ...it, qty: Math.max(0, Number(qty) || 0) } : it));
  };

  const updatePrice = (idx, priceUSD) => {
    setParsed(p => p.map((it, i) => i === idx ? { ...it, priceUSD: Math.max(0, Number(priceUSD) || 0) } : it));
  };

  const removeItem = (idx) => {
    setParsed(p => p.filter((_, i) => i !== idx));
  };

  const switchToAlternative = (idx, alt) => {
    setParsed(p => p.map((it, i) => {
      if (i !== idx) return it;
      return {
        ...it,
        product: alt.product,
        confidence: alt.confidence,
        alternatives: [...(it.alternatives || []).filter(a => a.product.id !== alt.product.id), { product: it.product, confidence: it.confidence }],
      };
    }));
  };

  // Items válidos para crear el pedido (matcheados + con qty > 0)
  const validItems = useMemo(
    () => parsed.filter(p => p.product && (Number(p.qty) || 0) > 0),
    [parsed]
  );

  const totals = useMemo(() => {
    const totalUnits = validItems.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    const totalUSDT = validItems.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.priceUSD) || 0), 0);
    return { totalUnits, totalUSDT };
  }, [validItems]);

  const handleApply = () => {
    if (validItems.length === 0) return;
    onApply?.(validItems.map(it => ({
      product: it.product,
      qty: Number(it.qty) || 1,
      priceUSD: Number(it.priceUSD) || 0,
    })));
    onClose?.();
  };

  if (!open) return null;

  const high = parsed.filter(p => p.confidence === "high").length;
  const med = parsed.filter(p => p.confidence === "medium").length;
  const low = parsed.filter(p => p.confidence === "low").length;

  return (
    <Modal open={open} onClose={onClose} title="📝 Pegar lista del proveedor">
      <p style={{ fontSize: 12, color: "#6B7794", margin: "0 0 14px", lineHeight: 1.5 }}>
        Pegá el listado del proveedor línea por línea. Sistema reconoce sabores, qty y precio
        automáticamente. Si lo procesaste antes (aprendido por alias), va directo al catálogo.
      </p>

      <textarea
        value={rawText}
        onChange={e => setRawText(e.target.value)}
        placeholder={`Ej:\nElfbar TE Watermelon Ice x20 USDT 7\nLost Mary BM Cherry Cola (15u) 8\nGeek Pulse Mango Ice x10 $7.5`}
        style={{
          width: "100%", minHeight: isMobile ? 120 : 160,
          padding: 12, background: "#F8F2E7", border: "1px solid #E5DAC2",
          borderRadius: 10, color: "#1E2B4A", fontSize: 13,
          outline: "none", boxSizing: "border-box",
          fontFamily: "'SF Mono', Monaco, monospace", resize: "vertical",
          marginBottom: 10,
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11, color: "#6B7794", flex: 1, minWidth: 200 }}>
          💡 Funciona con cualquier formato: "x20", "20u", "(20)", "$7", "USDT 7"
        </div>
        <Btn onClick={handleParse} disabled={!rawText.trim()}>
          🔍 Procesar
        </Btn>
      </div>

      {/* Preview de items */}
      {parsed.length > 0 && (
        <>
          <div style={{
            display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap",
            padding: "10px 12px", background: "#F1E9D6",
            borderRadius: 10, border: "1px solid #E5DAC2",
          }}>
            <span style={{ fontSize: 12, color: "#3A4868", fontWeight: 700 }}>
              Detectados: {parsed.length} items
            </span>
            {high > 0 && <Chip color="#0F6B5C" label={`🟢 ${high} OK`} />}
            {med > 0 && <Chip color="#CB912F" label={`🟡 ${med} revisar`} />}
            {low > 0 && <Chip color="#B83232" label={`🔴 ${low} sin match`} />}
          </div>

          <div style={{ marginBottom: 14, maxHeight: 400, overflowY: "auto" }}>
            {parsed.map((it, idx) => {
              const meta = confidenceMeta(it.confidence);
              return (
                <div
                  key={idx}
                  style={{
                    background: "#FFFFFF",
                    border: `1px solid ${meta.color}40`,
                    borderRadius: 10,
                    padding: 10, marginBottom: 8,
                  }}
                >
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "1fr 80px 80px auto",
                    gap: 8, alignItems: "center",
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                        {it.fromAlias ? (
                          <span style={{
                            fontSize: 10, fontWeight: 800, color: "#5B3592",
                            padding: "2px 8px", borderRadius: 6,
                            background: "#E4D8F0", border: "1px solid #C5A8E0",
                          }}>🧠 Aprendido</span>
                        ) : (
                          <span style={{
                            fontSize: 10, fontWeight: 800, color: meta.color,
                            padding: "2px 8px", borderRadius: 6,
                            background: `${meta.color}18`,
                          }}>{meta.emoji} {meta.label}</span>
                        )}
                        <span style={{
                          fontSize: 13, fontWeight: 700,
                          color: it.product ? "#1E2B4A" : "#B83232",
                        }}>
                          {it.product
                            ? `${it.product.brand} ${it.product.model} · ${it.product.flavor}`
                            : `❓ Sin match: "${it.raw}"`}
                        </span>
                      </div>
                      {it.product && it.alternatives?.length > 0 && (
                        <div style={{ fontSize: 11, color: "#6B7794" }}>
                          Alternativos:{" "}
                          {it.alternatives.slice(0, 2).map((alt, i) => (
                            <button
                              key={i}
                              onClick={() => switchToAlternative(idx, alt)}
                              style={{
                                background: "#FFFFFF", border: "1px dashed #C5CADE",
                                color: "#3A4868", padding: "1px 6px", borderRadius: 4,
                                fontSize: 10, cursor: "pointer", margin: "0 3px",
                                fontFamily: "inherit",
                              }}
                            >{alt.product.flavor}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input
                      type="number" min={0}
                      value={it.qty || ""}
                      onChange={e => updateQty(idx, e.target.value)}
                      placeholder="qty"
                      style={inputStyle()}
                    />
                    <input
                      type="number" min={0} step="0.01"
                      value={it.priceUSD || ""}
                      onChange={e => updatePrice(idx, e.target.value)}
                      placeholder="$USD"
                      style={inputStyle()}
                    />
                    <button
                      onClick={() => removeItem(idx)}
                      aria-label="Quitar"
                      style={{
                        background: "transparent", border: "1px solid #E5A8A8",
                        color: "#B83232", padding: "6px 10px", borderRadius: 8,
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >✕</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Totals + actions */}
          <div style={{
            padding: "12px 14px",
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
                  {validItems.length} items · {totals.totalUnits}u · USDT {totals.totalUSDT.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={handleApply} disabled={validItems.length === 0}>
          ✨ Agregar al pedido ({validItems.length})
        </Btn>
      </div>
    </Modal>
  );
}

function Chip({ color, label }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color,
      padding: "2px 10px", borderRadius: 999,
      background: `${color}18`, border: `1px solid ${color}40`,
    }}>{label}</span>
  );
}

function inputStyle() {
  return {
    width: "100%", padding: "6px 10px",
    border: "1px solid #E5DAC2", borderRadius: 6,
    fontSize: 13, textAlign: "center",
    fontFamily: "inherit", outline: "none",
    background: "#FFFFFF", color: "#1E2B4A",
  };
}
