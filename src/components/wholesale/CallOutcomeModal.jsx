import { Modal, Btn } from "../UI.jsx";
import { T } from "../../theme.js";

// Modal de DESENLACE de llamada (gate G3, 2026-08-11) — el gemelo telefónico
// de la confirmación de WhatsApp: tocar 📞 abre el discador y NO registra
// nada; al volver, esta pregunta captura lo que pasó de verdad y la
// derivación (prospectEtapas) hace el resto. Cerrar sin elegir no registra
// la llamada — el sistema jamás infiere.
//
// Los desenlaces son la matriz aprobada en G1 (no reabrir):
//   🤝 interesado → Negociación · 🚶 visita → Para visitar ·
//   ⏳ seguimiento → Esperando (timer desde la llamada) ·
//   📵 no atendió → registra el INTENTO, no mueve de cola ·
//   ✗ no interesado → descartar (con memoria), no es un hecho de llamada.
export function CallOutcomeModal({ target, onClose, onResultado, onDescartar }) {
  const elegir = (resultado) => { onResultado?.(target, resultado); onClose?.(); };
  return (
    <Modal open={!!target} onClose={onClose} title={`📞 Llamada — ${target?.businessName || ""}`}>
      <div style={{ fontSize: 17, fontWeight: 800, color: T.text, marginBottom: 6 }}>
        ¿Cómo salió la llamada?
      </div>
      <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 16, lineHeight: 1.5 }}>
        Abrir el discador no registra nada: contá el desenlace y el prospecto se acomoda solo. Cerrar sin elegir no registra la llamada.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Btn onClick={() => elegir("interesado")}>🤝 Quedó interesado</Btn>
        <Btn variant="secondary" onClick={() => elegir("visita")}>🚶 Quiere que lo visite</Btn>
        <Btn variant="secondary" onClick={() => elegir("seguimiento")}>⏳ Pidió seguimiento / info</Btn>
        <Btn variant="secondary" onClick={() => elegir("")}>📵 No atendió</Btn>
        <Btn variant="secondary" onClick={() => { onDescartar?.(target); onClose?.(); }}
          style={{ color: T.red, borderColor: T.redBorder }}>
          ✗ No le interesa — descartar
        </Btn>
      </div>
    </Modal>
  );
}
