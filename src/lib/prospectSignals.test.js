import { describe, it, expect } from "vitest";
import { prospectToSignals } from "./prospectSignals.js";
import { RUBRICA_IZN, OPORTUNIDAD, FIT } from "./prospectRubric.js";
import { construirScore, validarScore, TRI } from "./prospectScoring.js";

const PROSPECTO = {
  id: "p1", businessName: "Kiosco Test", zone: "Villa Adelina",
  address: "Av. Test 123", phone: "11-5555-0001", contactName: "Marta",
  source: "referido", pipelineStage: "contactado",
};

const CALIF = {
  vendeCategoria: "no", proveedorEstable: "no", competenciaVisible: "no",
  tamano: "medio", movimiento: "si",
  actualizadoAt: "2026-07-25T18:00:00.000Z", actualizadoPor: "Gustavo",
};

const visita = (over = {}) => ({
  id: "v1", targetId: "p1", targetType: "prospect",
  date: "2026-07-20T15:00:00.000Z", outcome: "interesado", byUser: "Gustavo", ...over,
});

const mayoristaEn = (zone, over = {}) => ({
  id: "c1", type: "mayorista", zone, businessName: "Kiosco Cliente", ...over,
});

describe("cobertura del contrato rúbrica ↔ señales", () => {
  it("el adaptador emite EXACTAMENTE una señal por fila de la rúbrica (sin huérfanas)", () => {
    const s = prospectToSignals(PROSPECTO, {});
    const idsRubrica = [...OPORTUNIDAD, ...FIT].map(f => f.id).sort();
    expect(Object.keys(s).sort()).toStrictEqual(idsRubrica);
  });

  it("toda señal emitida es TRI válido con fuentes array", () => {
    const s = prospectToSignals(PROSPECTO, { visits: [], clients: [], sales: [], products: [] });
    for (const [id, v] of Object.entries(s)) {
      expect(TRI, id).toContain(v.valor);
      expect(Array.isArray(v.fuentes), id).toBe(true);
      if (v.valor !== "sin_datos") expect(v.fuentes.length, id).toBeGreaterThan(0);
    }
  });
});

describe("honestidad: contexto ausente ≠ dato ausente", () => {
  it("sin contexto: todo sin_datos salvo lo que sale de la ficha misma", () => {
    const s = prospectToSignals(PROSPECTO, {});
    expect(s.op_nunca_visitado.valor).toBe("sin_datos");
    expect(s.op_zona_sin_mayorista.valor).toBe("sin_datos");
    expect(s.op_producto_vecino.valor).toBe("sin_datos");
    expect(s.fit_receptividad.valor).toBe("sin_datos");
    // la ficha es autoritativa aun sin contexto:
    expect(s.op_referido.valor).toBe("si");
    expect(s.fit_decisor.valor).toBe("si");
  });

  it("contexto provisto pero vacío = dato real (0 visitas ⇒ nunca visitado)", () => {
    const s = prospectToSignals(PROSPECTO, { visits: [], clients: [] });
    expect(s.op_nunca_visitado).toStrictEqual({ valor: "si", fuentes: ["visits"] });
    expect(s.op_zona_sin_mayorista.valor).toBe("si");   // 0 mayoristas = zona virgen real
    expect(s.fit_zona_reparto.valor).toBe("no");
    // pero un outcome no se puede inventar sin visitas:
    expect(s.op_interes_declarado.valor).toBe("sin_datos");
    expect(s.fit_receptividad.valor).toBe("sin_datos");
  });
});

describe("señales de calificación (visita)", () => {
  it("mapea con inversión: registra el hecho, la señal pregunta el gap", () => {
    const s = prospectToSignals({ ...PROSPECTO, calificacion: CALIF }, {});
    expect(s.op_sin_proveedor).toStrictEqual({ valor: "si", fuentes: ["calificacion_2026-07-25"] });
    expect(s.op_no_vende.valor).toBe("si");
    expect(s.op_sin_competencia_visible.valor).toBe("si");
    expect(s.fit_movimiento.valor).toBe("si");            // directo, sin inversión
  });

  it("tamano es escala: chico ⇒ no, medio/grande ⇒ si, ausente ⇒ sin_datos", () => {
    const con = (tamano) =>
      prospectToSignals({ ...PROSPECTO, calificacion: { ...CALIF, tamano } }, {}).fit_tamano.valor;
    expect(con("chico")).toBe("no");
    expect(con("medio")).toBe("si");
    expect(con("grande")).toBe("si");
    expect(con("sin_datos")).toBe("sin_datos");
    expect(prospectToSignals(PROSPECTO, {}).fit_tamano.valor).toBe("sin_datos");
  });

  it("prospecto sin calificar (data previa a la fase) rinde sin_datos, no rompe", () => {
    const s = prospectToSignals(PROSPECTO, {});
    for (const id of ["op_sin_proveedor", "op_no_vende", "op_sin_competencia_visible",
                      "fit_tamano", "fit_movimiento"]) {
      expect(s[id]).toStrictEqual({ valor: "sin_datos", fuentes: [] });
    }
  });
});

describe("señales de visitas", () => {
  it("última visita con interés ⇒ op_interes_declarado si, con la fecha como fuente", () => {
    const s = prospectToSignals(PROSPECTO, { visits: [visita()] });
    expect(s.op_interes_declarado).toStrictEqual({ valor: "si", fuentes: ["visita_2026-07-20"] });
    expect(s.op_nunca_visitado.valor).toBe("no");
  });

  it("manda la ÚLTIMA visita: interesado viejo + no_interesado reciente ⇒ no", () => {
    const s = prospectToSignals(PROSPECTO, {
      visits: [
        visita(),
        visita({ id: "v2", date: "2026-07-26T10:00:00.000Z", outcome: "no_interesado" }),
      ],
    });
    expect(s.op_interes_declarado).toStrictEqual({ valor: "no", fuentes: ["visita_2026-07-26"] });
    // pero la receptividad histórica se acuerda de la visita positiva:
    expect(s.fit_receptividad).toStrictEqual({ valor: "si", fuentes: ["visita_2026-07-20"] });
  });

  it("visitas de otro target o borradas no cuentan", () => {
    const s = prospectToSignals(PROSPECTO, {
      visits: [visita({ targetId: "otro" }), visita({ id: "v3", isDeleted: true })],
    });
    expect(s.op_nunca_visitado).toStrictEqual({ valor: "si", fuentes: ["visits"] });
  });

  it("visitas sin outcome positivo ⇒ receptividad no", () => {
    const s = prospectToSignals(PROSPECTO, {
      visits: [visita({ outcome: "sin_respuesta" })],
    });
    expect(s.fit_receptividad.valor).toBe("no");
  });
});

describe("señales de zona", () => {
  it("mayorista activo en la zona ⇒ zona cubierta + sinergia de reparto", () => {
    const s = prospectToSignals(PROSPECTO, { clients: [mayoristaEn("Villa Adelina")] });
    expect(s.op_zona_sin_mayorista.valor).toBe("no");
    expect(s.fit_zona_reparto).toStrictEqual({ valor: "si", fuentes: ["zonesCoverage"] });
  });

  it("normaliza la zona igual que zonesCoverage (espacios, vacío ⇒ Sin zona)", () => {
    const s1 = prospectToSignals({ ...PROSPECTO, zone: "  Villa Adelina  " },
                                 { clients: [mayoristaEn("Villa Adelina")] });
    expect(s1.fit_zona_reparto.valor).toBe("si");
    const s2 = prospectToSignals({ ...PROSPECTO, zone: "" },
                                 { clients: [mayoristaEn("")] });
    expect(s2.fit_zona_reparto.valor).toBe("si");   // ambos caen en "Sin zona"
  });

  it("minoristas y mayoristas borrados no cubren zona", () => {
    const s = prospectToSignals(PROSPECTO, {
      clients: [
        mayoristaEn("Villa Adelina", { type: "minorista" }),
        mayoristaEn("Villa Adelina", { id: "c2", isDeleted: true }),
      ],
    });
    expect(s.op_zona_sin_mayorista.valor).toBe("si");
  });
});

describe("señal de demanda en zona (producto vecino)", () => {
  const contexto = {
    clients: [mayoristaEn("Villa Adelina")],
    products: [{ id: "prod1", brand: "Elfbar", model: "BC5000", flavor: "Mint" }],
    sales: [{
      id: "s1", saleType: "mayorista", clientId: "c1",
      items: [{ productId: "prod1", qty: 20 }],
    }],
  };

  it("ventas mayoristas en la zona ⇒ demanda probada", () => {
    const s = prospectToSignals(PROSPECTO, contexto);
    expect(s.op_producto_vecino).toStrictEqual({ valor: "si", fuentes: ["productsByZone"] });
  });

  it("datasets provistos pero sin ventas en esa zona ⇒ no (medido, no sin_datos)", () => {
    const s = prospectToSignals({ ...PROSPECTO, zone: "Otra Zona" }, contexto);
    expect(s.op_producto_vecino.valor).toBe("no");
  });

  it("faltan datasets ⇒ sin_datos", () => {
    const s = prospectToSignals(PROSPECTO, { clients: contexto.clients });
    expect(s.op_producto_vecino.valor).toBe("sin_datos");
  });
});

describe("señales de ficha", () => {
  it("source referido/manual y decisor con o sin teléfono", () => {
    expect(prospectToSignals(PROSPECTO, {}).op_referido.valor).toBe("si");
    expect(prospectToSignals({ ...PROSPECTO, source: "manual" }, {}).op_referido.valor).toBe("no");
    expect(prospectToSignals({ ...PROSPECTO, source: "" }, {}).op_referido.valor).toBe("sin_datos");
    expect(prospectToSignals({ ...PROSPECTO, phone: "  " }, {}).fit_decisor.valor).toBe("no");
    expect(prospectToSignals({ ...PROSPECTO, contactName: "" }, {}).fit_decisor.valor).toBe("no");
  });
});

describe("integración señales → motor con la rúbrica izn-v1", () => {
  it("prospecto calificado con contexto completo produce un score válido y explicado", () => {
    const s = prospectToSignals(
      { ...PROSPECTO, calificacion: CALIF },
      {
        visits: [visita()],
        clients: [mayoristaEn("Villa Adelina")],
        sales: [{ id: "s1", saleType: "mayorista", clientId: "c1", items: [{ productId: "prod1", qty: 20 }] }],
        products: [{ id: "prod1", brand: "Elfbar", model: "BC5000", flavor: "Mint" }],
      },
    );
    const score = construirScore(s, RUBRICA_IZN, { prospectId: "p1", at: "2026-07-28" });
    expect(validarScore(score)).toStrictEqual([]);
    // 13/13 señales conocidas ⇒ confianza total, prioridad sin gate
    expect(score.confidence).toBe(1);
    expect(score.opportunity.resumen).toBe("8/8 criterios con datos");
    expect(score.fit.resumen).toBe("5/5 criterios con datos");
    expect(score.prioridad).not.toBe("");
    // el interés declarado y el mercado virgen disparan como oportunidades
    expect(score.oportunidades).toContain("La última visita terminó con interés declarado");
    expect(score.oportunidades).toContain("Todavía no vende la categoría — mercado virgen");
    // la sinergia de zona aparece como fortaleza
    expect(score.fortalezas).toContain("En zona de reparto activa — la logística ya paga");
  });

  it("prospecto recién cargado sin nada: score honesto de baja confianza, jamás rompe", () => {
    const score = construirScore(
      prospectToSignals({ id: "px", businessName: "X", zone: "Z", source: "manual" }, { visits: [], clients: [] }),
      RUBRICA_IZN,
    );
    expect(validarScore(score)).toStrictEqual([]);
    expect(score.confidence).toBeLessThan(0.5);
    expect(score.prioridad).not.toBe("muy_alta");   // el gate y las bandas protegen el top
  });
});
