// prospectDiagnosis.js — número → LENGUAJE. Port de la mecánica de
// prospect_crm/diagnosis.py de Atlas (la palabra lidera, el número respalda,
// el score nunca aparece desnudo) + el patrón estadoActual() de su Ficha
// (ningún análisis termina sin decir cuál es el próximo paso), con vocabulario
// B2B mayorista de Imports y las etapas de su pipeline.
//
// No recalcula NADA del dominio: lee un ScoreResult ya producido por
// prospectScoring.js (la misma instancia que ordenó la lista — única fuente de
// verdad) y le pone palabras. Puro, sin React, sin Firestore.
//
// Regla de honestidad heredada: sin_datos no es "no"; la cobertura se expresa
// como conteo de señales; el hueco de calificación se convierte en tarea.

import { redondearPy } from "./prospectScoring.js";

// Por debajo: la lista avisa "todavía con poca información".
export const UMBRAL_AVISO_CONFIANZA = 0.60;
// Por debajo: el diagnóstico se marca confianzaBaja (la UI suaviza la apertura).
export const UMBRAL_CONFIANZA_BAJA = 0.50;

const VEREDICTO = {
  muy_alta: "Oportunidad muy alta",
  alta: "Alta oportunidad",
  media: "Oportunidad media",
  baja: "Oportunidad baja",
  "": "Sin diagnóstico todavía",
};
const OP_WORD = { alto: "Mucho espacio para entrarle", medio: "Algo de espacio para entrarle", bajo: "Poco espacio para entrarle" };
const FIT_WORD = { alto: "Buen cliente mayorista", medio: "Cliente aceptable", bajo: "Encaje flojo" };

export function confianzaPalabra(conf) {
  if (conf == null) return "confianza sin medir";
  if (conf >= 0.66) return "confianza alta";
  if (conf >= 0.45) return "confianza media";
  return "confianza baja";
}

const nivel = (total, alto = 70, medio = 40) => {
  if (total == null) return null;
  if (total >= alto) return "alto";
  if (total >= medio) return "medio";
  return "bajo";
};

const senalesMedidas = (s) => {
  const crit = [...(s.opportunity?.criterios || []), ...(s.fit?.criterios || [])];
  return [crit.filter(c => c.valor === "si" || c.valor === "no").length, crit.length];
};

const fmt = (total, etiqueta) =>
  total != null ? `${etiqueta} ${redondearPy(total, 0)}` : "sin puntuar";

// Señales de calificación de visita que siguen en sin_datos (el hueco como
// tarea, diseño §8). Necesita la rúbrica para saber qué filas son de visita.
export function senalesVisitaFaltantes(scoreResult, rubrica) {
  const filas = [...(rubrica?.oportunidad || []), ...(rubrica?.fit || [])];
  const deVisita = new Set(filas.filter(f => f.fuente === "visita").map(f => f.id));
  const crit = [...(scoreResult.opportunity?.criterios || []), ...(scoreResult.fit?.criterios || [])];
  return crit.filter(c => deVisita.has(c.id) && c.valor === "sin_datos").map(c => c.id);
}

// Las tres razones que respaldan el veredicto: conclusión (palabra) + detalle
// concreto (lo que el motor ya midió) + respaldo (el número, nunca desnudo).
export function razones(s) {
  const [med, tot] = senalesMedidas(s);
  const opGloss = (s.oportunidades || []).slice(0, 2).join("; ") || "sin gaps claros medidos";
  const fitGloss = (s.fortalezas || []).slice(0, 2).join("; ") || "sin fortalezas claras medidas";
  const conf = confianzaPalabra(s.confidence);
  return [
    { conclusion: OP_WORD[nivel(s.opportunity?.total)] || "Espacio por medir",
      detalle: opGloss, respaldo: fmt(s.opportunity?.total, "Oportunidad") },
    { conclusion: FIT_WORD[nivel(s.fit?.total)] || "Encaje por medir",
      detalle: fitGloss, respaldo: fmt(s.fit?.total, "Encaje") },
    { conclusion: conf.charAt(0).toUpperCase() + conf.slice(1),
      detalle: tot ? `medido con ${med} de ${tot} señales` : "sin señales medidas",
      respaldo: "detalle en ¿Por qué?" },
  ];
}

// Una frase en lengua del vendedor, compuesta de lo que el motor ya midió
// (no inventa: reordena fortalezas y gaps).
export function sentenciaHumana(s) {
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const fort = (s.fortalezas || []).slice(0, 2).map(f => f.toLowerCase()).join(" y ");
  const gaps = (s.oportunidades || []).slice(0, 2).map(g => g.toLowerCase()).join("; ");
  if (fort && gaps) return `${cap(fort)}, pero ${gaps}.`;
  if (gaps) return `${cap(gaps)}.`;
  if (fort) return `${cap(fort)}.`;
  return "Todavía con poca información para un diagnóstico completo.";
}

// El diagnóstico como lo consume el modal: conclusión humana primero, números
// como respaldo, cobertura en conteo de señales.
export function diagnostico(scoreResult, { rubrica = null } = {}) {
  const s = scoreResult;
  const [med, tot] = senalesMedidas(s);
  const faltanVisita = rubrica ? senalesVisitaFaltantes(s, rubrica) : [];
  return {
    veredicto: VEREDICTO[s.prioridad] ?? VEREDICTO[""],
    confianza: confianzaPalabra(s.confidence),
    sentencia: sentenciaHumana(s),
    razones: razones(s),
    medidoEl: s.at || "",
    confianzaBaja: s.confidence != null && s.confidence < UMBRAL_CONFIANZA_BAJA,
    senalesVisitaFaltantes: faltanVisita,
    enDetalle: {
      oportunidad: s.opportunity?.total ?? null,
      encaje: s.fit?.total ?? null,
      confianza: s.confidence ?? null,
      coberturaOportunidad: s.opportunity?.coverage ?? null,
      coberturaEncaje: s.fit?.coverage ?? null,
      senalesMedidas: med,
      senalesTotales: tot,
    },
  };
}

// Aviso de incertidumbre para la LISTA (solo habla cuando importa).
export function avisoLista(confidence) {
  if (confidence == null || confidence < UMBRAL_AVISO_CONFIANZA) {
    return "todavía con poca información";
  }
  return null;
}

// Próximo paso por etapa del pipeline de Imports (patrón estadoActual de
// Atlas: determinista, sin inventar, siempre hay un siguiente paso).
// tono: "accion" (hay algo que hacer ya) | "espera".
export function proximoPaso({ stage, daysSinceContact = null, senalesVisitaFaltantes = [] } = {}) {
  const n = senalesVisitaFaltantes.length;
  const pendientes = n > 0
    ? [`completar la calificación de visita (${n === 1 ? "falta 1 señal" : `faltan ${n} señales`})`]
    : [];
  const desde = daysSinceContact != null && daysSinceContact >= 7
    ? ` (${daysSinceContact} días sin movimiento)` : "";
  switch (stage || "prospecto") {
    case "prospecto":
      return { tono: "accion", icono: "💬",
        texto: "Todavía sin contactar. La siguiente acción recomendada es abrir la conversación y marcarlo como contactado.",
        pendientes };
    case "contactado":
      return { tono: "accion", icono: "🚶",
        texto: `Contacto abierto${desde}. La siguiente acción recomendada es hacer la visita — y calificar el local en la vereda.`,
        pendientes };
    case "visitado":
      return { tono: "accion", icono: "🤝",
        texto: `Ya visitado${desde}. La siguiente acción recomendada es cerrar la primera compra y convertirlo a mayorista.`,
        pendientes };
    default:
      return { tono: "espera", icono: "⏳",
        texto: "Sin próximo paso definido para esta etapa. Registrá lo que pase para no perder el hilo.",
        pendientes };
  }
}
