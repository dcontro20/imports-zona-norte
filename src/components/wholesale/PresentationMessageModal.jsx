import { useState, useEffect } from "react";
import { Modal, Btn } from "../UI.jsx";
import { T } from "../../theme.js";
import { useAppContext } from "../../AppContext.js";
import { useResponsive } from "../../App.jsx";
import { presentationMessage } from "../../lib/wholesaleMessage.js";
import { buildWaUrl } from "../../lib/whatsappPhone.js";
import { derivarTelefonoWa } from "../../lib/whatsappMigration.js";

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
// FLUJO WHATSAPP (handoff 2026-08-10, Cambio 2+3): el link va con el número
// normalizado 549 — wa.me en mobile (deep-link a la app), web.whatsapp.com en
// desktop (WhatsApp Web, chat abierto con el texto cargado, a un Enter).
// **Abrir WhatsApp NO registra contacto**: WhatsApp no permite disparar el
// envío desde una URL (el Enter final siempre lo da una persona), así que el
// sistema no puede saber qué pasó del otro lado. Al volver, el modal pregunta
// y el humano confirma:
//   🟢 Sí, mensaje enviado  → onEnviado (mensajeEnviadoAt ⇒ ⏳) + tieneWhatsApp true
//   🔴 No, no lo envié      → NADA se registra; el prospecto queda en 💬
//   🚫 No está en WhatsApp  → tieneWhatsApp false; NADA de contacto se registra
//
// `onEnviado` (ciclo v2 F3): registra el HECHO "mensaje enviado". Copiar solo
// NO cuenta: copiar no es enviar, y esta casa deriva de hechos, no de
// intenciones. `onMarcarWhatsApp(target, bool)`: el dato "tiene WhatsApp" se
// construye con el uso — no existe consulta legítima de antemano.
export function PresentationMessageModal({ open, onClose, target, onEnviado, onMarcarWhatsApp }) {
  const { currentUser } = useAppContext();
  const { isMobile } = useResponsive();
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const remitente = currentUser?.name || "";

  // Regenera al abrir; después el texto es editable a mano.
  useEffect(() => {
    if (!open) return;
    setText(presentationMessage(target, { remitente }));
    setCopied(false);
    setConfirmando(false);
  }, [open, target, remitente]);

  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => {});
  };

  const enviar = () => { onEnviado?.(target); onClose?.(); };

  // Teléfono normalizado EN VIVO (no el estampado por la migración): si el
  // phone se editó en esta misma sesión, el link no miente. El campo
  // persistido queda para listas y filtros.
  const { telefonoWa, telefonoInvalido } = derivarTelefonoWa(target || {});
  const abrirWhatsApp = () => {
    const url = buildWaUrl(telefonoWa, text, { isMobile });
    if (!url) return;
    window.open(url, "_blank", "noopener");
    // Abrir NO registra nada: el hecho lo confirma el humano al volver.
    setConfirmando(true);
  };

  const confirmarEnviado = () => { onMarcarWhatsApp?.(target, true); enviar(); };
  const sinWhatsApp = () => { onMarcarWhatsApp?.(target, false); onClose?.(); };

  return (
    <Modal open={open} onClose={onClose} title={`💬 Presentación — ${target?.businessName || target?.name || ""}`}>
      {confirmando ? (
        // Vuelta de WhatsApp: la pregunta. Cerrar el modal acá equivale a
        // "no lo envié" — sin confirmación explícita no se registra nada.
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: T.text, marginBottom: 6 }}>
            ¿Enviaste el mensaje?
          </div>
          <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 16, lineHeight: 1.5 }}>
            Abrir WhatsApp no registra el contacto: el sistema solo anota lo que confirmes acá.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Btn onClick={confirmarEnviado}>🟢 Sí, mensaje enviado</Btn>
            <Btn variant="secondary" onClick={() => setConfirmando(false)}>🔴 No, no lo envié</Btn>
            {onMarcarWhatsApp && (
              <Btn variant="secondary" onClick={sinWhatsApp}>🚫 El número no está en WhatsApp</Btn>
            )}
          </div>
        </div>
      ) : (
        <>
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
              : telefonoWa
                ? <Btn onClick={abrirWhatsApp}>💬 Mandar por WhatsApp</Btn>
                : null)}
          </div>
          {onEnviado && !copied && !telefonoWa && (
            <div style={{ fontSize: 11, color: T.textFaint, marginTop: 8, textAlign: "right" }}>
              {telefonoInvalido
                ? `El teléfono "${target?.phone}" no sirve para WhatsApp: copiá el mensaje y confirmá cuando lo hayas mandado.`
                : "Sin teléfono: copiá el mensaje y confirmá cuando lo hayas mandado."}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
