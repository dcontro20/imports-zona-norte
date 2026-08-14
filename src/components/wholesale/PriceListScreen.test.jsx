// PriceListScreen.test.jsx — la pantalla de la lista publicada.
// Cubre lo que se agregó el 14/08/2026: los modelos sin stock siguen VISIBLES
// (marcados "a pedido") y la vista interna de costos arranca APAGADA.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PriceListScreen } from "./PriceListScreen.jsx";
import { AppContext } from "../../AppContext.js";
import { construirSnapshot } from "../../lib/priceLists.js";
import { DEFAULT_PRICING_POLICY } from "../../lib/pricingPolicy.js";

afterEach(cleanup);

const LISTA = construirSnapshot({
  productosMotor: [
    { id: "Elfbar|TE", marca: "Elfbar", modelo: "TE", costo: 9.5, productIds: ["a"], sabores: 1 },
    { id: "Ignite|V500", marca: "Ignite", modelo: "V500", costo: 12, productIds: ["b"], sabores: 1 },
  ],
  politica: DEFAULT_PRICING_POLICY,
  version: "v2026-08",
  fecha: "2026-08-14T12:00:00.000Z",
});

const PRODUCTS = [
  { id: "a", brand: "Elfbar", model: "TE", flavor: "Menta", stock: 5, costUSDT: 9.5 },
  { id: "b", brand: "Ignite", model: "V500", flavor: "A definir", stock: 0, costUSDT: 12 },
];

const renderScreen = (props = {}) => render(
  <AppContext.Provider value={{ exchangeRate: 1000, currentUser: { name: "Gustavo" } }}>
    <PriceListScreen
      products={PRODUCTS}
      priceLists={[LISTA]}
      setPriceLists={vi.fn()}
      pricingPolicy={DEFAULT_PRICING_POLICY}
      {...props}
    />
  </AppContext.Provider>
);

describe("PriceListScreen — la lista dejó de ser el inventario", () => {
  it("muestra los modelos SIN stock, marcados a pedido (no los oculta)", () => {
    renderScreen();
    expect(screen.getByText("TE")).toBeTruthy();
    expect(screen.getByText("V500")).toBeTruthy();          // stock 0 y ahí está
    expect(screen.getByText(/a pedido/)).toBeTruthy();
    expect(screen.queryByText(/sin stock/)).toBeNull();
  });

  it("el selector dice cuántos modelos lleva cada mensaje", () => {
    renderScreen();
    expect(screen.getByText(/Catálogo \(2\)/)).toBeTruthy();
    expect(screen.getByText(/Stock \(1\)/)).toBeTruthy();   // V500 no tiene
  });

  it("con stock inmediato en cero, avisa en vez de dejar un botón muerto", () => {
    renderScreen({ products: [{ ...PRODUCTS[0], stock: 0 }, PRODUCTS[1]] });
    fireEvent.click(screen.getByText(/Stock \(0\)/));
    expect(screen.getByText(/no hay stock inmediato de ningún modelo/)).toBeTruthy();
  });
});

describe("PriceListScreen — vista interna de costos", () => {
  it("arranca APAGADA: ningún costo en pantalla hasta pedirlo", () => {
    renderScreen();
    expect(screen.queryAllByText("COSTO PROV.")).toHaveLength(0);
    expect(screen.getByText("👁 Ver costos")).toBeTruthy();
  });

  it("al prenderla aparecen costo proveedor, costo real y margen del primer escalón", () => {
    renderScreen();
    fireEvent.click(screen.getByText("👁 Ver costos"));
    // Un header por marca (Elfbar + Ignite): la tabla es por card.
    expect(screen.getAllByText("COSTO PROV.")).toHaveLength(2);
    expect(screen.getAllByText("COSTO REAL")).toHaveLength(2);
    expect(screen.getAllByText(/MARGEN 20–49/)).toHaveLength(2);
    const filaTE = LISTA.filas.find(f => f.id === "Elfbar|TE");
    expect(screen.getByText(filaTE.costo.toFixed(2))).toBeTruthy();      // costo proveedor
    expect(screen.getByText(filaTE.costoReal.toFixed(2))).toBeTruthy();  // + 13% de envío
    expect(screen.getByText(`${(filaTE.precios[0].margenReal * 100).toFixed(1)}%`)).toBeTruthy();
    expect(screen.getByText(/Vista interna/)).toBeTruthy();
  });
});
