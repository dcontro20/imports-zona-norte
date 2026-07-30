import { describe, it, expect } from "vitest";
import { OPORTUNIDAD, FIT, RUBRICA_IZN } from "./prospectRubric.js";
import { construirScore, validarScore } from "./prospectScoring.js";

describe("rúbrica izn-v1 — forma y consistencia", () => {
  it("versión y tamaño del borrador §7: 8 oportunidad + 5 fit", () => {
    expect(RUBRICA_IZN.version).toBe("izn-v1");
    expect(OPORTUNIDAD.length).toBe(8);
    expect(FIT.length).toBe(5);
  });

  it("ids únicos, pesos numéricos positivos, fuente auto|visita en toda fila", () => {
    const filas = [...OPORTUNIDAD, ...FIT];
    expect(new Set(filas.map(f => f.id)).size).toBe(filas.length);
    for (const f of filas) {
      expect(typeof f.id).toBe("string");
      expect(f.pregunta.length).toBeGreaterThan(0);
      expect(f.peso).toBeGreaterThan(0);
      expect(["auto", "visita"]).toContain(f.fuente);
    }
  });

  it("mitad automática garantizada: 8 auto / 5 de visita (ranking útil día uno)", () => {
    const filas = [...OPORTUNIDAD, ...FIT];
    expect(filas.filter(f => f.fuente === "auto").length).toBe(8);
    expect(filas.filter(f => f.fuente === "visita").length).toBe(5);
  });

  it("pesos del borrador: 88 oportunidad / 80 fit (ancla de calibración)", () => {
    expect(OPORTUNIDAD.reduce((a, f) => a + f.peso, 0)).toBe(88);
    expect(FIT.reduce((a, f) => a + f.peso, 0)).toBe(80);
  });

  it("toda fila de oportunidad que dispara tiene su frase (alimenta el diagnóstico)", () => {
    for (const f of OPORTUNIDAD) expect(typeof f.fraseOportunidad).toBe("string");
    for (const f of FIT) expect(typeof f.fraseFortaleza).toBe("string");
  });

  it("es consumible por el motor tal cual: sin señales ⇒ score honesto vacío", () => {
    const s = construirScore({}, RUBRICA_IZN);
    expect(s.rubricVersion).toBe("izn-v1");
    expect(s.opportunity.total).toBeNull();
    expect(s.fit.total).toBeNull();
    expect(s.prioridad).toBe("");
    expect(s.confidence).toBe(0);
    expect(validarScore(s)).toStrictEqual([]);
  });
});
