// src/lib/wholesaleMessage.js
//
// Generadores de mensajes B2B (mayorista): COBRANZA y PRESENTACIÓN.
// Funciones PURAS (mismo espíritu que clientMessage.js). El componente copia el
// texto y lo pega en WhatsApp.

import { clientOutstanding, clientMayoristaSales, saleOutstanding, oldestUnpaidDays } from "./creditAccount.js";

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
// La lista de precios NO se perdió: vive en su propia pantalla (🏷️ Lista de
// precios → listaEscalonesText), que es donde se comparte cuando corresponde.
export function presentationMessage(target, { remitente = "" } = {}) {
  const quien = String(remitente || "").trim();
  const biz = String(target?.businessName || target?.name || "").trim();
  const saludo = `Hola, ¿cómo estás?${quien ? ` Mi nombre es ${quien}.` : ""}`;
  // Sin nombre del negocio no se inventa la pregunta: quedaría "¿Me comunico
  // con ?" y el mensaje se manda tal cual sale.
  return biz ? `${saludo} ¿Me comunico con ${biz}?` : saludo;
}

// (F6: los generadores por tier priceListItems/priceListText se retiraron —
// la lista compartible sale de la LISTA PUBLICADA, abajo.)

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

// DOS listas, los MISMOS precios (decisión de Gustavo, 2026-08-14):
//   "catalogo" — TODOS los modelos de la lista publicada, haya stock o no. Es
//     el que se manda siempre: el negocio tiene stock inmediato acotado en
//     Buenos Aires MÁS un catálogo que se consigue en pocos días, y filtrar por
//     stock le escondía al cliente la mitad de lo que puede comprar.
//   "stock" — solo lo que hay hoy, para el cliente que quiere algo YA.
// Lo que NO cambia: sin COSTO no hay precio y el modelo no entra a la lista
// (RN-18) — eso pasa al publicar el snapshot, y es otra cosa que la falta de
// stock.
export const MODOS_LISTA = ["catalogo", "stock"];

// Filas de la lista VIGENTE agrupadas por marca.
// El stock se suma por marca+modelo desde los productos VIVOS (no desde los
// productIds del snapshot: un sabor agregado después de publicar cuenta).
// `modo`: "catalogo" (default, no filtra) · "stock" (solo stock > 0).
// Devuelve [{ marca, items: [filas del snapshot] }].
export function listaEscalonesItems(lista, products = [], { modo = "catalogo" } = {}) {
  const soloConStock = String(modo) === "stock";
  const stockPorModelo = new Map();
  for (const p of products || []) {
    if (!p || p.isDeleted) continue;
    const clave = `${p.brand}|${p.model}`;
    stockPorModelo.set(clave, (stockPorModelo.get(clave) || 0) + (Number(p.stock) || 0));
  }
  const porMarca = {};
  for (const fila of lista?.filas || []) {
    if (soloConStock && (stockPorModelo.get(fila.id) || 0) <= 0) continue;
    (porMarca[fila.marca] = porMarca[fila.marca] || []).push(fila);
  }
  return Object.keys(porMarca).sort((a, b) => a.localeCompare(b)).map(marca => ({
    marca,
    items: porMarca[marca].slice().sort((a, b) => a.modelo.localeCompare(b.modelo)),
  }));
}

// Separador que la migración de colores dejó en el sabor: "Banana Ice · Black"
// (scripts/migrate-v250-colores.mjs). El color es una VARIANTE del mismo
// sabor, no un sabor distinto.
const SEP_VARIANTE = " · ";

// Pliega las variantes de un mismo sabor en un solo renglón:
//   ["Banana Ice · Black", "Banana Ice · Pink", "Menta"]
//   → ["Banana Ice (Black, Pink)", "Menta"]
// El cliente elige por SABOR; ver nueve renglones que solo difieren en el
// color hace más largo el mensaje sin agregar una sola opción real.
// Si un sabor existe además SIN variante, es otro SKU y va aparte.
export function plegarVariantes(sabores = []) {
  const porBase = new Map();
  for (const sabor of sabores) {
    const i = String(sabor).indexOf(SEP_VARIANTE);
    const base = i === -1 ? String(sabor) : String(sabor).slice(0, i);
    const variante = i === -1 ? null : String(sabor).slice(i + SEP_VARIANTE.length).trim();
    if (!porBase.has(base)) porBase.set(base, { pelado: false, variantes: new Set() });
    const entrada = porBase.get(base);
    if (variante) entrada.variantes.add(variante);
    else entrada.pelado = true;
  }
  const out = [];
  for (const [base, { pelado, variantes }] of porBase) {
    if (pelado) out.push(base);
    if (variantes.size > 0) {
      out.push(`${base} (${[...variantes].sort((a, b) => a.localeCompare(b, "es-AR")).join(", ")})`);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, "es-AR"));
}

// Reparte los sabores en renglones cortos separados por " · ".
// En párrafo corrido, once sabores son un bloque que en el celular no se lee;
// el corte por ANCHO (no por cantidad fija) mantiene los renglones parejos sea
// cual sea el largo de los nombres. Un sabor más largo que el presupuesto se
// lleva su renglón entero antes que partirse.
// 56 (probado en el celular de Gustavo, 14/08). A 46 los nombres largos
// —"Strawberry Apple Watermelon"— quedaban solos en su renglón. Si WhatsApp lo
// parte feo, se vuelve a 46: es el único número a mover.
const ANCHO_RENGLON = 56;
export function repartirEnRenglones(sabores = [], ancho = ANCHO_RENGLON) {
  const renglones = [];
  let actual = "";
  for (const sabor of sabores) {
    if (!actual) { actual = sabor; continue; }
    const candidato = `${actual} · ${sabor}`;
    if (candidato.length <= ancho) actual = candidato;
    else { renglones.push(actual); actual = sabor; }
  }
  if (actual) renglones.push(actual);
  return renglones;
}

// Sabores CON STOCK de cada modelo, ordenados alfabéticamente.
// Solo alimenta la lista de stock inmediato: el cliente elige por sabor, y
// decir "Ice King disponible" cuando quedan dos sabores devuelve exactamente
// el problema que esa lista viene a resolver (pedido que después hay que
// romper). El catálogo NO los lleva: ahí la promesa es la reposición y los
// sabores dependen de lo que se consiga.
// Devuelve Map("Marca|Modelo" → [sabor, ...]). Sin cantidades, nunca.
export function saboresConStock(products = []) {
  const porModelo = new Map();
  for (const p of products || []) {
    if (!p || p.isDeleted || !(Number(p.stock) > 0)) continue;
    const sabor = String(p.flavor || "").trim();
    if (!sabor) continue;
    const clave = `${p.brand}|${p.model}`;
    if (!porModelo.has(clave)) porModelo.set(clave, new Set());
    porModelo.get(clave).add(sabor);
  }
  return new Map(
    [...porModelo].map(([clave, set]) => [clave, [...set].sort((a, b) => a.localeCompare(b, "es-AR"))])
  );
}

// Texto compartible de la lista publicada, en pesos.
// Reglas: TODOS los escalones por modelo · mezcla libre escrita arriba ·
// versión + fecha + disclaimer del dólar (reglas de Diego, 2026-07-24) ·
// sin ninguna mención de tier/cliente. La conversión a pesos usa el FX del
// día + buffer de la política CONGELADA en la lista (la misma conversión que
// usará el cotizador: lista y presupuesto no divergen).
// `moneda`: "ARS" (default) convierte al FX del día + buffer · "USD" manda la
// lista en dólares y no necesita cotización (se puede compartir aunque no haya
// FX cargado); la conversión se hace recién al cotizar, y el texto lo dice.
// `modo`: "catalogo" (default, todos los modelos + la promesa de reposición) ·
// "stock" (solo lo disponible hoy, para entrega inmediata). Los dos mandan los
// MISMOS precios: la diferencia es qué se ofrece, no a cuánto.
export function listaEscalonesText(lista, { products = [], exchangeRate = 0, now = new Date(), moneda = "ARS", modo = "catalogo", resumido = null } = {}) {
  const grupos = listaEscalonesItems(lista, products, { modo });
  if (!lista || grupos.length === 0) return "";
  const esStock = String(modo) === "stock";
  // Las dos listas se mandan JUNTAS, una atrás de la otra: PRIMERO el stock,
  // DESPUÉS el catálogo (decisión comercial de Gustavo, 14/08 — lo primero que
  // abre el kiosquero tiene que ser lo que se lleva hoy; el catálogo es la
  // ampliación). Por eso las reglas —escalones, mínimo, disclaimer del dólar—
  // viajan en la de STOCK, y el catálogo es la continuación: cuando el cliente
  // llega ahí ya las leyó, y un mensaje que arranca con cuatro renglones ya
  // vistos esconde lo único nuevo.
  // `resumido` permite invertirlo sin tocar el modo si cambia el orden de envío.
  const esContinuacion = resumido == null ? !esStock : !!resumido;
  const enUSD = String(moneda).toUpperCase() === "USD";
  const buffer = Number(lista.politica?.bufferFxPct) || 0;
  const rate = (Number(exchangeRate) || 0) * (1 + buffer);
  if (!enUSD && !(rate > 0)) return "";
  const fecha = now.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const rango = (e) => (e.hasta == null ? `${e.desde}+` : `${e.desde}-${e.hasta}`);
  // La moneda se declara UNA vez en el encabezado, no cuatro veces por
  // renglón: "USD 14,00 · USD 13,50 · ..." gasta la mitad del ancho del
  // celular en repetir lo mismo. Y sin decimales vacíos (14,00 → 14).
  // 14,00 → "14" · 13,5 → "13,50": el entero no arrastra decimales vacíos, y
  // el que tiene centavos los muestra completos (13,5 se lee como precio a
  // medio escribir).
  const precio = (e) => {
    if (!enUSD) return Math.round(e.precio * rate).toLocaleString("es-AR");
    const v = Number(e.precio);
    const decimales = Number.isInteger(v) ? 0 : 2;
    return v.toLocaleString("es-AR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  };
  // Los rangos salen del snapshot (arreglo, cantidad libre — jamás se asume 4).
  const escalones = grupos[0].items[0].precios;

  const lines = [];
  lines.push("🏷️ *LISTA MAYORISTA — Imports Zona Norte*");
  lines.push(`📅 Lista ${lista.version} · ${fecha}`);
  lines.push("");
  // Qué es esta lista. Va ARRIBA de todo lo demás porque cambia lo que el
  // cliente entiende que puede pedir: el catálogo promete reposición, el de
  // stock promete entrega ya. Sin esta línea las dos listas son la misma con
  // renglones de menos, que es exactamente el malentendido que se quiere evitar.
  //
  // El de stock avisa que las cantidades POR SABOR son limitadas (2, 3, 4
  // unidades): hay variedad, no profundidad — así el cliente queda listo para
  // que parte del pedido venga después, en vez de armar uno que haya que
  // romper a la mitad. Cantidades por producto NO se publican.
  const plazoDias = Number(lista.politica?.plazoPedidoDias) || 5;
  lines.push(esStock
    ? "⚡ *Esto es lo que tengo acá ahora, listo para entrega* — las cantidades por sabor son limitadas."
    : `🗂️ *Estos son todos los modelos que manejamos* — lo que no tengo acá lo consigo en ${plazoDias} días.`);
  // El bloque de reglas (escalones + moneda) va solo en la primera lista.
  if (!esContinuacion) {
    lines.push("");
    lines.push("💡 *El precio por unidad depende del TOTAL de unidades del pedido.*");
    lines.push(`*Precios en ${enUSD ? "USD" : "pesos"}* — unidades: ${escalones.map(rango).join(" / ")}`);
  }
  // En la lista de stock, debajo de cada modelo van sus sabores disponibles,
  // repartidos en renglones cortos: en párrafo corrido, once sabores son un
  // bloque que en el celular no se lee.
  const sabores = esStock ? saboresConStock(products) : null;
  grupos.forEach(g => {
    lines.push("");
    lines.push(`*${g.marca.toUpperCase()}*`);
    g.items.forEach(f => {
      // Sin bullet: el modelo en negrita ya abre el renglón, y el bullet solo
      // gasta ancho.
      lines.push(`*${f.modelo}* — ${f.precios.map(precio).join(" / ")}`);
      for (const renglon of repartirEnRenglones(plegarVariantes(sabores?.get(f.id) || []))) {
        lines.push(renglon);
      }
    });
  });
  if (!esContinuacion) {
    lines.push("");
    // El mínimo se comunica EN POSITIVO y solo en unidades (decisión de Gustavo,
    // 2026-08-08): el ticket mínimo en pesos asusta y casi nunca aplica —
    // 20 unidades del producto más barato ya lo superan. Sigue existiendo como
    // validación bloqueante en el cotizador (RN-08), pero no se comunica acá.
    // La mezcla libre va ESCRITA (es EL diferencial del negocio, no implícita).
    const minimo = Number(lista.politica?.pedidoMinimo?.unidades) || 0;
    if (minimo > 0) lines.push(`📦 Comprás desde ${minimo} unidades — mezclá modelos y sabores como quieras.`);
    // Misma promesa que el presupuesto (48 hs por default, de la política
    // congelada): la versión vaga ("si el dólar se mueve") es la que el
    // cliente guarda en el teléfono — alineadas las dos (gate F4).
    const vigencia = Number(lista.politica?.vigenciaHoras) || 48;
    lines.push(enUSD
      ? `💵 Precios en dólares. La conversión a pesos se hace al dólar del día de la cotización y queda firme ${vigencia} hs.`
      : `💵 Precios en pesos al dólar del ${fecha} — válidos por ${vigencia} hs.`);
  }
  return lines.join("\n");
}
