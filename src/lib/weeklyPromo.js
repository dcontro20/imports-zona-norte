// src/lib/weeklyPromo.js
//
// "Promo de la semana" — UNA promo elegida por impacto económico, estable
// toda la semana (cambia los lunes).
//
// POR QUÉ una sola y fija:
//   - La repetición vende. El cliente la ve el lunes, la piensa el
//     miércoles, la compra el viernes. Si cambia todos los días, nunca
//     se asienta en la cabeza de nadie.
//   - Diego no tiene que elegir entre 15: el sistema rankea por impacto
//     y muestra la ganadora + 2 alternativas por si no le gusta.
//
// SCORING (impacto económico estimado, todo con margen garantizado por
// los guards que ya tiene smartOffers):
//   liquidar    → capital liberado (peso alto: plata dormida que vuelve)
//   packfiesta  → precio del pack × probabilidad de venta (proxy ahorro)
//   combomarca  → ahorro ofrecido (mueve ticket alto)
//   mix         → ticket x3 esperado
//   dupla       → ticket x2 esperado
//   topseller   → potencial semanal (velocidad × precio)
//   crosssell   → precio combo
//
// Funciones PURAS.

const PROMO_CATEGORIES = ["liquidar", "packfiesta", "combomarca", "mix", "dupla", "topseller", "crosssell"];

// Semana ISO-ish: clave "YYYY-WW" estable de lunes a domingo
export function weekKey(now = new Date()) {
  const d = new Date(now);
  // Llevar al lunes de la semana
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d.toISOString().slice(0, 10); // lunes de esa semana como clave
}

function scoreIdea(idea) {
  const imp = idea.impact || {};
  switch (idea.category) {
    case "liquidar":
      return (imp.capitalFreedARS || 0) * 1.2; // plata dormida vale más
    case "packfiesta":
      return (imp.comboPriceARS || 0);
    case "combomarca":
      return (imp.comboRegularARS || 0) * 0.8;
    case "mix":
      return (imp.productCount || 0) * 30000; // proxy: ticket x3
    case "dupla":
      return (imp.productCount || 0) * 20000; // proxy: ticket x2
    case "topseller":
      return (imp.currentMarginPct || 0) * 1500;
    case "crosssell":
      return (imp.comboPriceARS || 0) * 0.7;
    default:
      return 0;
  }
}

// Elige la promo de la semana entre las ideas de suggestSmartOffers.
// Estable por semana: si la lista de ideas no cambia, la promo es la misma
// de lunes a domingo. Si Diego "descarta" la principal (pasa skipIds),
// sube la siguiente.
export function pickWeeklyPromo(ideas = [], { now = new Date(), skipIds = [] } = {}) {
  const candidates = (ideas || [])
    .filter(i => i && PROMO_CATEGORIES.includes(i.category))
    .filter(i => !skipIds.includes(i.id))
    .map(i => ({ idea: i, score: scoreIdea(i) }))
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    return { weekKey: weekKey(now), main: null, alternatives: [] };
  }

  return {
    weekKey: weekKey(now),
    main: candidates[0].idea,
    alternatives: candidates.slice(1, 3).map(c => c.idea),
  };
}
