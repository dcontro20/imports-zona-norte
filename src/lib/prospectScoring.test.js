import { describe, it, expect } from "vitest";
import {
  TRI, PRIORIDADES, MIN_CONF_PRIORIDAD,
  redondearPy, derivarPrioridad, construirDimension, construirScore, validarScore,
} from "./prospectScoring.js";
// Casos de oro exportados del engine Python de Atlas (Fase 0). Copia
// byte-idéntica de atlas/prospect/tests/golden_cases.json — NO editar acá:
// se regenera en Atlas (export_golden_cases.py) y se vuelve a copiar.
import fixture from "./prospectScoring.golden.json";

// El esperado de la fixture no lleva `pregunta` por criterio (vive en la rúbrica);
// para comparar exacto se proyecta el criterio JS a la forma de la fixture.
const sinPregunta = (dim) => ({
  total: dim.total,
  coverage: dim.coverage,
  resumen: dim.resumen,
  criterios: dim.criterios.map(({ id, valor, puntos, fuentes }) => ({ id, valor, puntos, fuentes })),
});

// ---------- criterio de aceptación de Fase 1: los 10 casos de oro ----------

describe("casos de oro — idénticos al engine Python, sin tolerancias", () => {
  it("la fixture es la esperada (10 casos, constante del gate espejada)", () => {
    expect(fixture.casos.length).toBeGreaterThanOrEqual(8);
    expect(fixture.minConfPrioridad).toBe(MIN_CONF_PRIORIDAD);
    expect(fixture.rubrica.oportunidad.length).toBe(16);
    expect(fixture.rubrica.fit.length).toBe(7);
  });

  for (const caso of fixture.casos) {
    it(`${caso.caseId}: score idéntico al decimal`, () => {
      const s = construirScore(caso.senales, fixture.rubrica, {
        prospectId: caso.caseId, at: caso.hoy,
      });
      expect(sinPregunta(s.opportunity)).toStrictEqual(caso.esperado.opportunity);
      expect(sinPregunta(s.fit)).toStrictEqual(caso.esperado.fit);
      expect(s.confidence).toBe(caso.esperado.confidence);
      expect(s.prioridad).toBe(caso.esperado.prioridad);
      expect(s.fortalezas).toStrictEqual(caso.esperado.fortalezas);
      expect(s.oportunidades).toStrictEqual(caso.esperado.oportunidades);
      // prioridad base (sin gate) también espejada, para cubrir la derivación pura
      expect(derivarPrioridad(s.opportunity.total, s.fit.total, null))
        .toBe(caso.esperado.prioridadBase);
      // todo caso de oro pasa el validador del contrato
      expect(validarScore(s)).toStrictEqual([]);
    });
  }

  it("las preguntas de los criterios se toman de la rúbrica", () => {
    const caso = fixture.casos[0];
    const s = construirScore(caso.senales, fixture.rubrica);
    const porId = new Map(fixture.rubrica.oportunidad.map(f => [f.id, f.pregunta]));
    for (const c of s.opportunity.criterios) expect(c.pregunta).toBe(porId.get(c.id));
  });
});

// ---------- gate de confianza (sin caso de oro real: cobertura unitaria) ----------

describe("derivarPrioridad — bandas y gate de confianza", () => {
  it("bandas base: ambas altas / ambas medias / una sola fuerte / nada", () => {
    expect(derivarPrioridad(80, 80)).toBe("muy_alta");
    expect(derivarPrioridad(95, 20)).toBe("media");   // una sola fuerte NO alcanza
    expect(derivarPrioridad(60, 60)).toBe("alta");
    expect(derivarPrioridad(59.9, 60)).toBe("media");
    expect(derivarPrioridad(59.9, 59.9)).toBe("baja");
  });

  it("el gate degrada muy_alta/alta a media cuando confidence < 0.35", () => {
    expect(derivarPrioridad(90, 90, 0.34)).toBe("media");
    expect(derivarPrioridad(65, 65, 0.1)).toBe("media");
  });

  it("el gate es estricto (<): confidence exactamente 0.35 NO degrada", () => {
    expect(derivarPrioridad(90, 90, 0.35)).toBe("muy_alta");
  });

  it("el gate no toca media ni baja (solo evita falsos tops)", () => {
    expect(derivarPrioridad(95, 20, 0.1)).toBe("media");
    expect(derivarPrioridad(10, 10, 0.1)).toBe("baja");
  });

  it("confidence null = sin gate (compat histórica)", () => {
    expect(derivarPrioridad(90, 90, null)).toBe("muy_alta");
  });

  it("minConf es parametrizable", () => {
    expect(derivarPrioridad(90, 90, 0.5, 0.6)).toBe("media");
    expect(derivarPrioridad(90, 90, 0.5, 0.4)).toBe("muy_alta");
  });
});

// ---------- mecánica del motor ----------

const FILAS = [
  { id: "a", pregunta: "¿A?", peso: 10, fraseOportunidad: "gap A", fraseFortaleza: "bien A" },
  { id: "b", pregunta: "¿B?", peso: 30, fraseOportunidad: "gap B", fraseFortaleza: "bien B" },
  { id: "c", pregunta: "¿C?", peso: 60, fraseOportunidad: "gap C", fraseFortaleza: "bien C" },
];
const F = (fuentes = ["s1"]) => ({ si: { valor: "si", fuentes }, no: { valor: "no", fuentes } });

describe("construirDimension — normalización sobre lo conocido", () => {
  it("sin_datos no puntúa ni pesa; el total se normaliza sobre lo conocido", () => {
    const senales = { a: { valor: "si", fuentes: ["s1"] }, b: { valor: "sin_datos", fuentes: [] }, c: { valor: "no", fuentes: ["s2"] } };
    const { dimension } = construirDimension(senales, FILAS, { esOportunidad: true });
    // conocidos: a(10 → 10 pts) + c(60 → 0 pts) = 10/70
    expect(dimension.total).toBe(redondearPy(100 * 10 / 70, 1));
    expect(dimension.coverage).toBe(0.7);
    expect(dimension.resumen).toBe("2/3 criterios con datos");
  });

  it("señal ausente en el objeto = sin_datos (prospecto viejo, señal nueva)", () => {
    const { dimension } = construirDimension({ a: F().si }, FILAS, { esOportunidad: true });
    expect(dimension.criterios[1].valor).toBe("sin_datos");
    expect(dimension.criterios[1].puntos).toBe(0);
    expect(dimension.total).toBe(100);
    expect(dimension.coverage).toBe(0.1);
  });

  it("todo sin_datos ⇒ total null (no hay score inventado), coverage 0", () => {
    const { dimension } = construirDimension({}, FILAS, { esOportunidad: true });
    expect(dimension.total).toBeNull();
    expect(dimension.coverage).toBe(0);
    expect(dimension.resumen).toBe("0/3 criterios con datos");
  });

  it("las fuentes viajan solo en criterios medidos (si/no); sin_datos va vacío", () => {
    const senales = { a: { valor: "si", fuentes: ["v1", "v2"] }, b: { valor: "sin_datos", fuentes: ["basura"] } };
    const { dimension } = construirDimension(senales, FILAS, { esOportunidad: true });
    expect(dimension.criterios[0].fuentes).toStrictEqual(["v1", "v2"]);
    expect(dimension.criterios[1].fuentes).toStrictEqual([]);
  });

  it("oportunidad: 'si' dispara la fraseOportunidad, 'no' acumula la fraseFortaleza", () => {
    const senales = { a: F().si, b: F().no };
    const r = construirDimension(senales, FILAS, { esOportunidad: true });
    expect(r.disparos).toStrictEqual(["gap A"]);
    expect(r.fortalezas).toStrictEqual(["bien B"]);
  });

  it("fit: 'si' acumula la fraseFortaleza (presente = bueno), no hay disparos", () => {
    const senales = { a: F().si, b: F().no };
    const r = construirDimension(senales, FILAS, { esOportunidad: false });
    expect(r.fortalezas).toStrictEqual(["bien A"]);
    expect(r.disparos).toStrictEqual([]);
  });
});

describe("construirScore — ensamble", () => {
  it("confidence global = peso conocido de ambas dimensiones / peso total", () => {
    const rubrica = { version: "t", oportunidad: FILAS, fit: FILAS };
    const senales = { a: F().si };  // 10 conocidos por dimensión, de 100 c/u
    const s = construirScore(senales, rubrica);
    expect(s.confidence).toBe(0.1);
    expect(s.rubricVersion).toBe("t");
  });

  it("fortalezas = dedup(fit primero, luego oportunidad); oportunidades = disparos de op", () => {
    const rubrica = { version: "t", oportunidad: FILAS, fit: FILAS };
    // op: b="no" → fortaleza "bien B"; fit: a="si" → "bien A", b="no" → nada
    const s = construirScore({ a: F().si, b: F().no }, rubrica);
    expect(s.fortalezas).toStrictEqual(["bien A", "bien B"]);
    expect(s.oportunidades).toStrictEqual(["gap A"]);
  });

  it("sin ninguna señal: prioridad vacía (no se deriva sobre totales null)", () => {
    const s = construirScore({}, { version: "t", oportunidad: FILAS, fit: FILAS });
    expect(s.opportunity.total).toBeNull();
    expect(s.prioridad).toBe("");
  });
});

describe("redondearPy — réplica del round() de Python", () => {
  it("empates exactos en binario van al par (banker's rounding)", () => {
    expect(redondearPy(0.125, 2)).toBe(0.12);  // Math.round/toFixed darían 0.13
    expect(redondearPy(0.375, 2)).toBe(0.38);
    expect(redondearPy(2.5, 0)).toBe(2);
    expect(redondearPy(3.5, 0)).toBe(4);
  });

  it("los 'falsos empates' decimales se resuelven por el valor binario real", () => {
    expect(redondearPy(2.675, 2)).toBe(2.67);  // double(2.675) < 2.675 → baja
    expect(redondearPy(0.1 + 0.2, 1)).toBe(0.3);
  });

  it("casos normales", () => {
    expect(redondearPy(100 * 9 / 13, 1)).toBe(69.2);
    expect(redondearPy(0.5066, 3)).toBe(0.507);
    expect(redondearPy(-0.125, 2)).toBe(-0.12);
  });
});

describe("validarScore — invariantes del contrato", () => {
  it("score de oro válido: cero problemas", () => {
    const caso = fixture.casos[0];
    expect(validarScore(construirScore(caso.senales, fixture.rubrica))).toStrictEqual([]);
  });

  it("detecta sin_datos con puntos, medido sin evidencia y prioridad manual", () => {
    const s = construirScore(fixture.casos[0].senales, fixture.rubrica);
    const roto = {
      ...s,
      prioridad: s.prioridad === "baja" ? "muy_alta" : "baja",
      opportunity: {
        ...s.opportunity,
        criterios: [
          { id: "x", valor: "sin_datos", puntos: 5, fuentes: [] },
          { id: "y", valor: "si", puntos: 5, fuentes: [] },
          { id: "z", valor: "quizás", puntos: 0, fuentes: ["s1"] },
        ],
      },
    };
    const probs = validarScore(roto);
    expect(probs.some(p => p.includes("sin_datos con puntos"))).toBe(true);
    expect(probs.some(p => p.includes("sin evidencia"))).toBe(true);
    expect(probs.some(p => p.includes("fuera de si|no|sin_datos"))).toBe(true);
    expect(probs.some(p => p.includes("no coincide con la derivada"))).toBe(true);
  });

  it("catálogos exportados estables (los consume la UI en fases posteriores)", () => {
    expect(TRI).toStrictEqual(["si", "no", "sin_datos"]);
    expect(PRIORIDADES).toStrictEqual(["muy_alta", "alta", "media", "baja"]);
  });
});
