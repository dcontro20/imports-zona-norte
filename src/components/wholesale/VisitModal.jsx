// VisitModal.jsx — registro de visita + calificación rápida (Prospect Engine).
// Extraído de Pipeline en F2 del mini CRM (spec docs/PROSPECT_CRM_SPEC.md)
// para usarlo también desde la pestaña Hoy. Comportamiento IDÉNTICO:
//   - la calificación arranca en el estado actual del prospecto (lo ya sabido
//     se conserva; lo nunca evaluado aparece "Sin datos");
//   - solo se re-califica si algo cambió (no se re-sella autor/fecha gratis);
//   - clientes: solo actualiza lastVisitAt (sin calificación).
// Consume SOLO la fachada del engine (CALIFICACION_CAMPOS/calificacionActual/
// aplicarCalificacion) — regla de consumo intacta.
import { useState, useEffect } from "react";
import { uid } from "../../helpers.js";
import { Btn, Modal, Input, Select, MiniBtn } from "../UI.jsx";
import { T } from "../../theme.js";
import { VISIT_OUTCOMES } from "../../constants.js";
import {
  CALIFICACION_CAMPOS, calificacionActual, aplicarCalificacion,
} from "../../lib/prospectRanking.js";
import { useAppContext } from "../../AppContext.js";

// target: { id, type: "prospect" | "client", name } | null (cerrado).
export function VisitModal({ target, onClose, prospects = [], setProspects, setClients, setVisits }) {
  const { currentUser, logAudit } = useAppContext();
  const [visit, setVisit] = useState({ outcome: "interesado", notes: "" });
  const [calif, setCalif] = useState({});

  useEffect(() => {
    if (target) {
      setVisit({ outcome: "interesado", notes: "" });
      setCalif(target.type === "prospect"
        ? calificacionActual(prospects.find(p => p?.id === target.id))
        : {});
    }
    // Snapshot al abrir (igual que el openVisit original): prospects no es dep.
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    const v = { id: uid(), targetId: target.id, targetType: target.type, date: new Date().toISOString(), outcome: visit.outcome, notes: visit.notes.trim(), byUser: currentUser?.name || "?" };
    setVisits(prev => [v, ...prev]);
    if (target.type === "prospect") {
      // Solo se re-califica si algo cambió: sellar autor y fecha sin haber
      // evaluado nada diría "lo revisamos hoy" cuando no se revisó.
      const previa = calificacionActual(prospects.find(p => p?.id === target.id));
      const cambio = CALIFICACION_CAMPOS.some(c => calif[c.campo] !== previa[c.campo]);
      setProspects(prev => prev.map(p => {
        if (p.id !== target.id) return p;
        const conRecencia = { ...p, lastContactAt: v.date };
        return cambio
          ? aplicarCalificacion(conRecencia, calif, { autor: currentUser?.name || "?", at: v.date })
          : conRecencia;
      }));
      if (cambio) logAudit?.("qualify", "prospect", target.id, `Calificación actualizada: ${target.name}`);
    } else {
      setClients(prev => prev.map(c => c.id === target.id ? { ...c, lastVisitAt: v.date } : c));
    }
    logAudit?.("visit", target.type, target.id, `Visita a ${target.name}: ${visit.outcome}`);
    onClose();
  };

  return (
    <Modal open={!!target} onClose={onClose} title={`Visita — ${target?.name || ""}`}>
      <Select label="Resultado" options={VISIT_OUTCOMES} value={visit.outcome} onChange={e => setVisit(s => ({ ...s, outcome: e.target.value }))} />

      {/* Calificación rápida (Prospect Engine): los controles, sus opciones y
          el merge los define el dominio. Acá solo se pintan y se eligen. */}
      {target?.type === "prospect" && (
        <div style={{ marginBottom: 14, background: T.bg, border: `1px solid ${T.borderSoft}`, borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: T.text }}>Calificación rápida</div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8 }}>
            Opcional. Lo que no marques queda sin datos — nunca se completa solo.
          </div>
          {CALIFICACION_CAMPOS.map(c => (
            <div key={c.campo} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: T.textSub, marginBottom: 4 }}>{c.pregunta}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {c.opciones.map(o => {
                  const sel = calif[c.campo] === o.valor;
                  return (
                    <MiniBtn key={o.valor} color={sel ? T.blue : T.textFaint}
                      onClick={() => setCalif(s => ({ ...s, [c.campo]: o.valor }))}
                      style={sel ? { background: T.blueBg, borderColor: T.blueBorder } : undefined}>
                      {o.etiqueta}
                    </MiniBtn>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Input label="Notas" value={visit.notes} onChange={e => setVisit(s => ({ ...s, notes: e.target.value }))} />
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={save}>Registrar</Btn>
      </div>
    </Modal>
  );
}
