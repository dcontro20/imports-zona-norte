// prospectHechos.js — los HECHOS que las pantallas capturan con un tap
// (spec CONGELADO docs/PROSPECT_CRM_EJECUCION_SPEC.md §2, F3 del ciclo v2).
//
// Cada hecho es una función PURA prospecto → prospecto que estampa su campo y
// nada más. **Acá jamás se escribe una etapa**: la etapa la deriva
// prospectEtapas.js a partir de estos campos. Si alguna vez alguien tiene la
// tentación de setear `etapa` a mano, el sistema deja de contar la verdad de
// lo que pasó y pasa a contar lo que alguien tipeó.
//
// Regla de crecimiento: un hecho nuevo = una función acá + su lectura en la
// derivación + su builder en prospectActividad.js. Las pantallas no cambian.

// Campos que estampa cada hecho (tabla §2). Exportado para que la Actividad y
// los tests hablen de los mismos nombres que el spec.
export const CAMPOS_HECHO = {
  analizado: ["analizadoAt", "analizadoPor"],
  mensajeEnviado: ["mensajeEnviadoAt", "mensajeEnviadoPor"],
  respondio: ["respondioAt"],
  noResponde: ["noRespondeAt"],
  negociacion: ["negociacionAt"],
};

// ✓ Trabajar: el análisis humano del descubierto. Es lo que habilita contactar
// (compromiso del §4 enmendado del contrato Discovery). Idempotente: re-marcar
// no pisa la autoría original del que lo analizó primero.
export function marcarAnalizado(p, { at, por } = {}) {
  if (!p || p.analizadoAt) return p;
  return { ...p, analizadoAt: at, analizadoPor: por || "" };
}

// Mensaje de presentación enviado. Limpia `noRespondeAt`: un mensaje NUEVO
// reabre la espera — si no, el sub-estado quedaría "reintentar" para siempre
// aunque acabe de escribirle.
export function marcarMensajeEnviado(p, { at, por } = {}) {
  if (!p) return p;
  return { ...p, mensajeEnviadoAt: at, mensajeEnviadoPor: por || "", noRespondeAt: "" };
}

// 🟢 Respondió. Con esto solo alcanza para derivar "negociación" (precedencia
// §3), así que no se estampa además `negociacionAt`: un hecho, un campo.
export function marcarRespondio(p, { at } = {}) {
  return p ? { ...p, respondioAt: at } : p;
}

// 🔴 No responde. NO saca al prospecto de la espera: lo marca para reintentar
// (subEstadoEspera). El trabajo sigue siendo insistir, no archivarlo.
export function marcarNoResponde(p, { at } = {}) {
  return p ? { ...p, noRespondeAt: at } : p;
}

// 🤝 Movimiento explícito a negociación (sin respuesta previa registrada:
// p. ej. la charla pasó en la visita).
export function marcarNegociacion(p, { at } = {}) {
  return p ? { ...p, negociacionAt: at } : p;
}
