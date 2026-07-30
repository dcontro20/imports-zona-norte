// identity.test.js — unit sintéticos de slug/clavesDe/redDe.
// La equivalencia con la referencia (Atlas) vive en izn_discovery.golden.test.js;
// acá van los bordes que la fixture podría no traer.
import { describe, it, expect } from "vitest";
import { slug, clavesDe, redDe } from "./identity.js";

describe("slug — ascii-fold + minúsculas + colapso", () => {
  it("pliega acentos y eñes", () => {
    expect(slug("Kiosco Ñandú Café")).toBe("kiosco-nandu-cafe");
  });
  it("colapsa símbolos y espacios múltiples en un solo guión", () => {
    expect(slug("El Kiosco!!  & Cía.")).toBe("el-kiosco-cia");
  });
  it("sin guiones en los bordes", () => {
    expect(slug("  ¡Hola!  ")).toBe("hola");
  });
  it("caracteres no plegables a ascii se descartan", () => {
    expect(slug("Kiosco 💨 24hs")).toBe("kiosco-24hs");
  });
  it("vacío y null dan cadena vacía", () => {
    expect(slug("")).toBe("");
    expect(slug(null)).toBe("");
  });
});

describe("redDe — red social como web (semántica netloc de urlparse)", () => {
  it("detecta las cuatro plataformas del catálogo", () => {
    expect(redDe("https://www.facebook.com/kiosco")).toBe("facebook");
    expect(redDe("https://instagram.com/kiosco/")).toBe("instagram");
    expect(redDe("https://www.tiktok.com/@kiosco")).toBe("tiktok");
    expect(redDe("https://linktr.ee/kiosco")).toBe("linktree");
  });
  it("subdominios cuentan (m.facebook.com)", () => {
    expect(redDe("https://m.facebook.com/kiosco")).toBe("facebook");
  });
  it("SIN esquema no hay netloc para urlparse ⇒ no es red (comportamiento heredado)", () => {
    expect(redDe("facebook.com/kiosco")).toBe("");
  });
  it("scheme-relative sí tiene netloc", () => {
    expect(redDe("//instagram.com/kiosco")).toBe("instagram");
  });
  it("dominios que solo CONTIENEN el nombre no matchean", () => {
    expect(redDe("https://mifacebook.com.ar/")).toBe("");
    expect(redDe("https://notiktok.com/")).toBe("");
  });
  it("web normal y vacío dan cadena vacía", () => {
    expect(redDe("https://kiosco.com.ar/")).toBe("");
    expect(redDe("")).toBe("");
  });
});

describe("clavesDe — identidad del negocio", () => {
  it("web ⇒ clave url: en minúsculas y sin barras finales", () => {
    expect([...clavesDe("https://Kiosco.com.AR///", "", "")])
      .toEqual(["url:https://kiosco.com.ar"]);
  });
  it("nombre+dirección ⇒ clave nd: slugificada", () => {
    expect([...clavesDe("", "Kiosco Ñandú", "Thames 1800, CABA")])
      .toEqual(["nd:kiosco-nandu|thames-1800-caba"]);
  });
  it("nombre sin dirección (o viceversa) NO genera clave nd", () => {
    expect(clavesDe("", "Kiosco Solo", "").size).toBe(0);
    expect(clavesDe("", "", "Thames 1800").size).toBe(0);
  });
  it("con todo, genera ambas claves", () => {
    const claves = clavesDe("https://k.com", "Kiosco", "Thames 1800");
    expect(claves.size).toBe(2);
    expect(claves.has("url:https://k.com")).toBe(true);
    expect(claves.has("nd:kiosco|thames-1800")).toBe(true);
  });
  it("sin web y sin nombre+dirección: identidad vacía (no rastreable)", () => {
    expect(clavesDe("", "", "").size).toBe(0);
  });
});
