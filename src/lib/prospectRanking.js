// prospectRanking.js — LA FACHADA del Prospect Engine para la UI.
//
// Este es el ÚNICO módulo del engine que la capa de React debe importar.
// Coordina todo el flujo (señales → rúbrica → motor → diagnóstico → ranking)
// y devuelve un resultado terminado: la UI solo renderiza, sin conocer cómo se
// generan señales, cómo se calcula el score ni cómo se ordena.
//
//   const { items, porId } = buildProspectRanking({ prospects, visits, clients,
//                                                   sales, products, now });
//
// Cada item (ya ordenado por valor comercial, posicion 1..n):
//   { prospect, stage, daysSinceContact,      ← contrato de prioritizeProspects
//     rankKey,                                ← clave técnica: JAMÁS mostrarla
//     reason, scoreResult,                    ← fuente de verdad del diagnóstico
//     posicion,                               ← 1-based en el ranking global
//     chip: { prioridad, etiqueta, aviso },   ← tarjeta (U3): banda + aviso de
//                                               poca información (o null)
//     diagnostico,                            ← modal: veredicto, sentencia,
//                                               razones, señales de visita
//                                               faltantes, enDetalle
//     proximoPaso }                           ← { tono, icono, texto, pendientes }
//
// `porId[prospect.id]` da el mismo item para lookup O(1) (chips del kanban,
// modal). Para ordenar una columna del kanban: sort por `posicion` (U2).
// Reglas de consumo completas: docs/PROSPECT_ENGINE_ARQUITECTURA.md.

import { prioritizeProspects } from "../prospecting.js";
import { RUBRICA_IZN } from "./prospectRubric.js";
import { diagnostico, proximoPaso, avisoLista } from "./prospectDiagnosis.js";

// La UI del modal de visita importa estos dos desde acá (single import point):
export { CALIFICACION_CAMPOS, aplicarCalificacion } from "./prospectSignals.js";

export const ETIQUETA_PRIORIDAD = {
  muy_alta: "Muy alta",
  alta: "Alta",
  media: "Media",
  baja: "Baja",
  "": "Sin datos",
};

export function buildProspectRanking({
  prospects = [], visits, clients, sales, products, now = Date.now(),
} = {}) {
  const ranked = prioritizeProspects(prospects, now, { visits, clients, sales, products });
  const items = ranked.map((item, i) => {
    const diag = diagnostico(item.scoreResult, { rubrica: RUBRICA_IZN });
    return {
      ...item,
      posicion: i + 1,
      chip: {
        prioridad: item.scoreResult.prioridad,
        etiqueta: ETIQUETA_PRIORIDAD[item.scoreResult.prioridad] ?? ETIQUETA_PRIORIDAD[""],
        aviso: avisoLista(item.scoreResult.confidence),
      },
      diagnostico: diag,
      proximoPaso: proximoPaso({
        stage: item.stage,
        daysSinceContact: item.daysSinceContact,
        senalesVisitaFaltantes: diag.senalesVisitaFaltantes,
      }),
    };
  });
  const porId = {};
  for (const it of items) porId[it.prospect.id] = it;
  return { items, porId };
}
