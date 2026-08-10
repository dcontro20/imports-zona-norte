// whatsappPhone.test.js — la tabla de casos del handoff 2026-08-10 es el
// contrato: si alguno de esos pares cambia, cambió la función equivocada.
// Además: los bordes que el handoff decide (null antes que un link a otro
// número) y el builder del link (wa.me mobile / web.whatsapp.com desktop).
import { describe, it, expect } from "vitest";
import { normalizarWhatsApp, buildWaUrl } from "./whatsappPhone.js";

describe("normalizarWhatsApp — tabla de casos del handoff", () => {
  const TABLA = [
    ["011 2363-1422", "5491123631422"],
    ["01123631422", "5491123631422"],
    ["11 2709-0000", "5491127090000"],
    ["+54 9 11 2733-4673", "5491127334673"],
    ["0221 15 456-7890", "5492214567890"],
    ["4321-1000", null], // sin área: no identifica un destino
  ];
  it.each(TABLA)("%s → %s", (input, esperado) => {
    expect(normalizarWhatsApp(input)).toBe(esperado);
  });
});

describe("normalizarWhatsApp — bordes", () => {
  it("vacío / null / undefined → null", () => {
    expect(normalizarWhatsApp("")).toBe(null);
    expect(normalizarWhatsApp(null)).toBe(null);
    expect(normalizarWhatsApp(undefined)).toBe(null);
  });

  it("sin ningún dígito → null", () => {
    expect(normalizarWhatsApp("sin teléfono")).toBe(null);
  });

  it("ya internacional (549...) pasa intacto, con o sin decoración", () => {
    expect(normalizarWhatsApp("5491123631422")).toBe("5491123631422");
    expect(normalizarWhatsApp("+54 9 221 456-7890")).toBe("5492214567890");
  });

  it("54 sin el 9 (formato fijo internacional) también normaliza", () => {
    expect(normalizarWhatsApp("54 11 2363 1422")).toBe("5491123631422");
    expect(normalizarWhatsApp("+54 221 456 7890")).toBe("5492214567890");
  });

  it("interior con 0 y 15 en el mismo número", () => {
    expect(normalizarWhatsApp("0341 15 555-1234")).toBe("5493415551234");
  });

  it("demasiado corto o demasiado largo → null", () => {
    expect(normalizarWhatsApp("12345678")).toBe(null); // 8 dígitos
    expect(normalizarWhatsApp("111234567890")).toBe(null); // 12 dígitos
  });

  it("edge aceptado: abonado que empieza con 15 tras el área → null (no un link a otro número)", () => {
    // "1115234567" es indistinguible del formato viejo con 15: la regla lo
    // recorta y el check de largo lo rechaza. Documentado en el handoff/F1.
    expect(normalizarWhatsApp("11 1523-4567")).toBe(null);
  });

  it("acepta números (no solo strings)", () => {
    expect(normalizarWhatsApp(1123631422)).toBe("5491123631422");
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
