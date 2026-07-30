// izn_discovery.golden.test.js — EQUIVALENCIA del port contra la referencia
// (Atlas, Python), sin tolerancias. La fixture sale de una corrida REAL de
// gosom (kiosco / Palermo) + replay determinístico, y se regenera SOLO en
// Atlas (atlas/prospect/tests/export_izn_discovery_fixtures.py) — copia
// byte-idéntica acá. Misma regla y mismo estándar que prospectScoring.golden.json:
// si uno de estos tests falla, el port está mal — no se "ajusta" la fixture.
import { describe, it, expect } from "vitest";
import fixture from "./izn_discovery.golden.json";
import { parseGosomRecord } from "./gosomParse.js";
import { slug, clavesDe, redDe } from "./identity.js";
import { discoverRun } from "./discoverRun.js";

describe("golden — parser (registro NDJSON → RawBusiness, campo a campo)", () => {
  it("cada registro de la corrida real y cada sintético parsean IDÉNTICO", () => {
    expect(fixture.parse.length).toBeGreaterThan(0);
    for (const par of fixture.parse) {
      expect(parseGosomRecord(par.in)).toEqual(par.out);
    }
  });
});

describe("golden — identidad (slug, claves, red social)", () => {
  it("claves de identidad, red detectada y slug del nombre coinciden por registro", () => {
    expect(fixture.identidad).toHaveLength(fixture.parse.length);
    fixture.identidad.forEach((esperado, i) => {
      const rb = fixture.parse[i].out;
      expect([...clavesDe(rb.web, rb.nombre, rb.direccion)].sort()).toEqual(esperado.claves);
      expect(redDe(rb.web)).toBe(esperado.red);
      expect(slug(rb.nombre)).toBe(esperado.slugNombre);
    });
  });
});

describe("golden — runner (decisiones de la corrida real + replays)", () => {
  const { raws, run1, run2_idempotencia, run3_supresion } = fixture.runner;
  const tope = fixture._meta.corrida.tope;

  it("run1 (root limpio): mismos contadores y mismos descubiertos, en orden", () => {
    const res = discoverRun({ raws, tope, existentes: [], suprimidos: [] });
    expect(res.descubiertos.length).toBe(run1.descubiertos);
    expect(res.saltadosSuprimidos).toBe(run1.saltados_suprimidos);
    expect(res.saltadosDuplicados).toBe(run1.saltados_duplicados);
    expect(res.descubiertos.map(d => d.raw.nombre)).toEqual(run1.kept.map(k => k.nombre));
  });

  it("run1: la regla red-como-web coincide con lo que persistió la referencia", () => {
    const res = discoverRun({ raws, tope, existentes: [], suprimidos: [] });
    res.descubiertos.forEach((d, i) => {
      const kept = run1.kept[i];
      // Referencia: red detectada ⇒ negocio.web queda vacío y la URL va a redes[].
      expect(kept.web_final).toBe(d.red ? "" : d.raw.web);
      expect(kept.redes.map(r => r.plataforma)).toEqual(d.red ? [d.red] : []);
      if (d.red) expect(kept.redes[0].url).toBe(d.raw.web);
    });
  });

  it("run2 (mismo root): idempotencia — nada nuevo, todo duplicado", () => {
    // Las identidades "del store" se reconstruyen igual que la referencia:
    // claves de los descubiertos de run1.
    const existentes = new Set();
    const previa = discoverRun({ raws, tope, existentes: [], suprimidos: [] });
    for (const d of previa.descubiertos) for (const k of d.claves) existentes.add(k);
    const res = discoverRun({ raws, tope, existentes, suprimidos: [] });
    expect(res.descubiertos.length).toBe(run2_idempotencia.descubiertos);
    expect(res.saltadosSuprimidos).toBe(run2_idempotencia.saltados_suprimidos);
    expect(res.saltadosDuplicados).toBe(run2_idempotencia.saltados_duplicados);
  });

  it("run3 (root limpio + ledger P5): suprimidos exactos", () => {
    const res = discoverRun({ raws, tope, existentes: [], suprimidos: run3_supresion.ledger });
    expect(res.descubiertos.length).toBe(run3_supresion.descubiertos);
    expect(res.saltadosSuprimidos).toBe(run3_supresion.saltados_suprimidos);
    expect(res.saltadosDuplicados).toBe(run3_supresion.saltados_duplicados);
  });
});

describe("golden — sanidad de la fixture", () => {
  it("la corrida es la declarada y los raws son los del runner", () => {
    expect(fixture._meta.corrida.via).toBe("google_maps");
    expect(fixture.runner.raws.length).toBe(fixture.calidad.raws);
    expect(fixture.runner.raws.length).toBeLessThanOrEqual(fixture._meta.corrida.tope);
  });
  it("P6 también en la fixture: ningún 'in' trae contenido descartado", () => {
    for (const par of fixture.parse) {
      for (const k of ["user_reviews", "images", "owner", "popular_times", "about"]) {
        expect(par.in[k]).toBeUndefined();
      }
    }
  });
});
