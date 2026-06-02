// src/lib/offerCalendar.js
//
// Plan semanal sugerido de ofertas: qué audiencia y qué tipo de mensaje
// tiene sentido mandar cada día. La idea es mantenerse visualmente activo
// en WhatsApp sin saturar.
//
// Funciones PURAS.

const DAY_NAMES_LONG = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DAY_NAMES_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// Sugerencias por día. Cada día tiene 1-2 ideas de qué mandar.
// Tienen que coincidir con los tipos en smartOffers / offers.
const WEEK_PLAN = {
  // Domingo: planificación + cierre de semana suave
  0: [
    { audience: "individual", type: "recordatorio", reason: "Mensaje suave a clientes top: '¿necesitás para arrancar la semana?'" },
  ],
  // Lunes: arranque comercial al grupo
  1: [
    { audience: "groupClients", type: "stocklist", reason: "Arranque de semana: lista de stock + precios" },
    { audience: "individual", type: "reactivar", reason: "Reactivar 2-3 dormidos por DM uno a uno" },
  ],
  // Martes: empuje de lo que está parado
  2: [
    { audience: "groupClients", type: "liquidar", reason: "Mover stock parado con liquidación visible" },
    { audience: "individual", type: "topseller", reason: "Push de top-seller a clientes recurrentes" },
  ],
  // Miércoles: medio de semana — cross-sell + descanso del grupo
  3: [
    { audience: "individual", type: "crosssell", reason: "Combos sugeridos a clientes con historial" },
  ],
  // Jueves: pre-finde — empieza la audiencia fiesta
  4: [
    { audience: "groupParty", type: "packfiesta", reason: "Anunciar pack para la finde en grupo de fiestas" },
    { audience: "individual", type: "topseller", reason: "Push de top a clientes valiosos" },
  ],
  // Viernes: doble drop
  5: [
    { audience: "groupParty", type: "stocklist", reason: "Stock list pre-finde al grupo de fiestas" },
    { audience: "groupClients", type: "drop", reason: "Drop / restock al grupo propio" },
  ],
  // Sábado: vibe casual nocturna
  6: [
    { audience: "groupParty", type: "recordatorio", reason: "Casual: 'estoy disponible toda la noche'" },
    { audience: "groupClients", type: "topseller", reason: "Último empujón del fin de semana" },
  ],
};

// Genera el plan de la semana actual (lunes a domingo).
// Devuelve [{ dayName, dayShort, date, dow, isToday, isPast, suggestions }]
export function weeklyCalendar({ now = new Date() } = {}) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayDow = today.getDay();
  // Arrancamos en lunes: si hoy es domingo (0), volver 6 días; si lunes (1), 0 días; etc.
  const mondayOffset = todayDow === 0 ? -6 : 1 - todayDow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);

  const week = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dow = d.getDay();
    const isToday = d.getTime() === today.getTime();
    const isPast = d.getTime() < today.getTime();
    week.push({
      dayName: DAY_NAMES_LONG[dow],
      dayShort: DAY_NAMES_SHORT[dow],
      date: d,
      dow,
      isToday,
      isPast,
      suggestions: (WEEK_PLAN[dow] || []).map(s => ({ ...s })),
    });
  }
  return week;
}

// Sugerencias del día actual.
export function todaySuggestions({ now = new Date() } = {}) {
  const dow = new Date(now).getDay();
  return (WEEK_PLAN[dow] || []).map(s => ({ ...s }));
}

// ¿Es fin de semana? (Vie-Sáb-Dom)
export function isWeekend(date = new Date()) {
  const dow = date.getDay();
  return dow === 5 || dow === 6 || dow === 0;
}

// Próximo día con audience-fit para X audiencia.
export function nextFitDay(audienceKey, { now = new Date() } = {}) {
  const week = weeklyCalendar({ now });
  return week.find(d => !d.isPast && d.suggestions.some(s => s.audience === audienceKey)) || null;
}
