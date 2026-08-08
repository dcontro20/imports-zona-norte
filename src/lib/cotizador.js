// cotizador.js — COTIZACIÓN Y PRESUPUESTOS del Pricing Engine (F5). Puro.
//
// El flujo real (definido por Gustavo en gate F4): el presupuesto lo armamos
// NOSOTROS — lista completa al cliente → el cliente responde texto libre por
// WhatsApp → el vendedor lo carga acá → presupuesto de vuelta. No hay
// autoservicio.
//
// Reglas que implementa:
//   RN-06/07  escalón por TOTAL de unidades; todas las líneas toman ese precio
//   RN-08     mínimo de unidades Y de ticket, bloqueantes
//   RN-09     nudge de frontera — PARA EL VENDEDOR, en pantalla mientras carga
//             (punto f); en el texto también, pero nunca solo ahí
//   RN-10     conversión a pesos: FX elegido + buffer de la política
//   RN-11     el presupuesto declara vigencia y versión de lista
//   RN-12     cotiza SIEMPRE contra la lista publicada (precioEnLista), jamás
//             recalcula en vivo
//   RN-17     precio de lista = contado; plazo con recargo explícito
//   (h)       se cotiza a NIVEL MODELO; los sabores son NOTA libre de la
//             línea (detalle de preparación, no dato de cotización)
//   (k)       utilidad/margen del pedido: dato INTERNO del panel, jamás viaja
//             en el texto
//   Moneda    el FX se ELIGE entre fuentes configuradas — nunca número libre
//             sin registro (un FX editable a mano es la puerta trasera para
//             editar precios, RN-16); manual queda registrado y pasa la banda
//   No-cierre el motivo (precio / stock / no respondió) se registra al marcar
//             perdido — sin eso hay tasa de cierre pero no el porqué (§9)
import { precioEnLista } from "./priceLists.js";

const EPS = 1e-9;
const redondearCentavos = (x) => Math.round(x * 100) / 100;

// ---------------------------------------------------------------------------
// CARGA RÁPIDA (spec g) — parse y búsqueda, puros para poder testearlos
// ---------------------------------------------------------------------------

// Normaliza para matchear: minúsculas, sin acentos, espacios colapsados.
export function normalizarTexto(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// "10 ice king" o "ice king 10" → { qty, consulta }. Sin número ⇒ qty 1.
// El número puede ir adelante O atrás, nunca en el medio (un "TE 30K" tiene
// dígitos adentro del nombre y no son cantidad).
export function parseLineaRapida(texto) {
  const t = String(texto || "").trim();
  if (!t) return { qty: 0, consulta: "" };
  let m = t.match(/^(\d+)\s+(.+)$/);
  if (m) return { qty: Number(m[1]), consulta: m[2].trim() };
  m = t.match(/^(.+?)\s+(\d+)$/);
  if (m) return { qty: Number(m[2]), consulta: m[1].trim() };
  return { qty: 1, consulta: t };
}

// Busca modelos en la lista publicada. Matchea sobre marca + modelo,
// insensible a mayúsculas y acentos. Prioridad: lo que EMPIEZA con lo tipeado
// (por modelo o por marca) antes que lo que lo contiene en el medio
// ("te" trae TE 30K primero, no Sweet King).
export function buscarModelos(consulta, lista) {
  const q = normalizarTexto(consulta);
  if (!q) return [];
  const resultados = [];
  for (const fila of lista?.filas || []) {
    const modelo = normalizarTexto(fila.modelo);
    const marca = normalizarTexto(fila.marca);
    const completo = `${marca} ${modelo}`;
    let rango = null;
    if (modelo.startsWith(q) || marca.startsWith(q) || completo.startsWith(q)) rango = 0;
    else if (completo.includes(q)) rango = 1;
    if (rango !== null) resultados.push({ fila, rango, orden: completo });
  }
  return resultados
    .sort((a, b) => a.rango - b.rango || a.orden.localeCompare(b.orden))
    .map((r) => r.fila);
}

// Agrega una línea al pedido. Si el modelo YA está, SUMA a la línea existente
// (dos líneas del mismo modelo confunden al preparar y al contar). La nota
// nueva se concatena a la existente.
export function agregarLinea(lineas, { modeloId, qty, nota = "" }) {
  const existente = (lineas || []).find((l) => l.modeloId === modeloId);
  if (existente) {
    return lineas.map((l) =>
      l.modeloId === modeloId
        ? {
            ...l,
            qty: (Number(l.qty) || 0) + (Number(qty) || 0),
            nota: [l.nota, nota].filter(Boolean).join(", "),
          }
        : l
    );
  }
  return [...(lineas || []), { modeloId, qty: Number(qty) || 0, nota }];
}

// ---------------------------------------------------------------------------
// COTIZACIÓN (contra la lista publicada, jamás en vivo)
// ---------------------------------------------------------------------------

// lineas: [{ modeloId, qty, nota? }] — modeloId = id de fila de la lista.
// Devuelve la cotización completa para el panel del vendedor.
export function cotizar({ lineas, lista, politica }) {
  const motivosBloqueo = [];
  const filasPorId = new Map((lista?.filas || []).map((f) => [f.id, f]));
  if (!lista) motivosBloqueo.push("No hay lista de precios publicada.");

  const lineasValidas = (lineas || []).filter((l) => Number(l.qty) > 0);
  const totalUnidades = lineasValidas.reduce((s, l) => s + Number(l.qty), 0);

  // Escalones desde la propia lista (arreglo, cantidad libre).
  const escalones = lista?.filas[0]?.precios || [];
  const escalon = escalones.find(
    (e) => totalUnidades >= e.desde && (e.hasta == null || totalUnidades <= e.hasta)
  ) || null;
  // Mientras se carga y todavía no se llegó al mínimo, se muestra el primer
  // escalón como provisional (marcado bajoMinimo) — sin precio no se puede
  // armar el pedido que justamente busca alcanzarlo.
  const escalonEfectivo = escalon || escalones[0] || null;
  const bajoMinimo = !escalon && totalUnidades > 0;

  const detalle = lineasValidas.map((l) => {
    const fila = filasPorId.get(l.modeloId);
    if (!fila) {
      motivosBloqueo.push(`"${l.modeloId}" no está en la lista vigente (¿sin costo? RN-18).`);
      return { ...l, enLista: false, precioUSD: 0, subtotalUSD: 0 };
    }
    const p = escalonEfectivo
      ? precioEnLista(lista, l.modeloId, Math.max(totalUnidades, escalonEfectivo.desde))
      : null;
    const precioUSD = p?.precio || 0;
    return {
      ...l,
      enLista: true,
      marca: fila.marca,
      modelo: fila.modelo,
      precioUSD,
      subtotalUSD: redondearCentavos(precioUSD * Number(l.qty)),
      costoRealUnit: fila.costoReal,
    };
  });

  const totalUSD = redondearCentavos(detalle.reduce((s, l) => s + l.subtotalUSD, 0));
  // (k) — interno: utilidad y margen del pedido para el panel del vendedor.
  const utilidadUSD = redondearCentavos(
    detalle.reduce((s, l) => s + (l.enLista ? (l.precioUSD - l.costoRealUnit) * l.qty : 0), 0)
  );
  const margenPct = totalUSD > 0 ? utilidadUSD / totalUSD : 0;

  // RN-08 — mínimos bloqueantes (unidades Y ticket).
  const minimo = politica?.pedidoMinimo || {};
  if (totalUnidades > 0 && Number(minimo.unidades) > 0 && totalUnidades < Number(minimo.unidades)) {
    motivosBloqueo.push(`El pedido no llega al mínimo de ${minimo.unidades} unidades (tiene ${totalUnidades}).`);
  }
  if (totalUSD > 0 && Number(minimo.ticketUSD) > 0 && totalUSD < Number(minimo.ticketUSD) - EPS) {
    motivosBloqueo.push(`El ticket no llega al mínimo de USD ${minimo.ticketUSD} (tiene USD ${totalUSD}).`);
  }

  // RN-09 — nudge de frontera PARA EL VENDEDOR (punto f): a menos del umbral
  // del siguiente escalón, con el AHORRO CONCRETO sobre las unidades ya
  // cargadas (el argumento en la conversación, no una promesa abstracta).
  let nudge = null;
  const umbralNudge = Number(politica?.nudgeUmbralPct) || 0.1;
  const siguiente = escalones.find((e) => e.desde > totalUnidades);
  if (siguiente && totalUnidades > 0) {
    const faltan = siguiente.desde - totalUnidades;
    if (faltan / siguiente.desde < umbralNudge - EPS) {
      const ahorroUSD = redondearCentavos(
        detalle.reduce((s, l) => {
          if (!l.enLista) return s;
          const pSig = precioEnLista(lista, l.modeloId, siguiente.desde);
          return s + (pSig ? (l.precioUSD - pSig.precio) * l.qty : 0);
        }, 0)
      );
      nudge = { faltan, desde: siguiente.desde, hasta: siguiente.hasta ?? null, ahorroUSD };
    }
  }

  return {
    ok: motivosBloqueo.length === 0 && totalUnidades > 0,
    motivosBloqueo,
    lineas: detalle,
    totalUnidades,
    escalon,
    escalonEfectivo,
    bajoMinimo,
    totalUSD,
    utilidadUSD,
    margenPct,
    nudge,
  };
}

// ---------------------------------------------------------------------------
// FX — fuentes configuradas, manual registrado, banda de sanidad, divergencia
// ---------------------------------------------------------------------------

// Resuelve el FX del presupuesto. fuenteId:
//   "sistema"       → el valor que ya tiene la app (dolarapi blue venta)
//   otra configurada → valor traído por la pantalla de esa fuente (valorFuente)
//   "manual"        → valorManual, REGISTRADO (quién) y dentro de la banda de
//                     sanidad contra el sistema — fuera de banda NO pasa: un FX
//                     libre es un descuento sin registrar (RN-16 por la ventana)
export function resolverFx({ fuenteId = "sistema", valorFuente = 0, valorManual = 0, sistemaValor = 0, politica, elegidoPor = "" }) {
  const banda = Number(politica?.fxSanidadPct) || 0.1;
  if (fuenteId === "manual") {
    const v = Number(valorManual);
    if (!(v > 0)) return { ok: false, motivo: "Ingresá un valor de dólar válido." };
    if (Number(sistemaValor) > 0) {
      const drift = Math.abs(v - sistemaValor) / sistemaValor;
      if (drift > banda + EPS) {
        return {
          ok: false,
          motivo: `El valor manual difiere ${(drift * 100).toFixed(1)}% del sistema ($${sistemaValor}) — fuera de la banda de sanidad del ${Math.round(banda * 100)}%.`,
        };
      }
    }
    return { ok: true, fx: { valor: v, fuente: "manual", elegidoPor } };
  }
  if (fuenteId === "sistema") {
    const v = Number(sistemaValor);
    if (!(v > 0)) return { ok: false, motivo: "Sin cotización del sistema — esperá dolarapi o cargala en Caja." };
    return { ok: true, fx: { valor: v, fuente: "sistema" } };
  }
  const v = Number(valorFuente);
  if (!(v > 0)) return { ok: false, motivo: `La fuente "${fuenteId}" no devolvió cotización.` };
  return { ok: true, fx: { valor: v, fuente: fuenteId } };
}

// Aviso (d): si el FX del presupuesto difiere del FX con que se publicó la
// lista vigente más que el umbral — "el cliente vio la lista a $X" y los
// números no le van a cerrar. Listas viejas sin fxAlPublicar ⇒ sin aviso.
export function divergenciaFxConLista(fxValor, lista, umbralPct) {
  const publicado = Number(lista?.fxAlPublicar);
  const v = Number(fxValor);
  if (!(publicado > 0) || !(v > 0)) return null;
  const drift = Math.abs(v - publicado) / publicado;
  if (drift > (Number(umbralPct) || 0) + EPS) {
    return { divergente: true, fxLista: publicado, pct: drift };
  }
  return null;
}

// ---------------------------------------------------------------------------
// PRESUPUESTO — emisión (FX CONGELADO), texto, vencimiento y no-cierre
// ---------------------------------------------------------------------------

export const MOTIVOS_NO_CIERRE = [
  { id: "precio", label: "Precio" },
  { id: "stock", label: "Stock" },
  { id: "no_respondio", label: "No respondió" },
];

// Congela TODO lo que el presupuesto promete (RN-11/12 + regla e del gate F4):
// FX elegido (valor, fuente, quién si manual), buffer, vigencia, versión de
// lista, líneas con notas y totales. id y fecha vienen del caller (la lib es
// pura). El recargo por plazo va calculado explícito (RN-17).
export function emitirPresupuesto({ id, cotizacion, lista, politica, fx, cliente = null, fecha, autor = "" }) {
  const buffer = Number(politica?.bufferFxPct) || 0;
  const fxEfectivo = redondearCentavos(fx.valor * (1 + buffer));
  const vigenciaHoras = Number(politica?.vigenciaHoras) || 48;
  const venceAt = new Date(new Date(fecha).getTime() + vigenciaHoras * 3600 * 1000).toISOString();
  const totalARS = Math.round(cotizacion.totalUSD * fxEfectivo);
  const recargo = politica?.recargoPlazo || {};
  const recargoPct = Number(recargo.pct) || 0;

  return {
    id,
    estado: "emitido", // emitido → ganado | perdido (con motivo) · vencido se deriva
    emitidoAt: new Date(fecha).toISOString(),
    emitidoPor: autor,
    venceAt,
    vigenciaHoras,
    listVersion: lista?.version || "",
    clienteId: cliente?.id || null,
    clienteNombre: cliente?.nombre || cliente?.businessName || cliente?.name || "",
    fx: { ...fx, buffer, efectivo: fxEfectivo },
    lineas: cotizacion.lineas.map((l) => ({
      modeloId: l.modeloId, marca: l.marca, modelo: l.modelo,
      qty: l.qty, nota: l.nota || "",
      precioUSD: l.precioUSD,
      precioARS: Math.round(l.precioUSD * fxEfectivo),
    })),
    totalUnidades: cotizacion.totalUnidades,
    escalon: cotizacion.escalon ? { desde: cotizacion.escalon.desde, hasta: cotizacion.escalon.hasta ?? null } : null,
    totalUSD: cotizacion.totalUSD,
    totalARS,
    plazo: recargoPct > 0
      ? { pct: recargoPct, dias: Number(recargo.dias) || 0, totalARS: Math.round(totalARS * (1 + recargoPct)) }
      : null,
  };
}

export function presupuestoVencido(quote, now = new Date()) {
  if (!quote?.venceAt) return false;
  return quote.estado === "emitido" && new Date(now).toISOString() > quote.venceAt;
}

// Transiciones de estado (puras — el caller persiste).
export function marcarGanado(quote, { saleId = null, fecha }) {
  return { ...quote, estado: "ganado", cerradoAt: new Date(fecha).toISOString(), saleId };
}
export function marcarPerdido(quote, { motivo, fecha }) {
  if (!MOTIVOS_NO_CIERRE.some((m) => m.id === motivo)) {
    throw new Error(`Motivo de no-cierre inválido: ${motivo}`);
  }
  return { ...quote, estado: "perdido", cerradoAt: new Date(fecha).toISOString(), motivoNoCierre: motivo };
}

// Texto del presupuesto para WhatsApp. La MISMA promesa que la lista (48 hs
// declaradas, RN-11). El margen/utilidad NO viaja (k: interno). El nudge va
// como línea si existe (f: además de la pantalla, nunca solo acá).
export function presupuestoTexto(quote, { nudge = null } = {}) {
  if (!quote) return "";
  const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString("es-AR")}`;
  const fecha = new Date(quote.emitidoAt).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const vence = new Date(quote.venceAt).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
  const lines = [];
  lines.push("🧾 *PRESUPUESTO — Imports Zona Norte*");
  lines.push(`📅 ${fecha} · Lista ${quote.listVersion}`);
  if (quote.clienteNombre) lines.push(`Para: ${quote.clienteNombre}`);
  lines.push("");
  quote.lineas.forEach((l) => {
    const nota = l.nota ? ` (${l.nota})` : "";
    lines.push(`• ${l.modelo} ×${l.qty}${nota} — ${money(l.precioARS)} c/u = ${money(l.precioARS * l.qty)}`);
  });
  lines.push("");
  lines.push(`📦 ${quote.totalUnidades} unidades`);
  lines.push(`💰 *Total contado: ${money(quote.totalARS)}*`);
  if (quote.plazo) {
    lines.push(`🕐 A ${quote.plazo.dias} días: ${money(quote.plazo.totalARS)} (+${Math.round(quote.plazo.pct * 100)}%)`);
  }
  if (nudge && nudge.ahorroUSD > 0) {
    const ahorroARS = Math.round(nudge.ahorroUSD * quote.fx.efectivo);
    lines.push(`💡 Sumando ${nudge.faltan} unidad${nudge.faltan !== 1 ? "es" : ""} más, este pedido baja ${money(ahorroARS)}.`);
  }
  lines.push(`⏳ Válido por ${quote.vigenciaHoras} hs (hasta el ${vence}) al dólar de hoy.`);
  return lines.join("\n");
}
