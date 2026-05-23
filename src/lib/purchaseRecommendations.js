// src/lib/purchaseRecommendations.js
//
// Genera recomendaciones de pedidos cruzando datos de TODO el sistema:
//   - Listas de proveedores cargadas históricamente (supplierLists)
//   - Stock actual y velocity de venta (productIntelligence)
//   - Perfiles de proveedor (supplierProfiles)
//   - Pedidos pendientes (purchases) — para no contar 2 veces
//
// Output: array ordenado de "PurchaseRecommendation", una por proveedor,
// con los items que conviene pedirle, la razón y el ahorro estimado.

import { safeRate } from "../helpers.js";
import { buildProductSalesStats, suggestPurchaseQty } from "../productIntelligence.js";

// Para una lista de Lists de proveedores, devuelve un mapa de
// { productId: [{ supplierId, supplierName, priceUSD, qtyAvailable, listDate }] }
// ordenado por listDate desc (precio más reciente primero).
//
// Solo considera la lista MÁS RECIENTE por proveedor (evita usar precios viejos).
export function buildCurrentSupplyMap(lists, supplierProfiles = []) {
  const map = {};
  if (!Array.isArray(lists) || lists.length === 0) return map;

  // Latest list por supplier
  const latestBySupplier = {};
  lists.forEach(l => {
    if (!l || l.isDeleted || !l.supplierId) return;
    const cur = latestBySupplier[l.supplierId];
    if (!cur || new Date(l.processedAt) > new Date(cur.processedAt)) {
      latestBySupplier[l.supplierId] = l;
    }
  });

  Object.values(latestBySupplier).forEach(list => {
    const profile = supplierProfiles.find(p => p.id === list.supplierId);
    (list.items || []).forEach(it => {
      if (!it.matchedProductId || !it.priceUSD || it.priceUSD <= 0) return;
      if (!map[it.matchedProductId]) map[it.matchedProductId] = [];
      map[it.matchedProductId].push({
        supplierId: list.supplierId,
        supplierName: list.supplierName,
        supplierColor: profile?.color || "#1E2B4A",
        priceUSD: Number(it.priceUSD),
        qtyAvailable: Number(it.qty) || 0,
        listDate: list.processedAt,
        listId: list.id,
      });
    });
  });

  // Sort each product's offers by price asc (mejor precio primero)
  Object.values(map).forEach(offers => {
    offers.sort((a, b) => a.priceUSD - b.priceUSD);
  });
  return map;
}

// Calcula qty ya pendiente (en pedidos no verificados) por productId.
// Sirve para no sobre-pedir si ya hay un pedido en camino con ese item.
export function computePendingQtyByProduct(purchases = []) {
  const map = {};
  purchases.forEach(p => {
    if (!p || p.isDeleted || p.status === "verificado") return;
    (p.items || []).forEach(it => {
      if (!it.productId) return;
      map[it.productId] = (map[it.productId] || 0) + (Number(it.qty) || 0);
    });
  });
  return map;
}

// CORE: genera recomendaciones de pedido cruzando todo.
//
// inputs:
//   products: catálogo
//   sales: ventas históricas (para velocity)
//   purchases: pedidos existentes (para descontar pending)
//   supplierLists: listas cargadas en Monitor
//   supplierProfiles: perfiles con leadTime/costos defaults
//   exchangeRate: ARS por USD
//   options: { leadTimeDays, coverDays, safetyDays }
//
// output: array ordenado por totalUSDT desc, una entrada por proveedor:
//   {
//     supplierId, supplierName, color,
//     items: [{ productId, product, qty, priceUSD, reason, subtotalUSD, velocity, stockActual, pendingQty, daysOfStock }],
//     totalItems, totalUSDT, totalSavingsVsAlt,
//     defaultCommPct, defaultPaseroPct, defaultEnvioCostARS,
//   }
export function recommendPurchases({
  products = [],
  sales = [],
  purchases = [],
  supplierLists = [],
  supplierProfiles = [],
  exchangeRate = 1,
  options = {},
} = {}) {
  const { leadTimeDays = 30, coverDays = 30, safetyDays = 7 } = options;

  // 1) Stats S15: velocity por producto
  const stats = buildProductSalesStats(products, sales, exchangeRate);

  // 2) Qty sugerida POR PRODUCTO (sin importar proveedor todavía)
  const sugList = suggestPurchaseQty(stats, { leadTimeDays, coverDays, safetyDays });
  const sugByProduct = {};
  sugList.forEach(s => {
    if (s.suggestedQty > 0) sugByProduct[s.productId] = s;
  });

  // 3) Map de oferta actual por producto (de qué proveedores y a qué precio)
  const supplyMap = buildCurrentSupplyMap(supplierLists, supplierProfiles);

  // 4) Qty ya pendiente (no descontar 2 veces)
  const pendingByProduct = computePendingQtyByProduct(purchases);

  // 5) Para cada producto con qty sugerida, encontrar el MEJOR proveedor
  //    (mejor = más barato disponible con stock suficiente)
  const allocations = {}; // { supplierId: [{ item, qty, reason, ... }] }

  Object.entries(sugByProduct).forEach(([productId, sug]) => {
    const offers = supplyMap[productId] || [];
    if (offers.length === 0) return; // No hay proveedor con este producto

    const pending = pendingByProduct[productId] || 0;
    const netNeeded = Math.max(0, sug.suggestedQty - pending);
    if (netNeeded <= 0) return; // Ya está cubierto por pedidos pendientes

    // Elegir oferta más barata con stock disponible
    const validOffers = offers.filter(o => o.qtyAvailable > 0);
    if (validOffers.length === 0) return;
    const best = validOffers[0]; // ya ordenadas por precio asc
    const worst = validOffers[validOffers.length - 1];

    // Qty efectiva: lo que necesitamos, capped al qty disponible del proveedor
    const qtyToOrder = Math.min(netNeeded, best.qtyAvailable);
    if (qtyToOrder <= 0) return;

    const stockActual = stats[productId]?.product?.stock || 0;
    const velocity = stats[productId]?.velocity30dPerDay || 0;
    const daysOfStock = velocity > 0 ? Math.floor(stockActual / velocity) : null;

    // Razón legible
    let reason = "";
    if (stockActual === 0) {
      reason = "Sin stock";
    } else if (daysOfStock !== null && daysOfStock <= 7) {
      reason = `Se agota en ${daysOfStock}d`;
    } else if (daysOfStock !== null && daysOfStock <= 14) {
      reason = `Bajo stock (${daysOfStock}d restantes)`;
    } else {
      reason = `Reposición ${sug.suggestedQty}u`;
    }
    if (pending > 0) reason += ` · ya pediste ${pending}u`;

    // Savings vs el peor proveedor
    const savingsPerUnit = worst.priceUSD - best.priceUSD;
    const savingsTotal = savingsPerUnit * qtyToOrder;

    if (!allocations[best.supplierId]) {
      allocations[best.supplierId] = {
        supplierId: best.supplierId,
        supplierName: best.supplierName,
        color: best.supplierColor,
        items: [],
      };
    }
    allocations[best.supplierId].items.push({
      productId,
      product: stats[productId]?.product,
      qty: qtyToOrder,
      priceUSD: best.priceUSD,
      subtotalUSD: qtyToOrder * best.priceUSD,
      reason,
      velocity,
      stockActual,
      pendingQty: pending,
      daysOfStock,
      savingsTotal,
      alternativeSuppliers: validOffers.slice(1).map(o => ({
        supplierId: o.supplierId,
        supplierName: o.supplierName,
        priceUSD: o.priceUSD,
        delta: o.priceUSD - best.priceUSD,
      })),
    });
  });

  // 6) Construir output: una entrada por supplier con totales + costos default
  const result = Object.values(allocations).map(alloc => {
    const profile = supplierProfiles.find(p => p.id === alloc.supplierId);
    const totalItems = alloc.items.reduce((s, i) => s + i.qty, 0);
    const totalUSDT = alloc.items.reduce((s, i) => s + i.subtotalUSD, 0);
    const totalSavingsVsAlt = alloc.items.reduce((s, i) => s + i.savingsTotal, 0);
    return {
      ...alloc,
      totalItems,
      totalUSDT,
      totalSavingsVsAlt,
      defaultCommPct: profile?.defaultSupplierCommPercent || 0,
      defaultPaseroPct: profile?.defaultPaseroPercent || 0,
      defaultEnvioCostARS: profile?.defaultEnvioCostARS || 0,
      leadDays: profile?.defaultLeadDays || leadTimeDays,
    };
  });

  return result.sort((a, b) => b.totalUSDT - a.totalUSDT);
}

// Construye un PurchaseCard-ready object desde una RecommendedOrder.
// Se usa al crear el Purchase final.
export function buildPurchaseFromRecommendation(reco, exchangeRate = 1) {
  const groupsMap = {};
  const items = [];

  reco.items.forEach(it => {
    const prod = it.product;
    if (!prod) return;
    const key = `${prod.brand}|||${prod.model}|||${prod.puffs}`;
    if (!groupsMap[key]) {
      groupsMap[key] = {
        brand: prod.brand, model: prod.model, puffs: prod.puffs,
        modelKey: key, unitCostUSDT: it.priceUSD,
        flavors: [],
      };
    }
    groupsMap[key].flavors.push({
      name: prod.flavor, qty: it.qty, productId: prod.id, isNew: false,
    });
    items.push({ productId: prod.id, qty: it.qty, unitCostUSDT: it.priceUSD });
  });

  const productsUSDT = items.reduce((s, i) => s + i.qty * Number(i.unitCostUSDT || 0), 0);
  const supplierCommUSDT = Math.round(productsUSDT * (reco.defaultCommPct / 100) * 100) / 100;
  const totalUSDTwithComm = productsUSDT + supplierCommUSDT;
  const rate = safeRate(exchangeRate) || 1;
  const paseroARS = Math.round(totalUSDTwithComm * rate * (reco.defaultPaseroPct / 100));
  const envioARS = Number(reco.defaultEnvioCostARS) || 0;
  const totalCostARS = Math.round(totalUSDTwithComm * rate) + paseroARS + envioARS;

  return {
    supplier: reco.supplierName,
    supplierProfileId: reco.supplierId,
    loteNumber: "",
    date: new Date().toISOString().slice(0, 10),
    status: "pedido",
    groups: Object.values(groupsMap),
    items,
    totalItems: reco.totalItems,
    totalUSDT: productsUSDT,
    supplierCommPercent: reco.defaultCommPct,
    supplierCommUSDT,
    totalUSDTpaid: totalUSDTwithComm,
    paseroPercent: reco.defaultPaseroPct,
    paseroCostARS: paseroARS,
    envioCostARS: envioARS,
    totalCostARS,
    notes: "Generado desde Pedidos Recomendados",
    statusHistory: [{
      status: "pedido",
      timestamp: new Date().toISOString(),
      note: "Pedido recomendado por análisis automático",
    }],
  };
}
