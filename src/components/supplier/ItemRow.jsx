import { useState } from "react";
import { useResponsive } from "../../App.jsx";
import { confidenceMeta } from "../../lib/fuzzyMatch.js";
import { detectPriceChange } from "../../lib/supplierProfiles.js";

// Fila de item en la tabla de procesamiento. Profesional, agradable, con:
//  - estado match (🟢🟡🔴) o "aprendido" si vino de alias
//  - producto matcheado o "Nuevo"
//  - tu stock + velocity + sugerencia + margen
//  - precio del proveedor + alerta de cambio de precio vs lista anterior
//  - checkbox + qty editable + subtotal vivo
export function ItemRow({
  item,
  index,
  selected,
  qty,
  suggested,
  stat,
  priceHistory = [],
  onToggle,
  onQtyChange,
  onAddNew,
  onAcceptAlt,
}) {
  const { isMobile } = useResponsive();
  const [showAlts, setShowAlts] = useState(false);
  const meta = confidenceMeta(item.confidence);
  const isNew = item.confidence === "low";
  const matchedProduct = item.bestMatch?.product;
  const fromAlias = item.fromAlias;

  const stockActual = stat?.product?.stock || 0;
  const velocity = stat?.velocity30dPerDay || 0;
  const daysUntilEmpty = velocity > 0 ? Math.floor(stockActual / velocity) : null;
  const priceUSDsale = matchedProduct?.priceUSD || 0;
  const costUSD = item.priceUSD || matchedProduct?.costUSDT || 0;
  const marginPct = costUSD > 0 && priceUSDsale > 0
    ? Math.round(((priceUSDsale - costUSD) / priceUSDsale) * 100)
    : null;
  const priceChange = detectPriceChange(priceHistory, costUSD, 5);

  const isCritical = daysUntilEmpty != null && daysUntilEmpty <= 7 && velocity > 0;

  return (
    <div style={{
      background: selected ? "#EEF0FC" : "#FFFFFF",
      border: `1px solid ${selected ? "#5E6AD2" : isCritical ? "#F2D59A" : "#E8E7E3"}`,
      borderRadius: 12,
      padding: isMobile ? 12 : 14,
      marginBottom: 10,
      transition: "background 0.15s, border 0.15s",
      boxSizing: "border-box",
      position: "relative",
    }}>
      {isCritical && (
        <div style={{
          position: "absolute", top: -1, right: 12,
          background: "#CB912F", color: "#FFFFFF",
          fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4,
          padding: "2px 8px", borderRadius: "0 0 6px 6px",
        }}>Stock crítico</div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(index)}
          style={{
            marginTop: 2, width: 20, height: 20, accentColor: "#5E6AD2",
            cursor: "pointer", flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Línea 1: estado + producto */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
            {fromAlias ? (
              <span style={{
                fontSize: 10, fontWeight: 800, color: "#5E6AD2",
                padding: "2px 8px", borderRadius: 6,
                background: "#EEF0FC", border: "1px solid #C5CAEC",
              }}>🧠 Aprendido</span>
            ) : (
              <span style={{
                fontSize: 10, fontWeight: 800, color: meta.color,
                padding: "2px 8px", borderRadius: 6,
                background: `${meta.color}18`,
              }}>{meta.emoji} {meta.label}</span>
            )}
            {matchedProduct ? (
              <span style={{ fontSize: 13, fontWeight: 700, color: "#37352F" }}>
                {matchedProduct.brand} {matchedProduct.model} · {matchedProduct.flavor}
                {matchedProduct.puffs && (
                  <span style={{ fontSize: 11, color: "#8C8A82", fontWeight: 500, marginLeft: 6 }}>
                    {matchedProduct.puffs}p
                  </span>
                )}
              </span>
            ) : (
              <span style={{ fontSize: 13, fontWeight: 700, color: "#E03E3E", fontStyle: "italic" }}>
                {item.brand ? item.brand + " " : ""}{item.raw}
              </span>
            )}
          </div>

          {/* Línea 2: matches alternativos (medium) */}
          {item.confidence === "medium" && !fromAlias && item.topMatches?.length > 1 && (
            <div style={{ fontSize: 11, color: "#8C8A82", marginBottom: 6 }}>
              <button
                onClick={() => setShowAlts(s => !s)}
                style={{
                  background: "none", border: "none", color: "#5E6AD2", padding: 0,
                  fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {showAlts ? "Ocultar" : `Ver ${Math.min(3, item.topMatches.length - 1)} otros candidatos`} ▾
              </button>
              {showAlts && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {item.topMatches.slice(1, 4).map((m, i) => (
                    <button
                      key={i}
                      onClick={() => { onAcceptAlt(index, m); setShowAlts(false); }}
                      style={{
                        background: "#FFFFFF", border: "1px dashed #B1AFA7", color: "#37352F",
                        padding: "4px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                      title={`Cambiar al match: ${m.product.flavor} (${Math.round(m.score * 100)}%)`}
                    >
                      {m.product.model} · {m.product.flavor}
                      <span style={{ marginLeft: 6, color: "#8C8A82", fontWeight: 700 }}>
                        {Math.round(m.score * 100)}%
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {isNew && (
            <div style={{ fontSize: 11, color: "#8C8A82", marginBottom: 6 }}>
              No está en tu catálogo · <button
                onClick={() => onAddNew(index)}
                style={{
                  background: "#E03E3E18", border: "1px solid #F1B8B6", color: "#E03E3E",
                  padding: "2px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                  fontWeight: 700, fontFamily: "inherit", marginLeft: 4,
                }}
              >+ Agregar al catálogo</button>
            </div>
          )}

          {/* Línea 3: chips de stats */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            <Chip label="Proveedor" value={item.qty ? `${item.qty}u disponibles` : "Stock ?"} icon="🏭" />
            {costUSD > 0 && (
              <Chip
                label="Costo"
                value={`USD ${costUSD}`}
                icon="💵"
                trailing={priceChange && (
                  <span style={{
                    fontSize: 10, fontWeight: 800, color: priceChange.direction === "up" ? "#E03E3E" : "#0F7B6C",
                    marginLeft: 4,
                  }}>
                    {priceChange.direction === "up" ? "↑" : "↓"}{Math.abs(priceChange.changePct).toFixed(1)}%
                  </span>
                )}
              />
            )}
            {matchedProduct && (
              <Chip
                label="Tu stock"
                value={`${stockActual}u`}
                icon="📦"
                valueColor={stockActual === 0 ? "#E03E3E" : stockActual <= 3 ? "#CB912F" : "#0F7B6C"}
              />
            )}
            {velocity > 0 && (
              <Chip
                label="Velocidad"
                value={`${velocity.toFixed(1)}/d`}
                icon="🚀"
              />
            )}
            {daysUntilEmpty != null && (
              <Chip
                label="Se agota en"
                value={`${daysUntilEmpty}d`}
                icon="⏳"
                valueColor={daysUntilEmpty <= 7 ? "#E03E3E" : daysUntilEmpty <= 14 ? "#CB912F" : "#0F7B6C"}
              />
            )}
            {marginPct != null && (
              <Chip
                label="Margen"
                value={`${marginPct}%`}
                icon="💎"
                valueColor={marginPct < 15 ? "#E03E3E" : marginPct < 25 ? "#CB912F" : "#0F7B6C"}
              />
            )}
            {suggested > 0 && (
              <Chip
                label="⭐ Sugerencia"
                value={`Pedir ${suggested}u`}
                icon=""
                valueColor="#5E6AD2"
                bold
              />
            )}
          </div>

          {/* Línea 4: qty editor (visible solo si seleccionado) */}
          {selected && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10, marginTop: 12,
              paddingTop: 12, borderTop: "1px solid #F0EFEB",
              flexWrap: "wrap",
            }}>
              <label style={{ fontSize: 10, color: "#8C8A82", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Pedir:</label>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button
                  type="button"
                  onClick={() => onQtyChange(index, Math.max(0, (qty || 0) - 1))}
                  style={{
                    width: 32, height: 32, padding: 0, background: "#FAFAF9", border: "1px solid #E8E7E3",
                    borderRadius: 8, cursor: "pointer", color: "#37352F", fontSize: 16, fontFamily: "inherit",
                  }}
                >−</button>
                <input
                  type="number"
                  min="0"
                  value={qty}
                  onChange={e => onQtyChange(index, Math.max(0, Number(e.target.value) || 0))}
                  style={{
                    width: 70, padding: "6px 10px", border: "1px solid #E8E7E3", borderRadius: 8,
                    fontSize: 15, fontFamily: "inherit", textAlign: "center", outline: "none",
                    background: "#FFFFFF", color: "#37352F", fontWeight: 700,
                  }}
                />
                <button
                  type="button"
                  onClick={() => onQtyChange(index, (qty || 0) + 1)}
                  style={{
                    width: 32, height: 32, padding: 0, background: "#FAFAF9", border: "1px solid #E8E7E3",
                    borderRadius: 8, cursor: "pointer", color: "#37352F", fontSize: 16, fontFamily: "inherit",
                  }}
                >+</button>
              </div>
              {item.priceUSD > 0 && (
                <div style={{
                  marginLeft: "auto", padding: "4px 10px",
                  background: "#DDEDEA", borderRadius: 8,
                  fontSize: 13, color: "#0F7B6C", fontWeight: 700,
                }}>
                  USD {(qty * item.priceUSD).toFixed(2)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ label, value, icon, valueColor = "#37352F", bold = false, trailing }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 10px",
      background: "#FAFAF9", border: "1px solid #F0EFEB", borderRadius: 999,
      fontSize: 11, color: "#555247",
      whiteSpace: "nowrap",
    }}>
      {icon && <span style={{ fontSize: 11 }}>{icon}</span>}
      <span style={{ color: "#8C8A82", fontWeight: 500 }}>{label}:</span>
      <span style={{ color: valueColor, fontWeight: bold ? 800 : 700 }}>{value}</span>
      {trailing}
    </div>
  );
}
