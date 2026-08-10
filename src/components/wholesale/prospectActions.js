// prospectActions.js — las acciones de gestión del prospecto como ÚNICA
// fuente: las usan las colas de ☀️ Hoy y la Ficha. Si divergieran, dos
// pantallas contarían historias distintas sobre el mismo prospecto.
//
// Ciclo v2: se retiró `avanzar` (escribía `pipelineStage` a mano). Las etapas
// ya no se mueven — se DERIVAN de hechos, y los hechos se registran con las
// acciones de abajo. Mover una etapa sin que haya pasado nada era, justamente,
// la mentira que este ciclo eliminó.
import { uid } from "../../helpers.js";
import { suprimirDescubierto, puedeSuprimirse } from "../../lib/discovery/discoveryImport.js";
import {
  marcarAnalizado, marcarMensajeEnviado, marcarRespondio, marcarNoResponde, marcarNegociacion,
} from "../../lib/prospectHechos.js";

// `onHecho(prospectoActualizado, hecho)` (F5): el llamador decide qué mostrar.
// Existe porque en un sistema que DERIVA la etapa, cada acción reubica al
// prospecto sin que se vea — y eso desorienta. El prospecto actualizado se
// calcula acá, FUERA del updater de state (los updaters se pueden invocar dos
// veces en StrictMode: no es lugar para efectos).
export function makeProspectActions({
  setProspects, setClients, setDiscoverySuppressed, logAudit, currentUser, onHecho,
}) {
  const now = () => new Date().toISOString();
  return {
    convertir(p) {
      const id = uid();
      const newClient = {
        id, type: "mayorista",
        name: p.contactName || p.businessName || "Mayorista",
        businessName: p.businessName || "", businessType: null,
        zone: p.zone || "", address: p.address || "", phone: p.phone || "", contactName: p.contactName || "",
        source: p.source || "manual", pipelineStage: "primera_compra",
        tier: "regular", balance: 0, notes: p.notes || "",
        createdAt: now(), createdBy: currentUser?.name || "Sistema",
      };
      setClients(prev => [newClient, ...prev]);
      setProspects(prev => prev.map(x => x.id === p.id ? { ...x, convertedClientId: id, isDeleted: true, deletedAt: now(), deletedBy: currentUser?.name || "?" } : x));
      logAudit?.("convert", "prospect", p.id, `Prospecto → mayorista: ${newClient.businessName || newClient.name}`);
      onHecho?.(p, "convertido");
    },
    borrar(p) {
      setProspects(prev => prev.map(x => x.id === p.id ? { ...x, isDeleted: true, deletedAt: now(), deletedBy: currentUser?.name || "?" } : x));
      logAudit?.("delete", "prospect", p.id, `Prospecto borrado: ${p.businessName}`);
    },
    // --- Captura de hechos (ciclo v2 F3) ---
    // Un tap = un hecho registrado. NINGUNA de estas acciones escribe una
    // etapa: la etapa se deriva sola de los hechos (prospectEtapas.js). Por eso
    // no hay "mover a la columna X" — hay "esto pasó".
    analizar(p) {
      const at = now(), por = currentUser?.name || "?";
      setProspects(prev => prev.map(x => x.id === p.id ? marcarAnalizado(x, { at, por }) : x));
      const actualizado = marcarAnalizado(p, { at, por });
      logAudit?.("analyze", "prospect", p.id, `Analizado: ${p.businessName}`);
      onHecho?.(actualizado, "analizado");
    },
    mensajeEnviado(p) {
      const at = now(), por = currentUser?.name || "?";
      setProspects(prev => prev.map(x => x.id === p.id ? marcarMensajeEnviado(x, { at, por }) : x));
      const actualizado = marcarMensajeEnviado(p, { at, por });
      logAudit?.("message", "prospect", p.id, `Presentación enviada: ${p.businessName}`);
      onHecho?.(actualizado, "mensaje_enviado");
    },
    respondio(p) {
      const at = now();
      setProspects(prev => prev.map(x => x.id === p.id ? marcarRespondio(x, { at }) : x));
      const actualizado = marcarRespondio(p, { at });
      logAudit?.("reply", "prospect", p.id, `Respondió: ${p.businessName}`);
      onHecho?.(actualizado, "respondio");
    },
    noResponde(p) {
      const at = now();
      setProspects(prev => prev.map(x => x.id === p.id ? marcarNoResponde(x, { at }) : x));
      const actualizado = marcarNoResponde(p, { at });
      logAudit?.("noreply", "prospect", p.id, `No responde: ${p.businessName}`);
      onHecho?.(actualizado, "no_responde");
    },
    // tieneWhatsApp NO es un hecho de etapa: es un DATO del prospecto que se
    // construye con el uso (handoff 2026-08-10, Cambio 4 — no hay forma
    // legítima de consultarlo de antemano). No mueve colas, por eso vive acá
    // y no en prospectHechos. true acompaña al "Sí, mensaje enviado" (si lo
    // mandó, el número existe); false viene de WhatsApp Web diciendo que el
    // número no está — y NO registra contacto: el prospecto queda donde está.
    marcarWhatsApp(p, tiene) {
      setProspects(prev => prev.map(x => x.id === p.id ? { ...x, tieneWhatsApp: !!tiene } : x));
      logAudit?.("whatsapp", "prospect", p.id,
        (tiene ? "WhatsApp confirmado: " : "El número no está en WhatsApp: ") + p.businessName);
      // Solo el false avisa: el true llega junto al hecho "mensaje enviado",
      // que ya cuenta su propia historia (el pase a ⏳).
      if (!tiene) onHecho?.({ ...p, tieneWhatsApp: false }, "sin_whatsapp");
    },
    negociar(p) {
      const at = now();
      setProspects(prev => prev.map(x => x.id === p.id ? marcarNegociacion(x, { at }) : x));
      const actualizado = marcarNegociacion(p, { at });
      logAudit?.("negotiate", "prospect", p.id, `Pasó a negociación: ${p.businessName}`);
      onHecho?.(actualizado, "negociacion");
    },

    // Descartar ≠ borrar: el descarte RECUERDA (supresión, contrato §7) — el
    // negocio no vuelve a entrar por el discovery salvo rehabilitación
    // explícita. Es el mecanismo que traía el modal de revisión; con la
    // auto-ingesta (F2) vive en el prospecto ya creado: se suprime la
    // identidad y el prospecto se soft-borra (queda en Papelera como todo).
    // Sin identidad suficiente no hay memoria posible (regla heredada: un
    // bloqueo que no puede matchear es un hueco silencioso) — se avisa
    // devolviendo `false` y se borra igual.
    descartar(p, { motivo = "descartado desde la ficha" } = {}) {
      const at = now();
      const conMemoria = puedeSuprimirse(p);
      if (conMemoria) {
        const entrada = suprimirDescubierto(p, { id: uid(), motivo, at, por: currentUser?.name || "?" });
        setDiscoverySuppressed?.(prev => [entrada, ...prev]);
      }
      setProspects(prev => prev.map(x => x.id === p.id
        ? { ...x, descartadoAt: at, isDeleted: true, deletedAt: at, deletedBy: currentUser?.name || "?" }
        : x));
      logAudit?.("discard", "prospect", p.id,
        `Prospecto descartado${conMemoria ? " (con memoria)" : " sin memoria — identidad insuficiente"}: ${p.businessName}`);
      onHecho?.(p, conMemoria ? "descartado" : "descartado_sin_memoria");
      return conMemoria;
    },
  };
}
