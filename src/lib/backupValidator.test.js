import { describe, it, expect } from "vitest";
import { djb2Hash, packBackup, validateBackup } from "./backupValidator.js";

describe("djb2Hash", () => {
  it("hash determinístico", () => {
    expect(djb2Hash("hello")).toBe(djb2Hash("hello"));
  });
  it("strings distintos → hashes distintos", () => {
    expect(djb2Hash("hello")).not.toBe(djb2Hash("world"));
  });
});

describe("packBackup + validateBackup", () => {
  it("pack agrega _meta con checksum", () => {
    const data = { products: [{ id: "p1" }] };
    const packed = packBackup(data);
    expect(packed._meta.checksum).toBeTruthy();
    expect(packed._meta.version).toBe(1);
    expect(packed.data).toEqual(data);
  });

  it("validateBackup detecta backup íntegro", () => {
    const packed = packBackup({ products: [{ id: "p1" }] });
    const result = validateBackup(packed);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.summary.checksumValid).toBe(true);
  });

  it("validateBackup detecta corrupción", () => {
    const packed = packBackup({ products: [{ id: "p1" }] });
    // Corromper data manualmente
    packed.data.products.push({ id: "X" });
    const result = validateBackup(packed);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Checksum no coincide/);
  });

  it("validateBackup detecta backup sin estructura", () => {
    expect(validateBackup(null).valid).toBe(false);
    expect(validateBackup({}).valid).toBe(false);
  });

  it("summary incluye counts por colección", () => {
    const packed = packBackup({
      products: [{ id: "p1" }, { id: "p2" }],
      sales: [{ id: "s1" }],
      meta: "scalar",
    });
    const r = validateBackup(packed);
    expect(r.summary.counts.products).toBe(2);
    expect(r.summary.counts.sales).toBe(1);
  });

  it("strictSchemas valida estructura de cada colección", () => {
    const packed = packBackup({
      products: [
        { id: "p1", brand: "Elfbar" }, // válido
        { brand: "X" },                 // inválido (sin id)
      ],
    });
    const r = validateBackup(packed, { strictSchemas: true });
    expect(r.summary.schemaResults.products.invalid).toBe(1);
  });
});

describe("strictSchemas — colecciones del CRM (ciclo B3)", () => {
  it("valida prospects/visits/routes/discoverySuppressed y reporta los inválidos", () => {
    const packed = packBackup({
      prospects: [
        { id: "p1", businessName: "Kiosco OK", zone: "Martínez" },
        { id: "p2" },                                     // sin businessName ⇒ inválido
      ],
      visits: [{ id: "v1", targetId: "p1", outcome: "interesado" }],
      routes: [{ id: "r1", status: "planificada" }],
      discoverySuppressed: [{ id: "s1", nombre: "X", direccion: "C 1" }],
    });
    const r = validateBackup(packed, { strictSchemas: true });
    expect(r.valid).toBe(true);                            // checksum OK (soft schemas)
    expect(r.summary.schemaResults.prospects.valid).toBe(1);
    expect(r.summary.schemaResults.prospects.invalid).toBe(1);
    expect(r.summary.schemaResults.visits.invalid).toBe(0);
    expect(r.summary.schemaResults.routes.invalid).toBe(0);
    expect(r.summary.schemaResults.discoverySuppressed.invalid).toBe(0);
  });
});
