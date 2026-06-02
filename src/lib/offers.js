// src/lib/offers.js
//
// Generador de mensajes de oferta para WhatsApp. Funciones PURAS que arman
// el texto formateado listo para copiar/pegar, usando el catálogo y precios.
//
// Tipos de oferta:
//   "destacado"     — uno o varios productos con su precio (o precio especial)
//   "combo"         — "llevá N y pagá X" con ahorro calculado
//   "liquidacion"   — productos con % off, muestra precio tachado
//   "descuento"     — % off general sobre una selección
//   "stocklist"     — catálogo completo agrupado por marca con precio
//   "packfiesta"    — combo 3-4u pensado para grupos de fiestas
//   "recordatorio"  — mensaje casual sin push de venta
//   "drop"          — anuncio de sabores/productos nuevos
//   "restock"       — productos que volvieron al stock

import { safeRate } from "../helpers.js";
import { getAudience, TONES } from "./offerAudiences.js";
import { isWeekend } from "./offerCalendar.js";

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
    .filter(x => x.daysToClear > 60)
    .sort((a, b) => b.daysToClear - a.daysToClear);
}

// Arma el mensaje de oferta. Devuelve { full, stories }.
//
// offer:
//   type: ver lista de tipos arriba
//   title: encabezado opcional (default según tipo)
//   products: [{ product, specialPriceARS?, discountPct? }]
//   comboQty, comboPriceARS: para combos/packs
//   discountPct: para descuento general
//   footer: texto de cierre opcional (legacy, ignorado si hay audience)
//
// opts:
//   audience: key de audiencia ("individual" | "groupClients" | "groupParty")
//   ctx: { clientName?, weekend? } para personalizar opener/closer
export function buildOfferMessage(offer, exchangeRate, opts = {}) {
  const {
    type = "destacado",
    title,
    products = [],
    comboQty = 3,
    comboPriceARS = 0,
    discountPct = 0,
    footer = "📲 Escribime y lo aparto!",
  } = offer || {};

  const audience = opts.audience ? getAudience(opts.audience) : null;
  const tone = audience ? TONES[audience.tone] : null;
  const ctx = { ...opts.ctx, weekend: opts.ctx?.weekend ?? isWeekend() };

  const lines = [];
  const storyLines = [];

  // OPENER por tono (si hay audiencia)
  if (tone) {
    lines.push(tone.opener(ctx), "");
  }

  // ---- CUERPO según tipo ----
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

  // ---- NUEVOS TIPOS ----

  else if (type === "stocklist") {
    lines.push(title || "📋 *STOCK DISPONIBLE* 📋", "");
    storyLines.push(title || "📋 STOCK LIST");
    // Agrupar por marca
    const byBrand = {};
    products.forEach(({ product }) => {
      if (!product) return;
      const b = product.brand || "Otros";
      if (!byBrand[b]) byBrand[b] = [];
      byBrand[b].push(product);
    });
    const brands = Object.keys(byBrand).sort();
    if (brands.length === 0) {
      lines.push("_(sin productos para listar)_");
    } else {
      brands.forEach(brand => {
        lines.push(`*${brand.toUpperCase()}*`);
        byBrand[brand]
          .sort((a, b) => (a.flavor || "").localeCompare(b.flavor || ""))
          .forEach(p => {
            const price = productPriceARS(p, exchangeRate);
            const name = p.flavor ? `${p.model ? p.model + " " : ""}${p.flavor}` : (p.model || "—");
            lines.push(`• ${name} — ${money(price)}`);
          });
        lines.push("");
      });
    }
  }

  else if (type === "packfiesta") {
    lines.push(title || "🎵 *PACK PARA LA FINDE* 🎵", "");
    lines.push(`Llevate *${comboQty}* y pagás *${money(comboPriceARS)}* 🤝`);
    const regular = products.reduce((s, { product }) => s + productPriceARS(product, exchangeRate), 0);
    if (regular > comboPriceARS) {
      const saving = regular - comboPriceARS;
      lines.push(`_(regular ${money(regular)} — te ahorrás ${money(saving)})_`);
    }
    lines.push("");
    if (products.length > 0) {
      lines.push("Incluye:");
      products.forEach(({ product }) => lines.push(`• ${productLabel(product, { withPuffs: false })}`));
      lines.push("");
    }
    lines.push("Pensado para arrancar la previa 🔊");
    storyLines.push(title || "🎵 PACK FINDE", `${comboQty} x ${money(comboPriceARS)}`);
  }

  else if (type === "recordatorio") {
    lines.push(title || "Buenas! 👋", "");
    lines.push("Solo para recordarles que estoy con stock en Zona Norte 💨");
    if (products.length > 0) {
      lines.push("", "Algunos de los que tengo:");
      products.slice(0, 5).forEach(({ product }) => {
        lines.push(`• ${productLabel(product, { withPuffs: false })}`);
      });
    }
    storyLines.push(title || "Hay stock 💨");
  }

  else if (type === "drop") {
    lines.push(title || "🆕 *DROP NUEVO* 🆕", "");
    lines.push("Sabores que acaban de llegar:", "");
    storyLines.push(title || "🆕 DROP");
    products.forEach(({ product }) => {
      const price = productPriceARS(product, exchangeRate);
      lines.push(`💨 *${productLabel(product)}*`);
      lines.push(`   ${money(price)}`);
      lines.push("");
      storyLines.push(`🆕 ${product.brand} ${product.flavor} — ${money(price)}`);
    });
  }

  else if (type === "reactivar") {
    // Mensaje personalizado para cliente dormido con sus productos favoritos
    lines.push(title || "Te tenía esto preparado 👀", "");
    storyLines.push("Para vos 👀");
    if (products.length > 0) {
      lines.push("Sé que te gustaba esto, te lo dejo con un mimo:");
      lines.push("");
      products.forEach(({ product }) => {
        const regular = productPriceARS(product, exchangeRate);
        const finalP = discountPct > 0 ? applyDiscount(regular, discountPct) : regular;
        lines.push(`💨 *${productLabel(product, { withPuffs: false })}*`);
        if (discountPct > 0) {
          lines.push(`   ${money(finalP)}  ~${money(regular)}~  (-${discountPct}%)`);
          storyLines.push(`${product.flavor} ${money(finalP)} (-${discountPct}%)`);
        } else {
          lines.push(`   ${money(finalP)}`);
          storyLines.push(`${product.flavor} ${money(finalP)}`);
        }
        lines.push("");
      });
    } else {
      lines.push("Hace tiempo que no charlamos. Si te interesa algo nuevo,");
      lines.push("avisame y te paso lo que tengo 💨");
    }
  }

  else if (type === "restock") {
    lines.push(title || "✅ *VOLVIÓ EL STOCK* ✅", "");
    lines.push("Productos que volvieron:", "");
    storyLines.push(title || "✅ VOLVIÓ STOCK");
    products.forEach(({ product }) => {
      const price = productPriceARS(product, exchangeRate);
      lines.push(`• *${productLabel(product, { withPuffs: false })}* — ${money(price)}`);
      storyLines.push(`✅ ${product.flavor}`);
    });
  }

  // CLOSER por tono o footer legacy
  if (tone) {
    lines.push("", tone.closer(ctx));
  } else {
    lines.push(footer);
  }

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
