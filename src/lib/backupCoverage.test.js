// backupCoverage.test.js — invariante de COBERTURA DE RESPALDO (ciclo B3).
//
// La clase del bug B3: "colección registrada en el sync pero fuera de la red
// de seguridad" (backup diario a Drive, export manual, restore). Igual que el
// test de paridad de B1, verifica el invariante sobre el FUENTE: toda key de
// DATA_KEYS tiene que estar en scripts/backup.mjs (COLLECTIONS) y en
// Export.jsx (backupJSON + applyRestore) — salvo exclusión EXPLÍCITA y
// documentada acá. Una colección nueva sin cobertura rompe este test el día
// que nace, no el día que se pierde data.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const leer = (p) => readFileSync(join(process.cwd(), ...p.split("/")), "utf8");
const syncSrc = leer("src/useFirebaseSync.js");
const backupSrc = leer("scripts/backup.mjs");
const exportSrc = leer("src/components/Export.jsx");

const bloqueKeys = syncSrc.match(/const DATA_KEYS = \[([\s\S]*?)\n\];/)?.[1] ?? "";
const declaradas = [...bloqueKeys.matchAll(/key: "(\w+)"/g)].map(m => m[1]);

// HALLAZGO B3-H1 (2026-08-01, decisión PENDIENTE de Gustavo): estas colecciones
// de la era S16/proveedores están fuera del backup de Drive y del export desde
// que nacieron — gap PRE-EXISTENTE al ciclo B3, fuera de su alcance aprobado
// (que cubre el CRM). Excluidas EXPLÍCITAMENTE para que el invariante quede
// verde sin ocultar el hueco: sacarlas de esta lista = cerrarlo.
const EXCLUIDAS_B3H1 = ["coupons", "bundles", "supplierProfiles", "supplierAliases", "supplierLists"];

const cubiertas = declaradas.filter(k => !EXCLUIDAS_B3H1.includes(k));

describe("cobertura de respaldo — invariante B3", () => {
  it("el parser del fuente sigue encontrando las estructuras", () => {
    expect(declaradas.length).toBeGreaterThanOrEqual(20);
    expect(cubiertas).toContain("prospects");
    expect(cubiertas).toContain("discoverySuppressed");
  });

  it("toda key cubierta está en COLLECTIONS del backup diario a Drive", () => {
    const bloque = backupSrc.match(/const COLLECTIONS = \[([\s\S]*?)\n\];/)?.[1] ?? "";
    const enBackup = new Set([...bloque.matchAll(/"(\w+)"/g)].map(m => m[1]));
    const faltantes = cubiertas.filter(k => !enBackup.has(k));
    expect(faltantes).toEqual([]);
  });

  it("toda key cubierta está en el export manual (backupJSON) con su count", () => {
    // En backupJSON cada colección aparece como "key: (key || []).length" en
    // counts y como "key: key || []" en el payload — con que la key aparezca
    // seguida de ':' dentro del archivo alcanza para el invariante de fuente.
    const faltantes = cubiertas.filter(k =>
      k !== "exchangeRate" && !new RegExp(`${k}: \\(?${k}`).test(exportSrc));
    expect(faltantes).toEqual([]);
  });

  it("toda key cubierta tiene su rama de restore (applyRestore)", () => {
    // exchangeRate es escalar y el restore actual no lo aplica (pre-existente,
    // fuera de B3): el invariante cubre las colecciones-array.
    // Las keys-OBJETO (pricingPolicy) restauran con typeof en vez de
    // Array.isArray — su rama es `typeof d.<key> === "object"`.
    const OBJETOS = new Set(["pricingPolicy"]);
    const faltantes = cubiertas.filter(k => {
      if (k === "exchangeRate") return false;
      const patron = OBJETOS.has(k)
        ? new RegExp(`typeof d\\.${k} === "object"`)
        : new RegExp(`Array\\.isArray\\(d\\.${k}\\)`);
      return !patron.test(exportSrc);
    });
    expect(faltantes).toEqual([]);
  });

  it("las 4 del CRM están de punta a punta (backup + export + restore)", () => {
    for (const k of ["prospects", "visits", "routes", "discoverySuppressed"]) {
      expect(backupSrc.includes(`"${k}"`)).toBe(true);
      expect(new RegExp(`Array\\.isArray\\(d\\.${k}\\)`).test(exportSrc)).toBe(true);
    }
  });
});
