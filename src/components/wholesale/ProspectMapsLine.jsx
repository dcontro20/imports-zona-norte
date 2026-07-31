// ProspectMapsLine.jsx — el renglón de datos de Google Maps en las cards del
// CRM (micro-iteración post-cierre aprobada por Gustavo 2026-08-01): ver lo
// esencial de la ficha de Maps en cualquier etapa — ★ rating (reseñas),
// teléfono, dirección — y saltar a la ficha REAL (🗺️ Maps → urlOrigen)
// cuando falte algo. ÚNICA fuente: la usan Para hoy y el Embudo.
// Solo pinta lo que existe: un prospecto manual sin datos de Maps no muestra
// nada (devuelve null — cero ruido).
import { T } from "../../theme.js";

export function ProspectMapsLine({ prospect: p, style }) {
  if (!p) return null;
  const partes = [];
  if (p.rating != null) partes.push(`★ ${p.rating}${p.reviewsCount != null ? ` (${p.reviewsCount})` : ""}`);
  if (p.phone) partes.push(`📞 ${p.phone}`);
  if (p.address) partes.push(p.address);
  if (!partes.length && !p.urlOrigen) return null;
  return (
    <div style={{ fontSize: 10.5, color: T.textFaint, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "baseline", ...style }}>
      {partes.length > 0 && <span style={{ minWidth: 0 }}>{partes.join(" · ")}</span>}
      {p.urlOrigen && (
        // stopPropagation: la card que hospeda este renglón abre la Ficha al
        // tocarla — el link a Maps no debe disparar las dos cosas.
        <a href={p.urlOrigen} target="_blank" rel="noreferrer"
          onClick={e => e.stopPropagation()}
          style={{ color: T.blue, flexShrink: 0, textDecoration: "none", fontWeight: 700 }}>
          🗺️ Maps
        </a>
      )}
    </div>
  );
}
