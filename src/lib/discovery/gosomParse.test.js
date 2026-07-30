// gosomParse.test.js — unit sintéticos de las mañas del parser.
// La equivalencia registro-a-registro con la referencia está en
// izn_discovery.golden.test.js.
import { describe, it, expect } from "vitest";
import { parseGosomRecord } from "./gosomParse.js";

describe("parseGosomRecord — mañas heredadas de la referencia", () => {
  it("rating 0 ⇒ null (igual que sin rating); rating real se conserva", () => {
    expect(parseGosomRecord({ review_rating: 0 }).rating).toBe(null);
    expect(parseGosomRecord({ review_rating: 4.5 }).rating).toBe(4.5);
    expect(parseGosomRecord({}).rating).toBe(null);
  });
  it("review_count 0 SÍ se conserva (0 reseñas es un hecho); decimal trunca", () => {
    expect(parseGosomRecord({ review_count: 0 }).reviews_count).toBe(0);
    expect(parseGosomRecord({ review_count: 3.7 }).reviews_count).toBe(3);
    expect(parseGosomRecord({}).reviews_count).toBe(null);
  });
  it("fallback al typo 'longtitude' de gosom", () => {
    expect(parseGosomRecord({ longtitude: -58.43 }).longitud).toBe(-58.43);
    expect(parseGosomRecord({ longitude: -58.42, longtitude: -1 }).longitud).toBe(-58.42);
    expect(parseGosomRecord({}).longitud).toBe(null);
    expect(parseGosomRecord({}).latitud).toBe(null);
  });
  it("horarios: 7 días ⇒ si · parciales ⇒ no · nada ⇒ sin_datos", () => {
    const siete = Object.fromEntries(
      ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => [d, ["9-18"]]));
    expect(parseGosomRecord({ open_hours: siete }).horarios_completos).toBe("si");
    expect(parseGosomRecord({ open_hours: { Mon: ["9-18"] } }).horarios_completos).toBe("no");
    expect(parseGosomRecord({ open_hours: {} }).horarios_completos).toBe("sin_datos");
    expect(parseGosomRecord({}).horarios_completos).toBe("sin_datos");
  });
  it("emails: toma el primero con trim; lista vacía ⇒ cadena vacía", () => {
    expect(parseGosomRecord({ emails: [" hola@k.com ", "otro@x.com"] }).email).toBe("hola@k.com");
    expect(parseGosomRecord({ emails: [] }).email).toBe("");
    expect(parseGosomRecord({}).email).toBe("");
  });
  it("strings ausentes o null ⇒ cadena vacía, con trim", () => {
    const rb = parseGosomRecord({ title: "  Kiosco X  ", address: null });
    expect(rb.nombre).toBe("Kiosco X");
    expect(rb.direccion).toBe("");
    expect(rb.telefono).toBe("");
    expect(rb.web).toBe("");
  });
  it("P6: lo no listado se descarta (reviews, fotos, owner no aparecen)", () => {
    const rb = parseGosomRecord({
      title: "K", user_reviews: ["texto"], images: ["x.jpg"], owner: { name: "N" },
      popular_times: {}, about: "...",
    });
    expect(Object.keys(rb).sort()).toEqual([
      "categoria", "direccion", "email", "horarios_completos", "id_externo",
      "latitud", "longitud", "nombre", "rating", "reviews_count", "telefono",
      "url_origen", "web",
    ]);
  });
});
