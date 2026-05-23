import { useState, useMemo } from "react";
import { useResponsive } from "../../App.jsx";
import { Card, Btn } from "../UI.jsx";
import { formatMoney } from "../../helpers.js";
import { SupplierBadge } from "../supplier/Sparkline.jsx";
import {
  recommendPurchases,
  buildPurchaseFromRecommendation,
} from "../../lib/purchaseRecommendations.js";

// Panel "💡 Pedidos Recomendados" — analiza supplierLists + velocity + stock
// y sugiere proactivamente N pedidos óptimos.
//
// Visualmente: card colapsable con cards por proveedor, c/u con sus items,
// ahorro vs alternativa, totales, y botón "Crear Pedido".
//
// Si no hay supplierLists todavía, muestra empty state amigable que invita
// a cargar listas en el Monitor.
export function RecommendedOrdersPanel({
  products,
  sales,
  purchases,
  supplierLists,
  supplierProfiles,
  exchangeRate,
  onCreatePurchase,
}) {
  const { isMobile } = useResponsive();
  const [expanded, setExpanded] = useState(true);
  const [expandedSupplier, setExpandedSupplier] = useState(null);
  const [leadDays, setLeadDays] = useState(30);
  const [coverDays, setCoverDays] = useState(30);

  const recommendations = useMemo(
    () => recommendPurchases({
      products, sales, purchases,
      supplierLists, supplierProfiles, exchangeRate,
      options: { leadTimeDays: leadDays, coverDays, safetyDays: 7 },
    }),
    [products, sales, purchases, supplierLists, supplierProfiles, exchangeRate, leadDays, coverDays]
  );

  const totalRecoUSDT = recommendations.reduce((s, r) => s + r.totalUSDT, 0);
  const totalSavings = recommendations.reduce((s, r) => s + r.totalSavingsVsAlt, 0);
  const totalItems = recommendations.reduce((s, r) => s + r.totalItems, 0);

  const handleCreate = (reco) => {
    const purchase = buildPurchaseFromRecommendation(reco, exchangeRate);
    onCreatePurchase?.(purchase);
  };

  const handleCreateAll = () => {
    if (!confirm(
      `Crear ${recommendations.length} pedidos óptimos?\n\n` +
      `${totalItems} unidades · USDT ${totalRecoUSDT.toFixed(0)}\n` +
      `Ahorro estimado vs alternativas: USDT ${totalSavings.toFixed(0)}`
    )) return;
    recommendations.forEach(r => {
      const purchase = buildPurchaseFromRecommendation(r, exchangeRate);
      onCreatePurchase?.(purchase);
    });
  };

  // Empty state: no hay listas cargadas → invitar a cargar
  if (!supplierLists || supplierLists.filter(l => !l?.isDeleted).length === 0) {
    return (
      <Card style={{
        marginBottom: 16,
        background: "linear-gradient(135deg, #F1E9D6 0%, #FFFFFF 100%)",
        border: "1px solid #E5DAC2",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 36, lineHeight: 1, flexShrink: 0 }}>💡</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#1E2B4A", marginBottom: 4 }}>
              Pedidos Recomendados
            </div>
            <div style={{ fontSize: 12, color: "#6B7794", lineHeight: 1.5 }}>
              Cuando proceses listas de proveedores en el Monitor, el sistema te va a sugerir
              automáticamente qué pedirle a cada uno basándose en velocity y stock crítico.
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // Hay datos pero sin recomendaciones (todo en stock, sin urgencia)
  if (recommendations.length === 0) {
    return (
      <Card style={{
        marginBottom: 16,
        background: "linear-gradient(135deg, #D9E8E4 0%, #FFFFFF 100%)",
        border: "1px solid #A8C8BE",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 36, lineHeight: 1, flexShrink: 0 }}>✅</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#0F6B5C", marginBottom: 4 }}>
              Stock cubierto — no hay recomendaciones urgentes
            </div>
            <div style={{ fontSize: 12, color: "#3A4868" }}>
              Todos los productos con demanda activa tienen stock suficiente para los próximos {leadDays + coverDays + 7} días, o ya están en pedidos pendientes.
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card style={{
      marginBottom: 16,
      background: "linear-gradient(135deg, #EEF0FC 0%, #FFFFFF 100%)",
      border: "1px solid #C5CADE",
      padding: 0,
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: isMobile ? "14px 16px" : "16px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", gap: 10, flexWrap: "wrap",
          borderBottom: expanded ? "1px solid #E5DAC2" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 24, lineHeight: 1 }}>💡</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#1E2B4A", letterSpacing: "-0.2px" }}>
              Pedidos Recomendados
            </div>
            <div style={{ fontSize: 11, color: "#6B7794", marginTop: 2 }}>
              {recommendations.length} {recommendations.length === 1 ? "proveedor" : "proveedores"} · {totalItems}u · USDT {totalRecoUSDT.toFixed(0)}
              {totalSavings > 0 && <> · <strong style={{ color: "#0F6B5C" }}>ahorro USDT {totalSavings.toFixed(0)}</strong></>}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {expanded && (
            <Btn onClick={(e) => { e.stopPropagation(); handleCreateAll(); }}>
              ✨ Crear {recommendations.length} pedidos
            </Btn>
          )}
          <span style={{ fontSize: 16, color: "#6B7794" }}>{expanded ? "▾" : "▸"}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: isMobile ? "12px 14px 14px" : "14px 20px 18px" }}>
          {/* Lead/cover controls */}
          <div style={{
            display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap",
            padding: "8px 12px",
            background: "#FFFFFF", borderRadius: 8, border: "1px solid #E5DAC2",
            alignItems: "center",
          }}>
            <span style={{ fontSize: 11, color: "#6B7794", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>
              Horizonte:
            </span>
            <label style={{ fontSize: 12, color: "#3A4868", display: "flex", alignItems: "center", gap: 5 }}>
              Lead
              <input
                type="number" min={1} max={120}
                value={leadDays}
                onChange={e => setLeadDays(Math.max(1, Number(e.target.value) || 30))}
                style={{
                  width: 56, padding: "4px 8px", border: "1px solid #E5DAC2",
                  borderRadius: 6, fontSize: 12, textAlign: "center",
                  fontFamily: "inherit", outline: "none", background: "#F8F2E7", color: "#1E2B4A",
                }}
              />d
            </label>
            <label style={{ fontSize: 12, color: "#3A4868", display: "flex", alignItems: "center", gap: 5 }}>
              Cobertura
              <input
                type="number" min={1} max={180}
                value={coverDays}
                onChange={e => setCoverDays(Math.max(1, Number(e.target.value) || 30))}
                style={{
                  width: 56, padding: "4px 8px", border: "1px solid #E5DAC2",
                  borderRadius: 6, fontSize: 12, textAlign: "center",
                  fontFamily: "inherit", outline: "none", background: "#F8F2E7", color: "#1E2B4A",
                }}
              />d
            </label>
            <span style={{ fontSize: 11, color: "#9AA2B3" }}>+ 7d safety</span>
          </div>

          {/* Cards por proveedor */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {recommendations.map(reco => {
              const isThisExpanded = expandedSupplier === reco.supplierId;
              return (
                <div
                  key={reco.supplierId}
                  style={{
                    background: "#FFFFFF",
                    border: `1px solid ${reco.color}40`,
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  {/* Color bar */}
                  <div style={{ height: 3, background: reco.color }} />

                  <div style={{ padding: "12px 14px" }}>
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      gap: 10, flexWrap: "wrap", marginBottom: 10,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                        <SupplierBadge name={reco.supplierName} color={reco.color} />
                        <span style={{ fontSize: 11, color: "#6B7794" }}>
                          {reco.totalItems}u · USDT {reco.totalUSDT.toFixed(0)}
                          {reco.totalSavingsVsAlt > 0 && <>
                            {" · "}<strong style={{ color: "#0F6B5C" }}>ahorrás USDT {reco.totalSavingsVsAlt.toFixed(0)}</strong>
                          </>}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <button
                          onClick={() => setExpandedSupplier(isThisExpanded ? null : reco.supplierId)}
                          style={{
                            padding: "6px 10px", background: "transparent",
                            border: "1px solid #E5DAC2", borderRadius: 8,
                            fontSize: 11, fontWeight: 600, color: "#3A4868",
                            cursor: "pointer", fontFamily: "inherit",
                          }}
                        >
                          {isThisExpanded ? "Ocultar items" : `Ver ${reco.items.length} items`}
                        </button>
                        <Btn
                          onClick={() => handleCreate(reco)}
                          style={{ padding: "7px 14px", fontSize: 12, minHeight: "auto" }}
                        >
                          💾 Crear pedido
                        </Btn>
                      </div>
                    </div>

                    {isThisExpanded && (
                      <div style={{
                        background: "#F8F2E7", borderRadius: 8,
                        padding: "8px 10px", border: "1px solid #EFE5CE",
                      }}>
                        <div style={{ display: "grid", gap: 6 }}>
                          {reco.items.map(it => (
                            <div
                              key={it.productId}
                              style={{
                                display: "grid",
                                gridTemplateColumns: isMobile ? "1fr" : "1fr auto auto",
                                gap: 8, alignItems: "center",
                                padding: "6px 8px",
                                background: "#FFFFFF", borderRadius: 6,
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div style={{
                                  fontSize: 12, fontWeight: 700, color: "#1E2B4A",
                                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>
                                  {it.product?.brand} {it.product?.model} · {it.product?.flavor}
                                </div>
                                <div style={{ fontSize: 10, color: "#6B7794", marginTop: 2 }}>
                                  ⚡ {it.reason}
                                  {it.alternativeSuppliers?.length > 0 && (
                                    <span style={{ marginLeft: 6, color: "#9AA2B3" }}>
                                      · alt: {it.alternativeSuppliers.map(a => `${a.supplierName} $${a.priceUSD}`).join(", ")}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div style={{
                                fontSize: 12, fontWeight: 800, color: "#5B3592",
                                whiteSpace: "nowrap",
                              }}>
                                {it.qty}u
                              </div>
                              <div style={{
                                fontSize: 12, fontWeight: 800, color: "#0F6B5C",
                                whiteSpace: "nowrap",
                              }}>
                                ${it.priceUSD}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
