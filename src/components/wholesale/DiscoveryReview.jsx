// DiscoveryReview.jsx — revisión humana de descubiertos (contrato §4/§6/§7).
// Regla de consumo: esta UI usa SOLO discoveryImport.js (revisar/puedeSuprimirse);
// no calcula claves ni dedup por su cuenta. El llamador (Pipeline) persiste.
// Nada entra al Pipeline sin pasar por acá — el filtro de rubro es humano.
import { useMemo, useState, useEffect } from "react";
import { Btn, Modal, MiniBtn, Badge, Input } from "../UI.jsx";
import { T } from "../../theme.js";
import { revisarDescubiertos, puedeSuprimirse } from "../../lib/discovery/discoveryImport.js";
import { validarBusqueda, TOPE_DEFAULT, TOPE_MAX } from "../../lib/discovery/discoverRun.js";
import { formatDate } from "../../helpers.js";

const ESTADO_BADGE = {
  duplicado: { color: T.amber, texto: "duplicado" },
  suprimido: { color: T.red, texto: "descartado antes" },
};

// Modal de revisión de UNA búsqueda terminada (un doc de discoveryResults).
// onConfirm({ altas, supresiones, sinMemoria }) — listas de prospectos staged.
export function DiscoveryReviewModal({ open, onClose, resultado, prospects = [], clients = [], suprimidos = [], onConfirm }) {
  const revision = useMemo(
    () => revisarDescubiertos({ prospectos: resultado?.prospectos || [], prospects, clients, suprimidos }),
    [resultado, prospects, clients, suprimidos],
  );
  // Índices (sobre revision.items) marcados para descartar. Default: importar.
  const [descartes, setDescartes] = useState(() => new Set());
  useEffect(() => { setDescartes(new Set()); }, [resultado?.id]);

  if (!resultado) return null;

  const toggle = (i, descartar) => setDescartes(prev => {
    const next = new Set(prev);
    if (descartar) next.add(i); else next.delete(i);
    return next;
  });

  const confirmar = () => {
    const altas = [], supresiones = [], sinMemoria = [];
    revision.items.forEach((item, i) => {
      if (item.estado !== "importable") return;
      if (!descartes.has(i)) altas.push(item.prospecto);
      else if (puedeSuprimirse(item.prospecto)) supresiones.push(item.prospecto);
      else sinMemoria.push(item.prospecto);
    });
    onConfirm?.({ altas, supresiones, sinMemoria });
  };

  const nAltas = revision.importables - [...descartes].filter(i => revision.items[i]?.estado === "importable").length;

  return (
    <Modal open={open} onClose={onClose} title={`🔎 "${resultado.termino}" — ${resultado.zona}`}>
      <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 10 }}>
        {revision.importables} para importar · {revision.duplicados} duplicados · {revision.suprimidos} descartados antes
        {resultado.at ? ` · búsqueda del ${formatDate(resultado.at)}` : ""}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "55vh", overflowY: "auto", marginBottom: 12 }}>
        {revision.items.map((item, i) => {
          const p = item.prospecto;
          const accionable = item.estado === "importable";
          const descartado = descartes.has(i);
          const badge = ESTADO_BADGE[item.estado];
          return (
            <div key={i} style={{
              background: accionable ? T.card : T.bg, border: `1px solid ${accionable ? T.border : T.borderSoft}`,
              borderRadius: 10, padding: 10, opacity: accionable ? 1 : 0.7,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: T.text }}>{p.businessName}</div>
                  <div style={{ fontSize: 11, color: T.textMuted }}>
                    {p.address || "sin dirección"}
                    {p.phone ? ` · 📞 ${p.phone}` : ""}
                    {p.rating != null ? ` · ★ ${p.rating}${p.reviewsCount != null ? ` (${p.reviewsCount})` : ""}` : ""}
                  </div>
                  {p.categoria && <div style={{ fontSize: 10, color: T.textFaint }}>{p.categoria}{p.redSocial ? ` · ${p.redSocial}` : ""}</div>}
                  {item.motivo && <div style={{ fontSize: 10, color: T.textFaint, marginTop: 2 }}>{item.motivo}</div>}
                </div>
                {badge && <span style={{ flexShrink: 0 }}><Badge color={badge.color}>{badge.texto}</Badge></span>}
              </div>
              {accionable && (
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <MiniBtn color={descartado ? T.textFaint : T.green} onClick={() => toggle(i, false)}
                    style={!descartado ? { background: T.greenBg, borderColor: T.greenBorder } : undefined}>
                    ✓ Importar
                  </MiniBtn>
                  <MiniBtn color={descartado ? T.red : T.textFaint} onClick={() => toggle(i, true)}
                    style={descartado ? { background: T.redBg, borderColor: T.redBorder } : undefined}>
                    ✗ Descartar
                  </MiniBtn>
                  {descartado && !puedeSuprimirse(p) && (
                    <span style={{ fontSize: 10, color: T.textFaint, alignSelf: "center" }}>
                      sin identidad suficiente — se descarta sin memoria
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {revision.items.length === 0 && (
          <div style={{ fontSize: 12, color: T.textFaint, textAlign: "center", padding: 16 }}>
            La búsqueda no trajo resultados.
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: T.textFaint, marginBottom: 10 }}>
        Los descartados no vuelven a aparecer en búsquedas futuras (se pueden rehabilitar desde ⛔ Descartados).
        Los importados entran al Pipeline y el ranking los ordena solo.
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={confirmar}>
          {nAltas > 0 ? `Importar ${nAltas}` : "Confirmar"}
        </Btn>
      </div>
    </Modal>
  );
}

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
        resultados llegan acá para revisar — nada entra al Pipeline solo.
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
            <span style={{ flexShrink: 0 }}>{e.icono}</span>
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
