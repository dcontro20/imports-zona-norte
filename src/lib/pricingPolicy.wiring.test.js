// pricingPolicy.wiring.test.js — invariante de CABLEADO de la política.
//
// Clase del bug (encontrada al verificar la recalibración de la alerta): la
// política puede llegar con un esquema viejo — del caché de localStorage o de
// un appData/pricingPolicy escrito por una versión anterior. Si se reparte
// CRUDA, un campo agregado después llega `undefined` y apaga su función en
// silencio. Con la alerta de margen el síntoma es especialmente traicionero:
// "no hay badges" se lee igual que "está bien calibrada".
//
// Igual que los invariantes B1/B3, se verifica sobre el FUENTE: App.jsx tiene
// que normalizar antes de repartir, y ninguna pantalla puede recibir el objeto
// crudo del hook.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizarPolitica, DEFAULT_PRICING_POLICY } from "./pricingPolicy.js";
import { calcularProducto, validarProducto } from "./pricingEngine.js";

const app = readFileSync(join(process.cwd(), "src", "App.jsx"), "utf8");

describe("cableado de pricingPolicy en App", () => {
  it("App normaliza la política antes de repartirla", () => {
    expect(app).toMatch(/normalizarPolitica\(pricingPolicyRaw\)/);
    // El objeto crudo del hook no se pasa a ninguna pantalla.
    expect(app).not.toMatch(/pricingPolicy=\{pricingPolicyRaw\}/);
  });

  it("ninguna pantalla recibe otra cosa que la política normalizada", () => {
    const usos = [...app.matchAll(/pricingPolicy=\{(\w+)\}/g)].map((m) => m[1]);
    expect(usos.length).toBeGreaterThan(0);
    expect([...new Set(usos)]).toEqual(["pricingPolicy"]);
  });
});

describe("una política vieja normalizada mantiene viva la alerta de margen", () => {
  it("el esquema previo (margenAlerta absoluto) sale con margenAlertaPuntos", () => {
    // Exactamente lo que quedó cacheado en el navegador antes del cambio.
    const vieja = { ...DEFAULT_PRICING_POLICY, margenAlertaPuntos: undefined, margenAlerta: 0.2 };
    const normalizada = normalizarPolitica(vieja);
    expect(normalizada.margenAlertaPuntos).toBe(0.02);
    expect(normalizada.margenAlerta).toBeUndefined();
  });

  it("sin normalizar, la alerta queda APAGADA (el falso 'está calibrada')", () => {
    const cruda = { ...DEFAULT_PRICING_POLICY, margenAlertaPuntos: undefined };
    const precios = [{ desde: 20, hasta: null, margen: 0.28, precio: 13.5, margenReal: 0.2 }];
    // Con la política cruda no alerta aunque el margen esté 8 puntos abajo...
    const { alertas } = calcularProducto({ id: "x", costo: 8.5 }, cruda);
    expect(alertas).toEqual([]);
    // ...y con la normalizada, el mismo caso sí se ve.
    const { alertas: conNormalizar } = validarProducto({ id: "x" }, precios, normalizarPolitica(cruda));
    expect(conNormalizar.some((a) => a.regla === "margenAlerta")).toBe(true);
  });
});
