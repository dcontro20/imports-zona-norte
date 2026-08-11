// prospectHechos.test.js — los hechos que capturan las pantallas (spec §2 del
// ciclo v2). Lo que se testea acá es la REGLA DE ORO del módulo: un hecho
// estampa su campo y NADA más — nunca una etapa. Y que la derivación
// (prospectEtapas.js) traduce ese hecho a la cola correcta, que es el único
// motivo por el que el hecho existe.
import { describe, it, expect } from "vitest";
import {
  CAMPOS_HECHO, marcarAnalizado, marcarMensajeEnviado,
  marcarRespondio, marcarNoResponde, marcarNegociacion,
} from "./prospectHechos.js";
import { etapaOperativa, subEstadoEspera, DIAS_REINTENTO } from "./prospectEtapas.js";

const AT = "2026-08-06T12:00:00Z";
const descubierto = { id: "p-1", businessName: "Kiosco Golden", ingresoAutomatico: true, phone: "" };

describe("los hechos NO escriben etapas", () => {
  it("ninguna función toca `etapa` ni `pipelineStage`", () => {
    const fns = [marcarAnalizado, marcarMensajeEnviado, marcarRespondio, marcarNoResponde, marcarNegociacion];
    for (const fn of fns) {
      const r = fn({ ...descubierto }, { at: AT, por: "Diego" });
      expect(r.etapa).toBeUndefined();
      expect(r.pipelineStage).toBeUndefined();
    }
  });

  it("cada hecho estampa solo los campos que declara CAMPOS_HECHO", () => {
    const nuevos = (r) => Object.keys(r).filter(k => !(k in descubierto) && r[k] !== "");
    expect(nuevos(marcarAnalizado({ ...descubierto }, { at: AT, por: "D" }))).toEqual(CAMPOS_HECHO.analizado);
    expect(nuevos(marcarRespondio({ ...descubierto }, { at: AT }))).toEqual(CAMPOS_HECHO.respondio);
    expect(nuevos(marcarNegociacion({ ...descubierto }, { at: AT }))).toEqual(CAMPOS_HECHO.negociacion);
  });

  it("son puras: no mutan el prospecto original", () => {
    const p = { ...descubierto };
    marcarAnalizado(p, { at: AT, por: "Diego" });
    expect(p.analizadoAt).toBeUndefined();
  });
});

describe("marcarAnalizado — el ✓ Trabajar del deck", () => {
  it("saca al descubierto de `por_analizar` y lo manda según tenga teléfono", () => {
    expect(etapaOperativa(descubierto)).toBe("por_analizar");
    const sinTel = marcarAnalizado(descubierto, { at: AT, por: "Diego" });
    expect(etapaOperativa(sinTel)).toBe("para_visitar");
    const conTel = marcarAnalizado({ ...descubierto, phone: "11-4831-2200" }, { at: AT, por: "Diego" });
    expect(etapaOperativa(conTel)).toBe("para_contactar");
  });

  it("re-marcar no pisa la autoría del que analizó primero", () => {
    const uno = marcarAnalizado(descubierto, { at: AT, por: "Diego" });
    const dos = marcarAnalizado(uno, { at: "2026-08-07T12:00:00Z", por: "Gustavo" });
    expect(dos.analizadoPor).toBe("Diego");
    expect(dos.analizadoAt).toBe(AT);
  });
});

describe("marcarMensajeEnviado — el rastro que faltaba", () => {
  it("manda el prospecto a la espera, firmado", () => {
    const p = marcarMensajeEnviado({ ...descubierto, phone: "11-1", analizadoAt: AT }, { at: AT, por: "Diego" });
    expect(etapaOperativa(p)).toBe("esperando_respuesta");
    expect(p.mensajeEnviadoPor).toBe("Diego");
  });

  it("un mensaje NUEVO reabre la espera: limpia el 'no responde' anterior", () => {
    const viejo = new Date(Date.now() - (DIAS_REINTENTO + 5) * 86400000).toISOString();
    const marcado = marcarNoResponde({ ...descubierto, mensajeEnviadoAt: viejo }, { at: viejo });
    expect(subEstadoEspera(marcado)).toBe("reintentar");

    const reescrito = marcarMensajeEnviado(marcado, { at: new Date().toISOString(), por: "Diego" });
    expect(reescrito.noRespondeAt).toBe("");
    expect(subEstadoEspera(reescrito)).toBe("");   // vuelve a estar en tiempo
  });
});

describe("respuesta y negociación", () => {
  it("🟢 Respondió alcanza para derivar negociación (un hecho, un campo)", () => {
    const p = marcarRespondio({ ...descubierto, mensajeEnviadoAt: AT }, { at: AT });
    expect(etapaOperativa(p)).toBe("negociacion");
    expect(p.negociacionAt).toBeUndefined();
  });

  it("🔴 No responde NO saca de la espera: marca para reintentar", () => {
    const p = marcarNoResponde({ ...descubierto, mensajeEnviadoAt: AT }, { at: AT });
    expect(etapaOperativa(p)).toBe("esperando_respuesta");
    expect(subEstadoEspera(p)).toBe("reintentar");
  });

  it("🤝 mueve a negociación sin respuesta previa registrada (p. ej. se habló en la visita)", () => {
    const p = marcarNegociacion({ ...descubierto, analizadoAt: AT }, { at: AT });
    expect(etapaOperativa(p)).toBe("negociacion");
  });
});

// --- Gate G1 (2026-08-10): la llamada con desenlace ---
import { marcarLlamada, LLAMADA_RESULTADOS } from "./prospectHechos.js";

describe("marcarLlamada — un hecho con su desenlace (G1)", () => {
  const AT = "2026-08-10T15:00:00Z";
  const p = { ...descubierto, phone: "011 5555-1234", analizadoAt: "2026-08-08" };

  it("estampa solo los campos que declara y jamás una etapa", () => {
    const r = marcarLlamada({ ...p }, { at: AT, por: "Gustavo", resultado: "seguimiento" });
    expect(r.llamadaAt).toBe(AT);
    expect(r.llamadaPor).toBe("Gustavo");
    expect(r.llamadaResultado).toBe("seguimiento");
    expect(r.etapa).toBeUndefined();
    expect(r.pipelineStage).toBeUndefined();
    const nuevos = Object.keys(r).filter(k => !(k in p) && r[k] !== "");
    expect(nuevos).toEqual(CAMPOS_HECHO.llamada);
  });

  it("resultado desconocido degrada a '' (no atendió): jamás un desenlace inventado", () => {
    expect(marcarLlamada({ ...p }, { at: AT, resultado: "loQueSea" }).llamadaResultado).toBe("");
    expect(LLAMADA_RESULTADOS).toContain("");
  });

  it("hablar limpia el 🔴 (la espera se reabre); el intento fallido NO lo limpia", () => {
    const con = { ...p, noRespondeAt: "2026-08-09" };
    expect(marcarLlamada(con, { at: AT, resultado: "seguimiento" }).noRespondeAt).toBe("");
    expect(marcarLlamada(con, { at: AT, resultado: "interesado" }).noRespondeAt).toBe("");
    expect(marcarLlamada(con, { at: AT, resultado: "" }).noRespondeAt).toBe("2026-08-09");
  });

  it("una llamada nueva pisa a la anterior (el desenlace es el último)", () => {
    const primera = marcarLlamada({ ...p }, { at: "2026-08-01", resultado: "interesado" });
    const segunda = marcarLlamada(primera, { at: AT, por: "Diego", resultado: "visita" });
    expect(segunda.llamadaAt).toBe(AT);
    expect(segunda.llamadaResultado).toBe("visita");
    expect(segunda.llamadaPor).toBe("Diego");
  });
});
