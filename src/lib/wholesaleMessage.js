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

// ---------------------------------------------------------------------------
// LISTA MAYORISTA POR ESCALONES (Pricing Engine F4)
// ---------------------------------------------------------------------------
// Reemplaza al texto por tier: la lista compartida manda TODOS los escalones,
// no uno solo. Definición comercial de Gustavo (gate F3→F4): la grilla
// completa hace visible el incentivo de volumen antes de que el cliente pida
// presupuesto — mandar un escalón suelto tenía sentido con tiers por cliente;
// con escalones por volumen esconde justamente lo que los justifica. Y la
// mezcla libre va ESCRITA en el mensaje, no implícita en la grilla: es EL
// diferencial del negocio.

// Filas de la lista VIGENTE que tienen stock hoy, agrupadas por marca.
// El stock se suma por marca+modelo desde los productos VIVOS (no desde los
// productIds del snapshot: un sabor agregado después de publicar cuenta).
// Devuelve [{ marca, items: [filas del snapshot] }].
export function listaEscalonesItems(lista, products = []) {
  const stockPorModelo = new Map();
  for (const p of products || []) {
    if (!p || p.isDeleted) continue;
    const clave = `${p.brand}|${p.model}`;
    stockPorModelo.set(clave, (stockPorModelo.get(clave) || 0) + (Number(p.stock) || 0));
  }
  const porMarca = {};
  for (const fila of lista?.filas || []) {
    if ((stockPorModelo.get(fila.id) || 0) <= 0) continue;
    (porMarca[fila.marca] = porMarca[fila.marca] || []).push(fila);
  }
  return Object.keys(porMarca).sort((a, b) => a.localeCompare(b)).map(marca => ({
    marca,
    items: porMarca[marca].slice().sort((a, b) => a.modelo.localeCompare(b.modelo)),
  }));
}

// Texto compartible de la lista publicada, en pesos.
// Reglas: TODOS los escalones por modelo · mezcla libre escrita arriba ·
// versión + fecha + disclaimer del dólar (reglas de Diego, 2026-07-24) ·
// sin ninguna mención de tier/cliente. La conversión a pesos usa el FX del
// día + buffer de la política CONGELADA en la lista (la misma conversión que
// usará el cotizador: lista y presupuesto no divergen).
export function listaEscalonesText(lista, { products = [], exchangeRate = 0, now = new Date() } = {}) {
  const grupos = listaEscalonesItems(lista, products);
  if (!lista || grupos.length === 0) return "";
  const buffer = Number(lista.politica?.bufferFxPct) || 0;
  const rate = (Number(exchangeRate) || 0) * (1 + buffer);
  if (!(rate > 0)) return "";
  const fecha = now.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const rango = (e) => (e.hasta == null ? `${e.desde}+` : `${e.desde}-${e.hasta}`);
  // Los rangos salen del snapshot (arreglo, cantidad libre — jamás se asume 4).
  const escalones = grupos[0].items[0].precios;

  const lines = [];
  lines.push("🏷️ *LISTA MAYORISTA — Imports Zona Norte*");
  lines.push(`📅 Lista ${lista.version} · ${fecha}`);
  lines.push("");
  lines.push("💡 *El precio por unidad depende del TOTAL de unidades del pedido.* Mezclá modelos y sabores como quieras — lo que cuenta es el total.");
  lines.push(`Unidades: ${escalones.map(rango).join("  ·  ")}`);
  grupos.forEach(g => {
    lines.push("");
    lines.push(`*${g.marca.toUpperCase()}*`);
    g.items.forEach(f => {
      lines.push(`• ${f.modelo}: ${f.precios.map(e => money(e.precio * rate)).join(" · ")}`);
    });
  });
  lines.push("");
  const minimo = lista.politica?.pedidoMinimo;
  if (Number(minimo?.unidades) > 0) {
    const ticket = Number(minimo.ticketUSD) > 0 ? ` (ticket mínimo ${money(minimo.ticketUSD * rate)})` : "";
    lines.push(`📦 Pedido mínimo: ${minimo.unidades} unidades${ticket}.`);
  }
  lines.push(`💵 Precios en pesos al dólar del ${fecha} — pueden ajustarse si el dólar se mueve.`);
  return lines.join("\n");
}
