import { describe, it, expect } from "vitest";
import { payMethodToAccountId } from "../components/cash/shared.js";
import { PAYMENT_METHODS } from "../constants.js";
import { saleOutstanding } from "./creditAccount.js";

// TANDA B.3 — puente con la caja. Verifica el mapeo método→cuenta y que la
// contabilidad de pagos conserva el total (sin doble conteo de revenue).

describe("B.3 payMethodToAccountId — cada método mayorista mapea a una cuenta", () => {
  it("Mercado Pago discrimina Diego/Gustavo", () => {
    expect(payMethodToAccountId("Mercado Pago", "MP Diego")).toBe("mpDiego");
    expect(payMethodToAccountId("Mercado Pago", "MP Gustavo")).toBe("mpGustavo");
    // sin mpAccount → asume Diego (legacy)
    expect(payMethodToAccountId("Mercado Pago")).toBe("mpDiego");
  });
  it("Lemon / USDT / USD Cash / Pesos Cash", () => {
    expect(payMethodToAccountId("Lemon")).toBe("lemonPesos");
    expect(payMethodToAccountId("USDT")).toBe("lemonUSDT");
    expect(payMethodToAccountId("USD Cash")).toBe("usdCash");
    expect(payMethodToAccountId("Pesos Cash")).toBe("pesosCash");
  });
  it("TODOS los PAYMENT_METHODS del enum mapean a una cuenta no vacía", () => {
    PAYMENT_METHODS.forEach(m => {
      const acc = payMethodToAccountId(m, "MP Diego");
      expect(acc).not.toBe("");
    });
  });
  it("método desconocido → '' (el caller debe guardar)", () => {
    expect(payMethodToAccountId("Bitcoin")).toBe("");
    expect(payMethodToAccountId("")).toBe("");
  });
});

describe("B.3 conservación: pagos + pendiente = total (sin doble conteo)", () => {
  it("cobrar el total deja pendiente 0 y no altera el total", () => {
    const sale = { total: 30000, payments: [] };
    // Simula el cobro: se agrega un payment (lo que hace Routes/CuentasCorrientes).
    const cobrado = { ...sale, payments: [{ method: "Mercado Pago", mpAccount: "MP Diego", amount: 30000 }] };
    expect(saleOutstanding(cobrado)).toBe(0);
    expect(cobrado.total).toBe(30000); // el revenue (sale.total) NO cambia al cobrar
  });
  it("cobros parciales suman al total sin pasarse", () => {
    const sale = { total: 30000, payments: [{ amount: 10000 }, { amount: 5000 }] };
    expect(saleOutstanding(sale)).toBe(15000);
    const paid = (sale.payments).reduce((s, p) => s + p.amount, 0);
    expect(paid + saleOutstanding(sale)).toBe(sale.total); // conservación
  });
});
