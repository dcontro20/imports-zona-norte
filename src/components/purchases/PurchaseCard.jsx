import { useMemo } from "react";
import { formatMoney, formatDate } from "../../helpers.js";
import { useResponsive } from "../../App.jsx";
import { SupplierBadge } from "../supplier/Sparkline.jsx";
import {
  resolvePurchaseProfile,
  expectedDelivery,
  statusDelayInfo,
  projectedROI,
  isFromMonitor,
  PURCHASE_STATUSES,
  getNextStatus,
} from "./purchaseHelpers.js";

// Card profesional de un pedido — variantes "full" (lista) y "compact" (kanban).
// Muestra:
//   - Header con color del proveedor (barra superior + nombre destacado)
//   - Stepper horizontal con todos los status (pasado/actual/futuro)
//   - Stats inline: items, días en estado, ETA, costo total
//   - Indicador "Vino de Monitor 📋"
//   - ROI proyectado si está verificado o tiene costos
//   - Botones: avanzar, costos, editar, borrar
export function PurchaseCard({
  purchase,
  supplierProfiles = [],
  products = [],
  exchangeRate = 1,
  variant = "full",
  onOpenEdit,
  onAdvance,
  onVerify,
  onOpenCosts,
  onDelete,
  confirmDeleteId,
}) {
  const { isMobile } = useResponsive();
  const profile = useMemo(
    () => resolvePurchaseProfile(purchase, supplierProfiles),
    [purchase, supplierProfiles]
  );
  const color = profile?.color || "#1E2B4A";
  const eta = useMemo(() => expectedDelivery(purchase, profile), [purchase, profile]);
  const delay = useMemo(() => statusDelayInfo(purchase), [purchase]);
  const roi = useMemo(() => projectedROI(purchase, products, exchangeRate), [purchase, products, exchangeRate]);
  const fromMonitor = isFromMonitor(purchase);

  const totalUnits = purchase.totalItems
    || (purchase.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
  const hasCosts = !!(purchase.paseroCostARS && purchase.envioCostARS);
  const next = getNextStatus(purchase.status);
  const isCompact = variant === "compact";

  return (
    <div
      onClick={() => onOpenEdit?.(purchase)}
      style={{
        background: "#FFFFFF",
        border: `1px solid ${delay?.severity === "danger" ? "#E5A8A8" : delay?.severity === "warn" ? "#E1C684" : "#E5DAC2"}`,
        borderRadius: 14,
        padding: 0,
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(30,43,74,0.05)",
        transition: "box-shadow 0.18s, transform 0.05s",
        marginBottom: isCompact ? 10 : 12,
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(30,43,74,0.10)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "0 1px 3px rgba(30,43,74,0.05)"}
    >
      {/* Color bar */}
      <div style={{
        height: 4, background: color, width: "100%",
      }} />

      <div style={{ padding: isCompact ? "12px 14px" : "14px 16px" }}>
        {/* Header: supplier badge + status + lote */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: 10, marginBottom: 10, flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
            {profile ? (
              <SupplierBadge name={profile.name} color={color} size={isCompact ? "sm" : "md"} />
            ) : (
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1E2B4A" }}>
                {purchase.supplier || "Sin proveedor"}
              </span>
            )}
            {purchase.loteNumber && (
              <span style={{
                fontSize: 10, fontWeight: 700, color: "#6B7794",
                padding: "2px 8px", background: "#F1E9D6", borderRadius: 6,
              }}>{purchase.loteNumber}</span>
            )}
            {fromMonitor && (
              <span style={{
                fontSize: 10, fontWeight: 700, color: "#5B3592",
                padding: "2px 8px", background: "#E4D8F0", borderRadius: 6,
                display: "flex", alignItems: "center", gap: 3,
              }} title="Generado desde Monitor de Proveedores">
                📋 Monitor
              </span>
            )}
          </div>
        </div>

        {/* Stepper visual */}
        <Stepper status={purchase.status} compact={isCompact} />

        {/* Stats grid: fecha · uds · costo · ETA · días en estado */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isCompact ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 8,
          marginTop: 12,
        }}>
          <Mini label="Fecha" value={formatDate(purchase.date)} />
          <Mini label="Unidades" value={`${totalUnits}u`} color="#1E2B4A" bold />
          <Mini
            label={hasCosts ? "Costo total" : "Costos"}
            value={hasCosts ? formatMoney(purchase.totalCostARS) : "incompletos"}
            color={hasCosts ? "#0F6B5C" : "#CB912F"}
            bold
          />
          {!isCompact && (
            <Mini label="USDT" value={formatMoney(purchase.totalUSDT, "USDT")} />
          )}
          {eta && (
            <Mini
              label="ETA"
              value={eta.isOverdue ? `${Math.abs(eta.daysLeft)}d atrasado` : `${eta.daysLeft}d`}
              color={eta.isOverdue ? "#B83232" : eta.daysLeft <= 3 ? "#CB912F" : "#0F6B5C"}
              bold
            />
          )}
        </div>

        {/* Delay alert */}
        {delay && (
          <div style={{
            marginTop: 10,
            padding: "6px 12px",
            background: delay.severity === "danger" ? "#F7DEDE" : "#F5E4C2",
            border: `1px solid ${delay.severity === "danger" ? "#E5A8A8" : "#E1C684"}`,
            borderRadius: 8,
            fontSize: 11, fontWeight: 700,
            color: delay.severity === "danger" ? "#B83232" : "#B07A1F",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            ⚠️ Atrasado: {delay.days}d en "{purchase.status.replace("_", " ")}" (límite {delay.limit}d)
          </div>
        )}

        {/* ROI projection */}
        {roi && !isCompact && (
          <div style={{
            marginTop: 10,
            padding: "8px 12px",
            background: roi.profit >= 0 ? "#D9E8E4" : "#F7DEDE",
            border: `1px solid ${roi.profit >= 0 ? "#A8C8BE" : "#E5A8A8"}`,
            borderRadius: 8,
          }}>
            <div style={{
              fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4,
              color: roi.profit >= 0 ? "#0F6B5C" : "#B83232",
              marginBottom: 3,
            }}>💎 ROI Proyectado</div>
            <div style={{ display: "flex", gap: 14, fontSize: 11, flexWrap: "wrap" }}>
              <span style={{ color: "#3A4868" }}>
                Revenue <strong style={{ color: "#1E2B4A" }}>{formatMoney(roi.revenueARS)}</strong>
              </span>
              <span style={{ color: "#3A4868" }}>
                Ganancia <strong style={{ color: roi.profit >= 0 ? "#0F6B5C" : "#B83232" }}>{formatMoney(roi.profit)}</strong>
              </span>
              <span style={{ color: "#3A4868" }}>
                ROI <strong style={{ color: roi.profit >= 0 ? "#0F6B5C" : "#B83232" }}>{roi.roiPct.toFixed(1)}%</strong>
              </span>
              <span style={{ color: "#3A4868" }}>
                Margen <strong style={{ color: roi.profit >= 0 ? "#0F6B5C" : "#B83232" }}>{roi.marginPct.toFixed(1)}%</strong>
              </span>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          {!hasCosts && (
            <button
              onClick={e => { e.stopPropagation(); onOpenCosts?.(purchase); }}
              style={btnStyle("#CB912F", "#F5E4C2")}
            >$ Cargar costos</button>
          )}
          {next && (
            <button
              onClick={e => {
                e.stopPropagation();
                if (next.value === "verificado") onVerify?.(purchase.id);
                else onAdvance?.(purchase.id, next.value);
              }}
              style={btnStyle(next.color, `${next.color}22`)}
            >
              {next.value === "verificado" ? "✅ Verificar" : `${next.emoji} ${next.label}`}
            </button>
          )}
          {confirmDeleteId === purchase.id ? (
            <button
              onClick={e => { e.stopPropagation(); onDelete?.(purchase); }}
              style={btnStyle("#B83232", "#F7DEDE")}
            >Confirmar borrar</button>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); onDelete?.(purchase); }}
              aria-label="Borrar"
              style={{
                ...btnStyle("#B83232", "transparent"),
                border: "1px solid #E5A8A8",
              }}
            >🗑</button>
          )}
        </div>
      </div>
    </div>
  );
}

// Stepper horizontal con dots + lineas. Muestra el progreso del pedido.
function Stepper({ status, compact = false }) {
  const currentIdx = PURCHASE_STATUSES.findIndex(s => s.value === status);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      {PURCHASE_STATUSES.map((s, i) => {
        const isPast = i < currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <div key={s.value} style={{ display: "flex", alignItems: "center", flex: 1, gap: 4 }}>
            <div style={{
              width: compact ? 14 : 18, height: compact ? 14 : 18, borderRadius: "50%",
              flexShrink: 0,
              background: isPast || isCurrent ? s.color : "#E5DAC2",
              border: isCurrent ? `2px solid #FFFFFF` : "none",
              boxShadow: isCurrent ? `0 0 0 2px ${s.color}` : "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: compact ? 8 : 10, fontWeight: 800, color: "#FFFFFF",
            }}>{isPast ? "✓" : ""}</div>
            {!compact && (
              <span style={{
                fontSize: 10, fontWeight: isCurrent ? 800 : 600,
                color: i > currentIdx ? "#9AA2B3" : isCurrent ? s.color : "#3A4868",
                whiteSpace: "nowrap",
              }}>{s.label}</span>
            )}
            {i < PURCHASE_STATUSES.length - 1 && (
              <div style={{
                flex: 1, height: 2,
                background: isPast ? PURCHASE_STATUSES[i + 1].color : "#EFE5CE",
                margin: "0 2px",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Mini({ label, value, color = "#3A4868", bold = false }) {
  return (
    <div style={{
      padding: "6px 8px",
      background: "#F8F2E7", borderRadius: 6, border: "1px solid #EFE5CE",
      minWidth: 0,
    }}>
      <div style={{
        fontSize: 9, color: "#6B7794", fontWeight: 700,
        textTransform: "uppercase", letterSpacing: 0.4,
      }}>{label}</div>
      <div style={{
        fontSize: 13, color, fontWeight: bold ? 800 : 600, marginTop: 2,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{value}</div>
    </div>
  );
}

function btnStyle(color, bg) {
  return {
    background: bg,
    border: `1px solid ${color}55`,
    color,
    padding: "7px 12px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    minHeight: 34,
  };
}
