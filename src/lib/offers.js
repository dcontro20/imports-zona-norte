// src/lib/offers.js
//
// Generador de mensajes de oferta para WhatsApp. Funciones PURAS que arman
// el texto formateado listo para copiar/pegar, usando el catálogo y precios.
//
// REGLAS DE TONO:
//   - Sin nombre personal en mensajes (solo IZN como marca)
//   - Lenguaje natural, sin frases forzadas tipo "te dejo un mimo"
//   - Emoji de sabor automático (mismo set que el mensaje de WhatsApp clásico)
//   - Precios siempre claros, descuentos con anclaje (tachado del precio viejo)
//   - Promos multi-sabor por default para empujar tickets más altos
//     Excepción: liquidación de stock parado de un sabor puntual
//
// Tipos de oferta:
//   "destacado"      — uno o varios productos con su precio (o precio especial)
//   "combo"          — "llevá N y pagá X" con ahorro calculado
//   "liquidacion"    — productos con % off, muestra precio tachado
//   "descuento"      — % off general sobre una selección
//   "stocklist"      — catálogo completo agrupado por marca con precio
//   "packfiesta"     — combo 3-4u pensado para grupos de fiestas
//   "recordatorio"  — mensaje casual sin push de venta
//   "drop"           — anuncio de sabores/productos nuevos
//   "restock"        — productos que volvieron al stock
//   "reactivar"      — mensaje a cliente dormido con sus favoritos
//   "mix3x2"         — 3x2 o lleva-N-paga-(N-1) sobre varios sabores
//   "combomarca"     — combo de N sabores de la MISMA marca a precio especial
//   "duplapack"      — segunda unidad a -50% / 25% sobre una selección curada
//   "topsemana"      — top 3-5 sabores con micro-descuento para empujar volumen

import { safeRate } from "../helpers.js";
import { getAudience, TONES } from "./offerAudiences.js";
import { isWeekend } from "./offerCalendar.js";
import { getFlavorEmojis } from "./whatsappMessage.js";
import { pickOpener, pickCloser, urgencyLine } from "./messageTones.js";

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

function money(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString("es-AR")}`;
}

// Nombre legible del producto. emoji=true intenta meter el emoji del sabor.
function productLabel(product, { withPuffs = true, emoji = true } = {}) {
  if (!product) return "";
  const e = emoji ? getFlavorEmojis(product.flavor) + " " : "";
  const base = `${e}${product.brand} ${product.model} ${product.flavor}`.trim();
  if (withPuffs && product.puffs) return `${base} (${Number(product.puffs).toLocaleString("es-AR")} puffs)`;
  return base;
}

// Versión corta: solo brand + flavor con emoji (para listados largos).
function productShort(product, { emoji = true } = {}) {
  if (!product) return "";
  const e = emoji ? getFlavorEmojis(product.flavor) + " " : "";
  return `${e}${product.flavor}`;
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
export function buildOfferMessage(offer, exchangeRate, opts = {}) {
  const {
    type = "destacado",
    title,
    products = [],
    comboQty = 3,
    comboPriceARS = 0,
    discountPct = 0,
    footer = "📲 Consultas por DM",
  } = offer || {};

  const audience = opts.audience ? getAudience(opts.audience) : null;
  const toneName = audience ? audience.tone : null;
  const ctx = { ...opts.ctx, weekend: opts.ctx?.weekend ?? isWeekend() };
  // Seed estable basado en el tipo + audiencia + (opcionalmente) ID de idea
  // → mensajes del mismo tipo a la misma audiencia consecutivos varían.
  // Sin seed (undefined) sería 100% random — preferimos determinístico para
  // que copiar 2 veces seguidas dé el mismo mensaje (no confunde a Diego).
  const toneSeed = opts.seed || `${type}-${opts.audience || "any"}-${(products[0]?.product?.id) || ""}`;

  const lines = [];
  const storyLines = [];

  if (toneName) lines.push(pickOpener(toneName, ctx, toneSeed), "");

  // ---- DESTACADO ----
  if (type === "destacado") {
    lines.push(title || "🔥 *Destacados de la semana*", "");
    storyLines.push(title || "🔥 Destacados");
    products.forEach(({ product, specialPriceARS }) => {
      const price = specialPriceARS || productPriceARS(product, exchangeRate);
      lines.push(`${getFlavorEmojis(product.flavor)} *${product.brand} ${product.model} ${product.flavor}*`);
      lines.push(`   ${money(price)}`);
      lines.push("");
      storyLines.push(`${getFlavorEmojis(product.flavor)} ${product.flavor} — ${money(price)}`);
    });
  }

  // ---- COMBO genérico ----
  else if (type === "combo") {
    lines.push(title || "🎁 *Combo*", "");
    const regularTotal = products.reduce((s, { product }) => s + productPriceARS(product, exchangeRate), 0) * (comboQty / Math.max(1, products.length));
    const saving = Math.max(0, regularTotal - comboPriceARS);
    lines.push(`Llevás *${comboQty}* a *${money(comboPriceARS)}* en total`);
    if (saving > 0) lines.push(`_(precio normal ${money(regularTotal)} · ahorrás ${money(saving)})_`);
    lines.push("");
    if (products.length > 0) {
      lines.push("Sabores disponibles:");
      products.forEach(({ product }) => lines.push(`• ${productShort(product)}`));
      lines.push("");
    }
    storyLines.push(title || "🎁 COMBO", `${comboQty}u → ${money(comboPriceARS)}`);
  }

  // ---- LIQUIDACIÓN — usar cuando hay stock parado puntual ----
  else if (type === "liquidacion") {
    lines.push(title || "📉 *Liquidación · últimas unidades*", "");
    storyLines.push(title || "📉 Liquidación");
    products.forEach(({ product, discountPct: itemDisc }) => {
      const regular = productPriceARS(product, exchangeRate);
      const disc = itemDisc || discountPct;
      const final = applyDiscount(regular, disc);
      lines.push(`${getFlavorEmojis(product.flavor)} *${product.brand} ${product.model} ${product.flavor}*`);
      lines.push(`   ${money(final)}  ~${money(regular)}~  *-${disc}%*`);
      storyLines.push(`${getFlavorEmojis(product.flavor)} ${product.flavor} ${money(final)} (-${disc}%)`);
    });
    lines.push("", "_Solo mientras haya stock._");
  }

  // ---- DESCUENTO general ----
  else if (type === "descuento") {
    lines.push(title || `✨ *${discountPct}% OFF*`, "");
    if (products.length > 0) {
      products.forEach(({ product }) => {
        const regular = productPriceARS(product, exchangeRate);
        const final = applyDiscount(regular, discountPct);
        lines.push(`${getFlavorEmojis(product.flavor)} *${product.brand} ${product.model} ${product.flavor}*`);
        lines.push(`   ${money(final)}  ~${money(regular)}~`);
        storyLines.push(`${product.flavor} ${money(final)}`);
      });
      lines.push("");
    }
    storyLines.unshift(title || `✨ ${discountPct}% OFF`);
  }

  // ---- STOCK LIST — catálogo agrupado por marca con emojis ----
  else if (type === "stocklist") {
    lines.push(title || "📋 *Stock disponible*", "");
    storyLines.push(title || "📋 Stock");
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
            const name = `${p.model ? p.model + " · " : ""}${p.flavor || "—"}`;
            lines.push(`${getFlavorEmojis(p.flavor)} ${name} — ${money(price)}`);
          });
        lines.push("");
      });
    }
  }

  // ---- PACK FIESTA — pensado para grupos de previa/finde ----
  else if (type === "packfiesta") {
    lines.push(title || "🎉 *Pack del finde*", "");
    lines.push(`*${comboQty}* sabores · *${money(comboPriceARS)}* total`);
    const regular = products.reduce((s, { product }) => s + productPriceARS(product, exchangeRate), 0);
    if (regular > comboPriceARS) {
      const saving = regular - comboPriceARS;
      lines.push(`_Ahorro: ${money(saving)} vs precio individual_`);
    }
    lines.push("");
    if (products.length > 0) {
      lines.push("Vienen:");
      products.forEach(({ product }) => lines.push(`${getFlavorEmojis(product.flavor)} ${product.brand} ${product.flavor}`));
    }
    storyLines.push(title || "🎉 PACK FINDE", `${comboQty}u → ${money(comboPriceARS)}`);
  }

  // ---- RECORDATORIO — natural, sin push ----
  else if (type === "recordatorio") {
    lines.push(title || "Hay stock fresco esta semana 💨", "");
    if (products.length > 0) {
      lines.push("Algunos de los que están entrando bien:");
      lines.push("");
      products.slice(0, 5).forEach(({ product }) => {
        const price = productPriceARS(product, exchangeRate);
        lines.push(`${getFlavorEmojis(product.flavor)} *${product.brand} ${product.flavor}* — ${money(price)}`);
      });
    }
    storyLines.push(title || "Hay stock 💨");
  }

  // ---- DROP — sabores nuevos ----
  else if (type === "drop") {
    lines.push(title || "🆕 *Llegaron sabores nuevos*", "");
    storyLines.push(title || "🆕 Drop");
    products.forEach(({ product }) => {
      const price = productPriceARS(product, exchangeRate);
      lines.push(`${getFlavorEmojis(product.flavor)} *${product.brand} ${product.model} ${product.flavor}*`);
      lines.push(`   ${money(price)}`);
      lines.push("");
      storyLines.push(`${getFlavorEmojis(product.flavor)} ${product.brand} ${product.flavor} — ${money(price)}`);
    });
  }

  // ---- REACTIVAR — cliente dormido, sin frases forzadas ----
  else if (type === "reactivar") {
    lines.push(title || "Sumamos stock de los que solés llevar 👇", "");
    storyLines.push("Para vos");
    if (products.length > 0) {
      products.forEach(({ product }) => {
        const regular = productPriceARS(product, exchangeRate);
        const finalP = discountPct > 0 ? applyDiscount(regular, discountPct) : regular;
        lines.push(`${getFlavorEmojis(product.flavor)} *${product.brand} ${product.flavor}*`);
        if (discountPct > 0) {
          lines.push(`   ${money(finalP)}  ~${money(regular)}~  *-${discountPct}%*`);
          storyLines.push(`${product.flavor} ${money(finalP)} (-${discountPct}%)`);
        } else {
          lines.push(`   ${money(finalP)}`);
          storyLines.push(`${product.flavor} ${money(finalP)}`);
        }
        lines.push("");
      });
      if (discountPct > 0) {
        lines.push(`_Precio especial — solo esta semana._`);
      }
    } else {
      lines.push("Si querés que te pase la lista del stock actualizada, pedíla por acá.");
    }
  }

  // ---- RESTOCK ----
  else if (type === "restock") {
    lines.push(title || "✅ *Volvieron al stock*", "");
    storyLines.push(title || "✅ Volvieron");
    products.forEach(({ product }) => {
      const price = productPriceARS(product, exchangeRate);
      lines.push(`${getFlavorEmojis(product.flavor)} *${product.brand} ${product.model} ${product.flavor}* — ${money(price)}`);
      storyLines.push(`✅ ${product.flavor}`);
    });
  }

  // ---- MIX 3x2 / lleva N paga (N-1) — multi-sabor ----
  else if (type === "mix3x2") {
    const q = comboQty || 3;
    const payQ = Math.max(1, q - 1); // lleva q paga (q-1)
    lines.push(title || `🤝 *Llevás ${q}, pagás ${payQ}*`, "");
    lines.push(`Mezclá los sabores que quieras dentro de la selección.`);
    lines.push(`_(El más barato va de regalo 🎁)_`);
    lines.push("");
    if (products.length > 0) {
      lines.push("Sabores que aplican:");
      products.forEach(({ product }) => {
        const price = productPriceARS(product, exchangeRate);
        lines.push(`${getFlavorEmojis(product.flavor)} ${product.brand} ${product.flavor} — ${money(price)}`);
      });
    }
    storyLines.push(title || `🤝 Llevás ${q} pagás ${payQ}`);
  }

  // ---- COMBO MARCA — N sabores de la misma marca ----
  else if (type === "combomarca") {
    const brand = products[0]?.product?.brand || "marca";
    lines.push(title || `🎯 *Combo ${brand}* — ${comboQty} sabores`, "");
    lines.push(`Elegí *${comboQty}* sabores y los llevás a *${money(comboPriceARS)}* el combo.`);
    const regular = products.reduce((s, { product }) => s + productPriceARS(product, exchangeRate), 0);
    if (regular > comboPriceARS && products.length === comboQty) {
      lines.push(`_(precio individual ${money(regular)} — ahorrás ${money(regular - comboPriceARS)})_`);
    } else if (products.length > comboQty) {
      lines.push(`_(${products.length} sabores para elegir)_`);
    }
    lines.push("");
    if (products.length > 0) {
      lines.push("Sabores para combinar:");
      products.forEach(({ product }) => {
        lines.push(`${getFlavorEmojis(product.flavor)} ${product.flavor}`);
      });
    }
    storyLines.push(title || `🎯 COMBO ${brand}`, `${comboQty} → ${money(comboPriceARS)}`);
  }

  // ---- DUPLA PACK — 2da unidad a mitad de precio ----
  else if (type === "duplapack") {
    lines.push(title || "🎁 *2da unidad a mitad de precio*", "");
    lines.push("Llevate cualquiera de la lista, el segundo te sale *al 50%*.");
    lines.push("_(El más barato va con descuento.)_");
    lines.push("");
    if (products.length > 0) {
      lines.push("Aplica sobre:");
      products.forEach(({ product }) => {
        const price = productPriceARS(product, exchangeRate);
        lines.push(`${getFlavorEmojis(product.flavor)} ${product.brand} ${product.flavor} — ${money(price)}`);
      });
    }
    storyLines.push(title || "🎁 2do al 50%");
  }

  // ---- COMBO AMIGOS — mecánica viral: juntate con amigos y ahorran todos ----
  else if (type === "comboamigos") {
    lines.push(title || "👥 *Juntate con amigos y ahorran todos*", "");
    lines.push("• Llevando *2* → *-10%* cada uno");
    lines.push("• Llevando *3 o más* → *-15%* cada uno");
    lines.push("");
    if (products.length > 0) {
      lines.push("Sabores con stock para combinar:");
      products.slice(0, 8).forEach(({ product }) => {
        const price = productPriceARS(product, exchangeRate);
        lines.push(`${getFlavorEmojis(product.flavor)} ${product.brand} ${product.flavor} — ${money(price)}`);
      });
      lines.push("");
    }
    lines.push("_Un solo pedido, un solo envío — se ahorran el costo entre todos._");
    storyLines.push(title || "👥 COMBO AMIGOS", "2 → -10% c/u · 3+ → -15% c/u");
  }

  // ---- TOP SEMANA — los más pedidos con micro-descuento ----
  else if (type === "topsemana") {
    lines.push(title || "📈 *Los más pedidos esta semana*", "");
    if (discountPct > 0) {
      lines.push(`Todos con *-${discountPct}%* si te llevás *2 o más*.`);
      lines.push("");
    }
    storyLines.push(title || "📈 TOP SEMANA");
    products.forEach(({ product }) => {
      const regular = productPriceARS(product, exchangeRate);
      const finalP = discountPct > 0 ? applyDiscount(regular, discountPct) : regular;
      lines.push(`${getFlavorEmojis(product.flavor)} *${product.brand} ${product.flavor}*`);
      if (discountPct > 0) {
        lines.push(`   ${money(finalP)}  ~${money(regular)}~`);
      } else {
        lines.push(`   ${money(finalP)}`);
      }
      lines.push("");
      storyLines.push(`${getFlavorEmojis(product.flavor)} ${product.flavor} ${money(finalP)}`);
    });
  }

  // CTA con urgencia/escasez según tipo (antes del closer, si aplica)
  if (toneName) {
    // Contexto para urgencia: stock del primer producto, cantidad combo, etc.
    const firstStock = Number(products[0]?.product?.stock) || 0;
    const cta = urgencyLine(type, {
      stock: firstStock,
      comboQty: offer.comboQty,
      recentBuyers: opts.ctx?.recentBuyers,
      daysLeft: opts.ctx?.daysLeft,
    });
    if (cta) lines.push("", cta);
    lines.push("", pickCloser(toneName, ctx, toneSeed));
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
