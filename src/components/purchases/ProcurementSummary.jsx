import { useMemo } from "react";
import { formatMoney, formatDate } from "../../helpers.js";
import { useResponsive } from "../../App.jsx";
import { Card, StatCard, Btn } from "../UI.jsx";
import { buildProductSalesStats } from "../../productIntelligence.js";
import { SupplierBadge } from "../supplier/Sparkline.jsx";
import { RecommendedOrdersPanel } from "./RecommendedOrdersPanel.jsx";
import {
  aggregatePurchaseStats,
  resolvePurchaseProfile,
  expectedDelivery,
  statusDelayInfo,
  PURCHASE_STATUSES,
} from "./purchaseHelpers.js";
import { activeProfiles } from "../../lib/supplierProfiles.js";

// Tab "📊 Resumen" — centro de comando del abastecimiento.
// Une todo el ciclo en una vista: qué pedir, qué viene en camino, alertas de
// quiebre de stock, y el estado financiero del abastecimiento.
export function ProcurementSummary({
  products, sales, purchases, exchangeRate,
  supplierProfiles, supplierLists,
  onCreatePurchaseFromReco,
  onGoToTab,
}) {
  const { isMobile, isTablet } = useResponsive();

  const stats = useMemo(() => aggregatePurchaseStats(purchases), [purchases]);
  const productStats = useMemo(
    () => buildProductSalesStats(products, sales, exchangeRate),
    [products, sales, exchangeRate]
  );
  const profiles = useMemo(() => activeProfiles(supplierProfiles), [supplierProfiles]);

  // Productos en quiebre: con velocity > 0 y ≤7 días de stock
  const criticalProducts = useMemo(() => {
    return Object.values(productStats)
      .map(s => {
        const stock = s.product?.stock || 0;
        const velocity = s.velocity30dPerDay || 0;
        const days = velocity > 0 ? Math.floor(stock / velocity) : Infinity;
        return { ...s, days };
      })
      .filter(s => s.velocity30dPerDay > 0 && s.days <= 7)
      .sort((a, b) => a.days - b.days)
      .slice(0, 8);
  }, [productStats]);

  // Pedidos en camino (no verificados) ordenados por ETA
  const inTransit = useMemo(() => {
    return (purchases || [])
      .filter(p => p && !p.isDeleted && p.status !== "verificado")
      .map(p => {
        const profile = resolvePurchaseProfile(p, supplierProfiles);
        return { purchase: p, profile, eta: expectedDelivery(p, profile), delay: statusDelayInfo(p) };
      })
      .sort((a, b) => {
        const da = a.eta?.daysLeft ?? 999;
        const db = b.eta?.daysLeft ?? 999;
        return da - db;
      });
  }, [purchases, supplierProfiles]);

  return (
    <div>
      {/* KPIs del ciclo */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile || isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
        gap: 10, marginBottom: 16,
      }}>
        <StatCard
          label="Pedidos en curso"
          value={stats.totalPending}
          sub={stats.overdueCount > 0 ? `${stats.overdueCount} atrasados` : "al día"}
          color={stats.overdueCount > 0 ? "#B83232" : "#2383E2"}
          icon="🚚"
        />
        <StatCard
          label="En tránsito"
          value={formatMoney(stats.totalUSDTinTransit, "USDT")}
          sub="comprometido"
          color="#5B3592"
          icon="💸"
        />
        <StatCard
          label="Stock crítico"
          value={criticalProducts.length}
          sub="se agotan ≤7d"
          color={criticalProducts.length > 0 ? "#CB912F" : "#0F6B5C"}
          icon="⏳"
        />
        <StatCard
          label="Proveedores"
          value={profiles.length}
          sub="activos"
          color="#1E2B4A"
          icon="🏭"
        />
      </div>

      {/* Qué pedir hoy — recomendaciones cross-supplier */}
      <RecommendedOrdersPanel
        products={products}
        sales={sales}
        purchases={purchases}
        supplierLists={supplierLists}
        supplierProfiles={supplierProfiles}
        exchangeRate={exchangeRate}
        onCreatePurchase={onCreatePurchaseFromReco}
      />

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        {/* En camino */}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#1E2B4A" }}>🚚 En camino</div>
            {inTransit.length > 0 && (
              <button onClick={() => onGoToTab?.("orders")} style={linkBtn()}>Ver todos →</button>
            )}
          </div>
          {inTransit.length === 0 ? (
            <Empty msg="No hay pedidos en curso" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {inTransit.slice(0, 6).map(({ purchase, profile, eta, delay }) => {
                const st = PURCHASE_STATUSES.find(s => s.value === purchase.status);
                return (
                  <div key={purchase.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    gap: 8, padding: "8px 10px", background: "#F8F2E7",
                    borderRadius: 8, border: "1px solid #EFE5CE",
                  }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <SupplierBadge name={purchase.supplier || "?"} color={profile?.color || "#1E2B4A"} size="sm" />
                        <span style={{ fontSize: 11, fontWeight: 700, color: st?.color }}>{st?.emoji} {st?.label}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#6B7794", marginTop: 3 }}>
                        {purchase.totalItems || 0}u · {formatMoney(purchase.totalUSDT, "USDT")}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      {eta && (
                        <div style={{
                          fontSize: 12, fontWeight: 800,
                          color: eta.isOverdue ? "#B83232" : eta.daysLeft <= 3 ? "#CB912F" : "#0F6B5C",
                        }}>
                          {eta.isOverdue ? `${Math.abs(eta.daysLeft)}d tarde` : `ETA ${eta.daysLeft}d`}
                        </div>
                      )}
                      {delay && (
                        <div style={{ fontSize: 10, color: delay.severity === "danger" ? "#B83232" : "#B07A1F", fontWeight: 600 }}>
                          ⚠️ {delay.days}d en estado
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Stock crítico */}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#1E2B4A" }}>⏳ Stock crítico</div>
            {criticalProducts.length > 0 && (
              <button onClick={() => onGoToTab?.("suppliers")} style={linkBtn()}>Cargar lista →</button>
            )}
          </div>
          {criticalProducts.length === 0 ? (
            <Empty msg="Sin productos en quiebre 🎉" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {criticalProducts.map(s => (
                <div key={s.productId} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 8, padding: "7px 10px", background: "#F8F2E7",
                  borderRadius: 8, border: "1px solid #EFE5CE",
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 700, color: "#1E2B4A",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {s.product?.brand} {s.product?.model} · {s.product?.flavor}
                    </div>
                    <div style={{ fontSize: 10, color: "#6B7794", marginTop: 2 }}>
                      Stock {s.product?.stock || 0}u · vel {s.velocity30dPerDay}/d
                    </div>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 800,
                    color: s.days <= 3 ? "#B83232" : "#CB912F",
                    whiteSpace: "nowrap",
                  }}>
                    {s.days === 0 ? "hoy" : `${s.days}d`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Empty({ msg }) {
  return (
    <div style={{ padding: "24px 12px", textAlign: "center", color: "#9AA2B3", fontSize: 13 }}>
      {msg}
    </div>
  );
}

function linkBtn() {
  return {
    background: "transparent", border: "none", color: "#1E2B4A",
    fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
    padding: 0,
  };
}
