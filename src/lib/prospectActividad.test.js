// prospectActividad.test.js — la Actividad de la Ficha (F3 del CRM).
import { describe, it, expect } from "vitest";
import { actividadDeProspecto } from "./prospectActividad.js";

const VISITA = { id: "v1", targetId: "p1", targetType: "prospect", date: "2026-07-25T10:00:00Z", outcome: "interesado", notes: "pide lista", byUser: "Gustavo" };
const AUDIT = [
  { id: "a1", timestamp: "2026-07-20T09:00:00Z", user: "Diego", action: "create", entityType: "prospect", entityId: "p1", description: "Prospecto nuevo: Kiosco X" },
  { id: "a2", timestamp: "2026-07-25T10:00:01Z", user: "Gustavo", action: "visit", entityType: "prospect", entityId: "p1", description: "Visita a Kiosco X: interesado" },
  { id: "a3", timestamp: "2026-07-26T12:00:00Z", user: "Diego", action: "qualify", entityType: "prospect", entityId: "p1", description: "Calificación actualizada: Kiosco X" },
  { id: "a4", timestamp: "2026-07-27T12:00:00Z", user: "Diego", action: "create", entityType: "prospect", entityId: "OTRO", description: "Prospecto nuevo: Ajeno" },
  { id: "a5", timestamp: "2026-07-28T12:00:00Z", user: "Diego", action: "accionDesconocida", entityType: "prospect", entityId: "p1", description: "???" },
];

describe("actividadDeProspecto — eventos tipados", () => {
  it("compone visitas ricas + audit del prospecto, orden DESC", () => {
    const ev = actividadDeProspecto({ prospectId: "p1", visits: [VISITA], auditLog: AUDIT });
    expect(ev.map(e => e.tipo)).toEqual(["audit_qualify", "visita", "audit_create"]);
    expect(ev[1].titulo).toBe("Visita: interesado");
    expect(ev[1].detalle).toBe("pide lista");
    expect(ev[1].por).toBe("Gustavo");
  });
  it("excluye los audit 'visit' (la visita rica ya está) y lo de otros prospectos", () => {
    const ev = actividadDeProspecto({ prospectId: "p1", visits: [], auditLog: AUDIT });
    expect(ev.some(e => e.tipo === "audit_visit")).toBe(false);
    expect(ev.some(e => e.detalle.includes("Ajeno"))).toBe(false);
  });
  it("una action desconocida no se inventa: se ignora hasta tener builder", () => {
    const ev = actividadDeProspecto({ prospectId: "p1", visits: [], auditLog: AUDIT });
    expect(ev.some(e => e.tipo === "audit_accionDesconocida")).toBe(false);
  });
  it("visitas borradas no aparecen; sin prospectId devuelve vacío", () => {
    expect(actividadDeProspecto({ prospectId: "p1", visits: [{ ...VISITA, isDeleted: true }] })).toEqual([]);
    expect(actividadDeProspecto({})).toEqual([]);
    expect(actividadDeProspecto()).toEqual([]);
  });
  it("todo evento cumple el contrato {tipo, icono, titulo, detalle, at, por}", () => {
    const ev = actividadDeProspecto({ prospectId: "p1", visits: [VISITA], auditLog: AUDIT });
    for (const e of ev) {
      expect(Object.keys(e).sort()).toEqual(["at", "detalle", "icono", "por", "tipo", "titulo"]);
    }
  });
});
