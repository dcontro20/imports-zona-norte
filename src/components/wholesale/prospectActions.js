// prospectActions.js — las acciones de gestión del prospecto (avanzar etapa /
// convertir a mayorista / borrar) como ÚNICA fuente: las usan el kanban
// (pestaña Embudo) y la Ficha (F3 del CRM). Extraídas de Pipeline SIN cambio
// de comportamiento — si esto y el kanban divergieran, dos pantallas contarían
// historias distintas sobre el mismo prospecto.
import { uid } from "../../helpers.js";
import { PROSPECT_STAGES_ORDER } from "../../prospecting.js";
import { suprimirDescubierto, puedeSuprimirse } from "../../lib/discovery/discoveryImport.js";
import {
  marcarAnalizado, marcarMensajeEnviado, marcarRespondio, marcarNoResponde, marcarNegociacion,
} from "../../lib/prospectHechos.js";

export function makeProspectActions({ setProspects, setClients, setDiscoverySuppressed, logAudit, currentUser }) {
  const now = () => new Date().toISOString();
  return {
    avanzar(p) {
      const i = PROSPECT_STAGES_ORDER.indexOf(p.pipelineStage || "prospecto");
      const next = PROSPECT_STAGES_ORDER[Math.min(i + 1, PROSPECT_STAGES_ORDER.length - 1)];
      setProspects(prev => prev.map(x => x.id === p.id ? { ...x, pipelineStage: next, lastContactAt: now() } : x));
    },
    convertir(p) {
      const id = uid();
      const newClient = {
        id, type: "mayorista",
        name: p.contactName || p.businessName || "Mayorista",
        businessName: p.businessName || "", businessType: null, wholesaleTier: null,
        zone: p.zone || "", address: p.address || "", phone: p.phone || "", contactName: p.contactName || "",
        source: p.source || "manual", pipelineStage: "primera_compra",
        tier: "regular", balance: 0, notes: p.notes || "",
        createdAt: now(), createdBy: currentUser?.name || "Sistema",
      };
      setClients(prev => [newClient, ...prev]);
      setProspects(prev => prev.map(x => x.id === p.id ? { ...x, convertedClientId: id, isDeleted: true, deletedAt: now(), deletedBy: currentUser?.name || "?" } : x));
      logAudit?.("convert", "prospect", p.id, `Prospecto → mayorista: ${newClient.businessName || newClient.name}`);
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
      logAudit?.("analyze", "prospect", p.id, `Analizado: ${p.businessName}`);
    },
    mensajeEnviado(p) {
      const at = now(), por = currentUser?.name || "?";
      setProspects(prev => prev.map(x => x.id === p.id ? marcarMensajeEnviado(x, { at, por }) : x));
      logAudit?.("message", "prospect", p.id, `Presentación enviada: ${p.businessName}`);
    },
    respondio(p) {
      const at = now();
      setProspects(prev => prev.map(x => x.id === p.id ? marcarRespondio(x, { at }) : x));
      logAudit?.("reply", "prospect", p.id, `Respondió: ${p.businessName}`);
    },
    noResponde(p) {
      const at = now();
      setProspects(prev => prev.map(x => x.id === p.id ? marcarNoResponde(x, { at }) : x));
      logAudit?.("noreply", "prospect", p.id, `No responde: ${p.businessName}`);
    },
    negociar(p) {
      const at = now();
      setProspects(prev => prev.map(x => x.id === p.id ? marcarNegociacion(x, { at }) : x));
      logAudit?.("negotiate", "prospect", p.id, `Pasó a negociación: ${p.businessName}`);
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
      return conMemoria;
    },
  };
}
