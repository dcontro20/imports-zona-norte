// src/lib/offers.js
//
// Generador de mensajes de oferta para WhatsApp. Funciones PURAS que arman
// el texto formateado listo para copiar/pegar, usando el catálogo y precios.
//
// 4 tipos de oferta:
//   "destacado"   — uno o varios productos con su precio (o precio especial)
//   "combo"       — "llevá N y pagá X" con ahorro calculado
//   "liquidacion" — productos con % off, muestra precio tachado
//   "descuento"   — % off general sobre una marca/selección

import { safeRate } from "../helpers.js";

// Precio ARS de un producto (usa priceARS, fallback a priceUSD × rate).
export function productPriceARS(product, exchangeRate) {
  if (!product) return 0;
  const rate = safeRate(exchangeRate);
  return Number(product.priceARS) || (Number(product.priceUSD) || 0) * rate;
}

// Aplica descuento % a un precio. Redondea a centena (estética para vapes).
export function applyDiscount(priceARS, discountPct) {
  const p = Number(priceARS) || 0;
  const d = Math.max(0, Math.min(100, Number(discountPct) || 0));
  const result = p * (1 - d / 100);
  return Math.round(result / 100) * 100;
}

// Formatea ARS con separador de miles, sin decimales, con $ adelante.
function money(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString("es-AR")}`;
}

// Nombre legible de un producto para el mensaje.
function productLabel(product, { withPuffs = true } = {}) {
  if (!product) return "";
  const base = `${product.brand} ${product.model} ${product.flavor}`.trim();
  if (withPuffs && product.puffs) return `${base} (${Number(product.puffs).toLocaleString("es-AR")} puffs)`;
  return base;
}

// Sugiere candidatos a liquidación: productos con stock > umbral y poca/nula
// rotación (slow o dead). statsMap = salida de buildProductSalesStats.
export function suggestLiquidation(products, statsMap = {}, { minStock = 3 } = {}) {
  return (products || [])
    .filter(p => !p.isDeleted && (Number(p.stock) || 0) >= minStock)
    .map(p => {
      const stat = statsMap[p.id];
      const velocity = stat?.velocity30dPerDay || 0;
      const stock = Number(p.stock) || 0;
      const daysToClear = velocity > 0 ? Math.ceil(stock / velocity) : Infinity;
      return { product: p, velocity, stock, daysToClear };
    })
    // Lentos (tardan >60d en venderse) o sin ventas
    .filter(x => x.daysToClear > 60)
    .sort((a, b) => b.daysToClear - a.daysToClear);
}

// Arma el mensaje de oferta. Devuelve { full, stories } (largo y corto).
//
// offer:
//   type: "destacado" | "combo" | "liquidacion" | "descuento"
//   title: encabezado opcional (default según tipo)
//   products: [{ product, specialPriceARS?, discountPct? }]
//   comboQty, comboPriceARS: para tipo combo
//   discountPct: para descuento general
//   footer: texto de cierre opcional
//   brandName: nombre del negocio
export function buildOfferMessage(offer, exchangeRate) {
  const {
    type = "destacado",
    title,
    products = [],
    comboQty = 3,
    comboPriceARS = 0,
    discountPct = 0,
    footer = "📲 Escribime y lo aparto!",
    brandName = "IMPORTS ZONA NORTE",
  } = offer || {};

  const lines = [];
  const storyLines = [];

  if (type === "destacado") {
    lines.push(title || "🔥 *OFERTA DEL DÍA* 🔥", "");
    storyLines.push(title || "🔥 OFERTA 🔥");
    products.forEach(({ product, specialPriceARS }) => {
      const price = specialPriceARS || productPriceARS(product, exchangeRate);
      lines.push(`💨 *${productLabel(product)}*`);
      lines.push(`   ${money(price)}`);
      lines.push("");
      storyLines.push(`💨 ${product.brand} ${product.flavor} — ${money(price)}`);
    });
  }

  else if (type === "combo") {
    lines.push(title || "🎁 *COMBO ESPECIAL* 🎁", "");
    const regularTotal = products.reduce((s, { product }) => s + productPriceARS(product, exchangeRate), 0) * (comboQty / Math.max(1, products.length));
    const saving = Math.max(0, regularTotal - comboPriceARS);
    lines.push(`Llevá *${comboQty}* y pagás *${money(comboPriceARS)}*`);
    if (saving > 0) lines.push(`(en vez de ${money(regularTotal)} — ahorrás ${money(saving)})`);
    lines.push("");
    if (products.length > 0) {
      lines.push("Elegí entre:");
      products.forEach(({ product }) => lines.push(`• ${productLabel(product, { withPuffs: false })}`));
      lines.push("");
    }
    storyLines.push(title || "🎁 COMBO", `${comboQty} x ${money(comboPriceARS)}`);
  }

  else if (type === "liquidacion") {
    lines.push(title || "📉 *LIQUIDACIÓN* 📉", "");
    lines.push("Últimas unidades con descuento:", "");
    storyLines.push(title || "📉 LIQUIDACIÓN");
    products.forEach(({ product, discountPct: itemDisc }) => {
      const regular = productPriceARS(product, exchangeRate);
      const disc = itemDisc || discountPct;
      const final = applyDiscount(regular, disc);
      lines.push(`• *${productLabel(product, { withPuffs: false })}*`);
      lines.push(`   ${money(final)}  ~${money(regular)}~  (-${disc}%)`);
      storyLines.push(`• ${product.flavor} ${money(final)} (-${disc}%)`);
    });
    lines.push("", "🏃 Hasta agotar stock!");
  }

  else if (type === "descuento") {
    lines.push(title || `✨ *${discountPct}% OFF* ✨`, "");
    if (products.length > 0) {
      products.forEach(({ product }) => {
        const regular = productPriceARS(product, exchangeRate);
        const final = applyDiscount(regular, discountPct);
        lines.push(`💨 *${productLabel(product, { withPuffs: false })}*`);
        lines.push(`   ${money(final)}  ~${money(regular)}~`);
        storyLines.push(`${product.flavor} ${money(final)}`);
      });
      lines.push("");
    }
    storyLines.unshift(title || `✨ ${discountPct}% OFF ✨`);
  }

  lines.push(footer);

  return {
    full: lines.join("\n").trim(),
    stories: storyLines.join("\n").trim(),
  };
}

// Genera un link wa.me con el texto del mensaje (URL-encoded).
export function whatsappLink(text, phone = "") {
  const clean = (phone || "").replace(/[^\d]/g, "");
  const base = clean ? `https://wa.me/${clean}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text || "")}`;
}
