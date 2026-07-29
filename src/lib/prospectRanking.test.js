import { describe, it, expect } from "vitest";
import {
  buildProspectRanking, ETIQUETA_PRIORIDAD, ETIQUETA_TRI,
  CALIFICACION_CAMPOS, aplicarCalificacion, calificacionActual,
} from "./prospectRanking.js";
import { prioritizeProspects } from "../prospecting.js";

const NOW = new Date("2026-07-28T12:00:00Z").getTime();
const ago = (d) => new Date(NOW - d * 86400000).toISOString();

const DATOS = {
  prospects: [
    { id: "pX", businessName: "Sin datos", zone: "Nowhere" },
    {
      id: "pA", businessName: "Estrella", zone: "Villa Adelina", source: "referido",
      contactName: "Marta", phone: "11-1", pipelineStage: "contactado", lastContactAt: ago(2),
      calificacion: { vendeCategoria: "no", proveedorEstable: "no", competenciaVisible: "no",
                      tamano: "grande", movimiento: "si", actualizadoAt: ago(2) },
    },
    { id: "pB", businessName: "Maxi Munro", zone: "Munro", source: "mapa",
      phone: "11-2", pipelineStage: "visitado", lastContactAt: ago(12) },
    { id: "pBorrado", zone: "Munro", isDeleted: true },
  ],
  visits: [
    { id: "v1", targetId: "pA", date: ago(2), outcome: "interesado" },
    { id: "v2", targetId: "pB", date: ago(12), outcome: "volver" },
  ],
  clients: [{ id: "c1", type: "mayorista", zone: "Munro" }],
  sales: [{ id: "s1", saleType: "mayorista", clientId: "c1", items: [{ productId: "pr1", qty: 10 }] }],
  products: [{ id: "pr1", brand: "Elfbar", model: "BC5000", flavor: "Mint" }],
  now: NOW,
};

describe("buildProspectRanking — la fachada que consume la UI", () => {
  it("mismo orden que prioritizeProspects con contexto (única fuente de verdad)", () => {
    const { items } = buildProspectRanking(DATOS);
    const directo = prioritizeProspects(DATOS.prospects, NOW,
      { visits: DATOS.visits, clients: DATOS.clients, sales: DATOS.sales, products: DATOS.products });
    expect(items.map(i => i.prospect.id)).toStrictEqual(directo.map(i => i.prospect.id));
    expect(items.map(i => i.rankKey)).toStrictEqual(directo.map(i => i.rankKey));
  });

  it("posicion 1..n y porId apuntan al MISMO item", () => {
    const { items, porId } = buildProspectRanking(DATOS);
    expect(items.map(i => i.posicion)).toStrictEqual(items.map((_, i) => i + 1));
    for (const it of items) expect(porId[it.prospect.id]).toBe(it);
    expect(porId.pBorrado).toBeUndefined();
  });

  it("cada item trae todo lo que la UI necesita, ya digerido", () => {
    const { porId } = buildProspectRanking(DATOS);
    const a = porId.pA;
    expect(Object.keys(a).sort()).toStrictEqual([
      "chip", "daysSinceContact", "diagnostico", "posicion", "prospect",
      "proximoPaso", "rankKey", "reason", "scoreResult", "stage",
    ]);
    expect(a.chip.prioridad).toBe(a.scoreResult.prioridad);
    expect(a.chip.etiqueta).toBe(ETIQUETA_PRIORIDAD[a.scoreResult.prioridad]);
    expect(a.diagnostico.veredicto).toMatch(/oportunidad/i);
    expect(a.proximoPaso.texto).toContain("visita");   // etapa contactado
  });

  it("chip.aviso solo aparece con poca información (confianza < 0.60)", () => {
    const { porId } = buildProspectRanking(DATOS);
    expect(porId.pA.chip.aviso).toBeNull();                       // calificado: sabe mucho
    expect(porId.pX.chip.aviso).toBe("todavía con poca información");
    expect(porId.pX.chip.etiqueta).toBe(ETIQUETA_PRIORIDAD[porId.pX.scoreResult.prioridad]);
  });

  it("proximoPaso arrastra el hueco de calificación como pendiente", () => {
    const { porId } = buildProspectRanking(DATOS);
    expect(porId.pB.proximoPaso.pendientes[0]).toContain("faltan 5 señales");
    expect(porId.pA.proximoPaso.pendientes).toStrictEqual([]);
  });

  it("determinista e independiente del reloj en el orden", () => {
    const r1 = buildProspectRanking(DATOS);
    const r2 = buildProspectRanking({ ...DATOS, now: NOW + 5000 });
    expect(r1.items.map(i => [i.prospect.id, i.rankKey]))
      .toStrictEqual(r2.items.map(i => [i.prospect.id, i.rankKey]));
  });

  it("sin datasets: degrada honesto (motor con sin_datos), no explota", () => {
    const { items } = buildProspectRanking({ prospects: DATOS.prospects });
    expect(items.length).toBe(3);
    expect(items.every(i => i.scoreResult && i.diagnostico && i.proximoPaso)).toBe(true);
  });
});

describe("CALIFICACION_CAMPOS — el modal de visita se renderiza data-driven", () => {
  it("5 controles: 4 TRI + tamaño en escala; decisorVisto afuera (D2)", () => {
    expect(CALIFICACION_CAMPOS).toHaveLength(5);
    expect(CALIFICACION_CAMPOS.filter(c => c.tipo === "tri")).toHaveLength(4);
    const tamano = CALIFICACION_CAMPOS.find(c => c.campo === "tamano");
    expect(tamano.tipo).toBe("escala");
    expect(tamano.opciones.map(o => o.valor)).toStrictEqual(["chico", "medio", "grande", "sin_datos"]);
    expect(CALIFICACION_CAMPOS.map(c => c.campo)).not.toContain("decisorVisto");
  });

  it("toda opción trae valor + etiqueta: la UI no traduce nada a mano", () => {
    for (const c of CALIFICACION_CAMPOS) {
      expect(c.opciones.length).toBeGreaterThanOrEqual(3);
      for (const o of c.opciones) {
        expect(typeof o.valor).toBe("string");
        expect(o.etiqueta.length).toBeGreaterThan(0);
      }
      expect(c.opciones.some(o => o.valor === "sin_datos")).toBe(true);
    }
    expect(ETIQUETA_TRI).toStrictEqual({ si: "Sí", no: "No", sin_datos: "Sin datos" });
  });
});

describe("calificacionActual — estado del formulario sin conocer el shape", () => {
  it("normaliza: ausente, parcial o valor basura ⇒ sin_datos", () => {
    expect(calificacionActual({ id: "p1" })).toStrictEqual({
      vendeCategoria: "sin_datos", proveedorEstable: "sin_datos",
      competenciaVisible: "sin_datos", tamano: "sin_datos", movimiento: "sin_datos",
    });
    const parcial = calificacionActual({
      calificacion: { vendeCategoria: "si", tamano: "grande", movimiento: "quizás" },
    });
    expect(parcial.vendeCategoria).toBe("si");
    expect(parcial.tamano).toBe("grande");
    expect(parcial.movimiento).toBe("sin_datos");   // basura no llega a la UI
    expect(parcial.proveedorEstable).toBe("sin_datos");
  });

  it("ida y vuelta con aplicarCalificacion", () => {
    const p = aplicarCalificacion({ id: "p1" }, { movimiento: "no" }, { autor: "G", at: "2026-07-28" });
    expect(calificacionActual(p).movimiento).toBe("no");
  });
});

describe("aplicarCalificacion — merge honesto, fechado, sin mutar", () => {
  const p = { id: "p1", zone: "Munro", calificacion: { vendeCategoria: "si", actualizadoAt: "2026-07-01", actualizadoPor: "Diego" } };

  it("mergea solo lo tocado y sella autor + fecha", () => {
    const out = aplicarCalificacion(p, { movimiento: "si" }, { autor: "Gustavo", at: "2026-07-28" });
    expect(out.calificacion).toStrictEqual({
      vendeCategoria: "si", movimiento: "si",
      actualizadoAt: "2026-07-28", actualizadoPor: "Gustavo",
    });
    // jamás precompleta lo no marcado:
    expect("proveedorEstable" in out.calificacion).toBe(false);
  });

  it("no muta el prospecto original y funciona sin calificación previa", () => {
    aplicarCalificacion(p, { tamano: "medio" }, { autor: "G", at: "x" });
    expect(p.calificacion.actualizadoPor).toBe("Diego");
    const nuevo = aplicarCalificacion({ id: "p2" }, { tamano: "medio" }, { autor: "G", at: "2026-07-28" });
    expect(nuevo.calificacion.tamano).toBe("medio");
    expect(nuevo.calificacion.actualizadoPor).toBe("G");
  });
});
