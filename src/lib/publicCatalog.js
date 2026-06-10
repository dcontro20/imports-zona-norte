// src/lib/publicCatalog.js
//
// Sistema de catálogo público compartible. Genera un "snapshot" del stock
// actual con un ID único, lo guarda en Firestore (público), y devuelve un
// link tipo /c/<slug> que Diego puede compartir por WhatsApp/IG.
//
// El cliente abre el link → ve el catálogo bonito con precios + botón
// "Pedir por WhatsApp" que abre wa.me con un mensaje pre-armado.
//
// El catálogo expira en N días (default 14) — pasado eso, ya no se ve.
// Si el stock cambió, Diego genera un nuevo catálogo (no se actualiza
// automáticamente para no engañar al cliente con precios viejos).

import { safeRate } from "../helpers.js";

const MS_PER_DAY = 86400000;

// Genera un slug humano-friendly: "junio-x4k2"
function generateSlug() {
  const now = new Date();
  const month = now.toLocaleString("es-AR", { month: "short" });
  const random = Math.random().toString(36).slice(2, 6);
  return `${month.toLowerCase().replace(/[^a-z]/g, "")}-${random}`;
}

// Crea el snapshot del catálogo a partir de los productos en stock.
// Solo incluye productos REALES (que tienen stock > 0).
export function createCatalogSnapshot({
  products = [],
  exchangeRate = 1,
  title = null,
  expiresInDays = 14,
  contactPhone = "5491168725293", // 11 6872 5293 default
  contactIG = "imports.zonanorte",
  promoNote = null,
} = {}) {
  const rate = safeRate(exchangeRate) || 1;
  const inStock = (products || [])
    .filter(p => p && !p.isDeleted && (Number(p.stock) || 0) > 0);

  const items = inStock.map(p => ({
    id: p.id,
    brand: p.brand,
    model: p.model,
    flavor: p.flavor,
    puffs: p.puffs,
    stock: p.stock,
    priceARS: Math.round(Number(p.priceARS) || (Number(p.priceUSD) || 0) * rate),
  }));

  // Stats agregados
  const totalUnits = items.reduce((s, i) => s + i.stock, 0);
  const totalValue = items.reduce((s, i) => s + i.priceARS * i.stock, 0);

  const slug = generateSlug();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInDays * MS_PER_DAY);

  return {
    id: slug,
    slug,
    title: title || `Stock ${now.toLocaleString("es-AR", { day: "numeric", month: "long" })}`,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    contactPhone,
    contactIG,
    promoNote,
    exchangeRate: rate,
    items,
    stats: {
      productCount: items.length,
      totalUnits,
      totalValue,
      brands: [...new Set(items.map(i => i.brand))].length,
    },
  };
}

// URL pública compartible
export function catalogPublicURL(slug, baseURL = null) {
  const base = baseURL || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/c/${slug}`;
}

// Mensaje preparado para compartir por WhatsApp
export function catalogShareMessage(snapshot, publicURL) {
  const lines = [
    `🔥 *IMPORTS ZONA NORTE — Stock actualizado*`,
    "",
    `📦 ${snapshot.stats.productCount} sabores disponibles · ${snapshot.stats.brands} marcas`,
    `📲 Mirá el catálogo completo con precios:`,
    publicURL,
    "",
    `Pedís por DM y arreglamos 💬`,
  ];
  if (snapshot.promoNote) {
    lines.splice(3, 0, snapshot.promoNote, "");
  }
  return lines.join("\n");
}

// Para que un cliente pida por WA con un producto pre-seleccionado
export function clientOrderLink(snapshot, productIds = []) {
  const items = (snapshot?.items || []).filter(i => productIds.includes(i.id));
  const lines = [
    "Hola IZN! Me interesa pedir:",
    "",
    ...items.map(i => `• ${i.brand} ${i.model} ${i.flavor} — $${i.priceARS.toLocaleString("es-AR")}`),
    "",
    "¿Tenés stock disponible?",
  ];
  const text = encodeURIComponent(lines.join("\n"));
  const phone = (snapshot?.contactPhone || "").replace(/[^\d]/g, "");
  return `https://wa.me/${phone}?text=${text}`;
}

// Verifica si un snapshot expiró
export function isCatalogExpired(snapshot, now = new Date()) {
  if (!snapshot?.expiresAt) return false;
  return new Date(snapshot.expiresAt).getTime() < now.getTime();
}

// === ENCODING PARA URL PÚBLICA ===
// Estrategia: snapshot completo embebido en el hash de la URL como base64.
// Pro: 100% offline, sin backend, sin firestore rules adicionales.
// Funciona en cualquier deploy estático (Vercel/Netlify).

// Encode: snapshot → URL completa compartible
export function encodeCatalogToURL(snapshot, baseURL = null) {
  const base = baseURL || (typeof window !== "undefined" ? window.location.origin : "");
  // Encode UTF-8 → base64 (manejando chars unicode con encodeURIComponent)
  const json = JSON.stringify(snapshot);
  const utf8 = typeof TextEncoder !== "undefined"
    ? new TextEncoder().encode(json)
    : new Uint8Array([...json].map(c => c.charCodeAt(0)));
  let binary = "";
  utf8.forEach(byte => { binary += String.fromCharCode(byte); });
  const b64 = typeof btoa !== "undefined" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
  // base64url-safe
  const safe = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${base}/c/${snapshot.slug}#d=${safe}`;
}

// Decode: lee el hash actual y devuelve el snapshot
export function decodeCatalogFromURL(url = null) {
  const target = url || (typeof window !== "undefined" ? window.location.href : "");
  const match = target.match(/#d=([A-Za-z0-9_-]+)/);
  if (!match) return null;
  try {
    const safe = match[1];
    const b64 = safe.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - safe.length % 4) % 4);
    const binary = typeof atob !== "undefined" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
    const bytes = new Uint8Array([...binary].map(c => c.charCodeAt(0)));
    const json = typeof TextDecoder !== "undefined"
      ? new TextDecoder().decode(bytes)
      : binary;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Detecta si la URL actual es de un catálogo público
export function isCatalogURL(pathname = null) {
  const path = pathname || (typeof window !== "undefined" ? window.location.pathname : "");
  return /^\/c\//.test(path);
}
