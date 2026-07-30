// src/prospecting.js
//
// Lógica PURA de captación mayorista: embudo (pipeline), priorización de
// prospectos y cobertura por zona. Sin red, sin Firestore.
//
// Modelo:
//   - `prospects` = leads que todavía NO son clientes (etapas prospecto →
//     contactado → visitado). Al llegar a "primera_compra" se promocionan a
//     `client` con type="mayorista" (y el prospecto queda con convertedClientId).
//   - Los clientes mayoristas siguen el embudo en sus etapas propias
//     (primera_compra → activo → en_pausa) vía client.pipelineStage.

import { prospectToSignals } from "./lib/prospectSignals.js";
import { RUBRICA_IZN } from "./lib/prospectRubric.js";
import { construirScore, PRIORIDADES } from "./lib/prospectScoring.js";
// Nota: prospectSignals.js importa zonesCoverage/lastVisitFor de este módulo.
// El ciclo es deliberado y benigno (solo llamadas en runtime, nada al evaluar
// el módulo) — ver docs/PROSPECT_ENGINE_ARQUITECTURA.md.

const MS_DAY = 86400000;

export const PROSPECT_STAGES_ORDER = ["prospecto", "contactado", "visitado"];
export const CLIENT_STAGES_ORDER = ["primera_compra", "activo", "en_pausa"];
export const PIPELINE_FULL_ORDER = [...PROSPECT_STAGES_ORDER, ...CLIENT_STAGES_ORDER];

const activeProspect = (p) => p && !p.isDeleted && !p.convertedClientId;
const activeMayorista = (c) => c && !c.isDeleted && c.type === "mayorista";
const normZone = (z) => (z || "").trim() || "Sin zona";

// Conteo por etapa combinando prospectos (primeras 3) + clientes mayoristas (últimas 3).
export function pipelineCounts({ prospects = [], clients = [] } = {}) {
  const counts = {};
  PIPELINE_FULL_ORDER.forEach(s => { counts[s] = 0; });
  (prospects || []).filter(activeProspect).forEach(p => {
    const s = p.pipelineStage || "prospecto";
    if (counts[s] != null) counts[s] += 1;
  });
  (clients || []).filter(activeMayorista).forEach(c => {
    const s = c.pipelineStage || "activo";
    if (counts[s] != null) counts[s] += 1;
  });
  return counts;
}

// Días desde una fecha ISO (o null si no hay fecha válida).
export function daysSince(dateISO, now = Date.now()) {
  const ms = new Date(dateISO || 0).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.floor((now - ms) / MS_DAY);
}

// Prioriza prospectos activos. Dos caminos según `contexto`:
//   - SIN contexto (null/undefined): comportamiento histórico por recencia —
//     más avanzados en el embudo y más fríos primero. Cero breaking change.
//   - CON contexto ({ visits, clients, sales, products }): Prospect Engine —
//     señales TRI → rúbrica izn-v1 → motor, ordenado por VALOR COMERCIAL como
//     rank.py de Atlas: banda de prioridad → oportunidad ↓ → fit ↓ → confianza ↓
//     (la confianza es guardrail vía el gate de banda, no criterio de orden).
//     Prospectos sin ninguna señal conocida (prioridad "") van últimos.
// Shape de retorno:
//   sin contexto → [{ prospect, stage, daysSinceContact, score, reason }]
//     (histórico intacto; `score` = heurística de recencia, legacy)
//   con contexto → [{ prospect, stage, daysSinceContact, rankKey, reason, scoreResult }]
//     `rankKey` es una CLAVE TÉCNICA de ordenamiento (embedding del orden
//     banda→opp→fit→conf en un entero). JAMÁS mostrarla ni usarla como
//     indicador comercial: los valores de negocio para la UI son
//     scoreResult.opportunity.total, scoreResult.fit.total y
//     scoreResult.prioridad. Ver docs/PROSPECT_ENGINE_ARQUITECTURA.md.
export function prioritizeProspects(prospects = [], now = Date.now(), contexto = null) {
  const activos = (prospects || []).filter(activeProspect).map(p => ({
    p,
    stage: p.pipelineStage || "prospecto",
    d: daysSince(p.lastContactAt || p.foundAt, now),
  }));

  if (contexto == null) {
    return activos
      .map(({ p, stage, d }) => {
        const stageRank = Math.max(0, PROSPECT_STAGES_ORDER.indexOf(stage));
        const score = stageRank * 100 + (d || 0);
        let reason;
        if (stageRank === 2) reason = "Ya visitado — cerrá la primera compra";
        else if (d != null && d >= 7) reason = `Sin contacto hace ${d}d — seguir`;
        else reason = "Seguir el contacto";
        return { prospect: p, stage, daysSinceContact: d, score, reason };
      })
      .sort((a, b) => b.score - a.score);
  }

  return activos
    .map(({ p, stage, d }) => {
      const s = construirScore(prospectToSignals(p, contexto), RUBRICA_IZN, {
        prospectId: p.id || "",
      });
      // rankKey: escalar monótono con el orden de rank.py (banda → opp → fit →
      // conf). Banda "" (sin puntuar) queda debajo de "baja"; totales null
      // cuentan 0. Clave técnica opaca — no es un score comercial.
      const banda = s.prioridad ? PRIORIDADES.indexOf(s.prioridad) : PRIORIDADES.length;
      const rankKey = (PRIORIDADES.length - banda) * 1e12
        + Math.round((s.opportunity.total ?? 0) * 10) * 1e8
        + Math.round((s.fit.total ?? 0) * 10) * 1e4
        + Math.round((s.confidence ?? 0) * 1000);
      // Razón provisoria de Fase 3: el gap más fuerte confirmado. La reemplaza
      // el veredicto de prospectDiagnosis en Fases 4–5.
      let reason;
      if (!s.prioridad) reason = "Sin señales todavía — visitar y calificar";
      else reason = s.oportunidades[0] || `Sin gaps confirmados — encaje ${s.fit.total}`;
      return { prospect: p, stage, daysSinceContact: d, rankKey, reason, scoreResult: s };
    })
    .sort((a, b) => b.rankKey - a.rankKey);
}

// Cobertura por zona: cuántos mayoristas activos y cuántos prospectos hay por zona.
// Ordenado por volumen total (activos + prospectos) desc.
export function zonesCoverage({ clients = [], prospects = [] } = {}) {
  const map = {};
  const bump = (z, key) => {
    const zone = normZone(z);
    if (!map[zone]) map[zone] = { zone, activos: 0, prospectos: 0 };
    map[zone][key] += 1;
  };
  (clients || []).filter(activeMayorista).forEach(c => bump(c.zone, "activos"));
  (prospects || []).filter(activeProspect).forEach(p => bump(p.zone, "prospectos"));
  return Object.values(map).sort((a, b) => (b.activos + b.prospectos) - (a.activos + a.prospectos));
}

// Zonas con prospectos pero SIN ningún mayorista activo — dónde falta cerrar.
export function zonesWithoutCoverage(args) {
  return zonesCoverage(args).filter(z => z.activos === 0 && z.prospectos > 0);
}

// Última visita registrada a un target (prospecto o cliente).
export function lastVisitFor(visits = [], targetId) {
  if (!targetId) return null;
  return (visits || [])
    .filter(v => v && !v.isDeleted && v.targetId === targetId)
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;
}

// Resumen del embudo para KPIs: total prospectos activos, listos para cerrar
// (etapa visitado) y clientes mayoristas activos.
export function funnelSummary({ prospects = [], clients = [] } = {}) {
  const counts = pipelineCounts({ prospects, clients });
  const prospectosActivos = counts.prospecto + counts.contactado + counts.visitado;
  const listosParaCerrar = counts.visitado;
  const mayoristas = counts.primera_compra + counts.activo + counts.en_pausa;
  return { prospectosActivos, listosParaCerrar, mayoristas, counts };
}
