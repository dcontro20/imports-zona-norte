import { describe, it, expect } from "vitest";
// Módulos puros del pivote
import { orderMargin } from "./wholesale.js";
import { construirSnapshot, precioEnLista } from "./lib/priceLists.js";
import { DEFAULT_PRICING_POLICY } from "./lib/pricingPolicy.js";
import { PROSPECT_STAGES_ORDER } from "./prospecting.js";
import { pendingWholesaleOrders } from "./routes.js";
import { saleOutstanding, clientOutstanding, creditStatus, allocatePayment } from "./lib/creditAccount.js";
import { plByChannel, wholesaleKpis, committedUnits } from "./wholesaleIntelligence.js";
import { calcAccountBalance } from "./calcs.js";
// Caja (mismo mapeo que usa CashBox)
import { ACCOUNT_METHOD_MAP, payMethodToAccountId, normalizeType } from "./components/cash/shared.js";

// TANDA D — Tests de INTEGRACIÓN de flujos mayoristas a nivel de datos.
// Cada test replica exactamente las mutaciones que hacen los componentes
// (WholesaleOrder, Routes, Pipeline, CuentasCorrientes) y verifica que las piezas
// encajan: precio, stock, fulfillment, payments, caja, P&L. NO se toca lógica.

const RATE = 1000;
const nowISO = () => "2026-07-14T12:00:00.000Z";
// ctx de caja aislado (initialBalances en 0 para verificar el delta exacto)
const cashCtx = (sales, initial = {}) => ({
  sales, purchases: [], cashMovements: [],
  initialBalances: initial, accountMethodMap: ACCOUNT_METHOD_MAP,
  payMethodToAccountId, normalizeType,
});

// ============================================================================
describe("D.1 — flujo pedido → ruta → cobro (stock + fulfillment + caja)", () => {
  it("recorre todo el flujo con los números exactos", () => {
    // --- Setup ---
    let products = [{ id: "p1", brand: "Elfbar", model: "BC", flavor: "Sandía", priceUSD: 12, costUSDT: 6, stock: 100, priceByChannel: { mayorista_a: 10 } }];
    const client = { id: "c1", type: "mayorista", businessName: "Kiosco A" };
    let sales = [];
    let routes = [];

    // --- 1. WholesaleOrder (F5): precio desde la LISTA PUBLICADA al escalón ---
    const lista = construirSnapshot({
      productosMotor: [{ id: "Elfbar|BC", marca: "Elfbar", modelo: "BC", costo: 6, productIds: ["p1"], sabores: 1 }],
      politica: DEFAULT_PRICING_POLICY, version: "v2026-08", fecha: nowISO(),
    });
    const p1 = products[0];
    const qty = 25; // escalón 20-49 (≥ mínimo RN-08)
    const unitUSD = precioEnLista(lista, "Elfbar|BC", qty).precio;
    expect(unitUSD).toBe(9.5); // costo real 6×1.13=6.78 → /0.72 → redondeo ↑ 0.50
    const margin = orderMargin({ lines: [{ product: p1, qty, unitPriceUSD: unitUSD }] });
    const totalARS = Math.round(margin.totalRevenueUSD * RATE); // 9.5*25*1000
    expect(totalARS).toBe(237500);
    const saleId = "s1";
    const sale = {
      id: saleId, date: nowISO(), saleType: "mayorista", channel: "Mayorista",
      fulfillmentStatus: "pendiente", clientId: client.id, clientName: client.businessName,
      currency: "ARS", total: totalARS, payments: [], exchangeRate: RATE,
      listVersion: lista.version, escalonDesde: 20,
      items: [{ productId: "p1", qty, priceUSD: unitUSD, priceARS: Math.round(unitUSD * RATE), costUSDTAtSale: 6 }],
    };
    sales = [sale, ...sales];
    // descuento de stock (replica setProducts)
    products = products.map(p => p.id === "p1" ? { ...p, stock: p.stock - qty } : p);
    expect(products[0].stock).toBe(75);                   // 100 - 25

    // --- 2. Routes: meter en ruta (replica createRoute) ---
    const routeId = "r1";
    routes = [{ id: routeId, status: "planificada", stops: [{ clientId: "c1", orderId: "s1", order: 0, status: "pendiente" }] }];
    sales = sales.map(s => s.id === "s1" ? { ...s, routeId, fulfillmentStatus: "armado" } : s);
    expect(sales.find(s => s.id === "s1").fulfillmentStatus).toBe("armado");
    // ya no está pendiente de asignar a ruta
    expect(pendingWholesaleOrders(sales)).toHaveLength(0);

    // --- 3. Iniciar ruta (en_curso) → sale en_ruta (replica advanceRouteStatus) ---
    routes = routes.map(r => r.id === routeId ? { ...r, status: "en_curso" } : r);
    sales = sales.map(s => s.routeId === routeId && s.fulfillmentStatus !== "entregado" && s.fulfillmentStatus !== "cobrado" ? { ...s, fulfillmentStatus: "en_ruta" } : s);
    expect(sales.find(s => s.id === "s1").fulfillmentStatus).toBe("en_ruta");

    // --- 4. Marcar parada entregada (replica setStopStatus) ---
    sales = sales.map(s => s.id === "s1" ? { ...s, fulfillmentStatus: "entregado" } : s);
    expect(sales.find(s => s.id === "s1").fulfillmentStatus).toBe("entregado");

    // --- 5. Cobrar (replica confirmCobro) ---
    const outstanding = saleOutstanding(sales.find(s => s.id === "s1"));
    expect(outstanding).toBe(237500);
    const payment = { method: "Mercado Pago", mpAccount: "MP Diego", amount: 237500, date: nowISO() };
    sales = sales.map(s => s.id === "s1"
      ? { ...s, payments: [...s.payments, payment], fulfillmentStatus: saleOutstanding(s) - payment.amount <= 0 ? "cobrado" : "entregado" }
      : s);
    const finalSale = sales.find(s => s.id === "s1");
    expect(finalSale.fulfillmentStatus).toBe("cobrado");           // recorrió armado→en_ruta→entregado→cobrado
    expect(finalSale.payments).toHaveLength(1);
    expect(saleOutstanding(finalSale)).toBe(0);

    // --- 6. Puente con la caja: mpDiego subió 50000, mpGustavo intacto ---
    expect(calcAccountBalance("mpDiego", cashCtx(sales, { mpDiego: 0 }))).toBe(237500);
    expect(calcAccountBalance("mpGustavo", cashCtx(sales, { mpGustavo: 0 }))).toBe(0);
  });
});

// ============================================================================
describe("D.2 — flujo prospecto → conversión → cliente mayorista", () => {
  it("convierte y aparece en el listado de mayoristas", () => {
    let prospects = [{ id: "pr1", businessName: "Kiosco X", zone: "Palermo", contactName: "Ana", pipelineStage: "prospecto", foundAt: nowISO() }];
    let clients = [{ id: "c0", type: "minorista", name: "Retail" }];

    // avanzar el embudo (replica advanceProspect) prospecto→contactado→visitado
    const advance = (p) => { const i = PROSPECT_STAGES_ORDER.indexOf(p.pipelineStage); return PROSPECT_STAGES_ORDER[Math.min(i + 1, PROSPECT_STAGES_ORDER.length - 1)]; };
    prospects = prospects.map(p => ({ ...p, pipelineStage: advance(p) }));   // contactado
    prospects = prospects.map(p => ({ ...p, pipelineStage: advance(p) }));   // visitado
    expect(prospects[0].pipelineStage).toBe("visitado");

    // convertir (replica convert())
    const p = prospects[0];
    const newId = "c1";
    const newClient = {
      id: newId, type: "mayorista", name: p.contactName || p.businessName, businessName: p.businessName,
      businessType: null, zone: p.zone, pipelineStage: "primera_compra",
      tier: "regular", balance: 0, createdAt: nowISO(),
    };
    clients = [newClient, ...clients];
    prospects = prospects.map(x => x.id === p.id ? { ...x, convertedClientId: newId, isDeleted: true, deletedAt: nowISO() } : x);

    // verificaciones
    expect(newClient.type).toBe("mayorista");
    const prospectAfter = prospects.find(x => x.id === "pr1");
    expect(prospectAfter.isDeleted).toBe(true);
    expect(prospectAfter.convertedClientId).toBe("c1");
    // aparece en el listado de mayoristas (mismo filtro que Kioscos)
    const mayoristas = clients.filter(c => !c.isDeleted && c.type === "mayorista");
    expect(mayoristas.map(c => c.id)).toContain("c1");
    // ya no está en el pipeline activo
    const activeProspects = prospects.filter(x => !x.isDeleted && !x.convertedClientId);
    expect(activeProspects).toHaveLength(0);
  });
});

// ============================================================================
describe("D.3 — flujo cuenta corriente (fiado + pago parcial + caja)", () => {
  it("owed/disponible correctos, pago reparte más viejas primero y acredita caja", () => {
    const client = { id: "c1", type: "mayorista", creditEnabled: true, creditLimitARS: 100000, businessName: "Kiosco A" };
    const ago = (d) => new Date(new Date(nowISO()).getTime() - d * 86400000).toISOString();
    // dos pedidos a cuenta (payments vacío)
    let sales = [
      { id: "s1", saleType: "mayorista", clientId: "c1", total: 40000, payments: [], date: ago(40), fulfillmentStatus: "entregado" },
      { id: "s2", saleType: "mayorista", clientId: "c1", total: 20000, payments: [], date: ago(5), fulfillmentStatus: "entregado" },
    ];

    // estado inicial de crédito
    let st = creditStatus(client, sales);
    expect(st.owedARS).toBe(60000);
    expect(st.availableARS).toBe(40000);   // 100000 - 60000
    expect(st.overLimit).toBe(false);

    // pago parcial de 45000 (replica confirmPay → allocatePayment + setSales)
    const { updates } = allocatePayment(client, sales, 45000);
    expect(updates).toEqual([
      { saleId: "s1", amount: 40000, fullyPaid: true },   // la más vieja primero, saldada
      { saleId: "s2", amount: 5000, fullyPaid: false },   // parcial
    ]);
    const byId = Object.fromEntries(updates.map(u => [u.saleId, u]));
    sales = sales.map(s => {
      const u = byId[s.id];
      if (!u) return s;
      const payment = { method: "Pesos Cash", amount: u.amount, date: nowISO() };
      return { ...s, payments: [...s.payments, payment], fulfillmentStatus: u.fullyPaid ? "cobrado" : s.fulfillmentStatus };
    });

    // owed después del pago = 15000 (60000 - 45000)
    expect(clientOutstanding(client, sales)).toBe(15000);
    expect(sales.find(s => s.id === "s1").fulfillmentStatus).toBe("cobrado");
    expect(sales.find(s => s.id === "s2").fulfillmentStatus).toBe("entregado"); // sigue debiendo 15000

    // caja: pesosCash subió 45000
    expect(calcAccountBalance("pesosCash", cashCtx(sales, { pesosCash: 0 }))).toBe(45000);
  });
});

// ============================================================================
describe("D.4 — consistencia de P&L (canales bien separados)", () => {
  it("plByChannel y wholesaleKpis dan los números exactos, sin mezclar canales", () => {
    const products = [{ id: "p1", costUSDT: 4 }];
    const d = "2026-07-10T12:00:00.000Z";
    const now = new Date(nowISO()).getTime();
    // 2 mayoristas (50000 + 20000) + 1 minorista (10000)
    const sales = [
      { id: "m1", saleType: "mayorista", clientId: "c1", total: 50000, exchangeRate: RATE, date: d, items: [{ productId: "p1", qty: 5, costUSDTAtSale: 4 }] },
      { id: "m2", saleType: "mayorista", clientId: "c2", total: 20000, exchangeRate: RATE, date: d, items: [{ productId: "p1", qty: 2, costUSDTAtSale: 4 }] },
      { id: "r1", saleType: "minorista", clientId: "c3", total: 10000, exchangeRate: RATE, date: d, items: [{ productId: "p1", qty: 1, costUSDTAtSale: 4 }] },
    ];
    const clients = [{ id: "c1", type: "mayorista" }, { id: "c2", type: "mayorista" }, { id: "c3", type: "minorista" }];

    const pl = plByChannel(sales, { products, periodDays: 30, now });
    expect(pl.mayorista.revenueARS).toBe(70000);   // 50000 + 20000
    expect(pl.mayorista.cogsARS).toBe(28000);      // (5+2) × 4 × 1000
    expect(pl.mayorista.marginARS).toBe(42000);
    expect(pl.mayorista.orders).toBe(2);
    expect(pl.minorista.revenueARS).toBe(10000);   // NO mezcla
    expect(pl.minorista.cogsARS).toBe(4000);       // 1 × 4 × 1000

    const k = wholesaleKpis(clients, sales, [], { periodDays: 30, now });
    expect(k.facturacionMayorista).toBe(70000);
    expect(k.facturacionMinorista).toBe(10000);
    expect(k.pedidosMayorista).toBe(2);
    expect(k.ticketB2B).toBe(35000);               // 70000 / 2
  });
});

// ============================================================================
describe("D.5 — no-regresión del camino minorista", () => {
  it("una venta minorista con campos nuevos del schema sigue funcionando", () => {
    const now = new Date(nowISO()).getTime();
    // venta minorista normal, con los campos nuevos (saleType/fulfillmentStatus) por migración
    const retailSale = {
      id: "r1", saleType: "minorista", fulfillmentStatus: "entregado", clientId: "c9",
      total: 12000, currency: "ARS", exchangeRate: RATE, date: nowISO(),
      payments: [{ method: "Mercado Pago", mpAccount: "MP Diego", amount: 12000 }],
      items: [{ productId: "p1", qty: 1, costUSDTAtSale: 5 }],
    };
    const sales = [retailSale];
    const client = { id: "c9", type: "minorista" };

    // 1. la caja acredita la venta minorista igual que siempre
    expect(calcAccountBalance("mpDiego", cashCtx(sales, { mpDiego: 0 }))).toBe(12000);
    // 2. NINGUNA función mayorista la agarra
    expect(clientOutstanding(client, sales)).toBe(0);       // no es mayorista
    expect(pendingWholesaleOrders(sales)).toEqual([]);      // no es mayorista
    expect(committedUnits(sales)).toBe(0);                  // no es mayorista
    // 3. el P&L la cuenta como minorista, no mayorista
    const pl = plByChannel(sales, { products: [], periodDays: 30, now });
    expect(pl.minorista.revenueARS).toBe(12000);
    expect(pl.mayorista.revenueARS).toBe(0);
  });
});
