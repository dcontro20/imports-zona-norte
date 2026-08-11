// prospectEtapas.js — el dominio de ETAPAS OPERATIVAS del sistema de ejecución
// comercial (spec CONGELADO: docs/PROSPECT_CRM_EJECUCION_SPEC.md, ciclo v2 del
// módulo Prospectos). Cada prospecto está en UNA única etapa, y la etapa se
// DERIVA de hechos registrados — jamás se setea a mano (filosofía de la casa:
// derivar, no almacenar). La UI captura hechos con taps; este módulo decide.
//
// El Prospect Engine NO se toca: etapaEngine() mapea las 7 operativas a las 3
// etapas que el motor conoce (prospecto/contactado/visitado) para que señales,
// ranking, funnel y zonas sigan funcionando idénticos.

// Tabla CONGELADA (gate F1). El orden ES el flujo del embudo.
export const ETAPAS_OPERATIVAS = [
  { key: "por_analizar",       etiqueta: "Por analizar",       icono: "🔍" },
  { key: "para_contactar",     etiqueta: "Para contactar",     icono: "💬" },
  { key: "para_visitar",       etiqueta: "Para visitar",       icono: "🚶" },
  { key: "esperando_respuesta", etiqueta: "Esperando respuesta", icono: "⏳" },
  { key: "visitado",           etiqueta: "Visitado",           icono: "📋" },
  { key: "negociacion",        etiqueta: "Negociación",        icono: "🤝" },
  { key: "cliente",            etiqueta: "Cliente",            icono: "🏪" },
];

// --- Fases comerciales (2026-08-07) -----------------------------------------
// Las 7 etapas operativas son la VERDAD del trabajo, pero como columnas de un
// tablero no narran nada: siete columnas angostas son una pared, no un embudo.
// Estas 4 fases son una PROYECCIÓN para el Embudo — agrupan etapas sin
// reemplazarlas (cada card sigue mostrando su etapa real). Decisión de Gustavo
// tras usar el tablero prospectando.
//
// El agrupamiento sigue el flujo comercial real:
//   Entrada     → todavía no decidiste si vale la pena
//   Contactando → estás tratando de llegar (por teléfono o yendo)
//   En juego    → ya hubo contacto real, se está negociando
//   Clientes    → cerrado (sale del CRM hacia Kioscos)
export const FASES_COMERCIALES = [
  { key: "entrada",     etiqueta: "Entrada",     icono: "🔍", etapas: ["por_analizar"] },
  { key: "contactando", etiqueta: "Contactando", icono: "💬", etapas: ["para_contactar", "para_visitar", "esperando_respuesta"] },
  { key: "en_juego",    etiqueta: "En juego",    icono: "🤝", etapas: ["visitado", "negociacion"] },
  { key: "clientes",    etiqueta: "Clientes",    icono: "🏪", etapas: ["cliente"] },
];

const FASE_DE_ETAPA = Object.fromEntries(
  FASES_COMERCIALES.flatMap(f => f.etapas.map(e => [e, f.key])));

// faseDeEtapa(etapaKey) → key de FASES_COMERCIALES. Una etapa desconocida cae
// en "entrada": es lo menos dañino (queda a la vista para que alguien decida),
// y además es imposible salvo que se agregue una etapa sin mapearla acá — cosa
// que el test de cobertura total impide.
export function faseDeEtapa(etapaKey) {
  return FASE_DE_ETAPA[etapaKey] || "entrada";
}

// Días sin respuesta tras un mensaje para marcar el sub-estado "reintentar".
export const DIAS_REINTENTO = 3;

const fecha = (v) => (v ? String(v) : "");
const tiene = (v) => !!String(v || "").trim();

// Última visita PROPIA del prospecto (misma semántica que lastVisitFor:
// activas, del target, la más reciente).
function ultimaVisita(visits, prospectId) {
  let max = "";
  for (const v of visits || []) {
    if (!v || v.isDeleted || v.targetId !== prospectId) continue;
    if (fecha(v.date) > max) max = fecha(v.date);
  }
  return max;
}

// etapaOperativa(prospect, { visits }) → key de ETAPAS_OPERATIVAS.
// Precedencia del spec §3. Tolerancia legacy (§3): por_analizar EXIGE
// ingresoAutomatico sin análisis — todo prospecto pre-ciclo (alta manual o
// importado por el flujo viejo de revisión) cuenta como analizado: su ingreso
// ya fue un acto humano. Un "contactado" viejo sin mensajeEnviadoAt degrada
// honestamente a para_contactar/para_visitar (nunca se registró mensaje).
export function etapaOperativa(prospect, { visits = [] } = {}) {
  const p = prospect || {};

  // 1. Convertido ⇒ cliente (fuera del trabajo de captación).
  if (tiene(p.convertedClientId)) return "cliente";

  // 2. Negociación: movida explícita, respuesta positiva, o llamada cuyo
  // desenlace fue "interesado" (gate G1). llamadaResultado guarda el ÚLTIMO
  // desenlace: una llamada posterior con otro resultado lo pisa — la realidad
  // más nueva manda. respondioAt / negociacionAt la fijan permanente.
  if (fecha(p.negociacionAt) || fecha(p.respondioAt)) return "negociacion";
  if (fecha(p.llamadaAt) && p.llamadaResultado === "interesado") return "negociacion";

  // 3/4. Entre visita, mensaje y llamada-con-desenlace decide el hecho MÁS
  // RECIENTE (visitó → no estaba → le escribió = esperando; llamó y pidieron
  // visita → fue = visitado). La llamada solo entra con desenlace que deriva:
  // "visita" → 🚶 · "seguimiento" → ⏳. "No atendió" (sin resultado) NO entra:
  // registra el intento, no mueve de cola.
  // Desempate a fecha igual: visita > mensaje > llamada (conserva el
  // comportamiento previo `visita >= mensaje`).
  const visita = ultimaVisita(visits, p.id);
  const mensaje = fecha(p.mensajeEnviadoAt);
  const llamada = (p.llamadaResultado === "visita" || p.llamadaResultado === "seguimiento")
    ? fecha(p.llamadaAt) : "";
  const candidatos = [
    [visita, "visitado"],
    [mensaje, "esperando_respuesta"],
    [llamada, p.llamadaResultado === "visita" ? "para_visitar" : "esperando_respuesta"],
  ];
  let mejor = null;
  for (const [f, etapa] of candidatos) if (f && (!mejor || f > mejor[0])) mejor = [f, etapa];
  if (mejor) return mejor[1];

  // 5/6. Analizado ⇒ el teléfono UTILIZABLE decide (regla automática del spec
  // + gate G1: teléfono inválido = sin teléfono — si el número no sirve para
  // contactar, el plan es ir). Auto-ingresado sin análisis ⇒ por analizar.
  const analizado = fecha(p.analizadoAt) || !p.ingresoAutomatico;
  if (!analizado) return "por_analizar";
  return tiene(p.phone) && !p.telefonoInvalido ? "para_contactar" : "para_visitar";
}

// Sub-estado de la espera (spec §1): "reintentar" si el último TOQUE quedó
// sin respuesta hace más de DIAS_REINTENTO, o si se marcó 🔴 No responde.
// El toque es el mensaje enviado o la llamada con desenlace "seguimiento"
// (gate G1: el timer cuenta desde la llamada) — el más reciente de los dos.
// Solo aplica en esperando_respuesta; en el resto devuelve "".
export function subEstadoEspera(prospect, { now = Date.now() } = {}) {
  const p = prospect || {};
  const mensaje = fecha(p.mensajeEnviadoAt);
  const llamada = p.llamadaResultado === "seguimiento" ? fecha(p.llamadaAt) : "";
  const toque = llamada > mensaje ? llamada : mensaje;
  if (!toque) return "";
  if (fecha(p.noRespondeAt)) return "reintentar";
  const dias = (now - new Date(toque).getTime()) / 86400000;
  return dias > DIAS_REINTENTO ? "reintentar" : "";
}

// Mapping al Prospect Engine (spec §4): las 3 etapas que el motor conoce.
// "cliente" también mapea (a visitado) por totalidad de la función, pero los
// convertidos ya quedan fuera del ranking por su propia conversión.
const ETAPA_ENGINE = {
  por_analizar: "prospecto",
  para_contactar: "prospecto",
  para_visitar: "prospecto",
  esperando_respuesta: "contactado",
  visitado: "visitado",
  negociacion: "visitado",
  cliente: "visitado",
};
export function etapaEngine(etapaKey) {
  return ETAPA_ENGINE[etapaKey] || "prospecto";
}

// Adapter para los consumidores legacy (funnel, zonas, ranking): el MISMO
// array de prospectos con pipelineStage derivado de la etapa operativa.
// No muta los originales ni persiste nada.
export function conEtapaLegacy(prospects, { visits = [] } = {}) {
  return (prospects || []).map(p =>
    p ? { ...p, pipelineStage: etapaEngine(etapaOperativa(p, { visits })) } : p);
}

// Conteos por etapa para la barra de colas (F3) y el embudo operativo (F4).
// Excluye borrados y convertidos-borrados (la conversión soft-borra el
// prospecto: cliente vive en Kioscos; acá se cuenta solo el trabajo vivo).
export function conteoPorEtapa(prospects, { visits = [], now = Date.now() } = {}) {
  const conteo = Object.fromEntries(ETAPAS_OPERATIVAS.map(e => [e.key, 0]));
  let vencidos = 0;
  for (const p of prospects || []) {
    if (!p || p.isDeleted) continue;
    const etapa = etapaOperativa(p, { visits });
    conteo[etapa] += 1;
    if (etapa === "esperando_respuesta" && subEstadoEspera(p, { now }) === "reintentar") vencidos += 1;
  }
  return { conteo, vencidos };
}

// --- Cola 🚫 Sin WhatsApp (gate G1, 2026-08-10) -----------------------------
// PROYECCIÓN DE VISTA, no etapa: un prospecto con teléfono cuyo número se
// confirmó fuera de WhatsApp (tieneWhatsApp === false — dato que construye la
// confirmación del modal de presentación) sigue siendo etapa `para_contactar`
// para el Embudo, el engine y las métricas; pero su cola de TRABAJO es otra:
// el canal que queda es la llamada. ☀️ Hoy y la Ficha leen colaOperativa; el
// Embudo sigue leyendo etapaOperativa. La tabla de 7 etapas no cambia.
export const COLA_SIN_WHATSAPP = { key: "sin_whatsapp", etiqueta: "Sin WhatsApp", icono: "🚫" };

export function colaOperativa(prospect, { visits = [] } = {}) {
  const p = prospect || {};
  const etapa = etapaOperativa(p, { visits });
  return etapa === "para_contactar" && p.tieneWhatsApp === false ? "sin_whatsapp" : etapa;
}

// Conteos por COLA (proyección) para la barra de ☀️ Hoy: como conteoPorEtapa
// pero con sin_whatsapp separado de para_contactar.
export function conteoPorCola(prospects, { visits = [], now = Date.now() } = {}) {
  const conteo = Object.fromEntries(
    [...ETAPAS_OPERATIVAS.map(e => [e.key, 0]), [COLA_SIN_WHATSAPP.key, 0]]);
  let vencidos = 0;
  for (const p of prospects || []) {
    if (!p || p.isDeleted) continue;
    const cola = colaOperativa(p, { visits });
    conteo[cola] += 1;
    if (cola === "esperando_respuesta" && subEstadoEspera(p, { now }) === "reintentar") vencidos += 1;
  }
  return { conteo, vencidos };
}
