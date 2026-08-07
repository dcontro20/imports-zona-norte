import { useState, useEffect } from "react";
import { Modal, Btn } from "../UI.jsx";
import { T } from "../../theme.js";
import { useAppContext } from "../../AppContext.js";
import { presentationMessage } from "../../lib/wholesaleMessage.js";

// Modal compartido (Prospectos + Kioscos) para el mensaje de PRIMER CONTACTO.
// Preview EDITABLE → mandar por WhatsApp o copiar. Pensado para el celu con el
// kiosco enfrente.
//
// Desde 2026-08-07 el texto es UNO SOLO para todos los kioscos: sin tier y sin
// precios (decisión de Gustavo tras prospectar de verdad — el primer mensaje no
// vende, solo confirma que del otro lado atiende el local). El selector de tier
// se retiró: no había nada que elegir. El remitente sale del usuario logueado,
// así que el mensaje dice quién escribe de verdad.
//
// `onEnviado` (ciclo v2 F3): registra el HECHO "mensaje enviado" — hasta acá
// presentar no dejaba rastro y la etapa no podía derivar la espera. Se llama
// cuando el usuario efectivamente MANDA (abre WhatsApp) o confirma a mano que
// ya lo mandó tras copiar. Copiar solo NO cuenta: copiar no es enviar, y esta
// casa deriva de hechos, no de intenciones.
export function PresentationMessageModal({ open, onClose, target, onEnviado }) {
  const { currentUser } = useAppContext();
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const remitente = currentUser?.name || "";

  // Regenera al abrir; después el texto es editable a mano.
  useEffect(() => {
    if (!open) return;
    setText(presentationMessage(target, { remitente }));
    setCopied(false);
  }, [open, target, remitente]);

  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => {});
  };

  const enviar = () => { onEnviado?.(target); onClose?.(); };

  // wa.me con el texto ya cargado: la acción primaria de la cola 💬 es
  // "enviar la presentación", no "copiarla".
  const tel = String(target?.phone || "").replace(/\D/g, "");
  const abrirWhatsApp = () => {
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    enviar();
  };

  return (
    <Modal open={open} onClose={onClose} title={`💬 Presentación — ${target?.businessName || target?.name || ""}`}>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={4} style={{
        width: "100%", boxSizing: "border-box", padding: 12,
        background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10,
        color: T.text, fontSize: 16, fontFamily: "inherit", lineHeight: 1.45,
        resize: "vertical", outline: "none", marginBottom: 12,
      }} />
      <div style={{ fontSize: 11, color: T.textFaint, marginBottom: 12 }}>
        Mismo mensaje para todos: primero confirmás con quién hablás. Los precios van después, cuando la charla avanza. Editá lo que quieras antes de mandar.
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <Btn variant="secondary" onClick={onClose}>Cerrar</Btn>
        <Btn variant="secondary" onClick={copy}>{copied ? "✅ Copiado" : "📋 Copiar"}</Btn>
        {onEnviado && (copied
          // Copió y lo va a pegar a mano: que confirme el hecho, no lo asumimos.
          ? <Btn onClick={enviar}>✅ Ya lo mandé</Btn>
          : tel
            ? <Btn onClick={abrirWhatsApp}>💬 Mandar por WhatsApp</Btn>
            : null)}
      </div>
      {onEnviado && !copied && !tel && (
        <div style={{ fontSize: 11, color: T.textFaint, marginTop: 8, textAlign: "right" }}>
          Sin teléfono: copiá el mensaje y confirmá cuando lo hayas mandado.
        </div>
      )}
    </Modal>
  );
}
