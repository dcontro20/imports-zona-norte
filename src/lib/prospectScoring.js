// prospectScoring.js — MOTOR genérico de evaluación de prospectos.
// Port fiel del núcleo puro de Atlas Prospect Intelligence (score.py + scorer.py).
// Referencia y contrato: PROSPECT_ENGINE_DESIGN.md (repo Atlas) §3–§5.
//
// Principios que SON el motor (no negociables):
//   1. Toda señal es TRI: "si" | "no" | "sin_datos". No hay booleanos inventados.
//   2. Lo que no se sabe no puntúa NI pesa: el total se normaliza sobre lo conocido.
//   3. La confianza es un gate: con cobertura < MIN_CONF_PRIORIDAD no hay prioridad alta.
//   4. La prioridad es derivada, jamás manual.
//   5. Toda conclusión arrastra sus fuentes (criterio a criterio).
//
// Este módulo NO conoce prospectos, visitas, zonas ni Firestore. Recibe:
//   - señales:  { [id]: { valor: "si"|"no"|"sin_datos", fuentes: string[] } }
//     (las produce prospectSignals.js — acá llegan ya evaluadas, por eso no
//     existe el parámetro `hoy` del original: la evaluación vive en el adaptador)
//   - rúbrica:  { version, oportunidad: [fila], fit: [fila] } con fila =
//     { id, pregunta, peso, fraseOportunidad, fraseFortaleza }  (datos, no código)
// Y devuelve un ScoreResult (contrato 3 del diseño).
//
// La equivalencia con el engine Python se verifica contra la fixture de casos
// de oro (prospectScoring.golden.json) — idéntica al decimal, sin tolerancias.

export const TRI = ["si", "no", "sin_datos"];
export const PRIORIDADES = ["muy_alta", "alta", "media", "baja"];
export const MIN_CONF_PRIORIDAD = 0.35; // sin evaluar >=35% de las señales, no hay prioridad alta

// Réplica exacta de round(x, n) de Python: half-to-even sobre el valor binario
// EXACTO del double. Math.round/toFixed difieren en los empates (0.125 → Python
// da 0.12, toFixed da "0.13"); sin esto el port no es idéntico al decimal.
export function redondearPy(x, ndigits) {
  if (!Number.isFinite(x)) return x;
  const signo = x < 0 ? -1 : 1;
  // toFixed(100) da la expansión decimal exacta: todo double de este dominio
  // (|x| <= 100, |x| >= ~0.001) tiene menos de 100 dígitos fraccionarios.
  const [ent, frac] = Math.abs(x).toFixed(100).split(".");
  const resto = frac.slice(ndigits);
  let base = BigInt(ent + frac.slice(0, ndigits));
  const mitad = "5" + "0".repeat(resto.length - 1);
  if (resto > mitad) base += 1n;
  else if (resto === mitad && base % 2n === 1n) base += 1n; // empate exacto → par
  return signo * (Number(base) / 10 ** ndigits);
}

// Prioridad comercial determinista (P7 + gate IMPL-1). Port de score.py:derivar_prioridad.
// Ambas dimensiones altas => muy_alta; ambas medias => alta; una sola fuerte =>
// media (opp 95 + fit 20 NO es muy_alta); nada fuerte => baja. Con confidence
// < minConf, alta/muy_alta se degradan a media; confidence null = sin gate.
export function derivarPrioridad(opportunityTotal, fitTotal, confidence = null,
                                 minConf = MIN_CONF_PRIORIDAD) {
  const o = Number(opportunityTotal), f = Number(fitTotal);
  let base;
  if (o >= 80 && f >= 80) base = "muy_alta";
  else if (o >= 60 && f >= 60) base = "alta";
  else if (o >= 60 || f >= 60) base = "media";
  else base = "baja";
  if (confidence != null && confidence < minConf && (base === "muy_alta" || base === "alta")) {
    return "media";
  }
  return base;
}

function dedup(items) {
  const seen = new Set(), out = [];
  for (const it of items) {
    if (!seen.has(it)) { seen.add(it); out.push(it); }
  }
  return out;
}

// Port de scorer.py:_construir_dimension. La señal reemplaza al evaluador:
// una fila sin señal correspondiente rinde "sin_datos" (prospecto viejo, señal
// nueva — degradación honesta).
export function construirDimension(senales, filas, { esOportunidad }) {
  const criterios = [], fortalezas = [], disparos = [];
  let puntosConocidos = 0, pesoConocido = 0, pesoTotal = 0;
  for (const fila of filas) {
    const senal = (senales && senales[fila.id]) || { valor: "sin_datos", fuentes: [] };
    const valor = senal.valor;
    const dispara = valor === "si";
    const pts = dispara ? Number(fila.peso) : 0;
    pesoTotal += Number(fila.peso);
    if (valor !== "sin_datos") {
      pesoConocido += Number(fila.peso);
      puntosConocidos += pts;
    }
    criterios.push({
      id: fila.id,
      pregunta: fila.pregunta || "",
      valor,
      puntos: valor !== "sin_datos" ? pts : 0,
      fuentes: (valor === "si" || valor === "no") ? [...(senal.fuentes || [])] : [],
    });
    if (esOportunidad && dispara && fila.fraseOportunidad) disparos.push(fila.fraseOportunidad);
    if (esOportunidad && valor === "no" && fila.fraseFortaleza) fortalezas.push(fila.fraseFortaleza);
    if (!esOportunidad && dispara && fila.fraseFortaleza) fortalezas.push(fila.fraseFortaleza);
  }
  const conDatos = criterios.filter(c => c.valor !== "sin_datos").length;
  const dimension = {
    total: pesoConocido > 0 ? redondearPy(100 * puntosConocidos / pesoConocido, 1) : null,
    coverage: pesoTotal > 0 ? redondearPy(pesoConocido / pesoTotal, 3) : null,
    resumen: `${conDatos}/${criterios.length} criterios con datos`,
    criterios,
  };
  return { dimension, fortalezas, disparos, pesoConocido, pesoTotal };
}

// Port del ensamble de scorer.py:build_score (sin Prospect, sin persistencia:
// la validación de entrada y el guardado son responsabilidad del llamador).
export function construirScore(senales, rubrica, { prospectId = "", at = "" } = {}) {
  const op = construirDimension(senales, rubrica.oportunidad, { esOportunidad: true });
  const fit = construirDimension(senales, rubrica.fit, { esOportunidad: false });

  const pesoTotal = op.pesoTotal + fit.pesoTotal;
  const confidence = pesoTotal > 0
    ? redondearPy((op.pesoConocido + fit.pesoConocido) / pesoTotal, 3)
    : null;

  let prioridad = "";
  if (op.dimension.total != null && fit.dimension.total != null) {
    prioridad = derivarPrioridad(op.dimension.total, fit.dimension.total, confidence);
  }

  return {
    prospectId,
    at,
    rubricVersion: rubrica.version || "",
    opportunity: op.dimension,
    fit: fit.dimension,
    prioridad,
    confidence,
    fortalezas: dedup([...fit.fortalezas, ...op.fortalezas]),
    oportunidades: dedup(op.disparos),
  };
}

// Validaciones mínimas del contrato (subset fiel de score.py:validate_score).
// "GRAVE:" invalida el score; el llamador decide qué hacer con los problemas.
export function validarScore(s) {
  const probs = [];
  for (const nombre of ["opportunity", "fit"]) {
    const d = s[nombre] || {};
    if (d.total != null && (typeof d.total !== "number" || d.total < 0 || d.total > 100)) {
      probs.push(`GRAVE: ${nombre}.total fuera de [0,100] (${d.total})`);
    }
    if (d.coverage != null && (typeof d.coverage !== "number" || d.coverage < 0 || d.coverage > 1)) {
      probs.push(`GRAVE: ${nombre}.coverage fuera de [0,1] (${d.coverage})`);
    }
    for (const c of d.criterios || []) {
      if (!TRI.includes(c.valor)) {
        probs.push(`GRAVE: criterio '${c.id}' con valor fuera de si|no|sin_datos ('${c.valor}')`);
      }
      if ((c.valor === "si" || c.valor === "no") && !(c.fuentes || []).length) {
        probs.push(`GRAVE: criterio '${c.id}' medido '${c.valor}' sin evidencia`);
      }
      if (c.valor === "sin_datos" && Number(c.puntos) !== 0) {
        probs.push(`GRAVE: criterio '${c.id}' sin_datos con puntos ${c.puntos} (lo que no se sabe no puntúa)`);
      }
    }
  }
  if (s.confidence != null && (s.confidence < 0 || s.confidence > 1)) {
    probs.push(`GRAVE: confidence fuera de [0,1] (${s.confidence})`);
  }
  if (s.prioridad) {
    if (!PRIORIDADES.includes(s.prioridad)) {
      probs.push(`GRAVE: prioridad fuera de catálogo '${s.prioridad}'`);
    } else if (s.opportunity?.total == null || s.fit?.total == null) {
      probs.push("GRAVE: prioridad seteada con dimensiones sin puntuar");
    } else if (s.prioridad !== derivarPrioridad(s.opportunity.total, s.fit.total, s.confidence)) {
      probs.push(`GRAVE: prioridad '${s.prioridad}' no coincide con la derivada (jamás manual)`);
    }
  }
  return probs;
}
