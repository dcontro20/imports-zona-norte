import { describe, it, expect } from "vitest";
import {
  confianzaPalabra, razones, sentenciaHumana, diagnostico, avisoLista,
  proximoPaso, senalesVisitaFaltantes, UMBRAL_AVISO_CONFIANZA, UMBRAL_CONFIANZA_BAJA,
} from "./prospectDiagnosis.js";
import { construirScore } from "./prospectScoring.js";
import { RUBRICA_IZN } from "./prospectRubric.js";
import { prospectToSignals } from "./prospectSignals.js";

// ScoreResult real, producido por el flujo completo (única fuente de verdad).
const PROSPECTO = {
  id: "p1", zone: "Villa Adelina", source: "referido", contactName: "Marta", phone: "11-1",
  calificacion: { vendeCategoria: "no", proveedorEstable: "no", competenciaVisible: "no",
                  tamano: "grande", movimiento: "si", actualizadoAt: "2026-07-26" },
};
const CONTEXTO = {
  visits: [{ id: "v1", targetId: "p1", date: "2026-07-26", outcome: "interesado" }],
  clients: [], sales: [], products: [],
};
const score = () => construirScore(prospectToSignals(PROSPECTO, CONTEXTO), RUBRICA_IZN,
                                   { prospectId: "p1", at: "2026-07-28" });

describe("confianzaPalabra — umbrales del original (0.66 / 0.45)", () => {
  it("mapea niveles y borde exacto", () => {
    expect(confianzaPalabra(null)).toBe("confianza sin medir");
    expect(confianzaPalabra(0.66)).toBe("confianza alta");
    expect(confianzaPalabra(0.659)).toBe("confianza media");
    expect(confianzaPalabra(0.45)).toBe("confianza media");
    expect(confianzaPalabra(0.449)).toBe("confianza baja");
  });
});

describe("razones — la palabra lidera, el número respalda", () => {
  it("tres razones con conclusión + detalle medido + respaldo numérico", () => {
    const r = razones(score());
    expect(r).toHaveLength(3);
    expect(r[0].conclusion).toMatch(/espacio para entrarle/i);
    expect(r[0].detalle).toContain("proveedor");
    expect(r[0].respaldo).toMatch(/^Oportunidad \d+$/);
    expect(r[1].respaldo).toMatch(/^Encaje \d+$/);
    expect(r[2].detalle).toMatch(/^medido con \d+ de 13 señales$/);
  });

  it("dimensión sin puntuar: palabra 'por medir' y respaldo 'sin puntuar'", () => {
    const vacio = construirScore({}, RUBRICA_IZN);
    const r = razones(vacio);
    expect(r[0].conclusion).toBe("Espacio por medir");
    expect(r[0].respaldo).toBe("sin puntuar");
    expect(r[0].detalle).toBe("sin gaps claros medidos");
  });

  it("el respaldo redondea como Python (half-to-even), no como Math.round", () => {
    const s = { opportunity: { total: 78.5, criterios: [] }, fit: { total: 20, criterios: [] },
                fortalezas: [], oportunidades: [], confidence: 1 };
    expect(razones(s)[0].respaldo).toBe("Oportunidad 78");   // Math.round daría 79
  });
});

describe("sentenciaHumana — reordena lo medido, no inventa", () => {
  it("fortalezas + gaps: 'X e y, pero a; b.'", () => {
    const st = sentenciaHumana(score());
    expect(st).toMatch(/, pero /);
    expect(st.endsWith(".")).toBe(true);
    expect(st.charAt(0)).toBe(st.charAt(0).toUpperCase());
  });
  it("solo gaps / solo fortalezas / nada", () => {
    expect(sentenciaHumana({ fortalezas: [], oportunidades: ["No tiene proveedor"] }))
      .toBe("No tiene proveedor.");
    expect(sentenciaHumana({ fortalezas: ["Local grande"], oportunidades: [] }))
      .toBe("Local grande.");
    expect(sentenciaHumana({ fortalezas: [], oportunidades: [] }))
      .toBe("Todavía con poca información para un diagnóstico completo.");
  });
});

describe("diagnostico — el paquete que consume el modal", () => {
  it("veredicto por prioridad, confianza en palabras, señales contadas", () => {
    const d = diagnostico(score(), { rubrica: RUBRICA_IZN });
    expect(d.veredicto).toMatch(/oportunidad/i);
    expect(d.confianza).toMatch(/^confianza /);
    expect(d.medidoEl).toBe("2026-07-28");
    expect(d.enDetalle.senalesTotales).toBe(13);
    expect(d.enDetalle.senalesMedidas).toBeGreaterThan(0);
    expect(typeof d.confianzaBaja).toBe("boolean");
  });

  it("prioridad '' ⇒ 'Sin diagnóstico todavía'", () => {
    const d = diagnostico(construirScore({}, RUBRICA_IZN));
    expect(d.veredicto).toBe("Sin diagnóstico todavía");
    expect(d.enDetalle.oportunidad).toBeNull();
  });

  it("con rúbrica, expone las señales de visita faltantes (el hueco como tarea)", () => {
    const sinCalif = construirScore(
      prospectToSignals({ ...PROSPECTO, calificacion: undefined }, CONTEXTO), RUBRICA_IZN);
    const d = diagnostico(sinCalif, { rubrica: RUBRICA_IZN });
    expect(d.senalesVisitaFaltantes).toHaveLength(5);   // las 5 filas fuente:"visita"
    const conCalif = diagnostico(score(), { rubrica: RUBRICA_IZN });
    expect(conCalif.senalesVisitaFaltantes).toHaveLength(0);
  });
});

describe("senalesVisitaFaltantes", () => {
  it("solo cuenta filas de visita en sin_datos", () => {
    const s = construirScore(prospectToSignals({ id: "px", zone: "Z" }, {}), RUBRICA_IZN);
    const faltan = senalesVisitaFaltantes(s, RUBRICA_IZN);
    expect(faltan.sort()).toStrictEqual([
      "fit_movimiento", "fit_tamano", "op_no_vende", "op_sin_competencia_visible", "op_sin_proveedor",
    ]);
  });
});

describe("avisoLista — solo habla cuando importa", () => {
  it("null con confianza suficiente; aviso con poca o sin medir", () => {
    expect(avisoLista(0.75)).toBeNull();
    expect(avisoLista(UMBRAL_AVISO_CONFIANZA)).toBeNull();
    expect(avisoLista(0.59)).toBe("todavía con poca información");
    expect(avisoLista(null)).toBe("todavía con poca información");
  });
});

describe("proximoPaso — nunca termina sin decir qué sigue", () => {
  it("por etapa: contactar → visitar → cerrar primera compra", () => {
    expect(proximoPaso({ stage: "prospecto" }).texto).toContain("abrir la conversación");
    expect(proximoPaso({ stage: "contactado" }).texto).toContain("hacer la visita");
    expect(proximoPaso({ stage: "visitado" }).texto).toContain("primera compra");
    expect(proximoPaso({ stage: "prospecto" }).tono).toBe("accion");
  });

  it("frialdad visible solo cuando importa (≥7 días)", () => {
    expect(proximoPaso({ stage: "contactado", daysSinceContact: 12 }).texto)
      .toContain("(12 días sin movimiento)");
    expect(proximoPaso({ stage: "contactado", daysSinceContact: 3 }).texto)
      .not.toContain("sin movimiento");
  });

  it("el hueco de calificación aparece como pendiente accionable", () => {
    const p = proximoPaso({ stage: "contactado", senalesVisitaFaltantes: ["a", "b"] });
    expect(p.pendientes).toStrictEqual(["completar la calificación de visita (faltan 2 señales)"]);
    expect(proximoPaso({ stage: "visitado", senalesVisitaFaltantes: ["a"] }).pendientes[0])
      .toContain("falta 1 señal");
  });

  it("etapa desconocida: espera honesta, sin inventar", () => {
    const p = proximoPaso({ stage: "activo" });
    expect(p.tono).toBe("espera");
  });

  it("umbral exportado coherente con confianzaBaja", () => {
    expect(UMBRAL_CONFIANZA_BAJA).toBe(0.50);
  });
});
