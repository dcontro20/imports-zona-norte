// discoverRun.test.js — unit sintéticos del runner puro por inyección.
// La equivalencia de decisiones con la referencia (corrida real + replay) vive
// en izn_discovery.golden.test.js.
import { describe, it, expect } from "vitest";
import { discoverRun, validarBusqueda, TOPE_DEFAULT, TOPE_MAX } from "./discoverRun.js";

const raw = (nombre, extra = {}) => ({
  nombre, categoria: "", direccion: "", telefono: "", web: "", email: "",
  rating: null, reviews_count: null, horarios_completos: "sin_datos",
  latitud: null, longitud: null, url_origen: "", id_externo: "", ...extra,
});

describe("validarBusqueda — el validate_encargo de IZN", () => {
  const ok = { termino: "kiosco", ubicacion: "Palermo, CABA", zona: "Palermo", tope: 60 };
  it("búsqueda completa: sin problemas", () => {
    expect(validarBusqueda(ok)).toEqual([]);
  });
  it("término, ubicación y zona son obligatorios", () => {
    expect(validarBusqueda({ ...ok, termino: "  " })).toHaveLength(1);
    expect(validarBusqueda({ ...ok, ubicacion: "" })).toHaveLength(1);
    expect(validarBusqueda({ ...ok, zona: "" })).toHaveLength(1);
  });
  it("tope: entero positivo hasta el techo anti-crawling", () => {
    expect(validarBusqueda({ ...ok, tope: 0 })).toHaveLength(1);
    expect(validarBusqueda({ ...ok, tope: 30.5 })).toHaveLength(1);
    expect(validarBusqueda({ ...ok, tope: TOPE_MAX })).toEqual([]);
    expect(validarBusqueda({ ...ok, tope: TOPE_MAX + 1 })).toHaveLength(1);
  });
  it("vacía junta todos los problemas", () => {
    expect(validarBusqueda({}).length).toBeGreaterThanOrEqual(4);
  });
});

describe("discoverRun — decisiones", () => {
  it("P2: el tope manda aunque vengan más raws", () => {
    const raws = [raw("A", { direccion: "D 1" }), raw("B", { direccion: "D 2" }), raw("C", { direccion: "D 3" })];
    const res = discoverRun({ raws, tope: 2 });
    expect(res.descubiertos.map(d => d.raw.nombre)).toEqual(["A", "B"]);
  });
  it("dedup INTERNO del mismo run: el segundo avistaje es duplicado", () => {
    const res = discoverRun({
      raws: [raw("Kiosco X", { direccion: "Thames 1800" }), raw("Kiosco X", { direccion: "Thames 1800" })],
      tope: 10,
    });
    expect(res.descubiertos).toHaveLength(1);
    expect(res.saltadosDuplicados).toBe(1);
  });
  it("identidades inyectadas (prospectos/clientes vivos) ⇒ duplicado", () => {
    const res = discoverRun({
      raws: [raw("Kiosco X", { direccion: "Thames 1800" })],
      tope: 10,
      existentes: ["nd:kiosco-x|thames-1800"],
    });
    expect(res.descubiertos).toHaveLength(0);
    expect(res.saltadosDuplicados).toBe(1);
  });
  it("P5: suprimido por nombre+dirección y por web; se chequea ANTES que duplicado", () => {
    const res = discoverRun({
      raws: [
        raw("Kiosco Malo", { direccion: "Calle 1" }),
        raw("Otro", { web: "https://otro.com/", direccion: "Calle 2" }),
        raw("Kiosco Bueno", { direccion: "Calle 3" }),
      ],
      tope: 10,
      // El primero además ya existe: la supresión gana igual (orden heredado).
      existentes: ["nd:kiosco-malo|calle-1"],
      suprimidos: [
        { nombre: "Kiosco Malo", direccion: "Calle 1" },
        { web: "https://otro.com" },
      ],
    });
    expect(res.saltadosSuprimidos).toBe(2);
    expect(res.saltadosDuplicados).toBe(0);
    expect(res.descubiertos.map(d => d.raw.nombre)).toEqual(["Kiosco Bueno"]);
  });
  it("red-como-web: el descubierto sale etiquetado con la plataforma", () => {
    const res = discoverRun({
      raws: [raw("Kiosco Insta", { web: "https://www.instagram.com/k/", direccion: "Gorriti 5500" })],
      tope: 10,
    });
    expect(res.descubiertos[0].red).toBe("instagram");
  });
  it("claves del descubierto salen ordenadas (determinismo)", () => {
    const res = discoverRun({
      raws: [raw("Kiosco X", { web: "https://x.com", direccion: "Thames 1800" })],
      tope: 10,
    });
    const claves = res.descubiertos[0].claves;
    expect(claves).toEqual([...claves].sort());
    expect(claves).toHaveLength(2);
  });
  it("fail-loud: raw sin nombre es bug del proveedor ⇒ excepción", () => {
    expect(() => discoverRun({ raws: [raw("  ")], tope: 10 })).toThrow(/fail-loud/);
  });
  it("sin raws (o sin args) devuelve resultado vacío con defaults", () => {
    const res = discoverRun();
    expect(res).toEqual({ descubiertos: [], saltadosSuprimidos: 0, saltadosDuplicados: 0 });
    expect(TOPE_DEFAULT).toBe(60);
  });
});
