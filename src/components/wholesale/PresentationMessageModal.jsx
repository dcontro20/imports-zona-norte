import { useState, useEffect } from "react";
import { Modal, Btn } from "../UI.jsx";
import { T } from "../../theme.js";
import { WHOLESALE_TIERS } from "../../constants.js";
import { presentationMessage } from "../../lib/wholesaleMessage.js";

// Modal compartido (Prospectos + Pipeline + Kioscos) para el mensaje de
// PRESENTACIÓN B2B: primer contacto con un kiosco. Elegís el tier a ofrecer →
// preview EDITABLE → mandar por WhatsApp o copiar. Pensado para el celu con el
// kiosco enfrente.
//
// `onEnviado` (ciclo v2 F3): registra el HECHO "mensaje enviado" — hasta acá
// presentar no dejaba rastro y la etapa no podía derivar la espera. Se llama
// cuando el usuario efectivamente MANDA (abre WhatsApp) o confirma a mano que
// ya lo mandó tras copiar. Copiar solo NO cuenta: copiar no es enviar, y esta
// casa deriva de hechos, no de intenciones.
export function PresentationMessageModal({ open, onClose, target, defaultTier = "C", products = [], exchangeRate = 0, onEnviado }) {
  const [tier, setTier] = useState(defaultTier);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) setTier(defaultTier || "C");
  }, [open, defaultTier]);

  // Regenera al abrir o cambiar de tier; después el texto es editable a mano.
  useEffect(() => {
    if (!open) return;
    setText(presentationMessage(target, { tier, products, exchangeRate }));
    setCopied(false);
  }, [open, tier, target, products, exchangeRate]);

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
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: T.textMuted, fontWeight: 700 }}>Tier a ofrecer:</span>
        {WHOLESALE_TIERS.map(t => (
          <Btn key={t} variant={tier === t ? "primary" : "secondary"} onClick={() => setTier(t)}
            style={{ padding: "8px 16px" }}>{t}</Btn>
        ))}
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={10} style={{
        width: "100%", boxSizing: "border-box", padding: 12,
        background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10,
        color: T.text, fontSize: 16, fontFamily: "inherit", lineHeight: 1.45,
        resize: "vertical", outline: "none", marginBottom: 12,
      }} />
      <div style={{ fontSize: 11, color: T.textFaint, marginBottom: 12 }}>
        Los precios salen de la lista del tier elegido (solo productos con stock). Editá lo que quieras antes de copiar.
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
