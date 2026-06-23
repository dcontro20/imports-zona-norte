import { useState, useMemo } from "react";
import { Card } from "../UI.jsx";
import { T } from "../../theme.js";
import { formatMoney } from "../../helpers.js";
import {
  buildClientStats, clientAlerts, segmentBreakdown, clientsToReach,
} from "../../clientIntelligence.js";

// Panel de Inteligencia de Cliente (S17): alertas accionables + segmentos +
// clientes "a tocar" (predicción de próxima compra). Se embebe arriba de la
// lista de Clientes. Colapsable.
const SEG_META = {
  activo:      { label: "Activos",     color: "#22C55E" },
  nuevo:       { label: "Nuevos",      color: "#3B82F6" },
  en_riesgo:   { label: "En riesgo",   color: "#F59E0B" },
  dormido:     { label: "Dormidos",    color: "#94A3B8" },
  sin_compras: { label: "Sin compras", color: "#CBD5E1" },
};
const SEV_COLOR = { high: "#B83232", medium: "#B07A1F", low: "#6B7794" };

export function ClientIntelligence({ clients = [], sales = [], exchangeRate = 1, onOpenClient }) {
  const stats = useMemo(() => buildClientStats(clients, sales, exchangeRate), [clients, sales, exchangeRate]);
  const alerts = useMemo(() => clientAlerts(stats), [stats]);
  const segments = useMemo(() => segmentBreakdown(stats), [stats]);
  const toReach = useMemo(() => clientsToReach(stats), [stats]);

  const hasHigh = alerts.some(a => a.severity === "high");
  const [open, setOpen] = useState(hasHigh);

  if (stats.length === 0) return null;

  return (
    <Card style={{ marginBottom: 14 }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>🧠 Inteligencia de clientes</span>
          {alerts.length > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 999, background: hasHigh ? "#F7DEDE" : "#FDECC8", color: hasHigh ? "#B83232" : "#B07A1F" }}>
              {alerts.length} alerta{alerts.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <span style={{ fontSize: 12, color: T.textMuted }}>{open ? "▼" : "▶"}</span>
      </div>

      {/* Segmentos (siempre visibles, compactos) */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {Object.entries(segments).filter(([, n]) => n > 0).map(([seg, n]) => {
          const m = SEG_META[seg] || { label: seg, color: T.textMuted };
          return (
            <div key={seg} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: `${m.color}1A`, border: `1px solid ${m.color}44` }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: m.color }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{n}</span>
              <span style={{ fontSize: 11, color: T.textMuted }}>{m.label}</span>
            </div>
          );
        })}
      </div>

      {open && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Alertas accionables */}
          {alerts.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>⚠️ Acciones recomendadas</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {alerts.slice(0, 8).map((a, i) => (
                  <div key={i} onClick={() => onOpenClient?.(a.clientId)} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8,
                    background: `${SEV_COLOR[a.severity]}10`, border: `1px solid ${SEV_COLOR[a.severity]}33`,
                    cursor: onOpenClient ? "pointer" : "default",
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: SEV_COLOR[a.severity], flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, color: T.text, flex: 1 }}>{a.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clientes a tocar (predicción) */}
          {toReach.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>🎯 A tocar (por valor)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {toReach.map((c, i) => (
                  <div key={c.id} onClick={() => onOpenClient?.(c.id)} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                    borderBottom: i < toReach.length - 1 ? `1px solid ${T.borderSoft}` : "none",
                    cursor: onOpenClient ? "pointer" : "default",
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: T.textMuted }}>
                        {c.prediction.status === "atrasado"
                          ? `Atrasado ${c.prediction.overdueDays}d`
                          : "Le toca comprar"}
                        {c.avgDaysBetween ? ` · cada ${c.avgDaysBetween}d` : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontVariantNumeric: "tabular-nums" }}>{formatMoney(Math.round(c.totalSpentARS))}</div>
                      <div style={{ fontSize: 10, color: T.textFaint }}>{c.salesCount} compras</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default ClientIntelligence;
