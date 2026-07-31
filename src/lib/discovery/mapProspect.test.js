// mapProspect.test.js — el mapping RawBusiness → prospecto IZN contra la
// tabla §5 del contrato (docs/DISCOVERY_ENGINE_CONTRATO.md). Acá no hay
// equivalencia con la referencia: el contrato ES la especificación.
import { describe, it, expect } from "vitest";
import { rawToProspect } from "./mapProspect.js";

const RAW = {
  nombre: "Maxikiosco El Sol", categoria: "Kiosco",
  direccion: "El Salvador 4813, CABA", telefono: "+54 11 4831-0000",
  web: "https://elsol.com.ar/", email: "sol@elsol.com.ar",
  rating: 4.6, reviews_count: 89, horarios_completos: "si",
  latitud: -34.588, longitud: -58.43,
  url_origen: "https://maps.google.com/?cid=123", id_externo: "PID_123",
};
const CTX = { zona: " Palermo ", termino: "kiosco", ubicacion: "Palermo, CABA, Argentina", fecha: "2026-07-30" };

describe("rawToProspect — tabla §5 del contrato", () => {
  const p = rawToProspect({ raw: RAW, claves: ["nd:x|y", "url:z"], red: "" }, CTX);

  it("campos del alta manual de Pipeline", () => {
    expect(p.businessName).toBe("Maxikiosco El Sol");
    expect(p.address).toBe("El Salvador 4813, CABA");
    expect(p.phone).toBe("+54 11 4831-0000");
    expect(p.zone).toBe("Palermo");            // del JOB, con trim — no de la dirección
    expect(p.pipelineStage).toBe("prospecto");
  });
  it("contactName SIEMPRE vacío: fit_decisor debe rendir 'no' honestamente", () => {
    expect(p.contactName).toBe("");
  });
  it("source 'descubrimiento' (op_referido no se ve afectada)", () => {
    expect(p.source).toBe("descubrimiento");
  });
  it("lat/lng viajan (el port los recupera; la referencia los perdía)", () => {
    expect(p.lat).toBe(-34.588);
    expect(p.lng).toBe(-58.43);
  });
  it("lat/lng ausentes degradan a cadena vacía (shape del form)", () => {
    const sin = rawToProspect({ raw: { ...RAW, latitud: null, longitud: null }, claves: [], red: "" }, CTX);
    expect(sin.lat).toBe("");
    expect(sin.lng).toBe("");
  });
  it("procedencia completa (espíritu P1)", () => {
    expect(p.via).toBe("google_maps");
    expect(p.descubiertoTermino).toBe("kiosco");
    expect(p.descubiertoEn).toBe("Palermo, CABA, Argentina");
    expect(p.descubiertoAt).toBe("2026-07-30");
    expect(p.placeId).toBe("PID_123");
    expect(p.urlOrigen).toBe("https://maps.google.com/?cid=123");
    expect(p.clavesIdentidad).toEqual(["nd:x|y", "url:z"]);
  });
  it("passthrough para calibración futura (hoy NO alimentan señales)", () => {
    expect(p.web).toBe("https://elsol.com.ar/");
    expect(p.categoria).toBe("Kiosco");
    expect(p.email).toBe("sol@elsol.com.ar");
    expect(p.rating).toBe(4.6);
    expect(p.reviewsCount).toBe(89);
    expect(p.horariosCompletos).toBe("si");
    expect(p.redSocial).toBe("");
  });
  it("red social detectada viaja como etiqueta, la URL queda en web", () => {
    const conRed = rawToProspect(
      { raw: { ...RAW, web: "https://www.instagram.com/elsol/" }, claves: [], red: "instagram" }, CTX);
    expect(conRed.redSocial).toBe("instagram");
    expect(conRed.web).toBe("https://www.instagram.com/elsol/");
  });
  it("sin id ni createdAt: los pone el import al confirmar Diego", () => {
    expect(p.id).toBeUndefined();
    expect(p.createdAt).toBeUndefined();
  });
});
