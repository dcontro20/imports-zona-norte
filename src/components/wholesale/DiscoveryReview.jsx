// DiscoveryReview.jsx — la superficie del discovery en la app: nueva búsqueda,
// estado de las búsquedas en curso y descartados con memoria (contrato §3/§7).
//
// El MODAL DE REVISIÓN se eliminó en F2 del ciclo v2 (auto-ingesta): los
// descubiertos ya no esperan confirmación — entran solos en `por_analizar` y
// el análisis humano pasó a ser una etapa operativa, no un modal. El dedup no
// se perdió: lo hace ingestarDescubiertos() con las MISMAS funciones puras.
// El descarte con memoria vive ahora en el prospecto (prospectActions.descartar).
import { useState, useEffect } from "react";
import { Btn, Modal, MiniBtn, Input } from "../UI.jsx";
import { T } from "../../theme.js";
import { validarBusqueda, TOPE_DEFAULT, TOPE_MAX } from "../../lib/discovery/discoverRun.js";
import { formatDate } from "../../helpers.js";

const BUSQUEDA_VACIA = { termino: "", zona: "", ubicacion: "", tope: String(TOPE_DEFAULT) };

// Modal de nueva búsqueda (contrato §3): crea el job que el worker va a tomar.
// La validación es la del dominio (validarBusqueda — el validate_encargo de
// IZN); acá solo se pinta el primer problema. `inicial` pre-carga campos
// (p. ej. la zona desde "🔎 buscar en esta zona" — F2 del CRM).
export function DiscoverySearchModal({ open, onClose, onCreate, inicial = null }) {
  const [form, setForm] = useState(BUSQUEDA_VACIA);
  const [err, setErr] = useState("");
  useEffect(() => { if (open) { setForm({ ...BUSQUEDA_VACIA, ...(inicial || {}) }); setErr(""); } }, [open, inicial]);

  const crear = () => {
    const zona = form.zona.trim();
    // Ubicación para Maps: si no la especifican, se compone desde la zona.
    const ubicacion = form.ubicacion.trim() || (zona ? `${zona}, Buenos Aires, Argentina` : "");
    const busqueda = { termino: form.termino.trim(), zona, ubicacion, tope: Number(form.tope) };
    const probs = validarBusqueda(busqueda);
    if (probs.length) { setErr(probs[0].replace(/^GRAVE: /, "")); return; }
    onCreate?.(busqueda);
  };

  return (
    <Modal open={open} onClose={onClose} title="🔎 Descubrir negocios">
      <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 10 }}>
        La búsqueda corre en Google Maps (puede tardar varios minutos). Los
        resultados entran solos como "por analizar" — no se contacta a nadie
        hasta que los mires.
      </div>
      <Input label="Qué buscar *" placeholder="kiosco, maxikiosco, drugstore..."
        value={form.termino} onChange={e => setForm(f => ({ ...f, termino: e.target.value }))} />
      <Input label="Zona *" placeholder="Palermo"
        value={form.zona} onChange={e => setForm(f => ({ ...f, zona: e.target.value }))} />
      <Input label={`Ubicación para el mapa (si la dejás vacía: "${form.zona.trim() || "zona"}, Buenos Aires, Argentina")`}
        placeholder="Palermo, CABA, Argentina"
        value={form.ubicacion} onChange={e => setForm(f => ({ ...f, ubicacion: e.target.value }))} />
      <Input label={`Tope de resultados (máx ${TOPE_MAX})`} type="number"
        value={form.tope} onChange={e => setForm(f => ({ ...f, tope: e.target.value }))} />
      {err && <div style={{ color: T.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={crear}>Buscar</Btn>
      </div>
    </Modal>
  );
}

const JOB_ESTADO = {
  pendiente: { icono: "⏳", texto: "en cola", color: T.textMuted },
  en_curso: { icono: "🔄", texto: "buscando...", color: T.blue },
  error: { icono: "⚠️", texto: "error", color: T.red },
};

// Filas de estado de las búsquedas activas (todo lo que no está "listo" —
// lo listo se ve como staging en el banner de revisión).
export function DiscoveryJobsStatus({ jobs = [], onCancel }) {
  const activos = jobs.filter(j => j && j.status !== "listo");
  if (!activos.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
      {activos.map(j => {
        const e = JOB_ESTADO[j.status] || JOB_ESTADO.pendiente;
        return (
          <div key={j.id} style={{
            background: T.bg, border: `1px solid ${T.borderSoft}`, borderRadius: 10,
            padding: "8px 12px", display: "flex", alignItems: "center", gap: 8,
          }}>
            {/* El pulso solo en "buscando": feedback de trabajo en curso (D-A) */}
            <span style={{ flexShrink: 0, animation: j.status === "en_curso" ? "pulseSoft 1.6s ease-in-out infinite" : undefined }}>{e.icono}</span>
            <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: T.text }}>
              <b>"{j.termino}"</b> — {j.zona} · <span style={{ color: e.color }}>{e.texto}</span>
              {j.status === "error" && j.error && (
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{j.error}</div>
              )}
            </div>
            {(j.status === "pendiente" || j.status === "error") && (
              <span style={{ flexShrink: 0 }}>
                <MiniBtn color={T.red} onClick={() => onCancel?.(j)}>✕</MiniBtn>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Modal de descartados con memoria (§7): lista + rehabilitación explícita.
export function DiscoverySuppressedModal({ open, onClose, suprimidos = [], onRehabilitar }) {
  return (
    <Modal open={open} onClose={onClose} title="⛔ Descartados del descubrimiento">
      <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 10 }}>
        Estos negocios no aparecen en búsquedas futuras. Rehabilitar borra el bloqueo.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "60vh", overflowY: "auto" }}>
        {suprimidos.map(s => (
          <div key={s.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: T.text }}>{s.nombre || s.web}</div>
              <div style={{ fontSize: 11, color: T.textMuted }}>{s.direccion}</div>
              <div style={{ fontSize: 10, color: T.textFaint }}>
                {s.motivo}{s.at ? ` · ${formatDate(s.at)}` : ""}{s.por ? ` · por ${s.por}` : ""}
              </div>
            </div>
            <span style={{ flexShrink: 0 }}>
              <MiniBtn color={T.green} onClick={() => onRehabilitar?.(s)}>↩ Rehabilitar</MiniBtn>
            </span>
          </div>
        ))}
        {suprimidos.length === 0 && (
          <div style={{ fontSize: 12, color: T.textFaint, textAlign: "center", padding: 16 }}>
            No hay descartados.
          </div>
        )}
      </div>
    </Modal>
  );
}
