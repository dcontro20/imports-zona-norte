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
    suggestedTypes: ["reactivar", "topseller", "crosssell", "recordatorio", "drop", "destacado"],
  },
  groupClients: {
    key: "groupClients",
    icon: "📢",
    label: "Mi grupo de WhatsApp",
    description: "Broadcast comercial a tu grupo de clientes",
    tone: "commercial",
    needsClient: false,
    suggestedTypes: ["stocklist", "liquidar", "topseller", "drop", "restock", "destacado", "liquidacion"],
  },
  groupParty: {
    key: "groupParty",
    icon: "🎵",
    label: "Grupo de fiestas",
    description: "Vibe casual para grupos de techno/eventos. Soft-sell.",
    tone: "casual",
    needsClient: false,
    suggestedTypes: ["packfiesta", "stocklist", "recordatorio", "drop"],
  },
};

export const AUDIENCE_LIST = Object.values(AUDIENCES);

export function getAudience(key) {
  return AUDIENCES[key] || AUDIENCES.individual;
}

// Tonos: opener y closer del mensaje según audiencia.
// ctx puede traer: clientName, weekend (bool), isToday, etc.
export const TONES = {
  warm: {
    opener: (ctx = {}) => ctx.clientName
      ? `Hola ${ctx.clientName}! 👋`
      : "Hola! 👋",
    closer: () => "Cualquier cosa avisame por acá!\n— Diego · IZN 💨",
    callToAction: "Avisame y te lo aparto",
  },
  commercial: {
    opener: () => "🔥 *IMPORTS ZONA NORTE* 🔥",
    closer: () => "📲 Reservás por DM\n— IZN",
    callToAction: "Reservá por DM",
  },
  casual: {
    opener: (ctx = {}) => ctx.weekend
      ? "Hola gente! 🎵\nPreparándose para la finde?"
      : "Hola gente! 🎵",
    closer: () => "Si necesitan, escriban x privado 🤙\n— IZN (Zona Norte) 💨",
    callToAction: "Escriban x privado!",
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
