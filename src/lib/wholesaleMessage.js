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
