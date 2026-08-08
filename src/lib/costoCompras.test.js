// costoCompras.test.js — la referencia de Compras para el costo de reposición
// (decisión #3: la ficha es la fuente; Compras es referencia con warning).
import { describe, it, expect } from "vitest";
import { ultimoCostoCompra, driftCostoFicha } from "./costoCompras.js";

const compra = (over = {}) => ({
  id: "c1", date: "2026-08-01", status: "verificado",
  items: [{ productId: "p1", qty: 10, unitCostUSDT: 8.5 }],
  ...over,
});

describe("ultimoCostoCompra", () => {
  it("devuelve el costo de la compra más reciente recibida/verificada", () => {
    const purchases = [
      compra({ id: "vieja", date: "2026-06-01", items: [{ productId: "p1", qty: 5, unitCostUSDT: 8 }] }),
      compra({ id: "nueva", date: "2026-08-01", items: [{ productId: "p1", qty: 10, unitCostUSDT: 8.75 }] }),
      compra({ id: "recibida", date: "2026-07-15", status: "recibido", items: [{ productId: "p1", qty: 3, unitCostUSDT: 8.4 }] }),
    ];
    expect(ultimoCostoCompra("p1", purchases)).toEqual({ costo: 8.75, fecha: "2026-08-01", purchaseId: "nueva" });
  });
  it("ignora compras en tránsito, canceladas, borradas o sin el producto", () => {
    const purchases = [
      compra({ id: "pedida", status: "pedido", date: "2026-08-05", items: [{ productId: "p1", qty: 5, unitCostUSDT: 9.5 }] }),
      compra({ id: "camino", status: "en_camino", date: "2026-08-04", items: [{ productId: "p1", qty: 5, unitCostUSDT: 9.4 }] }),
      compra({ id: "cancelada", status: "cancelado", date: "2026-08-03", items: [{ productId: "p1", qty: 5, unitCostUSDT: 9.3 }] }),
      compra({ id: "borrada", isDeleted: true, date: "2026-08-02", items: [{ productId: "p1", qty: 5, unitCostUSDT: 9.2 }] }),
      compra({ id: "otra", date: "2026-08-06", items: [{ productId: "p2", qty: 5, unitCostUSDT: 7 }] }),
      compra({ id: "ok", date: "2026-07-01", items: [{ productId: "p1", qty: 5, unitCostUSDT: 8.5 }] }),
    ];
    expect(ultimoCostoCompra("p1", purchases)?.purchaseId).toBe("ok");
  });
  it("sin compras del producto ⇒ null (la ficha no muestra referencia)", () => {
    expect(ultimoCostoCompra("p9", [compra()])).toBeNull();
    expect(ultimoCostoCompra("p1", [])).toBeNull();
    expect(ultimoCostoCompra("p1", null)).toBeNull();
  });
  it("item con costo 0 no cuenta como referencia", () => {
    expect(ultimoCostoCompra("p1", [compra({ items: [{ productId: "p1", qty: 5, unitCostUSDT: 0 }] })])).toBeNull();
  });
});

describe("driftCostoFicha", () => {
  it("marca fuera de umbral cuando el último lote difiere más que el umbral de recálculo", () => {
    // Ficha 8.5, último lote 8.9 = +4,7% > 3% ⇒ el costo de reposición está viejo.
    const drift = driftCostoFicha(8.5, 8.9, 0.03);
    expect(drift.fueraDeUmbral).toBe(true);
    expect(drift.pct).toBeCloseTo(0.4 / 8.5, 10);
  });
  it("dentro del umbral no alarma (el margen lo absorbe — mismo criterio que RN-13)", () => {
    expect(driftCostoFicha(8.5, 8.67, 0.03).fueraDeUmbral).toBe(false);
    expect(driftCostoFicha(8.5, 8.5, 0.03).fueraDeUmbral).toBe(false);
  });
  it("sin alguno de los dos datos ⇒ null (no hay qué comparar)", () => {
    expect(driftCostoFicha(0, 8.9, 0.03)).toBeNull();
    expect(driftCostoFicha(8.5, 0, 0.03)).toBeNull();
    expect(driftCostoFicha("", null, 0.03)).toBeNull();
  });
});
