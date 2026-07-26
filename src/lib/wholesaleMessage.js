// src/lib/wholesaleMessage.js
//
// Generadores de mensajes B2B (mayorista): COBRANZA y PRESENTACIÓN.
// Funciones PURAS (mismo espíritu que clientMessage.js). El componente copia el
// texto y lo pega en WhatsApp.

import { clientOutstanding, clientMayoristaSales, saleOutstanding, oldestUnpaidDays } from "./creditAccount.js";
import { resolveTierPrice, hasTierPrice } from "../wholesale.js";

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString("es-AR")}`;

// Mensaje de recordatorio de cobranza para un cliente mayorista con deuda.
// Devuelve "" si no debe nada.
export function cobranzaMessage(client, sales, now = Date.now()) {
  const owed = clientOutstanding(client, sales);
  if (owed <= 0) return "";
  const name = client?.contactName || client?.businessName || client?.name || "";
  const dias = oldestUnpaidDays(client, sales, now);
  const impagas = clientMayoristaSales(client, sales)
    .filter(s => saleOutstanding(s) > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const lines = [];
  lines.push(`Hola${name ? ` ${name}` : ""}! 👋 Te paso el resumen de tu cuenta con Imports Zona Norte:`);
  lines.push("");
  impagas.forEach(s => {
    const d = new Date(s.date);
    const fecha = Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-AR");
    lines.push(`• Pedido del ${fecha}: ${money(saleOutstanding(s))} pendiente`);
  });
  lines.push("");
  lines.push(`💵 *Total a saldar: ${money(owed)}*`);
  if (dias != null && dias >= 30) lines.push(`⏰ El pedido más viejo tiene ${dias} días.`);
  lines.push("");
  lines.push("Cualquier cosa coordinamos el pago. ¡Gracias! 🙌");
  return lines.join("\n");
}

// Mensaje de PRESENTACIÓN para el primer contacto con un kiosco (Bloque 2 —
// front de ventas). `target` puede ser un prospecto ({businessName,
// contactName, zone}) o un cliente mayorista. `tier` = la lista que le vas a
// ofrecer. Incluye 2-3 precios de gancho REALES del tier (solo productos con
// lista de tier cargada Y stock) — si no hay ninguno, el mensaje sale sin
// precios (invita a pedir la lista). Mismo tono que el resto: natural, cálido,
// editable antes de mandar.
export function presentationMessage(target, { tier = "C", products = [], exchangeRate = 0, maxProducts = 3 } = {}) {
  const t = String(tier || "C").toUpperCase();
  const contact = target?.contactName || "";
  const biz = target?.businessName || target?.name || "";
  const rate = Number(exchangeRate) || 0;

  const conPrecio = (products || [])
    .filter(p => p && !p.isDeleted && (Number(p.stock) || 0) > 0 && hasTierPrice(p, t))
    .sort((a, b) => (Number(b.stock) || 0) - (Number(a.stock) || 0))
    .slice(0, maxProducts);

  const lines = [];
  lines.push(`Hola${contact ? ` ${contact}` : ""}! 👋 Soy Diego, de *Imports Zona Norte*.`);
  lines.push("");
  lines.push(`Distribuimos vapes importados (Elfbar, Lost Mary, Geek Bar y más) a kioscos${target?.zone ? ` de ${target.zone}` : " de la zona"}, con precio mayorista y entrega en el local.`);
  if (conPrecio.length > 0 && rate > 0) {
    lines.push("");
    lines.push("Para que tengas una referencia de precios:");
    conPrecio.forEach(p => {
      const ars = Math.round(resolveTierPrice(p, t) * rate);
      lines.push(`• ${p.brand} ${p.model} ${p.flavor}: ${money(ars)}`);
    });
  }
  lines.push("");
  lines.push("Si te interesa te paso la lista completa de precios y coordinamos una entrega sin compromiso. 🙌");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// LISTA DE PRECIOS COMPARTIBLE (Bloque 2.2 — front de ventas)
// ---------------------------------------------------------------------------

// Items de la lista para un tier: solo productos con stock Y lista de tier
// cargada, agrupados por marca (orden alfabético, y por modelo+sabor adentro).
// Devuelve [{ brand, items: [{ id, label, priceARS }] }]. Base compartida de
// la pantalla y del texto de WhatsApp.
export function priceListItems(products = [], tier = "C", exchangeRate = 0) {
  const t = String(tier || "C").toUpperCase();
  const rate = Number(exchangeRate) || 0;
  const byBrand = {};
  (products || [])
    .filter(p => p && !p.isDeleted && (Number(p.stock) || 0) > 0 && hasTierPrice(p, t))
    .forEach(p => {
      const brand = (p.brand || "Otros").trim() || "Otros";
      byBrand[brand] = byBrand[brand] || [];
      byBrand[brand].push({
        id: p.id,
        label: `${p.model || ""} ${p.flavor || ""}`.trim() || p.brand,
        priceARS: Math.round(resolveTierPrice(p, t) * rate),
      });
    });
  return Object.keys(byBrand).sort((a, b) => a.localeCompare(b)).map(brand => ({
    brand,
    items: byBrand[brand].sort((a, b) => a.label.localeCompare(b.label)),
  }));
}

// Texto compartible de la lista COMPLETA. Decisiones de Diego (2026-07-24):
// - NO menciona el tier (las listas se reenvían entre comercios; "Tier B"
//   abre la pregunta de por qué no A). El tier es info interna de la pantalla.
// - Fecha + disclaimer del dólar (estándar del rubro — cubre listas viejas).
// - Completa: todos los productos con stock y precio de tier, por marca.
export function priceListText(products = [], { tier = "C", exchangeRate = 0, now = new Date() } = {}) {
  const groups = priceListItems(products, tier, exchangeRate);
  if (groups.length === 0) return "";
  const fecha = now.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const lines = [];
  lines.push("🛒 *LISTA DE PRECIOS — Imports Zona Norte*");
  lines.push(`📅 Precios al ${fecha} · sujetos a variación del dólar`);
  groups.forEach(g => {
    lines.push("");
    lines.push(`*${g.brand.toUpperCase()}*`);
    g.items.forEach(it => lines.push(`• ${it.label} — ${money(it.priceARS)}`));
  });
  lines.push("");
  lines.push("📦 Todo con stock a hoy. Hacé tu pedido y coordinamos la entrega. 🙌");
  return lines.join("\n");
}
