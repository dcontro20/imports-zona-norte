// src/lib/dailyPlan.js
//
// "Plan de hoy" — el corazón del hábito diario de mensajes.
//
// FILOSOFÍA (experto en ventas):
//   - El hábito se construye eliminando la decisión. 2 slots fijos por día:
//     ☀️ Mediodía (12:00) y 🌆 Tarde (18:30).
//   - Cada slot tiene UN mensaje ya elegido y armado según el día de la
//     semana. Diego abre, copia, manda. Cero análisis.
//   - No todos los mensajes son promos: la mayoría son "presencia"
//     (stock, novedades, recordatorios). La promo va 2-3 veces por semana
//     máximo — si todo es promo, nada es promo.
//
// ROTACIÓN SEMANAL (basada en patrones de compra del rubro):
//   Lun ☀️ stocklist grupo (arranque de semana, gente planifica)
//       🌆 reactivar 1 dormido individual
//   Mar ☀️ topsemana grupo (prueba social: "los más pedidos")
//       🌆 recordatorio corto grupo fiestas... no, fiestas es Jue-Sab
//       🌆 destacado individual a frecuentes
//   Mié ☀️ comboamigos grupo (mitad de semana, armar plan finde)
//       🌆 drop/restock si hay, sino recordatorio suave
//   Jue ☀️ packfiesta grupo fiestas (pre-finde)
//       🌆 promo de la semana al grupo propio
//   Vie ☀️ stocklist grupo fiestas (finde!)
//       🌆 comboamigos grupo propio (compras grupales del finde)
//   Sáb ☀️ recordatorio "estoy disponible hoy" grupo
//       🌆 destacado top 3 con urgencia
//   Dom ☀️ —descanso— (slot vacío, no saturar)
//       🌆 reactivar 1 dormido (mensaje personal tranquilo de domingo)
//
// Funciones PURAS.

import { extractOffersFromAuditLog } from "./offerHistory.js";

const MS_PER_DAY = 86400000;

// === NOTA DE DISEÑO (pedido explícito de Diego) ===
// Los 2 slots diarios son SIEMPRE el mensaje de stock clásico de la sección
// WhatsApp (generateFullMessage) — copy/paste tal cual, sin variaciones.
// El objetivo es PRESENCIA: que el grupo lo vea todos los días.
// Las promos/ideas inteligentes viven aparte como sugerencias.
//
// La rotación semanal de abajo queda SOLO como sugerencia de promo extra
// del día (se muestra aparte, no reemplaza el mensaje de presencia).

// Plan por día de semana (0=Dom ... 6=Sáb)
const WEEKLY_ROTATION = {
  1: { // Lunes
    noon: { type: "stocklist", audience: "groupClients", label: "Stock list de arranque de semana", why: "Lunes la gente planifica la semana — mostrale qué tenés" },
    evening: { type: "reactivar", audience: "individual", label: "Reactivar 1 cliente dormido", why: "Mensaje personal a quien hace rato no compra" },
  },
  2: { // Martes
    noon: { type: "topsemana", audience: "groupClients", label: "Top de la semana", why: "Prueba social: 'los más pedidos' genera FOMO" },
    evening: { type: "destacado", audience: "individual", label: "Destacado a un cliente frecuente", why: "Tocá a tus frecuentes con lo nuevo que les puede gustar" },
  },
  3: { // Miércoles
    noon: { type: "comboamigos", audience: "groupClients", label: "Combo amigos", why: "Mitad de semana: la gente arma el plan del finde con amigos" },
    evening: { type: "drop", audience: "groupClients", label: "Novedades / restock", why: "Si entró algo nuevo, miércoles es buen día para anunciarlo" },
  },
  4: { // Jueves
    noon: { type: "packfiesta", audience: "groupParty", label: "Pack finde al grupo de fiestas", why: "Pre-finde: el grupo de fiestas arma su previa" },
    evening: { type: "weeklypromo", audience: "groupClients", label: "Promo de la semana", why: "Jueves-viernes es cuando más se concreta la compra" },
  },
  5: { // Viernes
    noon: { type: "stocklist", audience: "groupParty", label: "Stock al grupo de fiestas", why: "Viernes el grupo de fiestas define qué lleva" },
    evening: { type: "comboamigos", audience: "groupClients", label: "Combo amigos pre-finde", why: "Compras grupales de viernes a la noche" },
  },
  6: { // Sábado
    noon: { type: "recordatorio", audience: "groupClients", label: "Disponible hoy", why: "Recordatorio suave: estás activo el sábado" },
    evening: { type: "topsemana", audience: "groupClients", label: "Top 3 con urgencia", why: "Último empujón del finde con los más pedidos" },
  },
  0: { // Domingo
    noon: null, // descanso — no saturar
    evening: { type: "reactivar", audience: "individual", label: "Mensaje personal de domingo", why: "Domingo tranquilo: 1 mensaje personal a un dormido valioso" },
  },
};

// Devuelve el plan del día: 2 slots de PRESENCIA (mediodía + tarde),
// ambos con el mensaje de stock clásico de WhatsApp. Detecta si ya fueron
// enviados desde el auditLog (enviado <16h = mediodía, >=16h = tarde).
export function buildDailyPlan({ auditLog = [], now = new Date() } = {}) {
  const dow = now.getDay();

  // Mensajes enviados HOY (del audit log)
  const todayStr = now.toISOString().slice(0, 10);
  const sentToday = extractOffersFromAuditLog(auditLog)
    .filter(o => (o.timestamp || "").slice(0, 10) === todayStr);

  const noonSent = sentToday.some(o => new Date(o.timestamp).getHours() < 16);
  const eveningSent = sentToday.some(o => new Date(o.timestamp).getHours() >= 16);

  const slots = [
    {
      id: "noon",
      emoji: "☀️",
      timeLabel: "Mediodía (~12:00)",
      kind: "presence",
      audience: "groupClients",
      label: "Mensaje de stock al grupo",
      why: "Presencia diaria: que el grupo vea que estás activo y qué hay disponible",
      sent: noonSent,
    },
    {
      id: "evening",
      emoji: "🌆",
      timeLabel: "Tarde (~18:30)",
      kind: "presence",
      audience: "groupClients",
      label: "Mensaje de stock al grupo",
      why: "Segunda pasada: agarra a los que no vieron el del mediodía",
      sent: eveningSent,
    },
  ];

  // Sugerencia de promo extra del día (NO reemplaza la presencia — es opcional)
  const rotation = WEEKLY_ROTATION[dow] || {};
  const promoSuggestion = rotation.noon && rotation.noon.type !== "stocklist"
    ? rotation.noon
    : rotation.evening || null;

  return {
    dayOfWeek: dow,
    dayName: now.toLocaleDateString("es-AR", { weekday: "long" }),
    slots,
    promoSuggestion,
    sentCountToday: sentToday.length,
  };
}

// === STREAK — días seguidos mandando al menos 1 mensaje ===
// Devuelve { current, best, sentToday }
export function calcMessageStreak(auditLog = [], now = new Date()) {
  const offers = extractOffersFromAuditLog(auditLog);
  if (offers.length === 0) return { current: 0, best: 0, sentToday: false };

  // Set de días únicos con envíos
  const days = new Set(offers.map(o => (o.timestamp || "").slice(0, 10)).filter(Boolean));

  const todayStr = now.toISOString().slice(0, 10);
  const sentToday = days.has(todayStr);

  // Streak actual: contar hacia atrás desde hoy (o ayer si hoy aún no mandó)
  let current = 0;
  let cursor = new Date(now);
  if (!sentToday) cursor.setDate(cursor.getDate() - 1); // permitir que hoy aún no haya mandado
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (days.has(key)) {
      current += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else break;
  }

  // Best streak: recorrer todos los días ordenados
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  sorted.forEach(d => {
    if (prev) {
      const diff = (new Date(d) - new Date(prev)) / MS_PER_DAY;
      run = diff === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    if (run > best) best = run;
    prev = d;
  });

  return { current, best, sentToday };
}
