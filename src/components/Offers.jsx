import { useState, useMemo } from "react";
import { formatMoney } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Card, Btn } from "./UI.jsx";
import { buildProductSalesStats } from "../productIntelligence.js";
import {
  buildOfferMessage,
  suggestLiquidation,
  productPriceARS,
  applyDiscount,
  whatsappLink,
} from "../lib/offers.js";
import { suggestSmartOffers } from "../lib/smartOffers.js";

// Módulo "🔥 Ofertas" — generador inteligente de promos para WhatsApp.
// 2 modos:
//   💡 Ideas de venta — el sistema analiza estadísticas y propone promos
//      concretas (reactivar, liquidar, cross-sell, top-sellers) con impacto.
//   ✏️ Armar oferta — generador manual.
export const Offers = ({ products = [], sales = [], clients = [], exchangeRate = 1 }) => {
  const { isMobile } = useResponsive();

  const [view, setView] = useState("ideas"); // ideas | manual
  const [type, setType] = useState("destacado");
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState("");
  const [discountPct, setDiscountPct] = useState(20);
  const [comboQty, setComboQty] = useState(3);
  const [comboPrice, setComboPrice] = useState(0);
  const [title, setTitle] = useState("");
  const [footer, setFooter] = useState("📲 Escribime y lo aparto!");
  const [phone, setPhone] = useState("");
  const [storiesMode, setStoriesMode] = useState(false);
  const [copied, setCopied] = useState(false);

  const activeProducts = useMemo(
    () => products.filter(p => !p.isDeleted && (Number(p.stock) || 0) > 0),
    [products]
  );
  const stats = useMemo(() => buildProductSalesStats(products, sales, exchangeRate), [products, sales, exchangeRate]);
  const liquidationCandidates = useMemo(() => suggestLiquidation(products, stats), [products, stats]);

  const filtered = useMemo(() => {
    if (!search) return activeProducts;
    const t = search.toLowerCase();
    return activeProducts.filter(p => `${p.brand} ${p.model} ${p.flavor}`.toLowerCase().includes(t));
  }, [activeProducts, search]);

  const selectedProducts = useMemo(
    () => selectedIds.map(id => products.find(p => p.id === id)).filter(Boolean),
    [selectedIds, products]
  );

  const toggle = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Construye el objeto offer y genera el mensaje
  const offer = useMemo(() => ({
    type,
    title: title || undefined,
    products: selectedProducts.map(p => ({ product: p })),
    comboQty: Number(comboQty) || 3,
    comboPriceARS: Number(comboPrice) || 0,
    discountPct: Number(discountPct) || 0,
    footer,
  }), [type, title, selectedProducts, comboQty, comboPrice, discountPct, footer]);

  const message = useMemo(() => buildOfferMessage(offer, exchangeRate), [offer, exchangeRate]);
  const text = storiesMode ? message.stories : message.full;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("Copiá esto:", text);
    }
  };

  const sendWA = () => window.open(whatsappLink(text, phone), "_blank");

  // ----- Ideas de venta inteligentes -----
  const smartIdeas = useMemo(
    () => suggestSmartOffers({ products, statsMap: stats, sales, clients, exchangeRate }),
    [products, stats, sales, clients, exchangeRate]
  );

  // Carga una idea en el generador manual para revisarla/ajustarla.
  const useIdea = (idea) => {
    setType(idea.offerType);
    setTitle(idea.title || "");
    setSelectedIds((idea.products || []).map(x => x.product.id));
    setDiscountPct(idea.suggestedDiscountPct || 10);
    if (idea.offerType === "combo") {
      setComboQty(idea.comboQty || 2);
      setComboPrice(idea.comboPriceARS || 0);
    }
    if (idea.clientPhone) setPhone(idea.clientPhone);
    setView("manual");
  };

  const CATEGORY_COLORS = {
    liquidar: "#B83232", reactivar: "#5B3592", crosssell: "#2383E2", topseller: "#0F6B5C",
  };

  const TYPES = [
    { key: "destacado", label: "🔥 Destacado", desc: "Productos con precio" },
    { key: "combo", label: "🎁 Combo", desc: "Llevá N x precio" },
    { key: "liquidacion", label: "📉 Liquidación", desc: "Con % off" },
    { key: "descuento", label: "✨ Descuento", desc: "% off general" },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ color: "#1E2B4A", margin: 0, fontSize: isMobile ? 22 : 26, fontWeight: 800, letterSpacing: "-0.4px" }}>
          🔥 Ofertas
        </h2>
        <p style={{ color: "#6B7794", fontSize: 13, margin: "4px 0 0" }}>
          El sistema analiza tus datos y te dice qué promo conviene para vender más.
        </p>
      </div>

      {/* Toggle vista */}
      <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: "1px solid #E5DAC2" }}>
        {[
          { key: "ideas", label: "💡 Ideas de venta" },
          { key: "manual", label: "✏️ Armar oferta" },
        ].map(v => (
          <button key={v.key} onClick={() => setView(v.key)} style={{
            padding: isMobile ? "10px 14px" : "12px 18px", background: "transparent",
            color: view === v.key ? "#1E2B4A" : "#6B7794", border: "none",
            borderBottom: `3px solid ${view === v.key ? "#1E2B4A" : "transparent"}`,
            fontSize: isMobile ? 13 : 15, fontWeight: 800, cursor: "pointer",
            fontFamily: "inherit", marginBottom: -1, letterSpacing: "-0.2px",
          }}>{v.label}</button>
        ))}
      </div>

      {/* ===== MODO IDEAS DE VENTA ===== */}
      {view === "ideas" && (
        <div>
          {smartIdeas.length === 0 ? (
            <Card>
              <div style={{ textAlign: "center", padding: isMobile ? 28 : 48, color: "#6B7794" }}>
                <div style={{ fontSize: 52, marginBottom: 12 }}>💡</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1E2B4A", marginBottom: 6 }}>
                  Todavía no hay suficientes datos
                </div>
                <div style={{ fontSize: 13, maxWidth: 460, margin: "0 auto" }}>
                  Cuando tengas más ventas y movimiento de stock, acá vas a ver ideas concretas
                  para vender más. Mientras tanto, armá ofertas a mano en la otra pestaña.
                </div>
              </div>
            </Card>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? "100%" : "340px"}, 1fr))`, gap: 12 }}>
              {smartIdeas.map(idea => {
                const color = CATEGORY_COLORS[idea.category] || "#1E2B4A";
                return (
                  <div key={idea.id} style={{
                    background: "#FFFFFF", border: `1px solid ${color}40`, borderRadius: 14,
                    overflow: "hidden", display: "flex", flexDirection: "column",
                  }}>
                    <div style={{ height: 3, background: color }} />
                    <div style={{ padding: 14, display: "flex", flexDirection: "column", flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 18 }}>{idea.icon}</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: "#1E2B4A" }}>{idea.title}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#6B7794", lineHeight: 1.5, marginBottom: 10, flex: 1 }}>
                        {idea.reason}
                      </div>
                      {/* Impacto financiero */}
                      <div style={{
                        display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12,
                        padding: "8px 10px", background: "#F8F2E7", borderRadius: 8, border: "1px solid #EFE5CE",
                      }}>
                        {idea.category === "liquidar" && (
                          <>
                            <Impact label="Recuperás" value={formatMoney(idea.impact.capitalFreedARS)} color="#0F6B5C" />
                            <Impact label="Margen" value={`${idea.impact.marginPct}%`} color={idea.impact.marginPct >= 15 ? "#0F6B5C" : "#CB912F"} />
                            <Impact label="Descuento" value={`-${idea.suggestedDiscountPct}%`} color="#B83232" />
                          </>
                        )}
                        {idea.category === "reactivar" && (
                          <>
                            <Impact label="Ticket promedio" value={formatMoney(idea.impact.avgTicketARS)} color="#1E2B4A" />
                            <Impact label="Descuento" value={`-${idea.suggestedDiscountPct}%`} color="#5B3592" />
                          </>
                        )}
                        {idea.category === "crosssell" && (
                          <>
                            <Impact label="Combo" value={formatMoney(idea.impact.comboPriceARS)} color="#0F6B5C" />
                            <Impact label="Ahorro cliente" value={formatMoney(idea.impact.savingARS)} color="#2383E2" />
                          </>
                        )}
                        {idea.category === "topseller" && (
                          <>
                            <Impact label="Margen actual" value={`${idea.impact.currentMarginPct}%`} color="#0F6B5C" />
                            <Impact label="Tras promo" value={`${idea.impact.marginAfterPct}%`} color={idea.impact.marginAfterPct >= 25 ? "#0F6B5C" : "#CB912F"} />
                            <Impact label="Descuento" value={`-${idea.suggestedDiscountPct}%`} color="#1E2B4A" />
                          </>
                        )}
                      </div>
                      <Btn onClick={() => useIdea(idea)} style={{ width: "100%" }}>
                        Armar esta oferta →
                      </Btn>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== MODO ARMAR OFERTA (manual) ===== */}
      {view === "manual" && (<>
      {/* Tipo de oferta */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {TYPES.map(t => (
          <button
            key={t.key}
            onClick={() => setType(t.key)}
            style={{
              flex: isMobile ? "1 1 45%" : "0 0 auto",
              padding: "10px 16px",
              background: type === t.key ? "#1E2B4A" : "transparent",
              color: type === t.key ? "#FFFFFF" : "#555247",
              border: `1px solid ${type === t.key ? "#1E2B4A" : "#E5DAC2"}`,
              borderRadius: 10, fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", textAlign: "left",
            }}
          >
            <div>{t.label}</div>
            <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 500, marginTop: 2 }}>{t.desc}</div>
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        {/* Columna izquierda: configuración */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Parámetros según tipo */}
          <Card>
            <Label>Encabezado (opcional)</Label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: 🔥 OFERTA FINDE 🔥" style={inputStyle()} />

            {type === "combo" && (
              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <div style={{ flex: 1 }}>
                  <Label>Cantidad</Label>
                  <input type="number" min={2} value={comboQty} onChange={e => setComboQty(e.target.value)} style={inputStyle()} />
                </div>
                <div style={{ flex: 1 }}>
                  <Label>Precio combo ($)</Label>
                  <input type="number" value={comboPrice} onChange={e => setComboPrice(e.target.value)} placeholder="75000" style={inputStyle()} />
                </div>
              </div>
            )}

            {(type === "liquidacion" || type === "descuento") && (
              <div style={{ marginTop: 10 }}>
                <Label>Descuento %</Label>
                <input type="number" min={0} max={90} value={discountPct} onChange={e => setDiscountPct(e.target.value)} style={inputStyle()} />
              </div>
            )}

            <div style={{ marginTop: 10 }}>
              <Label>Cierre del mensaje</Label>
              <input value={footer} onChange={e => setFooter(e.target.value)} style={inputStyle()} />
            </div>
          </Card>

          {/* Sugerencia de liquidación */}
          {type === "liquidacion" && liquidationCandidates.length > 0 && (
            <Card style={{ background: "#F5E4C2", border: "1px solid #E1C684" }}>
              <Label>💡 Candidatos a liquidar (stock parado)</Label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {liquidationCandidates.slice(0, 8).map(c => (
                  <button
                    key={c.product.id}
                    onClick={() => !selectedIds.includes(c.product.id) && toggle(c.product.id)}
                    style={{
                      padding: "4px 10px", fontSize: 11, fontWeight: 600,
                      background: selectedIds.includes(c.product.id) ? "#1E2B4A" : "#FFFFFF",
                      color: selectedIds.includes(c.product.id) ? "#FFFFFF" : "#B07A1F",
                      border: "1px solid #E1C684", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >{c.product.flavor} ({c.stock}u)</button>
                ))}
              </div>
            </Card>
          )}

          {/* Selección de productos */}
          <Card>
            <Label>Productos {selectedIds.length > 0 && `(${selectedIds.length})`}</Label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar..." style={{ ...inputStyle(), marginBottom: 8 }} />
            <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {filtered.slice(0, 60).map(p => {
                const sel = selectedIds.includes(p.id);
                const regular = productPriceARS(p, exchangeRate);
                const showDisc = (type === "liquidacion" || type === "descuento") && discountPct > 0;
                return (
                  <div key={p.id} onClick={() => toggle(p.id)} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                    padding: "7px 10px", borderRadius: 8, cursor: "pointer",
                    background: sel ? "#E8EBF2" : "#F8F2E7", border: `1px solid ${sel ? "#C5CADE" : "#EFE5CE"}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <input type="checkbox" checked={sel} readOnly style={{ accentColor: "#1E2B4A" }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#1E2B4A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.brand} {p.model} · {p.flavor}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: showDisc ? "#0F6B5C" : "#3A4868", whiteSpace: "nowrap" }}>
                      {showDisc ? formatMoney(applyDiscount(regular, discountPct)) : formatMoney(regular)}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Columna derecha: preview + acciones */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card style={{ position: isMobile ? "static" : "sticky", top: 70 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <Label>Vista previa</Label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#555247", cursor: "pointer" }}>
                <input type="checkbox" checked={storiesMode} onChange={e => setStoriesMode(e.target.checked)} style={{ accentColor: "#1E2B4A" }} />
                Modo historias (corto)
              </label>
            </div>
            <div style={{
              background: "#DCF8C6", borderRadius: 12, padding: 14,
              whiteSpace: "pre-wrap", fontSize: 13, color: "#1E2B4A", lineHeight: 1.5,
              minHeight: 120, fontFamily: "'Segoe UI', sans-serif",
              border: "1px solid #B6E0A0",
            }}>
              {text || "Elegí productos para ver el mensaje..."}
            </div>

            <div style={{ marginTop: 12 }}>
              <Label>Teléfono del cliente (opcional, para enviar directo)</Label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+54 9 11 ..." style={inputStyle()} />
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <Btn onClick={copy} style={{ flex: 1 }}>{copied ? "✓ Copiado" : "📋 Copiar"}</Btn>
              <Btn variant="success" onClick={sendWA} style={{ flex: 1 }}>📲 WhatsApp</Btn>
            </div>
          </Card>
        </div>
      </div>
      </>)}
    </div>
  );
};

function Impact({ label, value, color = "#1E2B4A" }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "#6B7794", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 11, color: "#6B7794", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{children}</div>;
}

function inputStyle() {
  return {
    width: "100%", padding: "10px 12px", background: "#F8F2E7",
    border: "1px solid #E5DAC2", borderRadius: 10, color: "#1E2B4A",
    fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  };
}
