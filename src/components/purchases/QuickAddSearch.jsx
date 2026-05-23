import { useState, useMemo, useRef, useEffect } from "react";
import { matchProduct } from "../../lib/fuzzyMatch.js";

// Buscador con autocomplete para agregar productos al pedido rápido.
// Tipeás y muestra top 8 matches del catálogo. Click → agrega como item con
// qty 1 + costo USDT del producto (si tiene). Ideal para no perderse en groups.
export function QuickAddSearch({ products, onPick, placeholder = "🔍 Buscar producto..." }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(0);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  const activeProducts = useMemo(() => products.filter(p => !p.isDeleted), [products]);

  // Matches por fuzzy search
  const matches = useMemo(() => {
    if (!query || query.length < 2) return [];
    const results = matchProduct({ raw: query }, activeProducts, { topN: 8, minScore: 0.1 });
    return results;
  }, [query, activeProducts]);

  // Cierra dropdown al click afuera
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (product) => {
    onPick?.(product);
    setQuery("");
    setOpen(false);
    setHoverIdx(0);
    inputRef.current?.focus();
  };

  const handleKey = (e) => {
    if (matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHoverIdx(i => Math.min(matches.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHoverIdx(i => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(matches[hoverIdx].product);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} style={{ position: "relative", marginBottom: 14 }}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setHoverIdx(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "12px 14px",
          background: "#FFFFFF", border: "2px solid #1E2B4A",
          borderRadius: 12, color: "#1E2B4A",
          fontSize: 15, fontWeight: 600, outline: "none",
          boxSizing: "border-box", fontFamily: "inherit",
          boxShadow: open ? "0 4px 16px rgba(30,43,74,0.15)" : "0 1px 3px rgba(30,43,74,0.05)",
        }}
      />
      {open && matches.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          marginTop: 4, background: "#FFFFFF",
          border: "1px solid #E5DAC2", borderRadius: 12,
          boxShadow: "0 12px 32px rgba(30,43,74,0.18)",
          zIndex: 50, maxHeight: 320, overflowY: "auto",
          padding: 4,
        }}>
          {matches.map((m, i) => (
            <div
              key={m.product.id}
              onClick={() => handleSelect(m.product)}
              onMouseEnter={() => setHoverIdx(i)}
              style={{
                padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                background: i === hoverIdx ? "#E8EBF2" : "transparent",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{
                  fontSize: 13, fontWeight: 700, color: "#1E2B4A",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {m.product.brand} {m.product.model}
                </div>
                <div style={{
                  fontSize: 11, color: "#6B7794", marginTop: 2,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {m.product.flavor} · {m.product.puffs}p · stock {m.product.stock}u
                </div>
              </div>
              {m.product.costUSDT > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 700, color: "#0F6B5C",
                  whiteSpace: "nowrap",
                }}>${m.product.costUSDT}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {open && query.length >= 2 && matches.length === 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          marginTop: 4, padding: "14px 12px",
          background: "#FFFFFF", border: "1px solid #E5DAC2",
          borderRadius: 12, color: "#9AA2B3", fontSize: 12, textAlign: "center",
        }}>
          Sin matches en el catálogo
        </div>
      )}
    </div>
  );
}
