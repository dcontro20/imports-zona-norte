import { useMemo } from "react";
import { formatMoney, formatDate } from "../../helpers.js";
import { computeSupplierStats } from "../../lib/supplierProfiles.js";
import { Sparkline, SupplierBadge } from "./Sparkline.jsx";
import { useResponsive } from "../../App.jsx";

// Card de un perfil de proveedor con sus stats principales.
// 3 variantes:
//  - "compact":   chip pequeño (para listas)
//  - "grid":      card mediana para grid de selección
//  - "expanded":  card grande con historial
export function SupplierProfileCard({
  profile,
  purchases = [],
  lists = [],
  variant = "grid",
  onClick,
  onEdit,
  selected = false,
}) {
  const { isMobile } = useResponsive();
  const stats = useMemo(() => computeSupplierStats(profile, purchases, lists), [profile, purchases, lists]);

  if (!profile) return null;

  const color = profile.color || "#5E6AD2";

  if (variant === "compact") {
    return <SupplierBadge name={profile.name} color={color} size="sm" onClick={onClick} />;
  }

  const lastDate = stats?.lastPurchase?.date || stats?.lastList?.processedAt;
  const sparkData = (stats?.monthly || []).map(m => m.total);

  return (
    <div
      onClick={onClick}
      style={{
        background: "#FFFFFF",
        borderRadius: isMobile ? 12 : 14,
        padding: isMobile ? 14 : 18,
        border: selected ? `2px solid ${color}` : `1px solid #E8E7E3`,
        boxShadow: selected ? `0 4px 16px ${color}33` : "0 1px 3px rgba(15,15,15,0.04)",
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.18s",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      {/* Color bar at top */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 4,
        background: color, borderRadius: "12px 12px 0 0",
      }} />

      {/* Header con nombre + edit button */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginTop: 4, marginBottom: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: isMobile ? 16 : 18, fontWeight: 700, color: "#37352F",
            letterSpacing: "-0.2px", lineHeight: 1.2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{profile.name}</div>
          {profile.country && (
            <div style={{ fontSize: 11, color: "#8C8A82", marginTop: 2 }}>
              {profile.country}
              {profile.contactName ? ` · ${profile.contactName}` : ""}
            </div>
          )}
        </div>
        {onEdit && (
          <button
            onClick={e => { e.stopPropagation(); onEdit(profile); }}
            aria-label="Editar"
            style={{
              width: 28, height: 28, padding: 0, background: "transparent",
              border: "1px solid #E8E7E3", borderRadius: 6, color: "#8C8A82",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontFamily: "inherit", flexShrink: 0,
            }}
          >⚙</button>
        )}
      </div>

      {/* Stats grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 10,
        marginBottom: 12,
      }}>
        <StatMini
          label="Pedidos"
          value={stats?.orderCount || 0}
          sub={stats?.pendingCount ? `${stats.pendingCount} pendientes` : null}
          color={color}
        />
        <StatMini
          label="Confiabilidad"
          value={stats?.reliability != null ? `${stats.reliability}%` : "—"}
          sub={stats?.verifiedCount ? `${stats.verifiedCount} verif.` : null}
          color={stats?.reliability >= 80 ? "#0F7B6C" : stats?.reliability >= 50 ? "#CB912F" : "#E03E3E"}
        />
        <StatMini
          label="Lead time"
          value={stats?.avgLeadTime != null ? `${stats.avgLeadTime}d` : `${profile.defaultLeadDays}d*`}
          sub={stats?.avgLeadTime != null ? "promedio real" : "estimado"}
          color="#555247"
        />
        <StatMini
          label="Listas"
          value={stats?.listCount || 0}
          sub={lastDate ? formatDate(lastDate) : "—"}
          color="#555247"
        />
      </div>

      {/* Total spent + sparkline */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        paddingTop: 10,
        borderTop: "1px solid #F0EFEB",
      }}>
        <div>
          <div style={{ fontSize: 10, color: "#8C8A82", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Total comprado</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#37352F", letterSpacing: "-0.3px" }}>
            USDT {(stats?.totalUSDT || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
          </div>
          <div style={{ fontSize: 11, color: "#8C8A82", marginTop: 1 }}>
            {formatMoney(stats?.totalARS || 0)} · {stats?.totalUnits || 0}u
          </div>
        </div>
        <Sparkline data={sparkData} color={color} width={isMobile ? 60 : 80} height={28} />
      </div>
    </div>
  );
}

function StatMini({ label, value, sub, color = "#5E6AD2" }) {
  return (
    <div style={{
      padding: "8px 10px",
      background: "#FAFAF9", borderRadius: 8, border: "1px solid #F0EFEB",
      minWidth: 0,
    }}>
      <div style={{
        fontSize: 9, color: "#8C8A82", fontWeight: 700, textTransform: "uppercase",
        letterSpacing: 0.4, marginBottom: 2,
      }}>{label}</div>
      <div style={{
        fontSize: 16, fontWeight: 800, color, lineHeight: 1,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{value}</div>
      {sub && (
        <div style={{
          fontSize: 10, color: "#8C8A82", marginTop: 2,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{sub}</div>
      )}
    </div>
  );
}
