// prospectEtapas.test.js — la matriz de derivación del spec CONGELADO
// (docs/PROSPECT_CRM_EJECUCION_SPEC.md §1-§4). Si una regla de acá cambia,
// cambió el spec — y eso pide gate, no un fix de test.
import { describe, it, expect } from "vitest";
import {
  ETAPAS_OPERATIVAS, DIAS_REINTENTO,
  etapaOperativa, subEstadoEspera, etapaEngine, conEtapaLegacy, conteoPorEtapa,
} from "./prospectEtapas.js";

const base = { id: "p1", businessName: "Kiosco X" };
const visita = (date, over = {}) => ({ id: `v-${date}`, targetId: "p1", date, outcome: "interesado", ...over });

describe("tabla congelada", () => {
  it("las 7 etapas, en el orden del flujo", () => {
    expect(ETAPAS_OPERATIVAS.map(e => e.key)).toEqual([
      "por_analizar", "para_contactar", "para_visitar",
      "esperando_respuesta", "visitado", "negociacion", "cliente",
    ]);
  });
});

describe("etapaOperativa — precedencia (spec §3)", () => {
  it("convertido ⇒ cliente, gana a todo", () => {
    expect(etapaOperativa({ ...base, convertedClientId: "c1", negociacionAt: "2026-08-01", mensajeEnviadoAt: "2026-08-02" }))
      .toBe("cliente");
  });
  it("respondió o negociación explícita ⇒ negociación (gana a visitas y mensajes)", () => {
    expect(etapaOperativa({ ...base, respondioAt: "2026-08-03", mensajeEnviadoAt: "2026-08-01" })).toBe("negociacion");
    expect(etapaOperativa({ ...base, negociacionAt: "2026-08-03" }, { visits: [visita("2026-08-04")] })).toBe("negociacion");
  });
  it("entre visita y mensaje decide el MÁS RECIENTE", () => {
    // le escribió → después lo visitó ⇒ visitado
    expect(etapaOperativa({ ...base, mensajeEnviadoAt: "2026-08-01T10:00:00Z" },
      { visits: [visita("2026-08-02T10:00:00Z")] })).toBe("visitado");
    // lo visitó (no estaba) → después le escribió ⇒ esperando respuesta
    expect(etapaOperativa({ ...base, mensajeEnviadoAt: "2026-08-03T10:00:00Z" },
      { visits: [visita("2026-08-02T10:00:00Z")] })).toBe("esperando_respuesta");
  });
  it("solo mensaje ⇒ esperando; solo visita ⇒ visitado", () => {
    expect(etapaOperativa({ ...base, mensajeEnviadoAt: "2026-08-01" })).toBe("esperando_respuesta");
    expect(etapaOperativa(base, { visits: [visita("2026-08-01")] })).toBe("visitado");
  });
  it("visitas borradas o de otro prospecto no cuentan", () => {
    expect(etapaOperativa(base, { visits: [visita("2026-08-01", { isDeleted: true })] })).toBe("para_visitar");
    expect(etapaOperativa(base, { visits: [visita("2026-08-01", { targetId: "OTRO" })] })).toBe("para_visitar");
  });
  it("analizado: el teléfono decide la cola (regla automática)", () => {
    const analizado = { ...base, ingresoAutomatico: true, analizadoAt: "2026-08-05" };
    expect(etapaOperativa({ ...analizado, phone: "011 5555-1234" })).toBe("para_contactar");
    expect(etapaOperativa({ ...analizado, phone: "" })).toBe("para_visitar");
    expect(etapaOperativa({ ...analizado, phone: "   " })).toBe("para_visitar");
  });
  it("auto-ingresado SIN análisis ⇒ por analizar", () => {
    expect(etapaOperativa({ ...base, ingresoAutomatico: true, phone: "011 5555" })).toBe("por_analizar");
  });
  it("tolerancia legacy: prospecto pre-ciclo (sin flag) cuenta como analizado", () => {
    expect(etapaOperativa({ ...base, phone: "011 5555" })).toBe("para_contactar");
    expect(etapaOperativa(base)).toBe("para_visitar");
    // "contactado" viejo sin mensaje registrado degrada honestamente
    expect(etapaOperativa({ ...base, pipelineStage: "contactado", phone: "011 5555" })).toBe("para_contactar");
  });
});

describe("subEstadoEspera (spec §1)", () => {
  const AHORA = new Date("2026-08-06T12:00:00Z").getTime();
  it("mensaje reciente: sin sub-estado", () => {
    expect(subEstadoEspera({ ...base, mensajeEnviadoAt: "2026-08-05T12:00:00Z" }, { now: AHORA })).toBe("");
  });
  it(`sin respuesta hace > ${DIAS_REINTENTO} días ⇒ reintentar`, () => {
    expect(subEstadoEspera({ ...base, mensajeEnviadoAt: "2026-08-01T12:00:00Z" }, { now: AHORA })).toBe("reintentar");
  });
  it("🔴 No responde ⇒ reintentar aunque sea reciente", () => {
    expect(subEstadoEspera({ ...base, mensajeEnviadoAt: "2026-08-06T09:00:00Z", noRespondeAt: "2026-08-06T11:00:00Z" }, { now: AHORA }))
      .toBe("reintentar");
  });
  it("sin mensaje no hay espera", () => {
    expect(subEstadoEspera(base, { now: AHORA })).toBe("");
  });
});

describe("etapaEngine — el motor no se toca (spec §4)", () => {
  it("mapea las 7 a las 3 del engine", () => {
    expect(etapaEngine("por_analizar")).toBe("prospecto");
    expect(etapaEngine("para_contactar")).toBe("prospecto");
    expect(etapaEngine("para_visitar")).toBe("prospecto");
    expect(etapaEngine("esperando_respuesta")).toBe("contactado");
    expect(etapaEngine("visitado")).toBe("visitado");
    expect(etapaEngine("negociacion")).toBe("visitado");
    expect(etapaEngine("cliente")).toBe("visitado");
  });
  it("desconocida cae a prospecto (total, sin crash)", () => {
    expect(etapaEngine("loQueSea")).toBe("prospecto");
  });
});

describe("conEtapaLegacy — adapter para funnel/zonas/ranking", () => {
  it("deriva pipelineStage sin mutar los originales", () => {
    const original = { ...base, mensajeEnviadoAt: "2026-08-01" };
    const [adaptado] = conEtapaLegacy([original]);
    expect(adaptado.pipelineStage).toBe("contactado");
    expect(original.pipelineStage).toBeUndefined();
  });
});

describe("conteoPorEtapa — la barra de colas", () => {
  it("cuenta por etapa, excluye borrados, marca vencidos", () => {
    const AHORA = new Date("2026-08-06T12:00:00Z").getTime();
    const { conteo, vencidos } = conteoPorEtapa([
      { id: "a", ingresoAutomatico: true },                                  // por_analizar
      { id: "b", phone: "011 4" },                                           // para_contactar (legacy analizado)
      { id: "c" },                                                           // para_visitar
      { id: "d", mensajeEnviadoAt: "2026-08-05T12:00:00Z" },                 // esperando, fresco
      { id: "e", mensajeEnviadoAt: "2026-07-30T12:00:00Z" },                 // esperando, VENCIDO
      { id: "f", respondioAt: "2026-08-05" },                                // negociación
      { id: "g", convertedClientId: "c9" },                                  // cliente
      { id: "h", isDeleted: true },                                          // afuera
    ], { now: AHORA });
    expect(conteo.por_analizar).toBe(1);
    expect(conteo.para_contactar).toBe(1);
    expect(conteo.para_visitar).toBe(1);
    expect(conteo.esperando_respuesta).toBe(2);
    expect(conteo.negociacion).toBe(1);
    expect(conteo.cliente).toBe(1);
    expect(vencidos).toBe(1);
  });
});
