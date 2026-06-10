// src/lib/messageTones.js
//
// Manifiesto de marca + pools rotativos de openers/closers/CTAs.
// Los mensajes ya no se sienten "plantillados": cada vez que se genera
// uno, el sistema elige aleatoriamente del pool del tono correspondiente.
//
// === MANIFIESTO DE TONO IZN ===
// 1. Voseo argentino siempre ("avisame", "querés", "tenés")
// 2. Sin saludos forzados ni emojis al inicio de TODOS los mensajes
// 3. Cero "Diego" / nombre personal. Solo IZN o nada
// 4. Conversacional, no corporativo. Como hablás con un amigo cliente
// 5. Sin frases marketinianas ("oferta imperdible", "no te lo pierdas")
// 6. Emojis con criterio: 1-2 por mensaje, solo donde aportan
// 7. Brevedad: cuanto más corto, más se lee
// 8. CTAs con urgencia honesta (no inventada): si quedan 3 uds, decilo
//
// Funciones PURAS.

// Hash determinístico básico para "random pero estable" según un seed
// (ej: el ID de la oferta + el día). Así si Diego copia el mismo mensaje
// dos veces seguidas, sale igual; pero entre mensajes diferentes varía.
function hashSeed(s) {
  if (!s) return Date.now();
  let h = 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function pick(pool, seed) {
  if (!pool || pool.length === 0) return "";
  if (seed === undefined || seed === null) {
    return pool[Math.floor(Math.random() * pool.length)];
  }
  return pool[hashSeed(seed) % pool.length];
}

// ============================================================================
// POOLS POR TONO
// ============================================================================

// WARM (cliente individual) — cálido pero corto, sin frases hechas
const WARM_OPENERS = [
  (ctx = {}) => ctx.clientName ? `Hola ${ctx.clientName},` : "Hola,",
  (ctx = {}) => ctx.clientName ? `${ctx.clientName}, ¿todo bien?` : "¿Todo bien?",
  (ctx = {}) => ctx.clientName ? `Buenas ${ctx.clientName},` : "Buenas,",
  (ctx = {}) => ctx.clientName ? `${ctx.clientName}, te tiraba esto:` : "Te tiraba esto:",
  () => "Buenas,",
];

const WARM_CLOSERS = [
  "Cualquier cosa avisame 💬",
  "Si te copa, decime.",
  "Lo aparto si querés.",
  "Avisame y arreglamos.",
  "Cualquier duda por acá.",
];

// COMMERCIAL (grupo propio) — directo, identificable como negocio
const COMMERCIAL_OPENERS = [
  () => "*IZN — Imports Zona Norte*",
  () => "*IZN · Zona Norte 💨*",
  () => "Buenas, gente.",
  () => "*Novedades IZN:*",
  () => "Atención clientes IZN:",
];

const COMMERCIAL_CLOSERS = [
  "📲 Pedidos por DM",
  "Reservas y consultas por privado",
  "Coordinamos por DM",
  "Para reservar, escriben por privado",
  "Avisan por DM y arreglamos",
];

// CASUAL (grupo de fiestas) — vibe relajado, sin push
const CASUAL_OPENERS = [
  (ctx = {}) => ctx.weekend ? "Buenas! Para el finde 👇" : "Buenas gente,",
  () => "Hola che,",
  (ctx = {}) => ctx.weekend ? "Para los que están preparando finde:" : "Pasaba por acá,",
  () => "Buenas,",
  (ctx = {}) => ctx.weekend ? "¿Listos para el finde?" : "Para los que quieran:",
];

const CASUAL_CLOSERS = [
  "Si quieren algo, DM 🤙",
  "Cualquier cosa escriben por privado.",
  "Mandan privado y arreglamos.",
  "Estoy por acá si necesitan.",
  "DM si les copa.",
];

const POOLS = {
  warm: { openers: WARM_OPENERS, closers: WARM_CLOSERS },
  commercial: { openers: COMMERCIAL_OPENERS, closers: COMMERCIAL_CLOSERS },
  casual: { openers: CASUAL_OPENERS, closers: CASUAL_CLOSERS },
};

// API pública — pickOpener / pickCloser por tono
export function pickOpener(tone, ctx = {}, seed) {
  const pool = (POOLS[tone] || POOLS.warm).openers;
  const fn = pick(pool, seed);
  return typeof fn === "function" ? fn(ctx) : fn;
}

export function pickCloser(tone, ctx = {}, seed) {
  const pool = (POOLS[tone] || POOLS.warm).closers;
  const fn = pick(pool, seed);
  return typeof fn === "function" ? fn(ctx) : fn;
}

// ============================================================================
// CTAs CON URGENCIA / ESCASEZ POR TIPO DE OFERTA
// ============================================================================
// Estas se insertan ANTES del closer cuando aplica.

export function urgencyLine(offerType, ctx = {}) {
  const { stock, daysLeft, recentBuyers, comboQty } = ctx;
  switch (offerType) {
    case "liquidacion":
      if (stock && stock <= 5) return `_Quedan ${stock} ${stock === 1 ? "unidad" : "unidades"}._`;
      if (stock) return `_${stock} en stock._`;
      return "_Hasta agotar stock._";
    case "topsemana":
      if (recentBuyers && recentBuyers >= 3) return `_Esta semana ya lo llevaron ${recentBuyers} personas._`;
      return "_Promo válida esta semana._";
    case "reactivar":
      return daysLeft ? `_Te lo dejo separado hasta el ${daysLeft}._` : "_Te lo aparto unos días._";
    case "packfiesta":
      return "_Pack para esta finde — armé este para que les rinda._";
    case "drop":
    case "restock":
      return "_Recién entraron — primero el que avisa._";
    case "mix3x2":
    case "duplapack":
    case "combomarca":
      return comboQty ? `_Combiná los sabores como quieras (mínimo ${comboQty}u)._` : "_Combinás los sabores como quieras._";
    default:
      return "";
  }
}
