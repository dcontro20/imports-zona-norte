import { Badge } from "../UI.jsx";
import { T } from "../../theme.js";
import { ETIQUETA_TRI } from "../../lib/prospectRanking.js";
import { useResponsive } from "../../App.jsx";

// Ficha de diagnóstico de un prospecto. RENDER PURO de lo que la fachada del
// Prospect Engine ya dejó listo (item.diagnostico / item.scoreResult /
// item.proximoPaso): acá no se recalcula nada, no se redacta ningún texto de
// negocio y no hay umbrales. Si algo falta, se agrega en el dominio.

const VALOR_COLOR = { si: T.green, no: T.textMuted, sin_datos: T.textFaint };

function Criterio({ c }) {
  const medido = c.valor === "si" || c.valor === "no";
  return (
    <div style={{ padding: "7px 0", borderBottom: `1px solid ${T.borderSoft}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <span style={{ fontSize: 12, color: medido ? T.text : T.textFaint, flex: 1, minWidth: 0 }}>{c.pregunta}</span>
        <span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
          {c.puntos > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: T.green }}>+{c.puntos}</span>}
          <Badge color={VALOR_COLOR[c.valor] ?? T.textFaint}>{ETIQUETA_TRI[c.valor] ?? c.valor}</Badge>
        </span>
      </div>
      {c.fuentes?.length > 0 && (
        <div style={{ fontSize: 10, color: T.textFaint, marginTop: 3 }}>{c.fuentes.join(" · ")}</div>
      )}
    </div>
  );
}

function Dimension({ titulo, dim }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: T.text }}>{titulo}</span>
        <span style={{ fontSize: 11, color: T.textMuted, flexShrink: 0 }}>{dim.resumen}</span>
      </div>
      {dim.criterios.map(c => <Criterio key={c.id} c={c} />)}
    </div>
  );
}

// El CONTENIDO del diagnóstico, sin el Modal — F3 del CRM: la Ficha lo embebe
// como su sección central y este modal lo envuelve para el uso suelto.
// Sigue siendo render puro de la fachada.
export function DiagnosisContent({ item, prioridadColor }) {
  const { isMobile } = useResponsive();
  if (!item) return null;
  const { diagnostico: d, scoreResult: s, proximoPaso: paso } = item;

  return (
    <div>
      {/* Veredicto: la palabra lidera */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{d.veredicto}</span>
        <Badge color={prioridadColor}>{item.chip.etiqueta}</Badge>
      </div>
      <div style={{ fontSize: 12, color: d.confianzaBaja ? T.amber : T.textMuted, marginBottom: 10 }}>
        {d.confianza}{d.confianzaBaja && item.chip.aviso ? ` — ${item.chip.aviso}` : ""}
      </div>

      {/* La sentencia del vendedor */}
      <div style={{ fontSize: 13, color: T.text, background: T.bg, border: `1px solid ${T.borderSoft}`, borderRadius: 10, padding: 10, marginBottom: 12 }}>
        {d.sentencia}
      </div>

      {/* Las 3 razones: conclusión + detalle + respaldo numérico */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
        {d.razones.map((r, i) => (
          <div key={i} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.text, marginBottom: 3 }}>{r.conclusion}</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 5 }}>{r.detalle}</div>
            <div style={{ fontSize: 11, color: T.textFaint, fontWeight: 700 }}>{r.respaldo}</div>
          </div>
        ))}
      </div>

      {/* Evidencia: toda conclusión abre su porqué */}
      <details style={{ marginBottom: 12 }}>
        <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700, color: T.blue, padding: "6px 0" }}>
          ¿Por qué?
        </summary>
        <div style={{ marginTop: 8 }}>
          <Dimension titulo="Oportunidad" dim={s.opportunity} />
          <Dimension titulo="Encaje" dim={s.fit} />
        </div>
      </details>

      {/* Próximo paso: ningún diagnóstico termina sin decir qué sigue */}
      <div style={{
        background: paso.tono === "accion" ? T.greenBg : T.bg,
        border: `1px solid ${paso.tono === "accion" ? T.greenBorder : T.borderSoft}`,
        borderRadius: 10, padding: 10,
      }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span style={{ flexShrink: 0 }}>{paso.icono}</span>
          <span style={{ fontSize: 12, color: T.text }}>{paso.texto}</span>
        </div>
        {paso.pendientes.length > 0 && (
          <ul style={{ margin: "8px 0 0", paddingLeft: 26, fontSize: 12, color: T.textMuted }}>
            {paso.pendientes.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
