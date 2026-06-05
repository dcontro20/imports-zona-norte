// src/lib/whatsappMessage.js
//
// Generadores del mensaje de stock para WhatsApp. Funciones PURAS extraídas
// del componente WhatsApp para que sean reutilizables desde:
//   - El tab "Mensaje rápido" dentro de Mensajes
//   - El widget de Dashboard (copia directa sin abrir el módulo)
//
// Dos formatos:
//   - "full": mensaje completo con header de contacto + sabores agrupados por
//             marca+modelo+puffs+precio (el clásico catálogo)
//   - "short": versión corta para Stories (1 línea por modelo con stock total)

const FLAVOR_EMOJIS = {
  "banana": "🍌", "coconut": "🥥", "water": "💦", "ice": "🧊", "strawberry": "🍓",
  "watermelon": "🍉", "dragon": "🐉", "grape": "🍇", "apple": "🍏", "mango": "🥭",
  "kiwi": "🥝", "pineapple": "🍍", "cherry": "🍒", "blueberry": "🫐", "blue": "💙",
  "razz": "🧊", "peach": "🍑", "mint": "🌿", "menthol": "❄️", "miami": "🌴",
  "melon": "🍈", "pomegranate": "🍷", "sour": "😝", "orange": "🍊", "raspberry": "🍹",
  "lemon": "🍋", "lime": "🍋", "grapefruit": "🍋", "passion": "🥭", "guava": "🥭",
  "tigers": "🐯", "blood": "🐯", "cool": "🌿", "icy": "🧊", "splash": "💦",
  "summer": "☀️", "fuse": "🍒", "lush": "🍉", "sweet": "🍭", "hawaiian": "🥤",
  "sakura": "🌸", "red": "❤️"
};

export function getFlavorEmojis(flavor) {
  const words = String(flavor || "").toLowerCase().split(/[\s-]+/);
  const emojis = [];
  const seen = new Set();
  words.forEach(w => {
    const e = FLAVOR_EMOJIS[w];
    if (e && !seen.has(e)) { emojis.push(e); seen.add(e); }
  });
  return emojis.join("") || "💨";
}

// Orden de marcas en el catálogo.
const BRAND_ORDER = ["Elfbar", "Geek Bar", "Ignite", "Lost Mary", "Nikbar", "Supreme"];

// Header fijo con la info de contacto del negocio.
function brandHeader() {
  return [
    "🔥 IMPORTS ZONA NORTE 🔥",
    "*IG: @imports.zonanorte*",
    "",
    "📲 WhatsApp: 11 6872 5293 / 11 3698 4001",
    "",
    "*📥 Grupo exclusivo de promos y pedidos:* https://chat.whatsapp.com/D5Ar7LO7awNKNc98BChdzz",
    "",
    "💸 Todos los métodos de pago",
    "✅ Productos 100% originales e importados",
    "📦 Venta mayorista y minorista",
    "🔁 Stock nuevo TODAS las semanas",
    "🛠 Garantía de 48hs",
    "🚚 Envíos y retiros GRATIS en Nordelta y Pacheco",
    "✈️ Envíos a todo el país",
    "",
    "-----------------------------------------",
    "",
  ].join("\n");
}

// Calcula priceARS dinámicamente con el rate actual.
function withDynamicARS(products, exchangeRate) {
  const rate = Number(exchangeRate) || 0;
  return (products || []).map(p => ({
    ...p,
    priceARS: Math.round((Number(p.priceUSD) || 0) * rate),
  }));
}

// Mensaje completo: header de contacto + catálogo agrupado por
// marca+modelo+puffs+precio con sabores listados con emojis.
export function generateFullMessage(products, exchangeRate) {
  const enriched = withDynamicARS(products, exchangeRate);

  // Agrupar por marca|modelo|puffs|priceUSD|priceARS
  const groups = {};
  enriched.forEach(p => {
    const key = `${p.brand}|||${p.model}|||${p.puffs}|||${p.priceUSD}|||${p.priceARS}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  });

  // Ordenar según BRAND_ORDER
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    const [brandA] = a.split("|||");
    const [brandB] = b.split("|||");
    const iA = BRAND_ORDER.indexOf(brandA);
    const iB = BRAND_ORDER.indexOf(brandB);
    if (iA !== iB) return (iA === -1 ? 999 : iA) - (iB === -1 ? 999 : iB);
    return a.localeCompare(b);
  });

  let msg = brandHeader();

  sortedKeys.forEach(key => {
    const [brand, model, puffs, priceUSD, priceARS] = key.split("|||");
    const items = groups[key];
    const inStock = items
      .filter(p => (Number(p.stock) || 0) > 0)
      .sort((a, b) => (a.flavor || "").localeCompare(b.flavor || ""));
    if (inStock.length === 0) return; // skip modelo sin stock

    const puffsFormatted = Number(puffs).toLocaleString("es-AR");
    const iceTag = (model || "").toLowerCase().includes("ice") ? " 🧊" : "";
    msg += `*${(brand || "").toUpperCase()} ${model}${iceTag} – ${puffsFormatted} PUFFS* 💨\n`;
    msg += `💰 ${priceUSD} USD / $${Number(priceARS).toLocaleString("es-AR")}\n\n`;
    inStock.forEach(p => {
      msg += `* ${p.flavor} ${getFlavorEmojis(p.flavor)}\n`;
    });
    msg += `\n`;
  });

  return msg.trim();
}

// Mensaje corto para Stories: 1 línea por modelo con stock total.
export function generateShortMessage(products, exchangeRate) {
  const enriched = withDynamicARS(products, exchangeRate);
  const groups = {};
  enriched.filter(p => (Number(p.stock) || 0) > 0).forEach(p => {
    const key = `${p.brand}|||${p.model}|||${p.puffs}|||${p.priceARS}`;
    if (!groups[key]) groups[key] = 0;
    groups[key] += Number(p.stock) || 0;
  });

  let msg = `🔥 IMPORTS ZONA NORTE 🔥\n\n📦 STOCK DISPONIBLE:\n\n`;
  Object.entries(groups)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([key, stock]) => {
      const [brand, model, puffs, priceARS] = key.split("|||");
      msg += `✅ ${brand} ${model} ${Number(puffs).toLocaleString("es-AR")}p — $${Number(priceARS).toLocaleString("es-AR")} (${stock} uds)\n`;
    });
  msg += `\n📲 11 6872 5293 / 11 3698 4001\n`;
  msg += `📥 Envíos a todo el país\n`;
  msg += `IG: @imports.zonanorte`;
  return msg;
}

// Stats útiles para mostrar arriba del mensaje.
//   { inStockCount, activeModels, totalUnits }
export function quickMessageStats(products) {
  const inStock = (products || []).filter(p => (Number(p.stock) || 0) > 0);
  const models = new Set();
  inStock.forEach(p => models.add(`${p.brand}-${p.model}`));
  return {
    inStockCount: inStock.length,
    activeModels: models.size,
    totalUnits: inStock.reduce((s, p) => s + (Number(p.stock) || 0), 0),
  };
}
