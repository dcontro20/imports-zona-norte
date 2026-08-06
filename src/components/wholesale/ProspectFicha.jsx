// ProspectFicha.jsx — la FICHA del prospecto: el centro operativo del mini CRM
// (spec docs/PROSPECT_CRM_SPEC.md §Ficha, F3). No es un detalle de lectura:
// desde acá se gestiona — visitar, presentar, llamar, editar, avanzar,
// convertir, borrar. Composición pura de capacidades existentes:
//   - diagnóstico = DiagnosisContent (render puro de la fachada del engine);
//   - calificación = CALIFICACION_CAMPOS de la fachada + la firma de autoría;
//   - Actividad = actividadDeProspecto (lib de eventos TIPADOS — agregar un
//     tipo nuevo es un builder en la lib, esta pantalla no cambia);
//   - acciones = las mismas makeProspectActions del kanban (única fuente).
import { useMemo } from "react";
import { formatDate } from "../../helpers.js";
import { useResponsive } from "../../App.jsx";
import { Btn, Modal, MiniBtn, Badge } from "../UI.jsx";
import { T } from "../../theme.js";
import { CALIFICACION_CAMPOS } from "../../lib/prospectRanking.js";
import { actividadDeProspecto } from "../../lib/prospectActividad.js";
import { DiagnosisContent } from "./ProspectDiagnosisModal.jsx";

const ETAPA_LABEL = { prospecto: "Prospecto", contactado: "Contactado", visitado: "Visitado" };

const Seccion = ({ titulo, children }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ fontSize: 12, fontWeight: 800, color: T.textSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{titulo}</div>
    {children}
  </div>
);

const Dato = ({ label, children }) => (
  <div style={{ display: "flex", gap: 8, fontSize: 12, padding: "3px 0" }}>
    <span style={{ color: T.textFaint, flexShrink: 0, width: 84 }}>{label}</span>
    <span style={{ color: T.text, minWidth: 0 }}>{children}</span>
  </div>
);

// item: el ítem COMPLETO de la fachada (buildProspectRanking → porId[id]).
// acciones: makeProspectActions ya armado por el llamador (única fuente).
export function ProspectFicha({
  item, prioridadColor, visits = [], auditLog = [], onClose,
  onVisita, onPresentar, onEditar, acciones,
}) {
  const { isMobile } = useResponsive();
  const p = item?.prospect;
  const eventos = useMemo(
    () => actividadDeProspecto({ prospectId: p?.id, visits, auditLog }),
    [p?.id, visits, auditLog],
  );
  if (!item || !p) return <Modal open={false} onClose={onClose} title="" />;

  const etapa = p.pipelineStage || "prospecto";
  const calif = p.calificacion || null;
  const califValores = CALIFICACION_CAMPOS.map(c => ({
    pregunta: c.pregunta,
    etiqueta: c.opciones.find(o => o.valor === calif?.[c.campo])?.etiqueta || "Sin datos",
    medido: calif?.[c.campo] && calif[c.campo] !== "sin_datos",
  }));
  const esDescubierto = p.source === "descubrimiento";

  return (
    <Modal open onClose={onClose} title={`Ficha — ${p.businessName || ""}`}>
      {/* Encabezado: etapa + prioridad + aviso */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
        <Badge color={T.blue}>{ETAPA_LABEL[etapa] || etapa}</Badge>
        <Badge color={prioridadColor}>{item.chip?.etiqueta}</Badge>
        <span style={{ fontSize: 11, color: T.textMuted }}>{p.zone || "sin zona"}</span>
      </div>
      {item.chip?.aviso && (
        <div style={{ fontSize: 11, color: T.textFaint, marginBottom: 10, display: "flex", gap: 4 }}>
          <span style={{ flexShrink: 0 }}>◍</span><span>{item.chip.aviso}</span>
        </div>
      )}

      {/* Acciones: el centro OPERATIVO — gestionar, no solo leer */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        <MiniBtn onClick={() => onVisita?.(p)} color={T.amber}>📋 Visita</MiniBtn>
        <MiniBtn onClick={() => onPresentar?.(p)} color={T.green}>💬 Presentar</MiniBtn>
        {p.phone && (
          // MiniBtn con navegación tel: (un <button> dentro de <a> es HTML
          // inválido — interactivo anidado en interactivo)
          <MiniBtn color={T.blue}
            onClick={() => { window.location.href = `tel:${String(p.phone).replace(/[^\d+]/g, "")}`; }}>
            📞 Llamar
          </MiniBtn>
        )}
        <MiniBtn onClick={() => onEditar?.(p)} color={T.textMuted}>✏️ Editar</MiniBtn>
        {etapa !== "visitado" && (
          <MiniBtn onClick={() => acciones?.avanzar(p)} color={T.blue}>→ Avanzar</MiniBtn>
        )}
        {etapa === "visitado" && (
          <MiniBtn onClick={() => { acciones?.convertir(p); onClose?.(); }} color={T.green}>✓ Convertir</MiniBtn>
        )}
        {/* Descartar (con memoria) vs Borrar (a Papelera): el descarte es el
            "no me sirve" del discovery — no vuelve a entrar solo (§7). */}
        <MiniBtn onClick={() => { acciones?.descartar?.(p); onClose?.(); }} color={T.red}>✗ Descartar</MiniBtn>
        <MiniBtn onClick={() => { acciones?.borrar(p); onClose?.(); }} color={T.textMuted}>🗑 Borrar</MiniBtn>
      </div>

      {/* Datos (con procedencia si vino del descubrimiento) */}
      <Seccion titulo="Datos">
        {p.phone && <Dato label="Teléfono"><a href={`tel:${String(p.phone).replace(/[^\d+]/g, "")}`} style={{ color: T.blue }}>{p.phone}</a></Dato>}
        {p.address && <Dato label="Dirección">{p.address}</Dato>}
        {p.contactName && <Dato label="Contacto">{p.contactName}</Dato>}
        <Dato label="Origen">{p.source || "manual"}</Dato>
        {p.notes && <Dato label="Notas">{p.notes}</Dato>}
        {esDescubierto && (
          <div style={{ fontSize: 11, color: T.textFaint, marginTop: 6, background: T.bg, border: `1px solid ${T.borderSoft}`, borderRadius: 8, padding: 8 }}>
            🔎 Descubierto{p.descubiertoAt ? ` el ${formatDate(p.descubiertoAt)}` : ""}
            {p.descubiertoTermino ? ` buscando "${p.descubiertoTermino}"` : ""}
            {p.rating != null ? ` · ★ ${p.rating}${p.reviewsCount != null ? ` (${p.reviewsCount} reseñas)` : ""}` : ""}
            {p.web ? <> · <a href={p.web} target="_blank" rel="noreferrer" style={{ color: T.blue }}>{p.redSocial || "web"}</a></> : ""}
          </div>
        )}
      </Seccion>

      {/* Diagnóstico del engine — la sección central (render puro de la fachada) */}
      <Seccion titulo="Diagnóstico">
        <DiagnosisContent item={item} prioridadColor={prioridadColor} />
      </Seccion>

      {/* Calificación actual, con autoría */}
      <Seccion titulo="Calificación">
        {calif?.actualizadoAt ? (
          <div style={{ fontSize: 11, color: T.textFaint, marginBottom: 6 }}>
            Última: {formatDate(calif.actualizadoAt)}{calif.actualizadoPor ? ` · por ${calif.actualizadoPor}` : ""}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: T.textFaint, marginBottom: 6 }}>
            Sin calificar aún — se completa en la visita (📋).
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "2px 16px" }}>
          {califValores.map((c, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, padding: "3px 0" }}>
              <span style={{ color: T.textMuted, minWidth: 0 }}>{c.pregunta}</span>
              <span style={{ color: c.medido ? T.text : T.textFaint, fontWeight: c.medido ? 700 : 400, flexShrink: 0 }}>{c.etiqueta}</span>
            </div>
          ))}
        </div>
      </Seccion>

      {/* Actividad — lista de eventos TIPADOS (crece por builders en la lib) */}
      <Seccion titulo="Actividad">
        {eventos.length === 0 ? (
          <div style={{ fontSize: 12, color: T.textFaint }}>Sin actividad registrada todavía.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {eventos.map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 8, background: T.bg, border: `1px solid ${T.borderSoft}`, borderRadius: 8, padding: "6px 10px" }}>
                <span style={{ flexShrink: 0 }}>{e.icono}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>{e.titulo}</div>
                  {e.detalle && <div style={{ fontSize: 11, color: T.textMuted }}>{e.detalle}</div>}
                </div>
                <div style={{ fontSize: 10, color: T.textFaint, flexShrink: 0, textAlign: "right" }}>
                  {e.at ? formatDate(e.at) : ""}{e.por ? <><br />{e.por}</> : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </Seccion>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn variant="secondary" onClick={onClose}>Cerrar</Btn>
      </div>
    </Modal>
  );
}
