import { useMemo } from "react";
import { formatMoney, formatDate, formatDateTime } from "../../helpers.js";
import { useResponsive } from "../../App.jsx";
import { Btn } from "../UI.jsx";
import { SupplierBadge } from "../supplier/Sparkline.jsx";
import {
  resolvePurchaseProfile,
  buildTimeline,
  expectedDelivery,
  projectedROI,
  getNextStatus,
  isFromMonitor,
} from "./purchaseHelpers.js";

// Drawer lateral con la ficha completa de un pedido.
// Timeline, items detallados, costos previstos vs reales, margen, acciones.
export function PurchaseDetailDrawer({
  purchase,
  products = [],
  supplierProfiles = [],
  exchangeRate = 1,
  onClose,
  onAdvance,
  onVerify,
  onOpenCosts,
  onReorder,
  onEdit,
}) {
  const { isMobile } = useResponsive();
  const profile = useMemo(() => resolvePurchaseProfile(purchase, supplierProfiles), [purchase, supplierProfiles]);
  const timeline = useMemo(() => buildTimeline(purchase), [purchase]);
  const eta = useMemo(() => expectedDelivery(purchase, profile), [purchase, profile]);
  const roi = useMemo(() => projectedROI(purchase, products, exchangeRate), [purchase, products, exchangeRate]);

  if (!purchase) return null;
  const color = profile?.color || "#1E2B4A";
  const next = getNextStatus(purchase.status);
  const hasCosts = !!(purchase.paseroCostARS && purchase.envioCostARS);
  const productById = new Map(products.map(p => [p.id, p]));
  const fromMonitor = isFromMonitor(purchase);
  const totalUnits = purchase.totalItems || (purchase.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
  const anyPartial = (purchase.items || []).some(it => it.receivedQty != null && Number(it.receivedQty) < Number(it.qty));

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(30,43,74,0.35)",
        zIndex: 1000, display: "flex", justifyContent: "flex-end",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#F8F2E7", width: isMobile ? "100%" : 480, maxWidth: "100%",
          height: "100%", overflowY: "auto",
          boxShadow: "-8px 0 32px rgba(30,43,74,0.18)",
          display: "flex", flexDirection: "column",
          animation: "fadeIn 0.2s ease",
        }}
      >
        {/* Header */}
        <div style={{
          position: "sticky", top: 0, zIndex: 2,
          background: "#FFFFFF", borderBottom: "1px solid #E5DAC2",
          padding: "16px 18px",
          paddingTop: "max(16px, env(safe-area-inset-top))",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                <SupplierBadge name={purchase.supplier || "Sin proveedor"} color={color} />
                {purchase.loteNumber && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#6B7794", padding: "2px 8px", background: "#F1E9D6", borderRadius: 6 }}>{purchase.loteNumber}</span>
                )}
                {fromMonitor && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#5B3592", padding: "2px 8px", background: "#E4D8F0", borderRadius: 6 }}>📋 Monitor</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#6B7794" }}>
                {formatDate(purchase.date)} · {totalUnits} unidades
              </div>
            </div>
            <button onClick={onClose} aria-label="Cerrar" style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: "transparent", border: "1px solid #E5DAC2", color: "#6B7794",
              fontSize: 18, cursor: "pointer", fontFamily: "inherit",
            }}>✕</button>
          </div>
        </div>

        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Timeline */}
          <Section title="📍 Seguimiento">
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {timeline.map((step, i) => (
                <div key={step.status} style={{ display: "flex", gap: 12 }}>
                  {/* Dot + line */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%",
                      background: step.isPast || step.isCurrent ? step.color : "#E5DAC2",
                      border: step.isCurrent ? "2px solid #FFFFFF" : "none",
                      boxShadow: step.isCurrent ? `0 0 0 2px ${step.color}` : "none",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, color: "#FFFFFF", fontWeight: 800,
                    }}>{step.isPast ? "✓" : step.emoji}</div>
                    {i < timeline.length - 1 && (
                      <div style={{ width: 2, flex: 1, minHeight: 24, background: step.isPast ? timeline[i + 1].color : "#EFE5CE" }} />
                    )}
                  </div>
                  {/* Content */}
                  <div style={{ paddingBottom: 16, flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: step.isFuture ? "#9AA2B3" : "#1E2B4A" }}>
                      {step.label}
                      {step.isCurrent && <span style={{ fontSize: 10, fontWeight: 700, color: step.color, marginLeft: 6 }}>● actual</span>}
                    </div>
                    {step.timestamp && !step.isFuture && (
                      <div style={{ fontSize: 11, color: "#6B7794", marginTop: 2 }}>
                        {formatDateTime(step.timestamp)}
                        {step.user ? ` · ${step.user}` : ""}
                        {step.daysAgo != null && step.daysAgo >= 0 ? ` · hace ${step.daysAgo}d` : ""}
                      </div>
                    )}
                    {step.note && (
                      <div style={{ fontSize: 11, color: "#B07A1F", marginTop: 3, fontStyle: "italic" }}>{step.note}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {eta && (
              <div style={{
                marginTop: 4, padding: "8px 12px", borderRadius: 8,
                background: eta.isOverdue ? "#F7DEDE" : "#D9E8E4",
                border: `1px solid ${eta.isOverdue ? "#E5A8A8" : "#A8C8BE"}`,
                fontSize: 12, fontWeight: 600, color: eta.isOverdue ? "#B83232" : "#0F6B5C",
              }}>
                {eta.isOverdue
                  ? `⚠️ ETA vencida hace ${Math.abs(eta.daysLeft)}d (estimada ${formatDate(eta.date.toISOString())})`
                  : `🚚 Entrega estimada: ${formatDate(eta.date.toISOString())} (en ${eta.daysLeft}d)`}
              </div>
            )}
          </Section>

          {/* Items */}
          <Section title={`📦 Items (${(purchase.items || []).length})`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(purchase.items || []).map((it, i) => {
                const prod = productById.get(it.productId);
                const subtotal = (Number(it.qty) || 0) * (Number(it.unitCostUSDT) || 0);
                const partial = it.receivedQty != null && Number(it.receivedQty) < Number(it.qty);
                return (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                    padding: "8px 10px", background: "#FFFFFF", borderRadius: 8, border: "1px solid #EFE5CE",
                  }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#1E2B4A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {prod ? `${prod.brand} ${prod.model} · ${prod.flavor}` : (it.name || it.productId)}
                      </div>
                      <div style={{ fontSize: 10, color: "#6B7794", marginTop: 2 }}>
                        {it.qty}u × ${it.unitCostUSDT || 0}
                        {partial && <span style={{ color: "#B07A1F", fontWeight: 700 }}> · recibido {it.receivedQty}/{it.qty}</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#0F6B5C", whiteSpace: "nowrap" }}>
                      USDT {subtotal.toFixed(0)}
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Costos previstos vs reales */}
          <Section title="💰 Costos">
            <CostRow label="Vapes (productos)" value={formatMoney(purchase.totalUSDT, "USDT")} />
            {purchase.supplierCommUSDT > 0 && (
              <CostRow label={`Comisión proveedor${purchase.supplierCommPercent ? ` (${purchase.supplierCommPercent}%)` : ""}`} value={formatMoney(purchase.supplierCommUSDT, "USDT")} />
            )}
            <CostRow label="Total USDT transferido" value={formatMoney(purchase.totalUSDTpaid || purchase.totalUSDT, "USDT")} bold />
            <div style={{ height: 1, background: "#EFE5CE", margin: "6px 0" }} />
            {purchase.paseroCostARS > 0 && <CostRow label="Pasero" value={formatMoney(purchase.paseroCostARS)} />}
            {purchase.envioCostARS > 0 && <CostRow label="Envío" value={formatMoney(purchase.envioCostARS)} />}
            <CostRow label="Costo total ARS" value={hasCosts ? formatMoney(purchase.totalCostARS) : "incompletos"} bold big color={hasCosts ? "#B83232" : "#CB912F"} />
            {totalUnits > 0 && hasCosts && (
              <CostRow label="Costo por unidad" value={formatMoney(Math.round(purchase.totalCostARS / totalUnits))} muted />
            )}
            {!hasCosts && (
              <Btn variant="secondary" onClick={() => onOpenCosts?.(purchase)} style={{ marginTop: 8, width: "100%" }}>
                $ Cargar costos faltantes
              </Btn>
            )}
          </Section>

          {/* ROI / margen proyectado */}
          {roi && (
            <Section title="💎 Rentabilidad proyectada">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Metric label="Revenue esperado" value={formatMoney(roi.revenueARS)} />
                <Metric label="Ganancia" value={formatMoney(roi.profit)} color={roi.profit >= 0 ? "#0F6B5C" : "#B83232"} />
                <Metric label="ROI" value={`${roi.roiPct.toFixed(1)}%`} color={roi.profit >= 0 ? "#0F6B5C" : "#B83232"} />
                <Metric label="Margen" value={`${roi.marginPct.toFixed(1)}%`} color={roi.profit >= 0 ? "#0F6B5C" : "#B83232"} />
              </div>
            </Section>
          )}

          {purchase.notes && (
            <Section title="📝 Notas">
              <div style={{ fontSize: 13, color: "#3A4868", lineHeight: 1.5 }}>{purchase.notes}</div>
            </Section>
          )}

          {purchase.invoiceUrl && (
            <a href={purchase.invoiceUrl} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 13, color: "#1E2B4A", fontWeight: 600, textDecoration: "none" }}>
              🧾 Ver invoice / comprobante →
            </a>
          )}
        </div>

        {/* Action bar */}
        <div style={{
          position: "sticky", bottom: 0, marginTop: "auto",
          background: "#FFFFFF", borderTop: "1px solid #E5DAC2",
          padding: "12px 18px", paddingBottom: "max(12px, env(safe-area-inset-bottom))",
          display: "flex", gap: 8, flexWrap: "wrap",
        }}>
          {next && (
            <Btn onClick={() => { next.value === "verificado" ? onVerify?.(purchase.id) : onAdvance?.(purchase.id, next.value); onClose?.(); }} style={{ flex: 1 }}>
              {next.value === "verificado" ? "✅ Verificar" : `${next.emoji} ${next.label}`}
            </Btn>
          )}
          <Btn variant="secondary" onClick={() => { onEdit?.(purchase); onClose?.(); }}>✏️ Editar</Btn>
          <Btn variant="secondary" onClick={() => { onReorder?.(purchase); onClose?.(); }}>↻ Reordenar</Btn>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ background: "#FFFFFF", borderRadius: 12, border: "1px solid #E5DAC2", padding: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#1E2B4A", marginBottom: 10, letterSpacing: "-0.1px" }}>{title}</div>
      {children}
    </div>
  );
}

function CostRow({ label, value, bold, big, color, muted }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
      <span style={{ fontSize: big ? 14 : 12, fontWeight: bold ? 700 : 500, color: muted ? "#9AA2B3" : "#3A4868" }}>{label}</span>
      <span style={{ fontSize: big ? 17 : 13, fontWeight: bold ? 800 : 600, color: color || (muted ? "#9AA2B3" : "#1E2B4A") }}>{value}</span>
    </div>
  );
}

function Metric({ label, value, color = "#1E2B4A" }) {
  return (
    <div style={{ padding: "8px 10px", background: "#F8F2E7", borderRadius: 8, border: "1px solid #EFE5CE" }}>
      <div style={{ fontSize: 10, color: "#6B7794", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}
