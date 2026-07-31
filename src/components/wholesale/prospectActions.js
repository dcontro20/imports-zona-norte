// prospectActions.js — las acciones de gestión del prospecto (avanzar etapa /
// convertir a mayorista / borrar) como ÚNICA fuente: las usan el kanban
// (pestaña Embudo) y la Ficha (F3 del CRM). Extraídas de Pipeline SIN cambio
// de comportamiento — si esto y el kanban divergieran, dos pantallas contarían
// historias distintas sobre el mismo prospecto.
import { uid } from "../../helpers.js";
import { PROSPECT_STAGES_ORDER } from "../../prospecting.js";

export function makeProspectActions({ setProspects, setClients, logAudit, currentUser }) {
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
  };
}
