// src/lib/messageAgent.js
//
// 🤖 AGENTE REDACTOR — capa de IA que escribe el COPY HUMANO que envuelve el
// mensaje de stock diario.
//
// FILOSOFÍA (pedido de Diego: "que la IA trabaje sola y no sea siempre lo mismo"):
//   - El mensaje de presencia diario hoy es SIEMPRE idéntico (generateFullMessage).
//     Eso construye hábito pero cansa: el grupo ve el mismo texto dos veces por día.
//   - El redactor agrega variedad SIN tocar la parte sensible: la IA escribe sólo
//     el marco humano (gancho + urgencia + cierre) y lo varía por día/horario.
//     El CATÁLOGO (sabores, modelos, precios) lo sigue generando generateFullMessage,
//     que es determinista. La IA NUNCA inventa stock ni precios.
//
// SEPARACIÓN DE RESPONSABILIDADES:
//   - Este archivo: funciones PURAS (sin red, sin Firestore). Arma el contexto
//     que se le pasa al LLM, define el copy de respaldo (template) y ensambla el
//     mensaje final. Testeable al 100%.
//   - api/generate-daily-message.js: lee Firestore, llama a Claude, y si no hay
//     API key cae al template. Guarda el resultado en Firestore para que la app
//     y la push lo lean.
//
// El LLM produce SÓLO un objeto `copy` = { hook, urgency, cta }. Todo lo demás
// (qué datos ve, cómo se ensambla) vive acá y está testeado.

const MS_PER_DAY = 86400000;

// Los 2 slots diarios, alineados con dailyPlan.js / pushWindow.js.
export const MESSAGE_SLOTS = [
  { id: "noon", emoji: "☀️", timeLabel: "mediodía" },
  { id: "evening", emoji: "🌆", timeLabel: "tarde" },
];

// ---------------------------------------------------------------------------
// CONTEXTO PARA EL LLM
// ---------------------------------------------------------------------------

// Normaliza un producto a un nombre corto legible.
function productName(p) {
  return [p.brand, p.model, p.flavor].filter(Boolean).join(" ").trim();
}

// Construye el contexto que se le pasa al redactor (LLM o template). Es un objeto
// chico y JSON-serializable: el LLM sólo necesita SEÑALES para elegir el tono, no
// el catálogo completo (ese lo arma generateFullMessage aparte).
//
// Devuelve:
//   { slot, dayName, dayOfWeek, isWeekend, stats:{models,units,brands,flavors},
//     topSellers:[{name,units}], newArrivals:[{name}], lowStock:[{name,stock}] }
export function buildCatalogContext({ products = [], sales = [], now = new Date(), slot = "noon", newArrivalDays = 10 } = {}) {
  const active = (products || []).filter(p => p && !p.isDeleted && (Number(p.stock) || 0) > 0);

  // Stats agregadas del catálogo disponible.
  const models = new Set();
  const brands = new Set();
  active.forEach(p => {
    if (p.brand) brands.add(p.brand);
    models.add(`${p.brand}|${p.model}`);
  });
  const stats = {
    flavors: active.length,
    models: models.size,
    brands: brands.size,
    units: active.reduce((s, p) => s + (Number(p.stock) || 0), 0),
  };

  // Mapa id → producto activo (para resolver top sellers contra stock real).
  const byId = {};
  active.forEach(p => { byId[p.id] = p; });

  // Top sellers de los últimos 30 días que TODAVÍA tienen stock (no sirve
  // promocionar lo que no podés vender).
  const nowMs = now.getTime();
  const soldUnits = {};
  (sales || []).forEach(sale => {
    if (!sale || sale.isDeleted) return;
    const ms = new Date(sale.date).getTime();
    if (!Number.isFinite(ms) || nowMs - ms > 30 * MS_PER_DAY) return;
    (sale.items || []).forEach(it => {
      if (!it || !it.productId || !byId[it.productId]) return;
      soldUnits[it.productId] = (soldUnits[it.productId] || 0) + (Number(it.qty) || 0);
    });
  });
  const topSellers = Object.entries(soldUnits)
    .map(([id, units]) => ({ name: productName(byId[id]), units }))
    .filter(x => x.name && x.units > 0)
    .sort((a, b) => b.units - a.units)
    .slice(0, 5);

  // Novedades: productos con stock agregados en los últimos N días. `createdAt`
  // puede no existir en productos viejos — en ese caso simplemente no hay drop.
  const newArrivals = active
    .filter(p => {
      const ms = new Date(p.createdAt || p.addedDate || 0).getTime();
      return Number.isFinite(ms) && ms > 0 && nowMs - ms <= newArrivalDays * MS_PER_DAY;
    })
    .sort((a, b) => new Date(b.createdAt || b.addedDate || 0) - new Date(a.createdAt || a.addedDate || 0))
    .slice(0, 5)
    .map(p => ({ name: productName(p) }));

  // Por agotarse: stock bajo (1-3) — material de urgencia para el copy.
  const lowStock = active
    .filter(p => (Number(p.stock) || 0) <= 3)
    .sort((a, b) => (Number(a.stock) || 0) - (Number(b.stock) || 0))
    .slice(0, 5)
    .map(p => ({ name: productName(p), stock: Number(p.stock) || 0 }));

  const dow = now.getDay();
  return {
    slot,
    dayOfWeek: dow,
    dayName: now.toLocaleDateString("es-AR", { weekday: "long" }),
    isWeekend: dow === 0 || dow === 5 || dow === 6, // vie/sáb/dom = clima de finde
    stats,
    topSellers,
    newArrivals,
    lowStock,
  };
}

// ---------------------------------------------------------------------------
// COPY DE RESPALDO (TEMPLATE) — sin IA
// ---------------------------------------------------------------------------
//
// Si no hay ANTHROPIC_API_KEY (o el LLM falla), igual queremos variedad. Esta
// rotación por día×slot evita el "mismo texto siempre" aun sin IA. No es tan
// rica como la IA, pero nunca es idéntica dos días seguidos.

const HOOKS_BY_DAY = {
  0: ["Domingo tranqui pero activo 😎 ", "Cierre de finde con todo "], // Dom
  1: ["Arrancamos la semana 💪 ", "Lunes con stock fresco "],          // Lun
  2: ["Martes de reposición 🔥 ", "Mitad de semana arrancando "],       // Mar
  3: ["Miércoles, ya se viene el finde 👀 ", "Mood mitad de semana "],   // Mié
  4: ["Jueves pre-finde 🎉 ", "Armando la previa del finde "],          // Jue
  5: ["VIERNES 🍾 a full ", "Llegó el finde, hay de todo "],            // Vie
  6: ["Sábado a pura vibra 🌴 ", "Finde activo, stock listo "],         // Sáb
};

const CTA_BY_SLOT = {
  noon: "Escribime y lo coordinamos 📲",
  evening: "Quedan pocas horas para coordinar hoy ⏳ escribime 📲",
};

// Genera el copy de respaldo a partir del contexto. Mismo shape que devuelve el LLM.
export function templateCopy(context = {}) {
  const dayHooks = HOOKS_BY_DAY[context.dayOfWeek] || ["¡Hola! "];
  // Variar entre las 2 opciones del día según el slot (mediodía vs tarde).
  const hookBase = dayHooks[context.slot === "evening" ? Math.min(1, dayHooks.length - 1) : 0];
  const s = context.stats || {};
  const hook = `${hookBase}— ${s.flavors || 0} sabores en stock 💨`;

  let urgency = null;
  if ((context.newArrivals || []).length > 0) {
    const names = context.newArrivals.slice(0, 2).map(n => n.name).join(" · ");
    urgency = `🆕 Recién llegados: ${names}`;
  } else if ((context.lowStock || []).length > 0) {
    const ls = context.lowStock[0];
    urgency = `⚡ Últimas unidades de ${ls.name} (quedan ${ls.stock})`;
  } else if ((context.topSellers || []).length > 0) {
    urgency = `⭐ Los más pedidos: ${context.topSellers.slice(0, 2).map(t => t.name).join(" · ")}`;
  }

  return {
    hook,
    urgency,
    cta: CTA_BY_SLOT[context.slot] || CTA_BY_SLOT.noon,
    source: "template",
  };
}

// ---------------------------------------------------------------------------
// ENSAMBLADO FINAL
// ---------------------------------------------------------------------------

// Sanea el copy que viene del LLM (o template): recorta, valida tipos y trunca
// para que un LLM que se va de mambo no rompa el mensaje.
export function normalizeCopy(raw = {}, source = "ai") {
  const clip = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const hook = clip(raw.hook, 200);
  const urgencyRaw = clip(raw.urgency, 200);
  const cta = clip(raw.cta, 200);
  return {
    hook: hook || "",
    urgency: urgencyRaw || null,
    cta: cta || "",
    source: raw.source || source,
  };
}

// Ensambla el mensaje final: copy humano (IA/template) envolviendo el catálogo
// determinista. `catalogBody` es el output de generateFullMessage(products,rate).
//
// Estructura:
//   <hook>
//   <urgency?>
//
//   <catálogo completo con header de contacto>
//
//   <cta>
export function composeDailyMessage(copy, catalogBody) {
  const c = normalizeCopy(copy, copy?.source || "ai");
  const body = (catalogBody || "").trim();

  const header = [c.hook, c.urgency].filter(Boolean).join("\n");
  const parts = [];
  if (header) parts.push(header);
  if (body) parts.push(body);
  if (c.cta) parts.push(c.cta);
  return parts.join("\n\n").trim();
}

// ---------------------------------------------------------------------------
// PROMPTS PARA EL LLM
// ---------------------------------------------------------------------------
//
// Se exportan como funciones puras así el endpoint serverless no arma strings a
// mano (y los podemos testear: que mencionen las señales clave, que pidan JSON).

export const MESSAGE_COPY_SCHEMA = {
  type: "object",
  properties: {
    hook: { type: "string", description: "Gancho de apertura, 1 línea corta, cálido y con onda. Puede usar 1-2 emojis." },
    urgency: { type: ["string", "null"], description: "Línea opcional de urgencia/novedad (drop nuevo, últimas unidades, top pedido). null si no aplica." },
    cta: { type: "string", description: "Cierre con llamada a la acción para que escriban. 1 línea corta." },
  },
  required: ["hook", "urgency", "cta"],
  additionalProperties: false,
};

export function buildSystemPrompt() {
  return [
    "Sos el community manager de 'Imports Zona Norte', un negocio de venta de vapes",
    "(cigarrillos electrónicos descartables) en zona norte de Buenos Aires. Escribís los",
    "mensajes que se mandan al grupo de WhatsApp de clientes, dos veces por día.",
    "",
    "Tu trabajo: escribir SÓLO el copy humano que envuelve la lista de stock — un gancho",
    "de apertura, una línea opcional de urgencia/novedad, y un cierre con llamada a la acción.",
    "",
    "REGLAS DURAS:",
    "- NO inventes productos, sabores, modelos ni precios. La lista de stock se agrega aparte,",
    "  vos NO la escribís. Si querés mencionar algo, usá SÓLO lo que viene en el contexto.",
    "- Español rioplatense, informal, con onda, como le hablás a clientes jóvenes. Voseo.",
    "- Cortito. Cada campo es 1 línea. Emojis con moderación (1-3 por campo).",
    "- Variá el tono según el día y el horario. No suenes igual todos los días.",
    "- Nada de promesas falsas ni descuentos que no estén en el contexto.",
    "- Devolvé SÓLO el JSON pedido, sin texto extra.",
  ].join("\n");
}

export function buildUserPrompt(context = {}) {
  const slotLabel = context.slot === "evening" ? "tarde (~18:30)" : "mediodía (~12:00)";
  const lines = [
    `Día: ${context.dayName} (${context.isWeekend ? "clima de finde" : "día de semana"}).`,
    `Horario del mensaje: ${slotLabel}.`,
    `Stock disponible: ${context.stats?.flavors || 0} sabores, ${context.stats?.models || 0} modelos, ${context.stats?.brands || 0} marcas, ${context.stats?.units || 0} unidades.`,
  ];
  if ((context.newArrivals || []).length) {
    lines.push(`Novedades recién llegadas: ${context.newArrivals.map(n => n.name).join(", ")}.`);
  }
  if ((context.topSellers || []).length) {
    lines.push(`Más vendidos (con stock): ${context.topSellers.map(t => `${t.name} (${t.units}u)`).join(", ")}.`);
  }
  if ((context.lowStock || []).length) {
    lines.push(`Por agotarse: ${context.lowStock.map(l => `${l.name} (quedan ${l.stock})`).join(", ")}.`);
  }
  lines.push("");
  lines.push("Escribí el copy para este mensaje. Si es tarde, podés meter un toque de urgencia (cierra el día).");
  lines.push("Si hay novedades, destacalas. Si no hay nada urgente, dejá urgency en null.");
  return lines.join("\n");
}
