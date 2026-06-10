import { useMemo, useState } from "react";
import { formatMoney, formatDate } from "../../helpers.js";
import { useResponsive } from "../../App.jsx";
import { Card, useBodyScrollLock } from "../UI.jsx";
import { SupplierBadge, Sparkline } from "../supplier/Sparkline.jsx";
import { buildProductSalesStats } from "../../productIntelligence.js";
import {
  spendBySupplier,
  leadTimeStats,
  topPurchasedProducts,
  topCostIncreases,
  costPriceHistory,
  replenishmentForecast,
  spendOverTime,
} from "../../lib/purchaseAnalytics.js";

// Tab "📈 Analytics" del hub de Compras.
// Inteligencia: gasto por proveedor, lead times, productos top, evolución de
// costos (alerta de inflación) y calendario de reposición.
export function PurchaseAnalytics({
  purchases = [], products = [], sales = [], supplierProfiles = [],
  supplierLists = [], exchangeRate = 1,
}) {
  const { isMobile } = useResponsive();
  const [costDetailProduct, setCostDetailProduct] = useState(null);

  const spend = useMemo(() => spendBySupplier(purchases, supplierProfiles, 6), [purchases, supplierProfiles]);
  const leads = useMemo(() => leadTimeStats(purchases, supplierProfiles), [purchases, supplierProfiles]);
  const topProducts = useMemo(() => topPurchasedProducts(purchases, products, 8), [purchases, products]);
  const costIncreases = useMemo(() => topCostIncreases(products, purchases, supplierLists, 8), [products, purchases, supplierLists]);
  const spendSeries = useMemo(() => spendOverTime(purchases, 6), [purchases]);
  const stats = useMemo(() => buildProductSalesStats(products, sales, exchangeRate), [products, sales, exchangeRate]);
  const forecast = useMemo(() => replenishmentForecast(products, stats, purchases).slice(0, 12), [products, stats, purchases]);

  const totalSpend = spend.reduce((s, x) => s + x.totalARS, 0);
  const maxMonthly = Math.max(1, ...spendSeries.map(s => s.totalARS));

  const monthLabel = (m) => {
    const names = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return names[Number((m || "").split("-")[1]) - 1] || m;
  };

  const costHistory = useMemo(
    () => costDetailProduct ? costPriceHistory(costDetailProduct.id, purchases, supplierLists) : [],
    [costDetailProduct, purchases, supplierLists]
  );

  if ((purchases || []).filter(p => !p.isDeleted).length === 0) {
    return (
      <Card>
        <div style={{ textAlign: "center", padding: isMobile ? 28 : 56, color: "#6B7794" }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>📈</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1E2B4A", marginBottom: 6 }}>
            Todavía no hay datos de compras
          </div>
          <div style={{ fontSize: 13, maxWidth: 460, margin: "0 auto" }}>
            Cuando registres y verifiques pedidos, acá vas a ver gasto por proveedor,
            lead times reales, evolución de costos y proyección de reposición.
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Gasto en el tiempo */}
      <Card>
        <SecTitle>💰 Gasto en compras (6 meses)</SecTitle>
        <div style={{ display: "flex", alignItems: "flex-end", gap: isMobile ? 6 : 12, height: 120, marginTop: 8 }}>
          {spendSeries.map(s => {
            const h = Math.round((s.totalARS / maxMonthly) * 100);
            return (
              <div key={s.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 10, color: "#6B7794", fontWeight: 700 }}>
                  {s.totalARS > 0 ? `$${Math.round(s.totalARS / 1000)}k` : ""}
                </div>
                <div style={{
                  width: "100%", maxWidth: 48, height: `${Math.max(2, h)}%`, minHeight: 2,
                  background: "linear-gradient(180deg, #1E2B4A 0%, #3A4868 100%)",
                  borderRadius: "6px 6px 0 0",
                }} />
                <div style={{ fontSize: 10, color: "#9AA2B3", fontWeight: 600 }}>{monthLabel(s.month)}</div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "#6B7794", textAlign: "right" }}>
          Total 6m: <strong style={{ color: "#1E2B4A" }}>{formatMoney(totalSpend)}</strong>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        {/* Gasto por proveedor */}
        <Card>
          <SecTitle>🏭 Gasto por proveedor</SecTitle>
          {spend.length === 0 ? <Empty /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {spend.map(s => (
                <div key={s.supplierId}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, gap: 8 }}>
                    <SupplierBadge name={s.name} color={s.color} size="sm" />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#1E2B4A" }}>{formatMoney(s.totalARS)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 8, background: "#F1E9D6", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${totalSpend > 0 ? (s.totalARS / totalSpend) * 100 : 0}%`, height: "100%", background: s.color, borderRadius: 4 }} />
                    </div>
                    <Sparkline data={s.monthly.map(m => m.totalARS)} color={s.color} width={50} height={18} showDot={false} />
                  </div>
                  <div style={{ fontSize: 10, color: "#6B7794", marginTop: 2 }}>
                    {s.orderCount} pedidos · {formatMoney(s.totalUSDT, "USDT")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Lead times + cumplimiento */}
        <Card>
          <SecTitle>⏱️ Lead time & cumplimiento</SecTitle>
          {leads.length === 0 ? <Empty /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {leads.map(l => (
                <div key={l.supplierId} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 10px", background: "#F8F2E7", borderRadius: 8, border: "1px solid #EFE5CE", gap: 8,
                }}>
                  <SupplierBadge name={l.name} color={l.color} size="sm" />
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#1E2B4A" }}>
                        {l.avgLeadTime != null ? `${l.avgLeadTime}d` : "—"}
                      </div>
                      <div style={{ fontSize: 9, color: "#9AA2B3" }}>
                        {l.samples > 0 ? `${l.minLead}-${l.maxLead}d` : "sin datos"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: l.fulfillmentPct >= 80 ? "#0F6B5C" : l.fulfillmentPct >= 50 ? "#CB912F" : "#B83232" }}>
                        {l.fulfillmentPct}%
                      </div>
                      <div style={{ fontSize: 9, color: "#9AA2B3" }}>cumple</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        {/* Productos más comprados */}
        <Card>
          <SecTitle>📦 Más comprados</SecTitle>
          {topProducts.length === 0 ? <Empty /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {topProducts.map((t, i) => (
                <div key={t.productId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#9AA2B3", width: 18 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1E2B4A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.product ? `${t.product.brand} ${t.product.model} · ${t.product.flavor}` : t.productId}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#5B3592" }}>{t.totalQty}u</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Alerta de subas de costo */}
        <Card>
          <SecTitle>💹 Costos en alza</SecTitle>
          {costIncreases.length === 0 ? (
            <div style={{ padding: "20px 12px", textAlign: "center", color: "#0F6B5C", fontSize: 13 }}>
              ✅ Ningún producto subió de costo
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {costIncreases.map(c => (
                <div key={c.productId}
                  onClick={() => setCostDetailProduct(c.product)}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                    padding: "7px 10px", background: "#F8F2E7", borderRadius: 8,
                    border: "1px solid #EFE5CE", cursor: "pointer",
                  }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1E2B4A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.product.brand} {c.product.model} · {c.product.flavor}
                    </div>
                    <div style={{ fontSize: 10, color: "#6B7794", marginTop: 2 }}>
                      ${c.firstCost} → ${c.lastCost}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#B83232", whiteSpace: "nowrap" }}>
                    +{c.changePct}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Calendario de reposición */}
      <Card>
        <SecTitle>📅 Calendario de reposición</SecTitle>
        <p style={{ fontSize: 11, color: "#6B7794", margin: "0 0 12px" }}>
          Cuándo se agota cada producto según tu velocity. 🟢 = ya tenés pedido en camino.
        </p>
        {forecast.length === 0 ? (
          <div style={{ padding: "20px 12px", textAlign: "center", color: "#6B7794", fontSize: 13 }}>
            Sin productos con demanda activa para proyectar.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {forecast.map(f => {
              const urgent = f.daysUntilEmpty <= 7;
              const warn = f.daysUntilEmpty <= 14;
              const color = f.covered ? "#0F6B5C" : urgent ? "#B83232" : warn ? "#CB912F" : "#3A4868";
              return (
                <div key={f.productId} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                  padding: "8px 10px", background: "#F8F2E7", borderRadius: 8, border: "1px solid #EFE5CE",
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1E2B4A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.covered && <span title="Pedido en camino">🟢 </span>}
                      {f.product.brand} {f.product.model} · {f.product.flavor}
                    </div>
                    <div style={{ fontSize: 10, color: "#6B7794", marginTop: 2 }}>
                      Stock {f.stock}u · {f.velocity}/d
                      {f.pendingQty > 0 ? ` · ${f.pendingQty}u en camino` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color }}>
                      {f.daysUntilEmpty === 0 ? "hoy" : `${f.daysUntilEmpty}d`}
                    </div>
                    <div style={{ fontSize: 9, color: "#9AA2B3" }}>{formatDate(f.emptyDate)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Modal historial de costo de un producto */}
      {costDetailProduct && (
        <CostHistoryModal
          product={costDetailProduct}
          history={costHistory}
          onClose={() => setCostDetailProduct(null)}
        />
      )}
    </div>
  );
}

function CostHistoryModal({ product, history, onClose }) {
  useBodyScrollLock(true);
  const max = Math.max(1, ...history.map(h => h.costUSDT));
  const min = Math.min(...history.map(h => h.costUSDT), max);
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(30,43,74,0.35)",
      zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#FFFFFF", borderRadius: 16, padding: 20, width: "100%", maxWidth: 420,
        maxHeight: "85vh", overflowY: "auto", boxShadow: "0 24px 48px rgba(30,43,74,0.18)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#1E2B4A" }}>{product.brand} {product.model}</div>
            <div style={{ fontSize: 12, color: "#6B7794" }}>{product.flavor} · evolución de costo</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "1px solid #E5DAC2", borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: "#6B7794", fontSize: 16 }}>✕</button>
        </div>
        {history.length < 2 ? (
          <div style={{ padding: 20, textAlign: "center", color: "#6B7794", fontSize: 13 }}>
            Necesitás al menos 2 registros de costo para ver la evolución.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100, marginBottom: 12 }}>
              {history.map((h, i) => {
                const range = max - min || 1;
                const hgt = 20 + ((h.costUSDT - min) / range) * 70;
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#1E2B4A" }}>${h.costUSDT}</div>
                    <div style={{ width: "100%", maxWidth: 36, height: `${hgt}%`, background: h.source === "purchase" ? "#1E2B4A" : "#5B3592", borderRadius: "4px 4px 0 0" }} />
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {history.map((h, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6B7794", padding: "3px 0", borderBottom: "1px solid #F1E9D6" }}>
                  <span>{formatDate(h.date)} · {h.source === "purchase" ? "pedido" : "lista"} {h.supplier}</span>
                  <span style={{ fontWeight: 700, color: "#1E2B4A" }}>${h.costUSDT}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SecTitle({ children }) {
  return <div style={{ fontSize: 13, fontWeight: 800, color: "#1E2B4A", marginBottom: 12, letterSpacing: "-0.1px" }}>{children}</div>;
}

function Empty() {
  return <div style={{ padding: "20px 12px", textAlign: "center", color: "#9AA2B3", fontSize: 13 }}>Sin datos todavía</div>;
}
