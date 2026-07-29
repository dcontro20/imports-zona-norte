import { describe, it, expect } from "vitest";
import {
  pipelineCounts, prioritizeProspects, zonesCoverage, zonesWithoutCoverage,
  lastVisitFor, funnelSummary, daysSince,
  PIPELINE_FULL_ORDER,
} from "./prospecting.js";

const NOW = new Date("2026-07-14T12:00:00Z").getTime();
const ago = (d) => new Date(NOW - d * 86400000).toISOString();

const prospects = [
  { id: "p1", businessName: "Kiosco A", zone: "Palermo", pipelineStage: "prospecto", foundAt: ago(2) },
  { id: "p2", businessName: "Maxi B", zone: "Palermo", pipelineStage: "visitado", lastContactAt: ago(10) },
  { id: "p3", businessName: "Drug C", zone: "Caballito", pipelineStage: "contactado", lastContactAt: ago(1) },
  { id: "p4", businessName: "Conv D", zone: "Palermo", pipelineStage: "visitado", convertedClientId: "c9" }, // convertido → no cuenta
  { id: "p5", businessName: "Del E", zone: "Tigre", pipelineStage: "prospecto", isDeleted: true }, // borrado
];
const clients = [
  { id: "c1", type: "mayorista", zone: "Caballito", pipelineStage: "activo" },
  { id: "c2", type: "mayorista", zone: "Palermo", pipelineStage: "primera_compra" },
  { id: "c3", type: "minorista", zone: "Tigre" }, // minorista no cuenta
  { id: "c4", type: "mayorista", zone: "Villa Crespo", pipelineStage: "en_pausa", isDeleted: true }, // borrado
];

describe("pipelineCounts", () => {
  it("cuenta prospectos activos + clientes mayoristas por etapa", () => {
    const c = pipelineCounts({ prospects, clients });
    expect(c.prospecto).toBe(1);      // p1
    expect(c.contactado).toBe(1);     // p3
    expect(c.visitado).toBe(1);       // p2 (p4 convertido no cuenta)
    expect(c.primera_compra).toBe(1); // c2
    expect(c.activo).toBe(1);         // c1
    expect(c.en_pausa).toBe(0);       // c4 borrado
  });
  it("no crashea vacío", () => {
    const c = pipelineCounts({});
    expect(PIPELINE_FULL_ORDER.every(s => c[s] === 0)).toBe(true);
  });
});

describe("prioritizeProspects", () => {
  it("los visitados van primero (más cerca de cerrar)", () => {
    const r = prioritizeProspects(prospects, NOW);
    expect(r[0].prospect.id).toBe("p2"); // visitado
    expect(r[0].reason).toContain("cerrá");
  });
  it("excluye convertidos y borrados", () => {
    const ids = prioritizeProspects(prospects, NOW).map(r => r.prospect.id);
    expect(ids).not.toContain("p4");
    expect(ids).not.toContain("p5");
  });
  it("marca fríos (sin contacto hace >=7d)", () => {
    const r = prioritizeProspects([{ id: "x", pipelineStage: "contactado", lastContactAt: ago(9) }], NOW);
    expect(r[0].daysSinceContact).toBe(9);
    expect(r[0].reason).toContain("9d");
  });
});

describe("prioritizeProspects con contexto (Prospect Engine, Fase 3)", () => {
  // Casos con bandas distintas: A calificado completo (alta), B auto-only en
  // zona con demanda (media), E descartable con confianza total (baja),
  // X sin ninguna señal conocida ("" → último).
  const engineProspects = [
    { id: "pX", businessName: "Sin datos", zone: "Nowhere" },
    {
      id: "pE", businessName: "Chico frío", zone: "Boulogne", source: "manual",
      contactName: "Susana", phone: "11-5", lastContactAt: ago(30),
      calificacion: { vendeCategoria: "si", proveedorEstable: "si", competenciaVisible: "si",
                      tamano: "chico", movimiento: "no", actualizadoAt: ago(8) },
    },
    {
      id: "pA", businessName: "Estrella", zone: "Villa Adelina", source: "referido",
      contactName: "Marta", phone: "11-1", pipelineStage: "contactado", lastContactAt: ago(2),
      calificacion: { vendeCategoria: "no", proveedorEstable: "no", competenciaVisible: "no",
                      tamano: "grande", movimiento: "si", actualizadoAt: ago(2) },
    },
    {
      id: "pB", businessName: "Maxi Munro", zone: "Munro", source: "mapa",
      contactName: "", phone: "11-2", pipelineStage: "visitado", lastContactAt: ago(4),
    },
    { id: "pConv", zone: "Munro", convertedClientId: "c9" },
  ];
  const contexto = {
    visits: [
      { id: "v1", targetId: "pA", date: ago(2), outcome: "interesado" },
      { id: "v2", targetId: "pB", date: ago(4), outcome: "volver" },
      { id: "v3", targetId: "pE", date: ago(30), outcome: "no_interesado" },
    ],
    clients: [{ id: "c1", type: "mayorista", zone: "Munro" }],
    sales: [{ id: "s1", saleType: "mayorista", clientId: "c1", items: [{ productId: "pr1", qty: 10 }] }],
    products: [{ id: "pr1", brand: "Elfbar", model: "BC5000", flavor: "Mint" }],
  };

  it("ordena por valor comercial (banda → opp → fit → conf), no por recencia", () => {
    const r = prioritizeProspects(engineProspects, NOW, contexto);
    // pX (pelado, zona virgen) mide señales AUTO reales con contexto completo:
    // nunca_visitado + zona_sin_mayorista disparan → opp 66.7, banda media —
    // y dentro de media le gana a pB (45.8). Observación de calibración
    // registrada; la rúbrica está congelada por decisión.
    expect(r.map(x => x.prospect.id)).toStrictEqual(["pA", "pX", "pB", "pE"]);
    expect(r[0].scoreResult.prioridad).toBe("alta");
    expect(r[1].scoreResult.prioridad).toBe("media");
    // pE fue el contacto más viejo (30d): la recencia ya no manda
    expect(r[3].scoreResult.prioridad).toBe("baja");
  });

  it("sin ninguna señal conocida (contexto {} y ficha vacía): prioridad '' y va último", () => {
    const r = prioritizeProspects(
      [{ id: "pVacio", zone: "Z" }, engineProspects.find(p => p.id === "pA")], NOW, {});
    const x = r.find(i => i.prospect.id === "pVacio");
    expect(x.scoreResult.prioridad).toBe("");
    expect(x.reason).toBe("Sin señales todavía — visitar y calificar");
    expect(r[r.length - 1].prospect.id).toBe("pVacio");
  });

  it("score es un escalar monótono con el orden (consumidores pueden re-ordenar por él)", () => {
    const r = prioritizeProspects(engineProspects, NOW, contexto);
    for (let i = 1; i < r.length; i++) expect(r[i - 1].score).toBeGreaterThanOrEqual(r[i].score);
  });

  it("la razón es el gap más fuerte confirmado; con fit alto y sin gaps lo dice", () => {
    const r = prioritizeProspects(engineProspects, NOW, contexto);
    expect(r[0].reason).toBe("No tiene proveedor fijo de la categoría — entrada directa");
    // pD: todo en contra (ya vende, ya tiene proveedor, zona cubierta sin
    // demanda propia, visitado sin respuesta) pero gran fit ⇒ cero disparos.
    const sinGaps = prioritizeProspects([{
      id: "pD", zone: "Florida", source: "mapa", contactName: "Raúl", phone: "11-4",
      calificacion: { vendeCategoria: "si", proveedorEstable: "si", competenciaVisible: "si",
                      tamano: "grande", movimiento: "si", actualizadoAt: ago(1) },
    }], NOW, {
      ...contexto,
      clients: [...contexto.clients, { id: "c2", type: "mayorista", zone: "Florida" }],
      visits: [{ id: "v9", targetId: "pD", date: ago(1), outcome: "sin_respuesta" }],
    });
    expect(sinGaps[0].scoreResult.oportunidades).toStrictEqual([]);
    expect(sinGaps[0].reason).toMatch(/^Sin gaps confirmados/);
  });

  it("shape compatible: mismas claves de siempre + scoreResult aditivo; legacy no lo tiene", () => {
    const conMotor = prioritizeProspects(engineProspects, NOW, contexto)[0];
    expect(Object.keys(conMotor).sort())
      .toStrictEqual(["daysSinceContact", "prospect", "reason", "score", "scoreResult", "stage"]);
    const legacy = prioritizeProspects(prospects, NOW)[0];
    expect("scoreResult" in legacy).toBe(false);
  });

  it("excluye convertidos/borrados también en el camino motor", () => {
    const ids = prioritizeProspects(engineProspects, NOW, contexto).map(x => x.prospect.id);
    expect(ids).not.toContain("pConv");
  });

  it("determinista: mismo input ⇒ mismo ranking, independiente del reloj", () => {
    const r1 = prioritizeProspects(engineProspects, NOW, contexto);
    const r2 = prioritizeProspects(engineProspects, NOW + 999, contexto);
    expect(r1.map(x => [x.prospect.id, x.score])).toStrictEqual(r2.map(x => [x.prospect.id, x.score]));
  });

  it("contexto {} es motor (no legacy) con señales auto en sin_datos honesto", () => {
    const r = prioritizeProspects(engineProspects, NOW, {});
    expect(r.every(x => x.scoreResult != null)).toBe(true);
    // los que dependen de contexto quedan con confianza baja (solo ficha)...
    const pB = r.find(x => x.prospect.id === "pB");
    expect(pB.scoreResult.confidence).toBeLessThan(0.35);
    // ...pero la calificación de visita ya cargada sigue contando (pA)
    const pA = r.find(x => x.prospect.id === "pA");
    expect(pA.scoreResult.confidence).toBeGreaterThan(0.5);
  });
});

describe("zonesCoverage + zonesWithoutCoverage", () => {
  it("agrupa activos y prospectos por zona", () => {
    const z = zonesCoverage({ clients, prospects });
    const palermo = z.find(x => x.zone === "Palermo");
    expect(palermo.activos).toBe(1);    // c2
    expect(palermo.prospectos).toBe(2); // p1 (prospecto) + p2 (visitado); p4 convertido no cuenta
  });
  it("Palermo tiene 2 prospectos activos (p1 + p2)", () => {
    const z = zonesCoverage({ clients, prospects });
    expect(z.find(x => x.zone === "Palermo").prospectos).toBe(2);
  });
  it("zonas sin cobertura = prospectos pero 0 mayoristas activos", () => {
    const sin = zonesWithoutCoverage({ clients, prospects });
    // Palermo tiene c2 activo → cubierta. Caballito tiene c1 → cubierta.
    // No hay zona con prospectos y 0 activos en este fixture salvo... ninguna.
    expect(sin.every(z => z.activos === 0 && z.prospectos > 0)).toBe(true);
  });
  it("detecta una zona sin cobertura real", () => {
    const sin = zonesWithoutCoverage({
      clients: [{ id: "c1", type: "mayorista", zone: "Palermo", pipelineStage: "activo" }],
      prospects: [{ id: "p1", zone: "Chacarita", pipelineStage: "prospecto" }],
    });
    expect(sin).toHaveLength(1);
    expect(sin[0].zone).toBe("Chacarita");
  });
});

describe("lastVisitFor", () => {
  const visits = [
    { id: "v1", targetId: "p1", date: ago(5), outcome: "volver" },
    { id: "v2", targetId: "p1", date: ago(1), outcome: "interesado" },
    { id: "v3", targetId: "p2", date: ago(3), outcome: "vendido" },
    { id: "v4", targetId: "p1", date: ago(2), outcome: "volver", isDeleted: true },
  ];
  it("devuelve la visita más reciente no borrada", () => {
    expect(lastVisitFor(visits, "p1").id).toBe("v2");
  });
  it("null si no hay visitas", () => {
    expect(lastVisitFor(visits, "zzz")).toBeNull();
    expect(lastVisitFor([], "p1")).toBeNull();
  });
});

describe("funnelSummary", () => {
  it("resume prospectos activos, listos para cerrar y mayoristas", () => {
    const s = funnelSummary({ prospects, clients });
    expect(s.prospectosActivos).toBe(3); // p1 + p2 + p3
    expect(s.listosParaCerrar).toBe(1);  // p2 visitado
    expect(s.mayoristas).toBe(2);        // c1 + c2
  });
});

describe("daysSince", () => {
  it("calcula días o null", () => {
    expect(daysSince(ago(3), NOW)).toBe(3);
    expect(daysSince(null, NOW)).toBeNull();
    expect(daysSince(0, NOW)).toBeNull();
  });
});
