// prospectEtapas.test.js — la matriz de derivación del spec CONGELADO
// (docs/PROSPECT_CRM_EJECUCION_SPEC.md §1-§4). Si una regla de acá cambia,
// cambió el spec — y eso pide gate, no un fix de test.
import { describe, it, expect } from "vitest";
import {
  ETAPAS_OPERATIVAS, DIAS_REINTENTO,
  etapaOperativa, subEstadoEspera, etapaEngine, conEtapaLegacy, conteoPorEtapa,
  FASES_COMERCIALES, faseDeEtapa,
  COLA_SIN_WHATSAPP, colaOperativa, conteoPorCola,
} from "./prospectEtapas.js";
import { marcarLlamada } from "./prospectHechos.js";

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

// --- Fases comerciales del Embudo (2026-08-07) ---
describe("FASES_COMERCIALES — la proyección del Embudo", () => {
  it("cubre las 7 etapas operativas, sin huecos ni repeticiones", () => {
    const cubiertas = FASES_COMERCIALES.flatMap(f => f.etapas);
    expect([...cubiertas].sort()).toEqual(ETAPAS_OPERATIVAS.map(e => e.key).sort());
    expect(new Set(cubiertas).size).toBe(cubiertas.length);
  });

  it("agrupa según el flujo comercial real", () => {
    expect(faseDeEtapa("por_analizar")).toBe("entrada");
    // Contactando = todas las formas de intentar llegar
    expect(faseDeEtapa("para_contactar")).toBe("contactando");
    expect(faseDeEtapa("para_visitar")).toBe("contactando");
    expect(faseDeEtapa("esperando_respuesta")).toBe("contactando");
    // En juego = ya hubo contacto real
    expect(faseDeEtapa("visitado")).toBe("en_juego");
    expect(faseDeEtapa("negociacion")).toBe("en_juego");
    expect(faseDeEtapa("cliente")).toBe("clientes");
  });

  it("el orden de las fases ES el embudo, de más ancho a más angosto", () => {
    expect(FASES_COMERCIALES.map(f => f.key)).toEqual(["entrada", "contactando", "en_juego", "clientes"]);
  });

  it("una etapa desconocida no desaparece del tablero", () => {
    expect(faseDeEtapa("lo_que_sea")).toBe("entrada");
  });
});

// ---------------------------------------------------------------------------
// Gate G1 (2026-08-10): la llamada con desenlace alimenta la derivación; la
// cola 🚫 Sin WhatsApp es PROYECCIÓN de vista; teléfono inválido = sin
// teléfono. La tabla de 7 etapas NO cambió — cambió qué hechos alimentan
// las mismas 7.
// ---------------------------------------------------------------------------
const llamada = (resultado, at = "2026-08-10T12:00:00Z") =>
  marcarLlamada({ ...base, phone: "011 5555-1234" }, { at, por: "Gustavo", resultado });

describe("G1 — la llamada con desenlace deriva (etapaOperativa)", () => {
  it("interesado ⇒ negociación", () => {
    expect(etapaOperativa(llamada("interesado"))).toBe("negociacion");
  });
  it("quiere visita ⇒ para_visitar (aun con teléfono)", () => {
    expect(etapaOperativa(llamada("visita"))).toBe("para_visitar");
  });
  it("seguimiento ⇒ esperando_respuesta", () => {
    expect(etapaOperativa(llamada("seguimiento"))).toBe("esperando_respuesta");
  });
  it("no atendió (sin resultado) NO mueve: registra el intento y queda donde estaba", () => {
    expect(etapaOperativa(llamada(""))).toBe("para_contactar");
    // en espera por un mensaje previo, el intento fallido tampoco lo saca
    const enEspera = marcarLlamada({ ...base, phone: "011 5555", mensajeEnviadoAt: "2026-08-08" },
      { at: "2026-08-10", resultado: "" });
    expect(etapaOperativa(enEspera)).toBe("esperando_respuesta");
  });
  it("recencia a tres bandas: el hecho más nuevo decide", () => {
    // llamó (visita) → después le escribió ⇒ esperando
    expect(etapaOperativa({ ...llamada("visita", "2026-08-09"), mensajeEnviadoAt: "2026-08-10" }))
      .toBe("esperando_respuesta");
    // le escribió → después llamó y pidieron visita ⇒ para_visitar
    expect(etapaOperativa({ ...llamada("visita", "2026-08-10"), mensajeEnviadoAt: "2026-08-09" }))
      .toBe("para_visitar");
    // llamó (visita) → fue de verdad ⇒ visitado
    expect(etapaOperativa(llamada("visita", "2026-08-09T10:00:00Z"),
      { visits: [visita("2026-08-10T10:00:00Z")] })).toBe("visitado");
    // lo visitó (no estaba) → llamó y pidió seguimiento ⇒ esperando
    expect(etapaOperativa(llamada("seguimiento", "2026-08-10T10:00:00Z"),
      { visits: [visita("2026-08-09T10:00:00Z")] })).toBe("esperando_respuesta");
  });
  it("la última llamada pisa a la anterior; respondió/🤝 explícito la fijan", () => {
    // interesado → semanas después pide seguimiento ⇒ vuelve a la espera
    const despues = marcarLlamada(llamada("interesado", "2026-08-01"),
      { at: "2026-08-10", resultado: "seguimiento" });
    expect(etapaOperativa(despues)).toBe("esperando_respuesta");
    // pero si además respondió o se marcó 🤝, negociación queda fija
    expect(etapaOperativa({ ...despues, respondioAt: "2026-08-02" })).toBe("negociacion");
    expect(etapaOperativa({ ...despues, negociacionAt: "2026-08-02" })).toBe("negociacion");
  });
});

describe("G1 — teléfono inválido = sin teléfono (regla automática)", () => {
  const analizado = { ...base, ingresoAutomatico: true, analizadoAt: "2026-08-05" };
  it("inválido estampado ⇒ para_visitar; válido ⇒ para_contactar", () => {
    expect(etapaOperativa({ ...analizado, phone: "4321-1000", telefonoInvalido: true })).toBe("para_visitar");
    expect(etapaOperativa({ ...analizado, phone: "011 5555-1234", telefonoInvalido: false })).toBe("para_contactar");
    // sin estampa (data pre-migración) se comporta como hasta ahora
    expect(etapaOperativa({ ...analizado, phone: "011 5555-1234" })).toBe("para_contactar");
  });
});

describe("G1 — subEstadoEspera cuenta desde el último toque (mensaje o llamada-seguimiento)", () => {
  const HOY = new Date("2026-08-10T12:00:00Z").getTime();
  it("llamada-seguimiento vieja ⇒ reintentar; reciente ⇒ en espera normal", () => {
    expect(subEstadoEspera(llamada("seguimiento", "2026-08-01T12:00:00Z"), { now: HOY })).toBe("reintentar");
    expect(subEstadoEspera(llamada("seguimiento", "2026-08-09T12:00:00Z"), { now: HOY })).toBe("");
  });
  it("mensaje viejo + llamada-seguimiento nueva ⇒ el timer se reinicia con la llamada", () => {
    const p = { ...llamada("seguimiento", "2026-08-09T12:00:00Z"), mensajeEnviadoAt: "2026-08-01T12:00:00Z" };
    expect(subEstadoEspera(p, { now: HOY })).toBe("");
  });
  it("el intento fallido no toca el timer ni el 🔴", () => {
    // mensaje viejo sin respuesta + llamada no atendida: sigue en reintentar
    const p = marcarLlamada({ ...base, phone: "011 5555", mensajeEnviadoAt: "2026-08-01T12:00:00Z" },
      { at: "2026-08-09T12:00:00Z", resultado: "" });
    expect(subEstadoEspera(p, { now: HOY })).toBe("reintentar");
  });
});

describe("G1 — cola 🚫 Sin WhatsApp: proyección, no etapa", () => {
  const contactable = { ...base, phone: "011 5555-1234" };
  it("para_contactar + tieneWhatsApp false ⇒ cola sin_whatsapp (la etapa NO cambia)", () => {
    const p = { ...contactable, tieneWhatsApp: false };
    expect(etapaOperativa(p)).toBe("para_contactar");   // Embudo/engine/métricas
    expect(colaOperativa(p)).toBe("sin_whatsapp");      // ☀️ Hoy / Ficha
  });
  it("true o null quedan en para_contactar; la proyección solo aplica ahí", () => {
    expect(colaOperativa({ ...contactable, tieneWhatsApp: true })).toBe("para_contactar");
    expect(colaOperativa(contactable)).toBe("para_contactar");
    // en otra etapa el dato no proyecta nada
    expect(colaOperativa({ ...contactable, tieneWhatsApp: false, mensajeEnviadoAt: "2026-08-09" }))
      .toBe("esperando_respuesta");
  });
  it("la tabla de 7 etapas sigue congelada (sin_whatsapp NO es etapa)", () => {
    expect(ETAPAS_OPERATIVAS.some(e => e.key === COLA_SIN_WHATSAPP.key)).toBe(false);
    expect(ETAPAS_OPERATIVAS).toHaveLength(7);
  });
  it("conteoPorCola separa 🚫 de 💬; conteoPorEtapa no cambia", () => {
    const ps = [
      { ...contactable, id: "a" },
      { ...contactable, id: "b", tieneWhatsApp: false },
      { ...contactable, id: "c", tieneWhatsApp: false },
    ];
    const porCola = conteoPorCola(ps);
    expect(porCola.conteo.para_contactar).toBe(1);
    expect(porCola.conteo.sin_whatsapp).toBe(2);
    const porEtapa = conteoPorEtapa(ps);
    expect(porEtapa.conteo.para_contactar).toBe(3);
  });
  it("el engine sigue viendo para_contactar como 'prospecto' (nada que mapear de nuevo)", () => {
    expect(etapaEngine("para_contactar")).toBe("prospecto");
  });
});
