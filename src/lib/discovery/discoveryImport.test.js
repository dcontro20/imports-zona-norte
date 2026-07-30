// discoveryImport.test.js — la ingesta contra el contrato §6 (dedup en orden
// de fuerza) y §7 (supresión con memoria, identidad suficiente).
import { describe, it, expect } from "vitest";
import {
  normalizarTelefono, clavesDeRegistro, puedeSuprimirse,
  revisarDescubiertos, altaDesdeDescubierto, suprimirDescubierto,
} from "./discoveryImport.js";

const desc = (over = {}) => ({
  businessName: "Kiosco Golden", zone: "Palermo", address: "El Salvador 4813, CABA",
  phone: "+54 11 4831-2200", contactName: "", source: "descubrimiento", notes: "",
  lat: -34.58, lng: -58.43, pipelineStage: "prospecto",
  via: "google_maps", descubiertoTermino: "kiosco", descubiertoEn: "Palermo, CABA, Argentina",
  descubiertoAt: "2026-07-30", placeId: "PID_GOLDEN", urlOrigen: "https://maps.google.com/?cid=9",
  clavesIdentidad: ["nd:kiosco-golden|el-salvador-4813-caba"],
  web: "", redSocial: "", categoria: "Kiosco", email: "", rating: 4.4,
  reviewsCount: 51, horariosCompletos: "si", ...over,
});

describe("normalizarTelefono — normalización AR pragmática", () => {
  it("saca todo lo no-dígito y los prefijos 54/549/0", () => {
    expect(normalizarTelefono("+54 11 4831-2200")).toBe("1148312200");
    expect(normalizarTelefono("+54 9 11 4831-2200")).toBe("1148312200");
    expect(normalizarTelefono("011 4831 2200")).toBe("1148312200");
  });
  it("el mismo teléfono escrito distinto da la MISMA clave", () => {
    const formas = ["+54 11 4831-2200", "011-4831-2200", "+549 11 48312200", "11 4831 2200"];
    const claves = new Set(formas.map(normalizarTelefono));
    expect(claves.size).toBe(1);
  });
  it("menos de 6 dígitos no identifica ⇒ vacío", () => {
    expect(normalizarTelefono("4831")).toBe("");
    expect(normalizarTelefono("")).toBe("");
    expect(normalizarTelefono(null)).toBe("");
  });
});

describe("clavesDeRegistro — superset del runner, para cualquier registro", () => {
  it("descubierto: nd + placeId + tel + clavesIdentidad", () => {
    const claves = clavesDeRegistro(desc());
    expect(claves.has("nd:kiosco-golden|el-salvador-4813-caba")).toBe(true);
    expect(claves.has("pid:PID_GOLDEN")).toBe(true);
    expect(claves.has("tel:1148312200")).toBe(true);
  });
  it("cliente retail (name/address/phone) genera claves comparables", () => {
    const claves = clavesDeRegistro({ name: "Kiosco Golden", address: "El Salvador 4813, CABA", phone: "011 4831 2200" });
    expect(claves.has("nd:kiosco-golden|el-salvador-4813-caba")).toBe(true);
    expect(claves.has("tel:1148312200")).toBe(true);
  });
  it("entrada de supresión (nombre/direccion/claves) re-expone sus claves", () => {
    const claves = clavesDeRegistro({ nombre: "Kiosco X", direccion: "Calle 1", claves: ["pid:ABC"] });
    expect(claves.has("nd:kiosco-x|calle-1")).toBe(true);
    expect(claves.has("pid:ABC")).toBe(true);
  });
});

describe("revisarDescubiertos — dedup + supresión", () => {
  it("lote limpio: todo importable", () => {
    const r = revisarDescubiertos({ prospectos: [desc()], prospects: [], clients: [], suprimidos: [] });
    expect(r.importables).toBe(1);
    expect(r.items[0].estado).toBe("importable");
  });
  it("duplicado contra prospecto vivo (por placeId) con motivo nominal", () => {
    const r = revisarDescubiertos({
      prospectos: [desc()],
      prospects: [{ businessName: "Kiosco Golden (viejo)", placeId: "PID_GOLDEN" }],
    });
    expect(r.duplicados).toBe(1);
    expect(r.items[0].motivo).toContain('prospecto "Kiosco Golden (viejo)"');
  });
  it("duplicado contra CLIENTE por teléfono (no prospectar a un cliente actual)", () => {
    const r = revisarDescubiertos({
      prospectos: [desc()],
      clients: [{ name: "Golden SRL", phone: "011-4831-2200" }],
    });
    expect(r.duplicados).toBe(1);
    expect(r.items[0].motivo).toContain('cliente "Golden SRL"');
  });
  it("prospecto BORRADO (Papelera) no bloquea; suprimido SÍ", () => {
    const borrado = { businessName: "Kiosco Golden", address: "El Salvador 4813, CABA", isDeleted: true };
    const r1 = revisarDescubiertos({ prospectos: [desc()], prospects: [borrado] });
    expect(r1.importables).toBe(1);
    const r2 = revisarDescubiertos({
      prospectos: [desc()],
      suprimidos: [{ nombre: "Kiosco Golden", direccion: "El Salvador 4813, CABA" }],
    });
    expect(r2.suprimidos).toBe(1);
    expect(r2.items[0].estado).toBe("suprimido");
  });
  it("la supresión gana sobre el duplicado (mismo orden que el runner)", () => {
    const r = revisarDescubiertos({
      prospectos: [desc()],
      prospects: [{ businessName: "Kiosco Golden", placeId: "PID_GOLDEN" }],
      suprimidos: [{ nombre: "Kiosco Golden", direccion: "El Salvador 4813, CABA" }],
    });
    expect(r.items[0].estado).toBe("suprimido");
  });
  it("dedup DENTRO del lote: dos avistajes del mismo negocio ⇒ 1 alta", () => {
    const r = revisarDescubiertos({ prospectos: [desc(), desc({ placeId: "OTRO_PID" })] });
    expect(r.importables).toBe(1);
    expect(r.duplicados).toBe(1);
    expect(r.items[1].motivo).toContain("descubierto");
  });
  it("sin colisiones de claves no hay falsos positivos", () => {
    const r = revisarDescubiertos({
      prospectos: [desc()],
      prospects: [{ businessName: "Otro Kiosco", address: "Av. Santa Fe 1", phone: "011 5555 0001", placeId: "ZZZ" }],
      clients: [{ name: "Cliente Ajeno", phone: "011 5555 0002" }],
    });
    expect(r.importables).toBe(1);
  });
});

describe("altaDesdeDescubierto / suprimirDescubierto", () => {
  it("el alta inyecta id y fechas del llamador, sin tocar el resto", () => {
    const p = altaDesdeDescubierto(desc(), { id: "id-1", at: "2026-07-30T12:00:00Z" });
    expect(p.id).toBe("id-1");
    expect(p.foundAt).toBe("2026-07-30T12:00:00Z");
    expect(p.lastContactAt).toBe("2026-07-30T12:00:00Z");
    expect(p.businessName).toBe("Kiosco Golden");
    expect(p.source).toBe("descubrimiento");
  });
  it("la supresión guarda identidad completa + claves ordenadas + firma", () => {
    const s = suprimirDescubierto(desc(), { id: "s-1", at: "2026-07-30", por: "Diego" });
    expect(s.nombre).toBe("Kiosco Golden");
    expect(s.direccion).toBe("El Salvador 4813, CABA");
    expect(s.claves).toEqual([...s.claves].sort());
    expect(s.claves).toContain("pid:PID_GOLDEN");
    expect(s.motivo).toBe("descartado en revisión");
    expect(s.por).toBe("Diego");
  });
  it("regla heredada P5: sin identidad suficiente NO se suprime", () => {
    const sinIdentidad = desc({ businessName: "X", address: "", web: "" });
    expect(puedeSuprimirse(sinIdentidad)).toBe(false);
    expect(() => suprimirDescubierto(sinIdentidad, { at: "2026-07-30" })).toThrow(/insuficiente/);
    expect(puedeSuprimirse(desc())).toBe(true);
  });
});
