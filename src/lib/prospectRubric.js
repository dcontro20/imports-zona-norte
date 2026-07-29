// prospectRubric.js — la rúbrica de Imports para el Prospect Engine, como DATOS.
// Versión izn-v1 · BORRADOR del diseño §7 (PROSPECT_ENGINE_DESIGN.md) — los
// pesos y filas se calibran mirando el ranking real "a ojo" (Fase 2 §11);
// lo que se ajusta son estas filas, JAMÁS el motor (prospectScoring.js).
//
// Cada fila: { id, pregunta, peso, fuente, fraseOportunidad, fraseFortaleza }
//   - fuente: "auto" (la señal sale de datos que ya existen: zonas, visitas,
//     ventas, contacto) | "visita" (sale de la calificación rápida en la
//     visita — prospect.calificacion, se captura en Fase 4).
//     El motor ignora este campo; lo usará la UI para "faltan N señales de visita".
//   - fraseOportunidad se emite cuando el criterio dispara ("si") en oportunidad.
//   - fraseFortaleza se emite con "no" en oportunidad y con "si" en fit.
//     Tono según messageTones.js: breve, directo, sin marketinés.
//
// REGLA del port: acá no entra ni una fila de la rúbrica de Atlas.

// Oportunidad — "¿cuánto espacio hay para entrarle?"
export const OPORTUNIDAD = [
  { id: "op_sin_proveedor", pregunta: "¿No tiene proveedor estable de la categoría?", peso: 18,
    fuente: "visita",
    fraseOportunidad: "No tiene proveedor fijo de la categoría — entrada directa",
    fraseFortaleza: "Ya tiene proveedor estable" },
  { id: "op_no_vende", pregunta: "¿Todavía no vende la categoría? (mercado virgen)", peso: 14,
    fuente: "visita",
    fraseOportunidad: "Todavía no vende la categoría — mercado virgen",
    fraseFortaleza: "Ya vende la categoría" },
  { id: "op_zona_sin_mayorista", pregunta: "¿Está en zona sin mayorista nuestro activo?", peso: 12,
    fuente: "auto",
    fraseOportunidad: "Zona sin mayorista nuestro — el primero se queda la zona",
    fraseFortaleza: null },
  { id: "op_interes_declarado", pregunta: "¿La última visita terminó \"interesado\" o \"volver\"?", peso: 12,
    fuente: "auto",
    fraseOportunidad: "La última visita terminó con interés declarado",
    fraseFortaleza: null },
  { id: "op_nunca_visitado", pregunta: "¿Nunca recibió una visita nuestra?", peso: 8,
    fuente: "auto",
    fraseOportunidad: "Nunca recibió una visita nuestra — nadie le ofreció",
    fraseFortaleza: null },
  { id: "op_producto_vecino", pregunta: "¿En su zona la categoría ya rota bien?", peso: 10,
    fuente: "auto",
    fraseOportunidad: "En su zona la categoría ya rota — demanda probada al lado",
    fraseFortaleza: null },
  { id: "op_referido", pregunta: "¿Llegó por referido?", peso: 6,
    fuente: "auto",
    fraseOportunidad: "Llegó por referido — puerta tibia",
    fraseFortaleza: null },
  { id: "op_sin_competencia_visible", pregunta: "¿No se le vio surtido de un competidor?", peso: 8,
    fuente: "visita",
    fraseOportunidad: "Sin surtido de competidor a la vista",
    fraseFortaleza: "Ya le compra la categoría a otro (demanda confirmada)" },
];

// Fit — "¿qué tan buen cliente mayorista sería?"
export const FIT = [
  { id: "fit_tamano", pregunta: "¿Local medio o grande?", peso: 20,
    fuente: "visita",
    fraseOportunidad: null,
    fraseFortaleza: "Local con tamaño para volumen" },
  { id: "fit_movimiento", pregunta: "¿Se ve movimiento/tránsito real?", peso: 18,
    fuente: "visita",
    fraseOportunidad: null,
    fraseFortaleza: "Se ve movimiento real en el local" },
  { id: "fit_zona_reparto", pregunta: "¿Está en zona con reparto/clientes activos?", peso: 16,
    fuente: "auto",
    fraseOportunidad: null,
    fraseFortaleza: "En zona de reparto activa — la logística ya paga" },
  { id: "fit_decisor", pregunta: "¿Está identificado el que decide, con teléfono?", peso: 14,
    fuente: "auto",
    fraseOportunidad: null,
    fraseFortaleza: "Decisor identificado con teléfono directo" },
  { id: "fit_receptividad", pregunta: "¿Alguna visita con outcome positivo?", peso: 12,
    fuente: "auto",
    fraseOportunidad: null,
    fraseFortaleza: "Ya mostró receptividad en visitas" },
];

export const RUBRICA_IZN = {
  version: "izn-v1",
  oportunidad: OPORTUNIDAD,
  fit: FIT,
};
