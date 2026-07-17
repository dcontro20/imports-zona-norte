// src/lib/messageCopyBank.js
//
// 🎨 BANCO DE COPYS — el material creativo del Agente Redactor.
//
// POR QUÉ ASÍ (decisión de Diego: "sin costos extra, aprovechemos el plan MAX"):
//   - Llamar a la API de Anthropic por token cuesta plata aparte del plan MAX.
//   - En vez de eso, la creatividad la escribe Claude EN LA SESIÓN de Diego
//     (que ya paga el MAX) y la deja acá, en este banco. El sistema en vivo sólo
//     SELECCIONA del banco de forma contextual y rotada — cero costo, cero red,
//     cero infra frágil.
//   - Para refrescar el material: `/regenerar-banco-mensajes` en Claude Code.
//     Eso reescribe este archivo usando el plan MAX, sin gasto extra.
//
// Resultado: el mensaje diario varía por día, horario y situación del stock, y
// nunca se repite dentro de un ciclo largo — pero sin depender de una API paga.
//
// Funciones PURAS. La selección es DETERMINISTA (mismo día+slot+stock → mismo
// copy), lo que hace que sea consistente entre dispositivos y 100% testeable.

// ---------------------------------------------------------------------------
// POOLS DE GANCHO (hook) — la línea de apertura, pura vibra
// ---------------------------------------------------------------------------
// Se rota por (daySeed + slot) para que cambie cada día y entre mediodía/tarde.

const HOOKS_WEEKDAY = [
  "¡Buenas! Acá andamos con todo 💨",
  "Arrancó el día y hay stock fresco 🔥",
  "Lista actualizada para vos 👇",
  "Pasamos a mostrar lo que hay 💨",
  "Día de semana, modo full activado ⚡",
  "Acá estamos, con el catálogo cargado 😎",
  "Buen día! Mirá lo que tenemos hoy 👀",
  "Update de stock recién salido 🔥",
  "Todo listo para tu pedido de hoy 💨",
  "Volvemos con la lista del día 👇",
];

const HOOKS_WEEKEND = [
  "FINDE 🍾 y tenemos de todo 💨",
  "Llegó el finde, stock a full 🔥",
  "Arranca el finde con todo cargado 🎉",
  "Modo finde activado, mirá esto 👇",
  "Finde = momento de elegir el tuyo 😎",
  "Sábado/finde y la lista está completa 💨",
  "Para que armes tu finde 🎉 mirá 👇",
  "Finde a pura vibra 🌴 stock listo 🔥",
  "El finde se disfruta mejor con esto 💨",
  "Clima de finde, catálogo completo 👀",
];

// "Bit" de stats que acompaña al gancho — también rota.
const STAT_BITS = [
  "({flavors} sabores en stock)",
  "— {flavors} sabores disponibles 💨",
  "tenemos {flavors} sabores cargados 🔥",
  "{models} modelos / {flavors} sabores listos",
  "catálogo completo: {flavors} sabores",
];

// ---------------------------------------------------------------------------
// POOLS DE URGENCIA (urgency) — por situación, se rellena con datos reales
// ---------------------------------------------------------------------------

const URGENCY_NOVEDAD = [
  "🆕 Recién llegados: {names}",
  "🆕 Cayó stock nuevo: {names}",
  "✨ Novedad de la semana: {names}",
  "🆕 Sumamos al catálogo: {names}",
];

const URGENCY_AGOTANDO = [
  "⚡ Últimas unidades de {name} (quedan {stock})",
  "🏃 Volando: {name}, quedan {stock}",
  "⌛ Casi sin stock de {name} (quedan {stock})",
  "🔥 Se está por agotar {name} ({stock} u)",
];

const URGENCY_TOP = [
  "⭐ Los más pedidos: {names}",
  "🔝 Lo que más sale: {names}",
  "🤝 Favoritos del grupo: {names}",
  "💯 Recomendados de la semana: {names}",
];

// En situación "normal" la mayoría de las veces no hay línea de urgencia.
const URGENCY_NORMAL = [null, null, "💬 Cualquier consulta me escribís", null];

// ---------------------------------------------------------------------------
// POOLS DE CIERRE (cta) — por slot
// ---------------------------------------------------------------------------

const CTA_NOON = [
  "Escribime y lo coordinamos 📲",
  "Hacé tu pedido por privado 📲",
  "Reservá el tuyo, escribime 📲",
  "Mandame mensaje y arreglamos 📲",
];

const CTA_EVENING = [
  "Quedan pocas horas para coordinar hoy ⏳ escribime 📲",
  "Último llamado del día, escribime 📲",
  "Cierro pedidos en un rato, mandame 📲",
  "Coordinamos para hoy o mañana, escribime 📲",
];

// ---------------------------------------------------------------------------
// SELECTOR
// ---------------------------------------------------------------------------

// Toma un elemento del pool de forma determinista según el índice de rotación.
function pick(pool, idx) {
  if (!pool || pool.length === 0) return null;
  return pool[((idx % pool.length) + pool.length) % pool.length];
}

// Nombres legibles, hasta `max`, separados por " · ".
function joinNames(items, max = 2) {
  return (items || []).slice(0, max).map(x => x.name).filter(Boolean).join(" · ");
}

// Decide la situación a partir del contexto (prioridad: novedad > agotando > top > normal).
export function detectSituation(context = {}) {
  if ((context.newArrivals || []).length > 0) return "novedad";
  if ((context.lowStock || []).length > 0) return "agotando";
  if ((context.topSellers || []).length > 0) return "top";
  return "normal";
}

// Genera el copy del día a partir del contexto. Devuelve { hook, urgency, cta, source, situation }.
//
// La rotación usa context.daySeed (día epoch) + offset por slot, así:
//   - cambia todos los días
//   - mediodía ≠ tarde el mismo día
//   - es determinista (consistente entre dispositivos)
export function pickDailyCopy(context = {}) {
  const slot = context.slot === "evening" ? "evening" : "noon";
  const seed = Number(context.daySeed) || 0;
  const idx = seed * 2 + (slot === "evening" ? 1 : 0);

  const s = context.stats || {};
  const isWeekend = !!context.isWeekend;
  const hookVibe = pick(isWeekend ? HOOKS_WEEKEND : HOOKS_WEEKDAY, idx) || "¡Hola!";
  const statBit = (pick(STAT_BITS, idx) || "({flavors} sabores en stock)")
    .replaceAll("{flavors}", String(s.flavors || 0))
    .replaceAll("{models}", String(s.models || 0));
  const hook = `${hookVibe} ${statBit}`.trim();

  const situation = detectSituation(context);
  let urgency = null;
  if (situation === "novedad") {
    urgency = (pick(URGENCY_NOVEDAD, idx) || "").replaceAll("{names}", joinNames(context.newArrivals));
  } else if (situation === "agotando") {
    const ls = context.lowStock[0];
    urgency = (pick(URGENCY_AGOTANDO, idx) || "")
      .replaceAll("{name}", ls.name)
      .replaceAll("{stock}", String(ls.stock));
  } else if (situation === "top") {
    urgency = (pick(URGENCY_TOP, idx) || "").replaceAll("{names}", joinNames(context.topSellers));
  } else {
    urgency = pick(URGENCY_NORMAL, idx);
  }
  if (urgency === "") urgency = null;

  const cta = pick(slot === "evening" ? CTA_EVENING : CTA_NOON, idx) || "Escribime 📲";

  return { hook, urgency, cta, source: "bank", situation };
}

// Métrica de variedad — útil para tests y para reportar "cuántos días sin repetir".
export function bankSize() {
  return {
    hooksWeekday: HOOKS_WEEKDAY.length,
    hooksWeekend: HOOKS_WEEKEND.length,
    statBits: STAT_BITS.length,
    ctaNoon: CTA_NOON.length,
    ctaEvening: CTA_EVENING.length,
  };
}
