// whatsappPhone.test.js — la matriz de formatos argentinos reales es el
// contrato (gate F2): si alguno de estos pares cambia, cambió la función
// equivocada. Regla de oro: el 15 se saca SOLO cuando la estructura (12
// dígitos = área + 15 + abonado) lo delata como prefijo; jamás por aparecer
// en una posición. Lo indeterminable → null, nunca un link a otro número.
import { describe, it, expect } from "vitest";
import { normalizarWhatsApp, buildWaUrl } from "./whatsappPhone.js";

describe("normalizarWhatsApp — matriz de formatos argentinos", () => {
  const MATRIZ = [
    // --- AMBA (área 11), con y sin 0, decoraciones ---
    ["011 2363-1422", "5491123631422"],
    ["01123631422", "5491123631422"],
    ["11 2709-0000", "5491127090000"],
    ["011 4415-8435", "5491144158435"], // el caso Pocho: 15 INTERNO del abonado, se queda
    ["11 1523-4567", "5491115234567"],  // abonado que EMPIEZA con 15: 10 dígitos completos, se queda
    ["(011) 15-2363-1422", "5491123631422"], // 0 + área + 15 + abonado, con paréntesis y guiones
    // --- Interior: áreas de 3 dígitos ---
    ["0221 15 456-7890", "5492214567890"],  // La Plata, 0 + área + 15
    ["0221 456-7890", "5492214567890"],     // La Plata sin 15
    ["0341 15 555-1234", "5493415551234"],  // Rosario
    ["341 555-1234", "5493415551234"],      // Rosario sin 0 ni 15
    ["351 15 123-4567", "5493511234567"],   // Córdoba sin 0, con 15
    ["0261 15 612-3456", "5492616123456"],  // Mendoza
    // --- Interior: áreas de 4 dígitos ---
    ["02320 15 46-1234", "5492320461234"],  // José C. Paz, 0 + área + 15
    ["02320 46-1234", "5492320461234"],     // sin 15
    // --- Internacionales ---
    ["+54 9 11 2733-4673", "5491127334673"],
    ["54 9 11 2733-4673", "5491127334673"],
    ["+54 11 2363-1422", "5491123631422"],    // sin el 9 (formato fijo)
    ["0054 9 11 2733-4673", "5491127334673"], // doble cero
    ["+54 9 341 555-1234", "5493415551234"],  // móvil internacional del interior
    ["+54 9 11 15 2733-4673", "5491127334673"], // el 15 de más pegado al formato internacional
    ["5491123631422", "5491123631422"],       // ya normalizado pasa intacto
    // --- Indeterminables o incompletos → null ---
    ["4321-1000", null],        // sin área
    ["15 2733-4673", null],     // celular "local" sin área: incompleto
    ["011 2363-142", null],     // 9 dígitos: le falta uno
    ["011 2363-14221", null],   // 11 dígitos: le sobra uno
    ["111234567890", null],     // 12 dígitos sin un 15 identificable
    ["4123456789", null],       // 10 dígitos con área inexistente (empieza con 4)
    ["1523631422", null],       // 10 dígitos que empiezan con 15: no hay área 15
  ];
  it.each(MATRIZ)("%s → %s", (input, esperado) => {
    expect(normalizarWhatsApp(input)).toBe(esperado);
  });
});

describe("normalizarWhatsApp — bordes", () => {
  it("vacío / null / undefined / sin dígitos → null", () => {
    expect(normalizarWhatsApp("")).toBe(null);
    expect(normalizarWhatsApp(null)).toBe(null);
    expect(normalizarWhatsApp(undefined)).toBe(null);
    expect(normalizarWhatsApp("sin teléfono")).toBe(null);
  });

  it("acepta números (no solo strings)", () => {
    expect(normalizarWhatsApp(1123631422)).toBe("5491123631422");
  });

  it("basura larga → null", () => {
    expect(normalizarWhatsApp("111111111111111")).toBe(null);
  });
});

describe("buildWaUrl", () => {
  const TEL = "5491123631422";

  it("desktop → web.whatsapp.com/send con phone y text", () => {
    expect(buildWaUrl(TEL, "Hola, ¿cómo va?")).toBe(
      `https://web.whatsapp.com/send?phone=${TEL}&text=${encodeURIComponent("Hola, ¿cómo va?")}`,
    );
  });

  it("mobile → wa.me con deep-link directo", () => {
    expect(buildWaUrl(TEL, "Hola", { isMobile: true })).toBe(
      `https://wa.me/${TEL}?text=Hola`,
    );
  });

  it("sin texto no arrastra un text= vacío", () => {
    expect(buildWaUrl(TEL)).toBe(`https://web.whatsapp.com/send?phone=${TEL}`);
    expect(buildWaUrl(TEL, "", { isMobile: true })).toBe(`https://wa.me/${TEL}`);
  });

  it("texto con saltos de línea y emojis viaja URL-encoded", () => {
    const url = buildWaUrl(TEL, "Hola!\n¿Trabajan vapes? 🙂", { isMobile: true });
    expect(url).toContain("%0A"); // el salto de línea sobrevive
    expect(url).not.toContain("\n");
    expect(decodeURIComponent(url.split("?text=")[1])).toBe("Hola!\n¿Trabajan vapes? 🙂");
  });

  it("sin número válido → null (el llamador esconde el botón, no arma un link roto)", () => {
    expect(buildWaUrl(null, "Hola")).toBe(null);
    expect(buildWaUrl("", "Hola")).toBe(null);
  });
});
