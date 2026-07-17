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
