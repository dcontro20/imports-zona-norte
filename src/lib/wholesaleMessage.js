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

// Mensaje de PRIMER CONTACTO. Decisión de Gustavo (2026-08-07, tras prospectar
// de verdad): **un solo texto para todos los kioscos, sin tier y sin precios**.
// El primer mensaje no vende — solo confirma que del otro lado hay quien
// atiende el local. Mandar precios antes de saber con quién estás hablando
// quemaba el contacto. Los mensajes de seguimiento (ahí sí, según cómo avance
// la charla) se definen después.
//
// La lista de precios NO se perdió: vive en su propia pantalla (priceListText /
// priceListItems, 🏷️ Lista de precios), que es donde se comparte cuando
// corresponde.
export function presentationMessage(target, { remitente = "" } = {}) {
  const quien = String(remitente || "").trim();
  const biz = String(target?.businessName || target?.name || "").trim();
  const saludo = `Hola, ¿cómo estás?${quien ? ` Mi nombre es ${quien}.` : ""}`;
  // Sin nombre del negocio no se inventa la pregunta: quedaría "¿Me comunico
  // con ?" y el mensaje se manda tal cual sale.
  return biz ? `${saludo} ¿Me comunico con ${biz}?` : saludo;
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
