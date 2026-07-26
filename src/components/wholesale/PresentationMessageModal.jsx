import { useState, useEffect } from "react";
import { Modal, Btn } from "../UI.jsx";
import { T } from "../../theme.js";
import { WHOLESALE_TIERS } from "../../constants.js";
import { presentationMessage } from "../../lib/wholesaleMessage.js";

// Modal compartido (Pipeline + Kioscos) para el mensaje de PRESENTACIÓN B2B
// (Bloque 2 — front de ventas): primer contacto con un kiosco. Elegís el tier
// a ofrecer → preview EDITABLE (ajustás el texto ahí mismo) → copiar y pegar
// en WhatsApp. Pensado para el celu con el kiosco enfrente.
export function PresentationMessageModal({ open, onClose, target, defaultTier = "C", products = [], exchangeRate = 0 }) {
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
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Btn variant="secondary" onClick={onClose}>Cerrar</Btn>
        <Btn onClick={copy}>{copied ? "✅ Copiado" : "📋 Copiar"}</Btn>
      </div>
    </Modal>
  );
}
