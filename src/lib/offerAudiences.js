// src/lib/offerAudiences.js
//
// Audiencias para ofertas de WhatsApp. Cada una tiene un tono distinto que
// cambia opener, closer y vocabulario del mensaje. Funciones PURAS.
//
// Tres audiencias:
//   individual    — cliente puntual, mensaje cálido y personalizado
//   groupClients  — grupo propio de WhatsApp, broadcast comercial
//   groupParty    — grupo de fiestas/techno (amigo), vibe casual soft-sell

export const AUDIENCES = {
  individual: {
    key: "individual",
    icon: "👤",
    label: "Cliente individual",
    description: "Mensaje personalizado, con nombre y historial",
    tone: "warm",
    needsClient: true,
    // Tipos de oferta que tienen sentido en esta audiencia
    suggestedTypes: ["reactivar", "topseller", "crosssell", "recordatorio", "drop", "destacado", "duplapack"],
  },
  groupClients: {
    key: "groupClients",
    icon: "📢",
    label: "Mi grupo de WhatsApp",
    description: "Broadcast comercial a tu grupo de clientes",
    tone: "commercial",
    needsClient: false,
    // Multi-sabor pega más en grupos: empuja a llevar más por venta
    suggestedTypes: ["stocklist", "topseller", "mix", "combomarca", "dupla", "comboamigos", "liquidar", "drop", "restock", "destacado", "liquidacion"],
  },
  groupParty: {
    key: "groupParty",
    icon: "🎵",
    label: "Grupo de fiestas",
    description: "Vibe casual para grupos de techno/eventos. Soft-sell.",
    tone: "casual",
    needsClient: false,
    suggestedTypes: ["packfiesta", "mix", "combomarca", "comboamigos", "stocklist", "recordatorio", "drop"],
  },
};

export const AUDIENCE_LIST = Object.values(AUDIENCES);

export function getAudience(key) {
  return AUDIENCES[key] || AUDIENCES.individual;
}

// Tonos: opener y closer del mensaje según audiencia.
// ctx puede traer: clientName, weekend (bool), isToday, etc.
//
// REGLA: ningún tono firma con nombre personal (Diego). Solo el negocio (IZN).
// Lenguaje natural, sin frases forzadas tipo "te dejo un mimo".
export const TONES = {
  warm: {
    opener: (ctx = {}) => ctx.clientName
      ? `Hola ${ctx.clientName}!`
      : "Hola!",
    closer: () => "Cualquier consulta por acá 💬",
    callToAction: "Avisame y lo aparto",
  },
  commercial: {
    opener: () => "*IMPORTS ZONA NORTE* 🔥",
    closer: () => "📲 Pedidos y consultas por DM",
    callToAction: "Pedidos por DM",
  },
  casual: {
    opener: (ctx = {}) => ctx.weekend
      ? "Buenas! 🌙 Para el finde —"
      : "Buenas gente —",
    closer: () => "Si quieren algo, mandan DM 🤙",
    callToAction: "Mandan DM y arreglamos",
  },
};

export function getTone(audienceKey) {
  const aud = getAudience(audienceKey);
  return TONES[aud.tone] || TONES.warm;
}

// Días donde tiene sentido enviar a esta audiencia (0=Dom, 6=Sáb)
export function audienceFitsDay(audienceKey, dow) {
  if (audienceKey === "groupParty") {
    // Pre-finde y finde: jueves a sábado
    return [4, 5, 6].includes(dow);
  }
  return true; // las otras audiencias todos los días
}
