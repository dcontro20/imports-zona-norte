// clientMessage.js — genera un mensaje PERSONALIZADO para un cliente puntual,
// basado en su historial real: sus sabores favoritos que están EN STOCK ahora
// + su cadencia ("hace X que no venís"). Puente entre la inteligencia de
// cliente (S17) y el hub de marketing (S18). Función PURA.
//
// Regla de tono (igual que offerAudiences): no firma con nombre personal,
// lenguaje natural y cálido, sin frases forzadas.

import { formatMoney } from "../helpers.js";

// Productos favoritos del cliente que siguen en stock, por frecuencia de compra.
export function clientFavoritesInStock(clientId, sales, products, limit = 3) {
  const counts = {};
  (sales || [])
    .filter(s => !s.isDeleted && s.clientId === clientId)
    .forEach(s => (s.items || []).forEach(it => {
      if (it.productId) counts[it.productId] = (counts[it.productId] || 0) + (Number(it.qty) || 1);
    }));
  return Object.entries(counts)
    .map(([pid, qty]) => ({ product: (products || []).find(p => p.id === pid && !p.isDeleted), qty }))
    .filter(x => x.product && (x.product.stock || 0) > 0)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit)
    .map(x => x.product);
}

/**
 * Arma el mensaje. Devuelve { text, productsUsed, hasStock }.
 * @param stat  — stats del cliente (de buildClientStats): name, daysSinceLast, avgDaysBetween
 * @param opts  — { exchangeRate }
 */
export function buildClientMessage(stat, sales, products, opts = {}) {
  const rate = opts.exchangeRate || 1;
  const name = (stat?.name || "").trim();
  const favs = clientFavoritesInStock(stat?.id, sales, products);

  const lines = [];
  lines.push(name ? `¡Hola ${name}! 👋` : "¡Hola! 👋");

  // Gancho según recencia
  const d = stat?.daysSinceLast;
  if (typeof d === "number" && d >= 14) {
    lines.push(`Hace ${d} días que no pasás, te tenía en mente 🙌`);
  } else {
    lines.push("Pasé a comentarte las novedades 🙌");
  }

  if (favs.length > 0) {
    lines.push("");
    lines.push(favs.length === 1 ? "Volvió lo tuyo:" : "Tengo lo que te suele gustar:");
    favs.forEach(p => {
      const priceARS = Math.round((p.priceUSD || 0) * rate);
      lines.push(`• ${p.brand} ${p.model} — ${p.flavor} · ${formatMoney(priceARS)}`);
    });
  }

  lines.push("");
  lines.push(favs.length > 0 ? "¿Te aparto? 😉" : "¿Querés que te pase la lista al día?");

  return {
    text: lines.join("\n"),
    productsUsed: favs,
    hasStock: favs.length > 0,
  };
}
