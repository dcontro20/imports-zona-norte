import { useState, useMemo } from "react";
import { formatMoney } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Card, Btn, Modal } from "./UI.jsx";
import { buildProductSalesStats } from "../productIntelligence.js";
import {
  buildOfferMessage,
  productPriceARS,
  applyDiscount,
  whatsappLink,
} from "../lib/offers.js";
import { suggestSmartOffers, maxDiscountForMargin } from "../lib/smartOffers.js";
import { AUDIENCES, AUDIENCE_LIST, getAudience } from "../lib/offerAudiences.js";
import { weeklyCalendar, todaySuggestions, isWeekend } from "../lib/offerCalendar.js";
import {
  extractOffersFromAuditLog,
  linkSalesToOffers,
  calcConversionStats,
} from "../lib/offerHistory.js";
import { checkCooldown } from "../lib/messageCooldown.js";
import { buildDailyPlan, calcMessageStreak } from "../lib/dailyPlan.js";
import { generateFullMessage } from "../lib/whatsappMessage.js";
import { pickWeeklyPromo } from "../lib/weeklyPromo.js";
import { generateStoryImage, downloadBlob } from "../lib/storyImageGenerator.js";
import { createCatalogSnapshot, encodeCatalogToURL, catalogShareMessage } from "../lib/publicCatalog.js";
import { WhatsAppMessage } from "./WhatsApp.jsx";

// Módulo "📲 Mensajes" — hub centralizado de mensajes WhatsApp.
//
// Default es "📲 Mensaje rápido" (catálogo de stock listo para copiar — flujo
// más rápido). Para casos más sofisticados están las otras tabs.
//
// 5 vistas:
//   📲 Mensaje rápido — catálogo de stock para copiar/pegar (default)
//   💡 Hoy            — sugerencias del día + ideas inteligentes por audiencia
//   📅 Semana         — calendario sugerido lun-dom
//   📜 Historial      — qué se mandó + conversión real a venta
//   ✏️ Manual         — generador a mano (oferta puntual)
//
// 3 audiencias (afectan el tono de los mensajes de las tabs de ideas):
//   👤 Cliente individual    — personalizado, link wa.me
//   📢 Mi grupo de WhatsApp  — broadcast comercial
//   🎵 Grupo de fiestas       — vibe casual soft-sell

const CATEGORY_COLORS = {
  liquidar: "#B83232",
  reactivar: "#5B3592",
  crosssell: "#2383E2",
  topseller: "#0F6B5C",
  stocklist: "#1E2B4A",
  packfiesta: "#D4691C",
  recordatorio: "#6B7794",
  drop: "#0F6B5C",
  mix: "#2383E2",
  combomarca: "#0F6B5C",
  dupla: "#D4691C",
  comboamigos: "#5B3592",
};

const TYPES = [
  // Promos multi-sabor (las que más empujan el ticket)
  { key: "topsemana", label: "📈 Top semana", desc: "3-5 sabores top con -% al llevar 2+" },
  { key: "comboamigos", label: "👥 Combo amigos", desc: "2 → -10% c/u · 3+ → -15% c/u" },
  { key: "mix3x2", label: "🤝 3x2 mixto", desc: "Llevás 3, pagás 2" },
  { key: "combomarca", label: "🎯 Combo marca", desc: "N sabores de la misma marca" },
  { key: "duplapack", label: "🎁 2da al 50%", desc: "2da unidad al 50%" },
  { key: "packfiesta", label: "🎉 Pack finde", desc: "Combo 3-4u pre-finde" },
  // Promos individuales / catálogo
  { key: "destacado", label: "🔥 Destacado", desc: "Productos con precio" },
  { key: "liquidacion", label: "📉 Liquidación", desc: "Stock parado con % off" },
  { key: "descuento", label: "✨ Descuento", desc: "% off general" },
  { key: "stocklist", label: "📋 Stock list", desc: "Catálogo por marca" },
  { key: "drop", label: "🆕 Drop", desc: "Sabores nuevos" },
  { key: "restock", label: "✅ Restock", desc: "Productos que volvieron" },
  { key: "recordatorio", label: "💬 Recordatorio", desc: "Casual sin venta" },
];

export const Offers = ({ products = [], sales = [], clients = [], exchangeRate = 1, logAudit, currentUser, auditLog = [], initialTab }) => {
  const { isMobile, isTablet } = useResponsive();

  // Audiencia activa (filtra qué ideas se muestran)
  const [audience, setAudience] = useState("individual");
  const audienceConfig = getAudience(audience);

  // Vista activa: hoy | semana | manual
  // Default es "quick" (Mensaje rápido) — el flujo más usado: catálogo de stock
  // listo para copiar. Las otras tabs son para casos más sofisticados.
  // Permite override por initialTab (ej: cuando se entra desde "?page=whatsapp" legacy
  // o desde el widget del Dashboard).
  const [view, setView] = useState(initialTab || "quick");

  // Modal de preview de una idea
  const [previewIdea, setPreviewIdea] = useState(null);

  // Estado del modo manual
  const [type, setType] = useState("destacado");
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState("");
  const [discountPct, setDiscountPct] = useState(20);
  const [comboQty, setComboQty] = useState(3);
  const [comboPrice, setComboPrice] = useState(0);
  const [title, setTitle] = useState("");

  const activeProducts = useMemo(
    () => products.filter(p => !p.isDeleted && (Number(p.stock) || 0) > 0),
    [products]
  );
  const stats = useMemo(
    () => buildProductSalesStats(products, sales, exchangeRate),
    [products, sales, exchangeRate]
  );

  // ----- Ideas inteligentes (todas) -----
  const allIdeas = useMemo(
    () => suggestSmartOffers({ products, statsMap: stats, sales, clients, exchangeRate }),
    [products, stats, sales, clients, exchangeRate]
  );

  // Ideas filtradas por la audiencia activa
  const ideasForAudience = useMemo(() => {
    const allowedTypes = audienceConfig.suggestedTypes;
    return allIdeas.filter(idea => {
      // Cross-sell del motor matchea con "combo" en offers types; allowedTypes lista category keys
      return allowedTypes.includes(idea.category) || allowedTypes.includes(idea.offerType);
    });
  }, [allIdeas, audienceConfig]);

  // Calendario semanal + sugerencias de hoy
  const week = useMemo(() => weeklyCalendar(), []);
  const todaySugs = useMemo(() => todaySuggestions(), []);

  // Búsqueda manual
  const filtered = useMemo(() => {
    if (!search) return activeProducts.slice(0, 80);
    const t = search.toLowerCase();
    return activeProducts.filter(p => `${p.brand} ${p.model} ${p.flavor}`.toLowerCase().includes(t)).slice(0, 80);
  }, [activeProducts, search]);

  const selectedProducts = useMemo(
    () => selectedIds.map(id => products.find(p => p.id === id)).filter(Boolean),
    [selectedIds, products]
  );

  const toggle = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Manual offer object
  const manualOffer = useMemo(() => ({
    type,
    title: title || undefined,
    products: selectedProducts.map(p => ({ product: p })),
    comboQty: Number(comboQty) || 3,
    comboPriceARS: Number(comboPrice) || 0,
    discountPct: Number(discountPct) || 0,
  }), [type, title, selectedProducts, comboQty, comboPrice, discountPct]);

  // Abre una idea como preview (con audiencia activa aplicada)
  const openIdea = (idea) => {
    setPreviewIdea(idea);
  };

  // Abre el modo manual cargando una idea
  const useIdeaManual = (idea) => {
    setType(idea.offerType);
    setTitle(idea.title || "");
    setSelectedIds((idea.products || []).map(x => x.product.id));
    setDiscountPct(idea.suggestedDiscountPct || 10);
    if (idea.offerType === "combo" || idea.offerType === "packfiesta") {
      setComboQty(idea.comboQty || 3);
      setComboPrice(idea.comboPriceARS || 0);
    }
    setView("manual");
    setPreviewIdea(null);
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* HEADER */}
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ color: "#1E2B4A", margin: 0, fontSize: isMobile ? 22 : 26, fontWeight: 800, letterSpacing: "-0.4px" }}>
          📲 Mensajes
        </h2>
        <p style={{ color: "#6B7794", fontSize: 13, margin: "4px 0 0" }}>
          Tu hub de mensajes para WhatsApp: catálogo de stock, ideas inteligentes por audiencia, calendario y registro de envíos.
        </p>
      </div>

      {/* SELECTOR DE AUDIENCIA — solo visible en tabs que lo usan */}
      {view !== "quick" && view !== "historial" && (
        <AudienceSelector value={audience} onChange={setAudience} isMobile={isMobile} />
      )}

      {/* TABS DE VISTA */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: "1px solid #E5DAC2", overflowX: "auto" }}>
        {[
          { key: "quick", label: isMobile ? "📲 Rápido" : "📲 Mensaje rápido" },
          { key: "hoy", label: isMobile ? "💡 Hoy" : "💡 Hoy + Ideas" },
          { key: "semana", label: isMobile ? "📅 Semana" : "📅 Plan semanal" },
          { key: "historial", label: isMobile ? "📜 Historial" : "📜 Historial + Conversión" },
          { key: "manual", label: isMobile ? "✏️ Manual" : "✏️ Armar a mano" },
        ].map(v => (
          <button key={v.key} onClick={() => setView(v.key)} style={{
            padding: isMobile ? "10px 14px" : "12px 18px", background: "transparent",
            color: view === v.key ? "#1E2B4A" : "#6B7794", border: "none",
            borderBottom: `3px solid ${view === v.key ? "#1E2B4A" : "transparent"}`,
            fontSize: isMobile ? 13 : 15, fontWeight: 800, cursor: "pointer",
            fontFamily: "inherit", marginBottom: -1, letterSpacing: "-0.2px",
            whiteSpace: "nowrap", flexShrink: 0,
          }}>{v.label}</button>
        ))}
      </div>

      {/* VISTA MENSAJE RÁPIDO (default) — embebe el WhatsAppMessage tal cual */}
      {view === "quick" && (
        <>
          <PublicCatalogGenerator products={products} exchangeRate={exchangeRate} />
          <WhatsAppMessage products={products} />
        </>
      )}

      {/* VISTA HOY — Plan de hoy: 2 envíos de presencia + promos sugeridas */}
      {view === "hoy" && (
        <TodayView
          audience={audience}
          ideas={ideasForAudience}
          allIdeas={allIdeas}
          auditLog={auditLog}
          products={products}
          exchangeRate={exchangeRate}
          logAudit={logAudit}
          onOpenIdea={openIdea}
          onPickAudience={setAudience}
          onGoQuick={() => setView("quick")}
          isMobile={isMobile}
        />
      )}

      {/* VISTA SEMANA */}
      {view === "semana" && (
        <WeekView
          week={week}
          ideas={allIdeas}
          onOpenIdea={openIdea}
          onPickAudience={setAudience}
          isMobile={isMobile}
        />
      )}

      {/* VISTA HISTORIAL */}
      {view === "historial" && (
        <HistoryView
          auditLog={auditLog}
          sales={sales}
          clients={clients}
          products={products}
          isMobile={isMobile}
        />
      )}

      {/* VISTA MANUAL */}
      {view === "manual" && (
        <ManualView
          isMobile={isMobile}
          type={type} setType={setType}
          title={title} setTitle={setTitle}
          comboQty={comboQty} setComboQty={setComboQty}
          comboPrice={comboPrice} setComboPrice={setComboPrice}
          discountPct={discountPct} setDiscountPct={setDiscountPct}
          search={search} setSearch={setSearch}
          filtered={filtered}
          selectedIds={selectedIds} toggle={toggle}
          manualOffer={manualOffer}
          audience={audience}
          clients={clients}
          exchangeRate={exchangeRate}
        />
      )}

      {/* MODAL PREVIEW DE IDEA */}
      {previewIdea && (
        <IdeaPreviewModal
          idea={previewIdea}
          audience={audience}
          clients={clients}
          exchangeRate={exchangeRate}
          onClose={() => setPreviewIdea(null)}
          onEditManual={useIdeaManual}
          isMobile={isMobile}
          logAudit={logAudit}
          auditLog={auditLog}
        />
      )}
    </div>
  );
};

// ============================================================================
// AUDIENCE SELECTOR — 3 chips grandes mobile-friendly
// ============================================================================

function AudienceSelector({ value, onChange, isMobile }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
      gap: 8, marginBottom: 16,
    }}>
      {AUDIENCE_LIST.map(aud => {
        const selected = value === aud.key;
        return (
          <button
            key={aud.key}
            onClick={() => onChange(aud.key)}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 14px", minHeight: 60,
              background: selected ? "#1E2B4A" : "#FFFFFF",
              color: selected ? "#F8F2E7" : "#1E2B4A",
              border: `1px solid ${selected ? "#1E2B4A" : "#E5DAC2"}`,
              borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
              textAlign: "left", boxShadow: selected ? "0 4px 12px rgba(30,43,74,0.18)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            <span style={{ fontSize: 24, flexShrink: 0 }}>{aud.icon}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 2 }}>{aud.label}</div>
              <div style={{ fontSize: 11, opacity: 0.78, lineHeight: 1.3 }}>{aud.description}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// VISTA HOY
// ============================================================================

function TodayView({ audience, ideas, allIdeas, auditLog, products, exchangeRate, logAudit, onOpenIdea, onPickAudience, onGoQuick, isMobile }) {
  const [showAllIdeas, setShowAllIdeas] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [copiedSlot, setCopiedSlot] = useState(null);

  const plan = useMemo(() => buildDailyPlan({ auditLog, now: new Date() }), [auditLog]);
  const streak = useMemo(() => calcMessageStreak(auditLog, new Date()), [auditLog]);
  const weekly = useMemo(() => pickWeeklyPromo(allIdeas, { now: new Date() }), [allIdeas]);

  // El mensaje de presencia ES el mensaje de stock clásico de la sección
  // WhatsApp — exactamente el mismo formato, sin tocar.
  const presenceMessage = useMemo(
    () => generateFullMessage(products, exchangeRate),
    [products, exchangeRate]
  );

  // Copia el mensaje de presencia y lo registra en el audit log → el slot
  // queda ✓ y la racha suma.
  const copyPresence = async (slot) => {
    try {
      await navigator.clipboard.writeText(presenceMessage);
    } catch {
      prompt("Copiá el mensaje:", presenceMessage);
    }
    setCopiedSlot(slot.id);
    setTimeout(() => setCopiedSlot(null), 3000);
    if (logAudit) {
      logAudit("create", "offer", `presence-${slot.id}-${Date.now()}`,
        `Mensaje de presencia (stock) al grupo · ${slot.id === "noon" ? "mediodía" : "tarde"}`, {
          audience: "groupClients",
          ideaCategory: "presencia",
          offerType: "stocklist",
          method: "copia",
          productIds: [],
          suggestedDiscountPct: 0,
        });
    }
  };

  const slotsDone = plan.slots.filter(s => s.sent).length;
  const allDone = slotsDone === plan.slots.length;

  return (
    <div>
      {/* ===== STREAK + ESTADO DEL DÍA ===== */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 10, marginBottom: 14, flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#1E2B4A", textTransform: "capitalize" }}>
          📅 Plan de hoy · {plan.dayName}
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 12px", borderRadius: 999,
          background: streak.current > 0 ? "#FDECC8" : "#F8F2E7",
          border: `1px solid ${streak.current > 0 ? "#F2D59A" : "#E5DAC2"}`,
          fontSize: 12, fontWeight: 800,
          color: streak.current > 0 ? "#B07A1F" : "#6B7794",
        }}>
          🔥 {streak.current} {streak.current === 1 ? "día" : "días"} seguidos
          {streak.best > streak.current && (
            <span style={{ fontWeight: 500, opacity: 0.7 }}>· récord {streak.best}</span>
          )}
        </div>
      </div>

      {/* ===== LOS 2 ENVÍOS DE PRESENCIA DEL DÍA =====
          Ambos copian EL MISMO mensaje de stock clásico de WhatsApp.
          Tocás "Copiar mensaje" → portapapeles → lo pegás en el grupo.
          El slot se marca ✓ y la racha suma. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
        {plan.slots.map(slot => {
          const done = slot.sent;
          const justCopied = copiedSlot === slot.id;
          return (
            <div key={slot.id} style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: isMobile ? "14px 16px" : "16px 20px",
              borderRadius: 14,
              background: done ? "#F0F9F6" : "#FFFFFF",
              border: done ? "2px solid #0F7B6C" : "1px solid #E5DAC2",
              flexWrap: isMobile ? "wrap" : "nowrap",
            }}>
              <div style={{
                fontSize: 28, flexShrink: 0, width: 44, textAlign: "center",
              }}>{done ? "✅" : slot.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7794", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {slot.timeLabel} · 📢 Mi grupo
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#1E2B4A", marginTop: 2 }}>
                  {slot.label}
                </div>
                <div style={{ fontSize: 12, color: "#6B7794", marginTop: 3, lineHeight: 1.4 }}>
                  {slot.why}
                </div>
              </div>
              {!done && (
                <button onClick={() => copyPresence(slot)} style={{
                  flexShrink: 0, padding: "12px 18px", minHeight: 48,
                  background: justCopied ? "#0F7B6C" : "#25d366",
                  color: "#FFF", border: "none",
                  borderRadius: 10, fontSize: 14, fontWeight: 800,
                  cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                  width: isMobile ? "100%" : "auto",
                }}>
                  {justCopied ? "✓ Copiado — pegalo en el grupo" : "📋 Copiar mensaje"}
                </button>
              )}
              {done && (
                <span style={{ fontSize: 12, fontWeight: 800, color: "#0F7B6C", flexShrink: 0 }}>
                  Enviado
                </span>
              )}
            </div>
          );
        })}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          <button onClick={onGoQuick} style={{
            background: "none", border: "none", color: "#6B7794",
            fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: "4px 0",
          }}>
            👁 Ver / editar el mensaje en "Mensaje rápido" →
          </button>
          {allDone && (
            <span style={{ fontSize: 13, fontWeight: 700, color: "#0F7B6C" }}>
              🎉 Presencia de hoy completa
            </span>
          )}
        </div>
      </div>

      {/* ===== PROMO DE LA SEMANA ===== */}
      {weekly.main && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#1E2B4A", marginBottom: 8 }}>
            ⭐ Promo de la semana
            <span style={{ fontSize: 11, color: "#6B7794", fontWeight: 500, marginLeft: 8 }}>
              fija de lunes a domingo — la repetición vende
            </span>
          </div>
          <div style={{
            background: "linear-gradient(135deg, #1E2B4A 0%, #2D3D63 100%)",
            borderRadius: 14, padding: isMobile ? 16 : 20, color: "#F8F2E7",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 30 }}>{weekly.main.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{weekly.main.title}</div>
                <div style={{ fontSize: 12, opacity: 0.8, marginTop: 3, lineHeight: 1.4 }}>{weekly.main.reason}</div>
              </div>
              <button onClick={() => onOpenIdea(weekly.main)} style={{
                flexShrink: 0, padding: "12px 18px", minHeight: 48,
                background: "#F8F2E7", color: "#1E2B4A", border: "none",
                borderRadius: 10, fontSize: 14, fontWeight: 800,
                cursor: "pointer", fontFamily: "inherit",
              }}>Ver promo →</button>
            </div>
          </div>
          {weekly.alternatives.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <button onClick={() => setShowAlternatives(v => !v)} style={{
                background: "none", border: "none", color: "#6B7794",
                fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: "4px 0",
              }}>
                {showAlternatives ? "▲ Ocultar alternativas" : `▼ ¿No te convence? Ver ${weekly.alternatives.length} alternativa${weekly.alternatives.length > 1 ? "s" : ""}`}
              </button>
              {showAlternatives && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                  {weekly.alternatives.map(alt => (
                    <div key={alt.id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 14px", background: "#FFFFFF",
                      border: "1px solid #E5DAC2", borderRadius: 10,
                    }}>
                      <span style={{ fontSize: 20 }}>{alt.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#1E2B4A" }}>{alt.title}</div>
                        <div style={{ fontSize: 11, color: "#6B7794", marginTop: 1 }}>{alt.reason}</div>
                      </div>
                      <button onClick={() => onOpenIdea(alt)} style={{
                        flexShrink: 0, padding: "8px 12px", minHeight: 40,
                        background: "transparent", color: "#1E2B4A", border: "1px solid #E5DAC2",
                        borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                      }}>Ver</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== TODAS LAS IDEAS (colapsado por default — anti-saturación visual) ===== */}
      <div>
        <button onClick={() => setShowAllIdeas(v => !v)} style={{
          width: "100%", padding: "12px 16px", minHeight: 48,
          background: "transparent", border: "1px dashed #E5DAC2",
          borderRadius: 12, color: "#6B7794", fontSize: 13, fontWeight: 700,
          cursor: "pointer", fontFamily: "inherit",
        }}>
          {showAllIdeas
            ? "▲ Ocultar el resto de las ideas"
            : `▼ Explorar todas las ideas para ${AUDIENCES[audience].label.toLowerCase()} (${ideas.length})`}
        </button>
        {showAllIdeas && (
          ideas.length === 0 ? (
            <Card style={{ marginTop: 10 }}>
              <div style={{ textAlign: "center", padding: isMobile ? 24 : 40, color: "#6B7794", fontSize: 13 }}>
                Sin ideas para esta audiencia todavía — cuando haya más ventas, aparecen acá.
              </div>
            </Card>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(340px, 1fr))",
              gap: 12, marginTop: 10,
            }}>
              {ideas.map(idea => (
                <IdeaCard key={idea.id} idea={idea} onClick={() => onOpenIdea(idea)} />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ============================================================================
// IDEA CARD
// ============================================================================

function IdeaCard({ idea, onClick }) {
  const color = CATEGORY_COLORS[idea.category] || "#1E2B4A";

  return (
    <button
      onClick={onClick}
      style={{
        background: "#FFFFFF", border: `1px solid ${color}40`, borderRadius: 14,
        overflow: "hidden", display: "flex", flexDirection: "column",
        cursor: "pointer", fontFamily: "inherit", textAlign: "left", padding: 0,
        transition: "all 0.15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 6px 18px ${color}25`; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}
    >
      <div style={{ height: 3, background: color }} />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 18 }}>{idea.icon}</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#1E2B4A" }}>{idea.title}</span>
        </div>
        <div style={{ fontSize: 12, color: "#6B7794", lineHeight: 1.5, marginBottom: 10, flex: 1 }}>
          {idea.reason}
        </div>

        {/* Impact metrics inline */}
        <ImpactRow idea={idea} />

        <div style={{
          marginTop: 10, padding: "8px 12px", background: "#F8F2E7", borderRadius: 8,
          fontSize: 12, color: "#1E2B4A", fontWeight: 700, textAlign: "center",
          border: "1px dashed #E5DAC2",
        }}>
          Ver mensaje y enviar →
        </div>
      </div>
    </button>
  );
}

function ImpactRow({ idea: rawIdea }) {
  // Defense: si una idea futura llega sin impact, no rompe el render.
  const idea = { ...rawIdea, impact: rawIdea.impact || {} };
  const wrap = {
    display: "flex", gap: 12, flexWrap: "wrap",
    padding: "8px 10px", background: "#F8F2E7", borderRadius: 8, border: "1px solid #EFE5CE",
  };
  const hasContent = ["liquidar","reactivar","crosssell","topseller","stocklist","packfiesta","recordatorio","drop","mix","combomarca","dupla","comboamigos"].includes(idea.category);
  if (!hasContent) return null;
  return (
    <div style={wrap}>
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
          <Impact label="Descuento sug." value={`-${idea.suggestedDiscountPct}%`} color="#5B3592" />
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
          <Impact label="Margen ahora" value={`${idea.impact.currentMarginPct}%`} color="#0F6B5C" />
          <Impact label="Tras promo" value={`${idea.impact.marginAfterPct}%`} color={idea.impact.marginAfterPct >= 25 ? "#0F6B5C" : "#CB912F"} />
          <Impact label="Descuento" value={`-${idea.suggestedDiscountPct}%`} color="#1E2B4A" />
        </>
      )}
      {idea.category === "stocklist" && (
        <>
          <Impact label="Productos" value={`${idea.impact.productsListed}`} color="#1E2B4A" />
          <Impact label="Unidades" value={`${idea.impact.totalUnits}`} color="#0F6B5C" />
          <Impact label="Valor stock" value={formatMoney(idea.impact.potentialARS)} color="#2383E2" />
        </>
      )}
      {idea.category === "packfiesta" && (
        <>
          <Impact label="Pack" value={formatMoney(idea.impact.comboPriceARS)} color="#D4691C" />
          <Impact label="Ahorro" value={formatMoney(idea.impact.savingARS)} color="#0F6B5C" />
          <Impact label="Margen pack" value={`${idea.impact.marginPct}%`} color={idea.impact.marginPct >= 20 ? "#0F6B5C" : "#CB912F"} />
        </>
      )}
      {idea.category === "recordatorio" && (
        <Impact label="Productos destacados" value={`${idea.impact.productsShown}`} color="#6B7794" />
      )}
      {idea.category === "drop" && (
        <Impact label="Sabores nuevos" value={`${idea.impact.newProducts}`} color="#0F6B5C" />
      )}
      {idea.category === "mix" && (
        <>
          <Impact label="Sabores en la promo" value={`${idea.impact.productCount}`} color="#2383E2" />
          <Impact label="Desc. efectivo" value={`-${idea.impact.effectiveDiscount}%`} color="#2383E2" />
          <Impact label="Empuja" value="x3 ticket" color="#0F6B5C" />
        </>
      )}
      {idea.category === "combomarca" && (
        <>
          <Impact label="Marca" value={idea.impact.brand || "—"} color="#0F6B5C" />
          <Impact label="Combo" value={formatMoney(idea.impact.comboPriceARS)} color="#0F6B5C" />
          <Impact label="Ahorro" value={formatMoney(idea.impact.savingARS)} color="#2383E2" />
        </>
      )}
      {idea.category === "comboamigos" && (
        <>
          <Impact label="Sabores incluidos" value={`${idea.impact.productCount}`} color="#5B3592" />
          <Impact label="Desc. máx" value={`-${idea.impact.effectiveDiscount}%`} color="#5B3592" />
          <Impact label="Trae" value="clientes nuevos" color="#0F6B5C" />
        </>
      )}
      {idea.category === "dupla" && (
        <>
          <Impact label="Sabores incluidos" value={`${idea.impact.productCount}`} color="#D4691C" />
          <Impact label="Desc. efectivo" value={`-${idea.impact.effectiveDiscount}%`} color="#D4691C" />
          <Impact label="Empuja" value="x2 ticket" color="#0F6B5C" />
        </>
      )}
    </div>
  );
}

// ============================================================================
// VISTA SEMANA
// ============================================================================

function WeekView({ week, ideas, onOpenIdea, onPickAudience, isMobile }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: "#6B7794", marginBottom: 12 }}>
        Plan sugerido de la semana. El sistema te dice qué mandar cada día para mantenerte
        visible sin saturar a tus clientes. Tocá un día para enfocarte ahí.
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
        gap: 10,
      }}>
        {week.map(d => (
          <Card key={d.dow} style={{
            border: d.isToday ? "2px solid #1E2B4A" : "1px solid #E5DAC2",
            opacity: d.isPast ? 0.55 : 1,
            background: d.isToday ? "#F8F2E7" : "#FFFFFF",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#1E2B4A" }}>
                  {d.dayName}
                  {d.isToday && <span style={{ marginLeft: 8, fontSize: 10, background: "#1E2B4A", color: "#F8F2E7", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>HOY</span>}
                </div>
                <div style={{ fontSize: 11, color: "#9AA2B3" }}>
                  {d.date.toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                </div>
              </div>
            </div>
            {d.suggestions.length === 0 ? (
              <div style={{ fontSize: 12, color: "#9AA2B3", fontStyle: "italic" }}>Sin sugerencias</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {d.suggestions.map((sug, i) => {
                  const matchingIdea = ideas.find(idea => idea.offerType === sug.type || idea.category === sug.type);
                  const aud = AUDIENCES[sug.audience];
                  return (
                    <div key={i} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      gap: 8, padding: "8px 10px", background: "#F8F2E7", borderRadius: 8,
                      border: "1px solid #EFE5CE",
                    }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#1E2B4A" }}>
                          <span style={{ marginRight: 4 }}>{aud?.icon}</span>
                          {TYPES.find(t => t.key === sug.type)?.label || sug.type}
                        </div>
                        <div style={{ fontSize: 11, color: "#6B7794", marginTop: 1 }}>{sug.reason}</div>
                      </div>
                      {matchingIdea && !d.isPast && (
                        <button onClick={() => { onPickAudience(sug.audience); onOpenIdea(matchingIdea); }} style={{
                          background: "#1E2B4A", color: "#F8F2E7", border: "none",
                          padding: "6px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                          cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
                        }}>Ver</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MODAL PREVIEW DE IDEA
// ============================================================================

function IdeaPreviewModal({ idea, audience, clients, exchangeRate, onClose, onEditManual, isMobile, logAudit, auditLog = [] }) {
  const audienceConfig = getAudience(audience);
  const needsClient = audienceConfig.needsClient;
  const [selectedClientId, setSelectedClientId] = useState(idea.clientId || "");
  const [copied, setCopied] = useState(false);

  // Anti-saturación: chequea cuántos mensajes ya mandó a este destinatario
  // y avisa si estaría saturando. NO bloquea — Diego decide.
  const cooldown = useMemo(() => {
    const effClientId = selectedClientId || idea.clientId || null;
    return checkCooldown(auditLog, { audience, clientId: effClientId, now: new Date() });
  }, [auditLog, audience, selectedClientId, idea.clientId]);

  // Cliente seleccionado para individual
  const selectedClient = useMemo(
    () => clients.find(c => c.id === selectedClientId),
    [clients, selectedClientId]
  );

  // Ctx para el tono del mensaje
  const ctx = useMemo(() => ({
    clientName: needsClient ? (selectedClient?.name || idea.clientName || "") : "",
    weekend: isWeekend(),
  }), [needsClient, selectedClient, idea.clientName]);

  // Construye el offer object desde la idea
  const offer = useMemo(() => ({
    type: idea.offerType,
    title: undefined, // usar default por tipo
    products: idea.products || [],
    comboQty: idea.comboQty || 3,
    comboPriceARS: idea.comboPriceARS || 0,
    discountPct: idea.suggestedDiscountPct || 0,
  }), [idea]);

  const message = useMemo(
    () => buildOfferMessage(offer, exchangeRate, { audience, ctx }),
    [offer, exchangeRate, audience, ctx]
  );

  // Registra en audit log que mandamos una oferta. Esto deja trazabilidad
  // para después poder ver "qué oferta llevó a qué venta".
  const logOfferSent = (method) => {
    if (!logAudit) return;
    const target = audienceConfig.needsClient
      ? (selectedClient?.name || idea.clientName || "—")
      : audienceConfig.label;
    logAudit("create", "offer", `${idea.id}-${Date.now()}`, `Envió oferta "${idea.title}" a ${target} vía ${method}`, {
      audience,
      ideaCategory: idea.category,
      offerType: idea.offerType,
      method,
      clientId: selectedClientId || idea.clientId || null,
      productIds: (idea.products || []).map(x => x.product?.id).filter(Boolean),
      suggestedDiscountPct: idea.suggestedDiscountPct || 0,
    });
  };

  // Acciones
  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(message.full);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      logOfferSent("copia");
    } catch {
      prompt("Copiá esto:", message.full);
    }
  };

  const openWhatsApp = () => {
    const phone = selectedClient?.phone || idea.clientPhone || "";
    window.open(whatsappLink(message.full, phone), "_blank");
    logOfferSent("whatsapp");
  };

  const shareNative = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text: message.full });
        logOfferSent("share");
      } catch {/* user cancelled */}
    } else {
      copyText();
    }
  };

  // Genera imagen 1080×1920 con productos de la idea y la descarga.
  // Útil para subirla como Story de Instagram / Estado de WhatsApp.
  const [generatingImage, setGeneratingImage] = useState(false);
  const downloadStoryImage = async () => {
    setGeneratingImage(true);
    try {
      const prods = (idea.products || []).map(x => x.product).filter(Boolean);
      const blob = await generateStoryImage(prods, {
        title: idea.title || "Stock disponible",
        headline: idea.reason || "",
        exchangeRate,
      });
      if (blob) {
        const date = new Date().toISOString().slice(0, 10);
        downloadBlob(blob, `izn-${idea.category || "stories"}-${date}.png`);
        logOfferSent("imagen_stories");
      }
    } finally {
      setGeneratingImage(false);
    }
  };

  const color = CATEGORY_COLORS[idea.category] || "#1E2B4A";

  return (
    <Modal open={true} onClose={onClose} title={`${audienceConfig.icon} ${audienceConfig.label}`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Aviso anti-saturación si aplica (no bloquea, solo avisa) */}
        {cooldown.warning && (
          <div style={{
            padding: "10px 12px",
            background: cooldown.ok ? "#FDECC8" : "#FBE4E4",
            border: `1px solid ${cooldown.ok ? "#F2D59A" : "#F1B8B6"}`,
            borderRadius: 10,
            fontSize: 12,
            color: cooldown.ok ? "#8B6A1E" : "#9C2A2A",
            fontWeight: 600,
            lineHeight: 1.4,
          }}>{cooldown.warning}</div>
        )}

        {/* Encabezado idea */}
        <div style={{
          padding: "10px 12px", background: `${color}12`, border: `1px solid ${color}30`,
          borderRadius: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 18 }}>{idea.icon}</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#1E2B4A" }}>{idea.title}</span>
          </div>
          <div style={{ fontSize: 12, color: "#6B7794", lineHeight: 1.5 }}>{idea.reason}</div>
        </div>

        {/* Selector de cliente (solo para individual) */}
        {needsClient && (
          <div>
            <div style={{ fontSize: 11, color: "#6B7794", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
              Cliente
            </div>
            <select
              value={selectedClientId}
              onChange={e => setSelectedClientId(e.target.value)}
              style={{
                width: "100%", padding: "10px 12px", minHeight: 44,
                background: "#F8F2E7", border: "1px solid #E5DAC2", borderRadius: 10,
                color: "#1E2B4A", fontSize: 16, outline: "none", fontFamily: "inherit",
              }}
            >
              <option value="">— elegí cliente —</option>
              {clients.filter(c => !c.isDeleted)
                .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                .map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.phone ? ` · ${c.phone}` : ""}
                  </option>
                ))}
            </select>
            {selectedClient && !selectedClient.phone && (
              <div style={{ fontSize: 11, color: "#CB912F", marginTop: 6 }}>
                ⚠️ Este cliente no tiene teléfono cargado. Podés copiar y mandar manualmente.
              </div>
            )}
          </div>
        )}

        {/* Métricas económicas */}
        <div style={{ background: "#FFFFFF", border: "1px solid #E5DAC2", borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 11, color: "#6B7794", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>
            📊 Impacto económico
          </div>
          <ImpactRow idea={idea} />
        </div>

        {/* Preview WhatsApp */}
        <div>
          <div style={{ fontSize: 11, color: "#6B7794", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
            Vista previa
          </div>
          <div style={{
            background: "#DCF8C6", borderRadius: 12, padding: 14,
            whiteSpace: "pre-wrap", fontSize: 13, color: "#1E2B4A", lineHeight: 1.5,
            fontFamily: "'Segoe UI', sans-serif",
            border: "1px solid #B6E0A0", maxHeight: 320, overflowY: "auto",
          }}>
            {message.full}
          </div>
        </div>

        {/* Acciones */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 8 }}>
          <Btn onClick={copyText}>{copied ? "✓ Copiado" : "📋 Copiar"}</Btn>
          <Btn variant="success" onClick={openWhatsApp}>📲 WhatsApp</Btn>
          {navigator.share && (
            <Btn onClick={shareNative} style={{ gridColumn: isMobile ? "span 2" : "auto" }}>📤 Compartir</Btn>
          )}
        </div>

        {/* Imagen para Stories (Instagram / Estado de WhatsApp) */}
        {(idea.products || []).length > 0 && (
          <button onClick={downloadStoryImage} disabled={generatingImage} style={{
            width: "100%", padding: "10px 14px", minHeight: 44,
            background: "transparent", border: "1px solid #E5DAC2",
            borderRadius: 10, color: "#1E2B4A", fontSize: 13, fontWeight: 700,
            cursor: generatingImage ? "wait" : "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            {generatingImage ? "Generando…" : "📸 Descargar imagen para Stories"}
          </button>
        )}

        <button onClick={() => onEditManual(idea)} style={{
          background: "transparent", border: "1px dashed #E5DAC2",
          padding: "8px 12px", borderRadius: 8, color: "#6B7794", fontSize: 12,
          cursor: "pointer", fontFamily: "inherit",
        }}>
          ✏️ Ajustar a mano antes de mandar
        </button>
      </div>
    </Modal>
  );
}

// ============================================================================
// VISTA MANUAL (con audiencia activa para tono)
// ============================================================================

function ManualView({
  isMobile, type, setType, title, setTitle, comboQty, setComboQty,
  comboPrice, setComboPrice, discountPct, setDiscountPct, search, setSearch,
  filtered, selectedIds, toggle, manualOffer, audience, clients, exchangeRate,
}) {
  const [storiesMode, setStoriesMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [phone, setPhone] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");

  const audienceConfig = getAudience(audience);
  const selectedClient = clients.find(c => c.id === selectedClientId);
  const effectivePhone = selectedClient?.phone || phone;

  const ctx = { clientName: selectedClient?.name || "", weekend: isWeekend() };
  const message = useMemo(
    () => buildOfferMessage(manualOffer, exchangeRate, { audience, ctx }),
    [manualOffer, exchangeRate, audience, selectedClient, ctx]
  );
  const text = storiesMode ? message.stories : message.full;

  const copyText = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { prompt("Copiá esto:", text); }
  };
  const sendWA = () => window.open(whatsappLink(text, effectivePhone), "_blank");

  return (
    <div>
      <div style={{ fontSize: 12, color: "#6B7794", marginBottom: 10 }}>
        Tono actual: <strong>{audienceConfig.icon} {audienceConfig.label}</strong> · cambiá la audiencia arriba para cambiar el tono.
      </div>

      {/* Tipo de oferta */}
      <div style={{
        display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
        gap: 6, marginBottom: 16,
      }}>
        {TYPES.map(t => (
          <button key={t.key} onClick={() => setType(t.key)} style={{
            padding: "10px 12px",
            background: type === t.key ? "#1E2B4A" : "#FFFFFF",
            color: type === t.key ? "#F8F2E7" : "#1E2B4A",
            border: `1px solid ${type === t.key ? "#1E2B4A" : "#E5DAC2"}`,
            borderRadius: 10, fontSize: 12, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit", textAlign: "left",
          }}>
            <div>{t.label}</div>
            <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 500, marginTop: 2 }}>{t.desc}</div>
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        {/* Columna izquierda */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card>
            <Label>Encabezado (opcional)</Label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: 🔥 OFERTA FINDE" style={inputStyle(isMobile)} />

            {(type === "combo" || type === "packfiesta") && (
              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <div style={{ flex: 1 }}>
                  <Label>Cantidad</Label>
                  <input type="number" min={2} value={comboQty} onChange={e => setComboQty(e.target.value)} style={inputStyle(isMobile)} />
                </div>
                <div style={{ flex: 1 }}>
                  <Label>Precio combo ($)</Label>
                  <input type="number" value={comboPrice} onChange={e => setComboPrice(e.target.value)} placeholder="75000" style={inputStyle(isMobile)} />
                </div>
              </div>
            )}

            {(type === "liquidacion" || type === "descuento") && (
              <div style={{ marginTop: 10 }}>
                <Label>Descuento %</Label>
                <input type="number" min={0} max={90} value={discountPct} onChange={e => setDiscountPct(e.target.value)} style={inputStyle(isMobile)} />
                <DiscountGuard discountPct={Number(discountPct) || 0} selectedProducts={manualOffer.products.map(x => x.product)} />
              </div>
            )}
          </Card>

          {/* Selector cliente solo si audience=individual */}
          {audienceConfig.needsClient && (
            <Card>
              <Label>Cliente (para personalizar)</Label>
              <select
                value={selectedClientId}
                onChange={e => setSelectedClientId(e.target.value)}
                style={{ ...inputStyle(isMobile), padding: isMobile ? "10px 12px" : "10px 12px" }}
              >
                <option value="">— sin cliente específico —</option>
                {clients.filter(c => !c.isDeleted).sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                  .map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
              </select>
            </Card>
          )}

          <Card>
            <Label>Productos {selectedIds.length > 0 && `(${selectedIds.length})`}</Label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar..." style={{ ...inputStyle(isMobile), marginBottom: 8 }} />
            <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {filtered.map(p => {
                const sel = selectedIds.includes(p.id);
                const regular = productPriceARS(p, exchangeRate);
                const showDisc = (type === "liquidacion" || type === "descuento") && discountPct > 0;
                return (
                  <div key={p.id} onClick={() => toggle(p.id)} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                    padding: "8px 10px", minHeight: 44,
                    borderRadius: 8, cursor: "pointer",
                    background: sel ? "#E8EBF2" : "#F8F2E7",
                    border: `1px solid ${sel ? "#C5CADE" : "#EFE5CE"}`,
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
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
              border: "1px solid #B6E0A0", maxHeight: 360, overflowY: "auto",
            }}>
              {text || "Elegí productos para ver el mensaje..."}
            </div>

            {!audienceConfig.needsClient && (
              <div style={{ marginTop: 12 }}>
                <Label>Teléfono (opcional, para abrir wa.me)</Label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+54 9 11 ..." style={inputStyle(isMobile)} />
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <Btn onClick={copyText} style={{ flex: 1 }}>{copied ? "✓ Copiado" : "📋 Copiar"}</Btn>
              <Btn variant="success" onClick={sendWA} style={{ flex: 1 }}>📲 WhatsApp</Btn>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

// ============================================================================
// VISTA HISTORIAL — ofertas mandadas + conversión
// ============================================================================

function HistoryView({ auditLog, sales, clients, products, isMobile }) {
  const offers = useMemo(() => extractOffersFromAuditLog(auditLog), [auditLog]);
  const linked = useMemo(() => linkSalesToOffers(offers, sales), [offers, sales]);
  const stats = useMemo(() => calcConversionStats(offers, sales), [offers, sales]);

  const clientById = useMemo(() => new Map((clients || []).map(c => [c.id, c])), [clients]);
  const productById = useMemo(() => new Map((products || []).map(p => [p.id, p])), [products]);

  if (offers.length === 0) {
    return (
      <Card>
        <div style={{ textAlign: "center", padding: isMobile ? 28 : 48, color: "#6B7794" }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>📜</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1E2B4A", marginBottom: 6 }}>
            Todavía no mandaste ofertas
          </div>
          <div style={{ fontSize: 13, maxWidth: 460, margin: "0 auto" }}>
            Cuando empieces a usar las ideas y copies/mandes mensajes, todo el historial va a aparecer acá.
            Vas a poder ver qué tipo de oferta te convierte más.
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div>
      {/* Stats overall */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
        gap: 10, marginBottom: 14,
      }}>
        <StatBox label="Ofertas mandadas" value={stats.totalSent} icon="📨" color="#1E2B4A" />
        <StatBox label="Con venta" value={stats.totalWithSale} icon="🎯" color="#0F6B5C" />
        <StatBox label="Conversión total" value={`${stats.overallConversion}%`} icon="📈" color={stats.overallConversion >= 25 ? "#0F6B5C" : "#CB912F"} />
        <StatBox label="Último envío" value={formatRelative(offers[0]?.timestamp)} icon="⏱️" color="#6B7794" />
      </div>

      {/* Conversion por categoría */}
      {Object.keys(stats.byCategory).length > 0 && (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1E2B4A", marginBottom: 10 }}>
            🏷️ Conversión por tipo de oferta
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {Object.entries(stats.byCategory)
              .sort((a, b) => b[1].sent - a[1].sent)
              .map(([cat, s]) => {
                const color = CATEGORY_COLORS[cat] || "#1E2B4A";
                return (
                  <div key={cat} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "6px 10px",
                    background: "#F8F2E7", borderRadius: 8, border: `1px solid ${color}33`,
                  }}>
                    <span style={{
                      fontSize: 11, fontWeight: 800, color, minWidth: 90,
                      textTransform: "uppercase",
                    }}>{cat}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ height: 6, background: "#EFE5CE", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{
                          height: "100%", width: `${s.conversion}%`, background: color,
                        }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color, minWidth: 90, textAlign: "right" }}>
                      {s.withSale}/{s.sent} ({s.conversion}%)
                    </span>
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      {/* Conversion por audiencia */}
      {Object.keys(stats.byAudience).length > 0 && (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1E2B4A", marginBottom: 10 }}>
            🎯 Conversión por audiencia
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {Object.entries(stats.byAudience)
              .sort((a, b) => b[1].sent - a[1].sent)
              .map(([audKey, s]) => {
                const aud = AUDIENCES[audKey];
                return (
                  <div key={audKey} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "6px 10px",
                    background: "#F8F2E7", borderRadius: 8, border: "1px solid #EFE5CE",
                  }}>
                    <span style={{ fontSize: 16 }}>{aud?.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#1E2B4A", minWidth: isMobile ? 0 : 140, flex: isMobile ? 1 : "none" }}>
                      {aud?.label || audKey}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ height: 6, background: "#EFE5CE", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{
                          height: "100%", width: `${s.conversion}%`,
                          background: s.conversion >= 25 ? "#0F6B5C" : "#CB912F",
                        }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#1E2B4A", minWidth: 90, textAlign: "right" }}>
                      {s.withSale}/{s.sent} ({s.conversion}%)
                    </span>
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      {/* Lista de ofertas mandadas */}
      <div style={{ fontSize: 13, fontWeight: 800, color: "#1E2B4A", marginBottom: 8 }}>
        📨 Últimas ofertas ({offers.length})
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {linked.slice(0, 50).map(({ offer, salesExplicit, salesImplicit }) => {
          const color = CATEGORY_COLORS[offer.category] || "#1E2B4A";
          const aud = AUDIENCES[offer.audience];
          const target = offer.clientId
            ? (clientById.get(offer.clientId)?.name || "—")
            : (aud?.label || "—");
          const allLinked = [...salesExplicit, ...salesImplicit];
          const hasSale = allLinked.length > 0;
          return (
            <div key={offer.id} style={{
              background: "#FFFFFF", border: `1px solid ${hasSale ? "#0F6B5C" : "#E5DAC2"}`,
              borderRadius: 10, padding: "10px 12px",
              borderLeft: `3px solid ${color}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: 0.3 }}>
                      {offer.category || offer.offerType}
                    </span>
                    <span style={{ fontSize: 11, color: "#6B7794" }}>
                      {aud?.icon} {target}
                    </span>
                    <span style={{
                      fontSize: 10, padding: "2px 6px", background: "#F8F2E7", borderRadius: 4,
                      color: "#6B7794", fontWeight: 600,
                    }}>vía {offer.method}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#1E2B4A", marginTop: 3, lineHeight: 1.4 }}>
                    {offer.description}
                  </div>
                  {offer.productIds.length > 0 && (
                    <div style={{ fontSize: 11, color: "#9AA2B3", marginTop: 4 }}>
                      {offer.productIds.length} producto{offer.productIds.length === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: "#6B7794" }}>{formatRelative(offer.timestamp)}</div>
                  {hasSale ? (
                    <div style={{
                      marginTop: 6, fontSize: 11, fontWeight: 800, color: "#0F6B5C",
                      padding: "3px 8px", background: "#DDEDEA", borderRadius: 12,
                      border: "1px solid #B6D4CC",
                    }}>
                      ✓ {allLinked.length} venta{allLinked.length === 1 ? "" : "s"}
                      {salesImplicit.length > 0 && salesExplicit.length === 0 && (
                        <span style={{ fontWeight: 500, marginLeft: 4 }}>(sugerida)</span>
                      )}
                    </div>
                  ) : (
                    <div style={{
                      marginTop: 6, fontSize: 11, color: "#9AA2B3",
                      padding: "3px 8px", background: "#F8F2E7", borderRadius: 12,
                    }}>
                      sin venta aún
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {linked.length > 50 && (
        <div style={{ textAlign: "center", padding: 12, color: "#9AA2B3", fontSize: 12 }}>
          Mostrando 50 de {linked.length}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, icon, color }) {
  return (
    <div style={{
      background: "#FFFFFF", border: "1px solid #E5DAC2", borderRadius: 10,
      padding: "10px 12px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span style={{ fontSize: 10, color: "#6B7794", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function formatRelative(timestamp) {
  if (!timestamp) return "—";
  const now = Date.now();
  const ms = new Date(timestamp).getTime();
  if (!Number.isFinite(ms)) return "—";
  const diff = (now - ms) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 7) return `hace ${Math.floor(diff / 86400)}d`;
  return new Date(timestamp).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

// Avisa al usuario si el descuento manual baja del margen mínimo (15%).
// Calcula el peor caso (producto con menor margen) y compara.
function DiscountGuard({ discountPct, selectedProducts }) {
  const issues = useMemo(() => {
    if (!selectedProducts || selectedProducts.length === 0 || discountPct <= 0) return [];
    return selectedProducts
      .map(p => {
        const guard = maxDiscountForMargin(p, 15);
        if (!guard) return null;
        if (discountPct <= guard.maxDiscountPct) return null;
        return {
          product: p,
          maxAllowed: guard.maxDiscountPct,
          currentMargin: guard.currentMarginPct,
        };
      })
      .filter(Boolean);
  }, [selectedProducts, discountPct]);

  if (issues.length === 0) return null;

  return (
    <div style={{
      marginTop: 8, padding: "8px 10px",
      background: "#FBE4E4", border: "1px solid #F1B8B6", borderRadius: 8,
      fontSize: 11, color: "#9C2A2A",
    }}>
      <div style={{ fontWeight: 800, marginBottom: 4 }}>⚠️ El descuento es muy agresivo</div>
      <div style={{ lineHeight: 1.4 }}>
        Estás bajando del margen mínimo (15%) en <strong>{issues.length}</strong> producto{issues.length === 1 ? "" : "s"}.
        Bajá a -{Math.floor(Math.min(...issues.map(x => x.maxAllowed)))}% para mantener margen sano.
      </div>
    </div>
  );
}

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

function inputStyle(isMobile) {
  return {
    width: "100%", padding: isMobile ? "12px 14px" : "10px 12px",
    minHeight: isMobile ? 44 : "auto",
    background: "#F8F2E7", border: "1px solid #E5DAC2", borderRadius: 10, color: "#1E2B4A",
    fontSize: isMobile ? 16 : 14,
    outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  };
}

// ============================================================================
// PUBLIC CATALOG GENERATOR — botón "Generar link público"
// ============================================================================

function PublicCatalogGenerator({ products = [], exchangeRate = 1 }) {
  const [generated, setGenerated] = useState(null);
  const [copied, setCopied] = useState(false);
  const [promoNote, setPromoNote] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(14);

  const generate = () => {
    const snap = createCatalogSnapshot({
      products,
      exchangeRate,
      promoNote: promoNote.trim() || null,
      expiresInDays: Number(expiresInDays) || 14,
    });
    const url = encodeCatalogToURL(snap);
    const shareMsg = catalogShareMessage(snap, url);
    setGenerated({ snap, url, shareMsg });
    setCopied(false);
  };

  const copyShareMsg = async () => {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated.shareMsg);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      prompt("Copiá este mensaje:", generated.shareMsg);
    }
  };

  const openLink = () => {
    if (generated) window.open(generated.url, "_blank", "noopener");
  };

  return (
    <Card style={{ marginBottom: 14, background: "linear-gradient(135deg, #1E2B4A 0%, #2D3D63 100%)", color: "#F8F2E7", border: "none" }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>
        🌐 Catálogo público compartible
      </div>
      <div style={{ fontSize: 12, opacity: 0.78, marginBottom: 14, lineHeight: 1.5 }}>
        Generá un link tipo <code style={{ background: "rgba(248,242,231,0.15)", padding: "1px 6px", borderRadius: 4 }}>/c/junio-x4k2</code>{" "}
        que tus clientes abren y ven tu stock con precios + botón "Pedir por WhatsApp" pre-armado.
      </div>

      {!generated ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            value={promoNote}
            onChange={e => setPromoNote(e.target.value)}
            placeholder="Mensaje promocional (opcional, ej: '🎁 Envío gratis esta semana')"
            style={{
              padding: "12px", background: "rgba(248,242,231,0.10)", minHeight: 44, boxSizing: "border-box",
              border: "1px solid rgba(248,242,231,0.2)", borderRadius: 8,
              fontSize: 16, color: "#F8F2E7", outline: "none", fontFamily: "inherit",
            }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, opacity: 0.78 }}>Expira en</span>
            <input type="number" min={1} max={60} value={expiresInDays}
              onChange={e => setExpiresInDays(e.target.value)}
              style={{
                width: 64, padding: "8px", background: "rgba(248,242,231,0.10)", minHeight: 44, boxSizing: "border-box",
                border: "1px solid rgba(248,242,231,0.2)", borderRadius: 8,
                color: "#F8F2E7", fontSize: 16, outline: "none", textAlign: "center",
              }} />
            <span style={{ fontSize: 12, opacity: 0.78 }}>días</span>
          </div>
          <button onClick={generate} style={{
            padding: "12px 18px", minHeight: 48,
            background: "#F8F2E7", color: "#1E2B4A", border: "none",
            borderRadius: 10, fontSize: 14, fontWeight: 800,
            cursor: "pointer", fontFamily: "inherit",
          }}>🔗 Generar link público</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{
            padding: "10px 12px", background: "rgba(248,242,231,0.10)",
            border: "1px solid rgba(248,242,231,0.2)", borderRadius: 8,
            fontSize: 12, fontFamily: "monospace", wordBreak: "break-all",
            maxHeight: 80, overflowY: "auto",
          }}>{generated.url}</div>
          <div style={{ fontSize: 11, opacity: 0.78 }}>
            Incluye {generated.snap.items.length} productos · {generated.snap.stats.totalUnits} unidades · expira el{" "}
            {new Date(generated.snap.expiresAt).toLocaleDateString("es-AR")}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
            <button onClick={copyShareMsg} style={btnStyle("#F8F2E7", "#1E2B4A")}>
              {copied ? "✓ Copiado" : "📋 Copiar mensaje"}
            </button>
            <button onClick={openLink} style={btnStyle("transparent", "#F8F2E7", "1px solid rgba(248,242,231,0.3)")}>
              👁 Ver
            </button>
            <button onClick={() => setGenerated(null)} style={btnStyle("transparent", "#F8F2E7", "1px solid rgba(248,242,231,0.3)")}>
              ↺ Otro
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function btnStyle(bg, color, border = "none") {
  return {
    padding: "10px 14px", minHeight: 44, background: bg, color, border,
    borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
    fontFamily: "inherit", whiteSpace: "nowrap",
  };
}
