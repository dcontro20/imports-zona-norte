// src/lib/smartOffers.js
//
// Motor de "Ideas de venta": analiza estadísticas y genera ofertas concretas
// para vender más, cada una con su razón y su impacto en ganancia.
//
// Categorías:
//   reactivar     — clientes dormidos (no compran hace +Nd)
//   liquidar      — stock parado, recuperar capital sin malvender
//   crosssell     — combos de productos que se compran juntos
//   topseller     — empujar lo que más rota, con margen sano
//   stocklist     — catálogo agrupado para grupos (sin descuento)
//   packfiesta    — pack 3-4u pensado para grupos sociales/fiestas
//   recordatorio  — mensaje casual sin push de venta
//   drop          — sabores agregados al catálogo recientemente
//
// Funciones PURAS. El componente pasa statsMap (buildProductSalesStats) ya hecho.

import { safeRate } from "../helpers.js";
import { getProductCostUSDT } from "../finance.js";
import { productPriceARS, applyDiscount } from "./offers.js";
import { getClientInsights } from "./clientInsights.js";

const MS_PER_DAY = 86400000;

// ---------------------------------------------------------------------------
// CLIENTES DORMIDOS
// ---------------------------------------------------------------------------

// Clientes que compraron alguna vez pero no compran hace >daysThreshold.
// Devuelve [{ client, lastPurchase, daysSince, totalSpentARS, orderCount, avgTicketARS }]
// ordenados por valor histórico (los más valiosos primero).
export function dormantClients(clients, sales, { daysThreshold = 30, exchangeRate = 1, now = new Date() } = {}) {
  const nowMs = now.getTime();
  const byClient = {};
  (sales || []).forEach(s => {
    if (!s || s.isDeleted || !s.clientId) return;
    if (!byClient[s.clientId]) byClient[s.clientId] = { lastMs: 0, totalARS: 0, count: 0 };
    const ms = new Date(s.date).getTime();
    const rate = safeRate(s.exchangeRate || exchangeRate);
    const cur = s.currency || "ARS";
    const totalARS = (cur === "USD" || cur === "USDT") ? (Number(s.total) || 0) * rate : (Number(s.total) || 0);
    const entry = byClient[s.clientId];
    entry.totalARS += totalARS;
    entry.count += 1;
    if (Number.isFinite(ms) && ms > entry.lastMs) entry.lastMs = ms;
  });

  const result = [];
  (clients || []).forEach(c => {
    if (!c || c.isDeleted) return;
    const data = byClient[c.id];
    if (!data || data.count === 0 || data.lastMs === 0) return; // nunca compró
    const daysSince = Math.floor((nowMs - data.lastMs) / MS_PER_DAY);
    if (daysSince < daysThreshold) return; // todavía activo
    result.push({
      client: c,
      daysSince,
      lastPurchase: new Date(data.lastMs).toISOString().slice(0, 10),
      totalSpentARS: Math.round(data.totalARS),
      orderCount: data.count,
      avgTicketARS: Math.round(data.totalARS / data.count),
    });
  });
  return result.sort((a, b) => b.totalSpentARS - a.totalSpentARS);
}

// ---------------------------------------------------------------------------
// MARGEN / DESCUENTO MÁXIMO (con costo real ponderado)
// ---------------------------------------------------------------------------

// Descuento máximo que mantiene un margen objetivo, usando el costo real.
//   Devuelve { maxDiscountPct, currentMarginPct, minPriceUSD } o null si falta data.
export function maxDiscountForMargin(product, targetMarginPct = 30) {
  if (!product) return null;
  const priceUSD = Number(product.priceUSD) || 0;
  const costUSD = getProductCostUSDT(product);
  if (priceUSD <= 0 || costUSD <= 0) return null;
  const target = Math.max(0, Math.min(95, Number(targetMarginPct) || 0));
  const minPriceUSD = costUSD / (1 - target / 100);
  const maxDiscountPct = priceUSD > 0 ? Math.max(0, ((priceUSD - minPriceUSD) / priceUSD) * 100) : 0;
  const currentMarginPct = ((priceUSD - costUSD) / priceUSD) * 100;
  return {
    maxDiscountPct: Math.round(maxDiscountPct * 10) / 10,
    currentMarginPct: Math.round(currentMarginPct * 10) / 10,
    minPriceUSD: Math.round(minPriceUSD * 100) / 100,
  };
}

// Impacto de ganancia de aplicar un descuento a N unidades de un producto.
//   Devuelve { unitProfitARS, totalProfitARS, marginPct, discountedPriceARS }
export function offerProfitImpact(product, discountPct, units, exchangeRate) {
  const rate = safeRate(exchangeRate);
  const priceARS = productPriceARS(product, exchangeRate);
  const discountedARS = applyDiscount(priceARS, discountPct);
  const costARS = getProductCostUSDT(product) * rate;
  const unitProfit = discountedARS - costARS;
  const u = Math.max(0, Number(units) || 0);
  return {
    discountedPriceARS: discountedARS,
    unitProfitARS: Math.round(unitProfit),
    totalProfitARS: Math.round(unitProfit * u),
    marginPct: discountedARS > 0 ? Math.round((unitProfit / discountedARS) * 1000) / 10 : 0,
  };
}

// ---------------------------------------------------------------------------
// CROSS-SELL: pares de productos comprados juntos
// ---------------------------------------------------------------------------

// Cuenta pares de productos que aparecen en la misma venta.
//   Devuelve [{ a: productId, b: productId, count }] ordenado desc.
export function crossSellPairs(sales, { minTogether = 2, limit = 10 } = {}) {
  const pairs = {};
  (sales || []).forEach(s => {
    if (!s || s.isDeleted) return;
    const ids = Array.from(new Set((s.items || []).map(i => i.productId).filter(Boolean)));
    if (ids.length < 2) return;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = [ids[i], ids[j]].sort();
        const key = `${a}|${b}`;
        if (!pairs[key]) pairs[key] = { a, b, count: 0 };
        pairs[key].count += 1;
      }
    }
  });
  return Object.values(pairs)
    .filter(p => p.count >= minTogether)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// GENERADOR DE IDEAS DE VENTA
// ---------------------------------------------------------------------------

// Genera ofertas sugeridas de las 4 categorías. Cada idea:
//   { id, category, icon, title, reason, products:[{product,...}],
//     suggestedDiscountPct, offerType, impact, clientId? }
// offerType mapea a buildOfferMessage (offers.js).
export function suggestSmartOffers({
  products = [], statsMap = {}, sales = [], clients = [],
  exchangeRate = 1, options = {},
} = {}) {
  const {
    dormantDays = 30,
    targetMargin = 30,
    minStockLiquidate = 4,
    slowDays = 60,
  } = options;
  const ideas = [];
  const productById = new Map(products.map(p => [p.id, p]));

  // ---- 1) LIQUIDAR stock parado ----
  products.filter(p => !p.isDeleted && (Number(p.stock) || 0) >= minStockLiquidate).forEach(p => {
    const stat = statsMap[p.id];
    const velocity = stat?.velocity30dPerDay || 0;
    const stock = Number(p.stock) || 0;
    const daysToClear = velocity > 0 ? Math.ceil(stock / velocity) : Infinity;
    if (daysToClear <= slowDays) return; // rota bien, no liquidar

    const guard = maxDiscountForMargin(p, 15); // margen mínimo 15% al liquidar
    const discount = guard ? Math.min(30, Math.max(10, Math.round(guard.maxDiscountPct))) : 20;
    const impact = offerProfitImpact(p, discount, stock, exchangeRate);
    if (impact.marginPct < 0) return; // nunca a pérdida

    ideas.push({
      id: `liq_${p.id}`,
      category: "liquidar",
      icon: "🔴",
      title: `Liquidar ${p.brand} ${p.flavor}`,
      reason: velocity > 0
        ? `${stock}u en stock, tardarías ${daysToClear}d en venderlas al ritmo actual`
        : `${stock}u sin ventas registradas — capital parado`,
      products: [{ product: p, discountPct: discount }],
      suggestedDiscountPct: discount,
      offerType: "liquidacion",
      impact: {
        ...impact,
        capitalFreedARS: Math.round(impact.discountedPriceARS * stock),
        units: stock,
      },
    });
  });

  // ---- 2) REACTIVAR clientes dormidos (personalizado con sus favoritos) ----
  const dormant = dormantClients(clients, sales, { daysThreshold: dormantDays, exchangeRate });
  dormant.slice(0, 5).forEach(d => {
    // Buscamos los productos favoritos del cliente para personalizar la oferta
    const insights = getClientInsights(d.client, sales, products, { exchangeRate });
    const favs = (insights?.topProducts || [])
      .filter(tp => tp.product && !tp.product.isDeleted && (Number(tp.product.stock) || 0) > 0)
      .slice(0, 2);

    const favNames = favs.map(tp => tp.product.flavor).filter(Boolean).join(" y ");
    const personalizedReason = favs.length > 0
      ? `No compra hace ${d.daysSince}d. Te llevó ${favNames} antes — ofrecele eso con -10%`
      : `No compra hace ${d.daysSince}d. ${d.orderCount}x compró (${money(d.totalSpentARS)} histórico)`;

    // Si tenemos favoritos con stock, oferta especializada. Si no, fallback a descuento general.
    const useFavorites = favs.length > 0;

    ideas.push({
      id: `react_${d.client.id}`,
      category: "reactivar",
      icon: "😴",
      title: `Reactivar a ${d.client.name}`,
      reason: personalizedReason,
      products: favs.map(tp => ({ product: tp.product })),
      suggestedDiscountPct: 10,
      offerType: useFavorites ? "reactivar" : "descuento",
      clientId: d.client.id,
      clientName: d.client.name,
      clientPhone: d.client.phone || "",
      impact: {
        avgTicketARS: d.avgTicketARS,
        potentialARS: d.avgTicketARS,
        favoriteCount: favs.length,
        ordersHistorical: d.orderCount,
      },
    });
  });

  // ---- 3) CROSS-SELL combos ----
  const pairs = crossSellPairs(sales, { minTogether: 2, limit: 5 });
  pairs.forEach(pair => {
    const a = productById.get(pair.a);
    const b = productById.get(pair.b);
    if (!a || !b || a.isDeleted || b.isDeleted) return;
    const comboRegular = productPriceARS(a, exchangeRate) + productPriceARS(b, exchangeRate);
    const comboPrice = applyDiscount(comboRegular, 10); // 10% off al combo
    ideas.push({
      id: `cross_${pair.a}_${pair.b}`,
      category: "crosssell",
      icon: "🔗",
      title: `Combo ${a.flavor} + ${b.flavor}`,
      reason: `Se compraron juntos ${pair.count} ${pair.count === 1 ? "vez" : "veces"} — armá el combo`,
      products: [{ product: a }, { product: b }],
      suggestedDiscountPct: 10,
      offerType: "combo",
      comboQty: 2,
      comboPriceARS: comboPrice,
      impact: {
        comboRegularARS: comboRegular,
        comboPriceARS: comboPrice,
        savingARS: comboRegular - comboPrice,
      },
    });
  });

  // ---- 4) TOP SEMANA — los 3-5 más rotados con descuento por llevar 2+ ----
  // (antes generaba 5 ideas individuales; ahora 1 idea multi-sabor que empuja
  //  a llevar MÁS de uno, aumentando el ticket promedio sin sacrificar margen)
  const topSellersAll = Object.values(statsMap)
    .filter(s => s.product && !s.product.isDeleted && s.velocity30dPerDay > 0
                && (Number(s.product.stock) || 0) > 0)
    .sort((a, b) => b.velocity30dPerDay - a.velocity30dPerDay)
    .slice(0, 5);
  const topEligible = topSellersAll.filter(s => {
    const g = maxDiscountForMargin(s.product, targetMargin);
    return g && g.currentMarginPct >= 25;
  });
  if (topEligible.length >= 2) {
    // Descuento conservador que respeta el margen del producto MÁS ajustado
    const safeMaxDisc = Math.min(
      ...topEligible.map(s => {
        const g = maxDiscountForMargin(s.product, 20);
        return g ? g.maxDiscountPct : 10;
      })
    );
    const discount = Math.min(12, Math.max(5, Math.floor(safeMaxDisc)));
    const avgMargin = Math.round(
      topEligible.reduce((sum, s) => {
        const g = maxDiscountForMargin(s.product, targetMargin);
        return sum + (g?.currentMarginPct || 0);
      }, 0) / topEligible.length
    );
    ideas.push({
      id: "topsemana",
      category: "topseller",
      icon: "📈",
      title: `Top ${topEligible.length} de la semana`,
      reason: `Los más rotados. -${discount}% si llevan 2 o más → empuja el ticket sin pisar el margen.`,
      products: topEligible.map(s => ({ product: s.product, discountPct: discount })),
      suggestedDiscountPct: discount,
      offerType: "topsemana",
      impact: {
        currentMarginPct: avgMargin,
        marginAfterPct: Math.max(0, avgMargin - discount),
        productCount: topEligible.length,
      },
    });
  }

  // ---- 5) STOCK LIST — catálogo agrupado por marca para mandar a grupos ----
  const inStock = Object.values(statsMap)
    .filter(s => s.product && !s.product.isDeleted && (Number(s.product.stock) || 0) > 0)
    .sort((a, b) => (b.velocity30dPerDay || 0) - (a.velocity30dPerDay || 0));
  if (inStock.length > 0) {
    const top = inStock.slice(0, 25);
    const totalUnits = top.reduce((sum, s) => sum + (Number(s.product.stock) || 0), 0);
    const totalValueARS = top.reduce((sum, s) => sum + productPriceARS(s.product, exchangeRate) * (Number(s.product.stock) || 0), 0);
    ideas.push({
      id: "stocklist",
      category: "stocklist",
      icon: "📋",
      title: "Stock list para mandar al grupo",
      reason: `${top.length} productos con stock — catálogo listo para pegar`,
      products: top.map(s => ({ product: s.product })),
      offerType: "stocklist",
      impact: {
        totalUnits,
        potentialARS: Math.round(totalValueARS),
        productsListed: top.length,
      },
    });
  }

  // ---- 6) PACK FIESTA — combo 3-4u top de marcas distintas con stock ----
  const byBrand = {};
  Object.values(statsMap).forEach(s => {
    if (!s.product || s.product.isDeleted || !s.product.brand) return;
    if ((Number(s.product.stock) || 0) <= 0) return;
    if ((s.velocity30dPerDay || 0) <= 0) return;
    const b = s.product.brand;
    if (!byBrand[b] || (s.velocity30dPerDay || 0) > (byBrand[b].velocity30dPerDay || 0)) {
      byBrand[b] = s;
    }
  });
  const partyPicks = Object.values(byBrand)
    .sort((a, b) => (b.velocity30dPerDay || 0) - (a.velocity30dPerDay || 0))
    .slice(0, 4);
  if (partyPicks.length >= 3) {
    const regularTotal = partyPicks.reduce((sum, s) => sum + productPriceARS(s.product, exchangeRate), 0);
    const packPrice = applyDiscount(regularTotal, 15); // 15% off pack
    // Margen agregado del pack
    const totalCostARS = partyPicks.reduce((sum, s) => sum + getProductCostUSDT(s.product) * safeRate(exchangeRate), 0);
    const packProfit = packPrice - totalCostARS;
    const packMarginPct = packPrice > 0 ? Math.round((packProfit / packPrice) * 1000) / 10 : 0;
    ideas.push({
      id: "packfiesta",
      category: "packfiesta",
      icon: "🎵",
      title: `Pack para la finde — ${partyPicks.length}u`,
      reason: `Top de cada marca con stock. Pack a -15% pensado para grupos de fiestas`,
      products: partyPicks.map(s => ({ product: s.product })),
      suggestedDiscountPct: 15,
      offerType: "packfiesta",
      comboQty: partyPicks.length,
      comboPriceARS: packPrice,
      impact: {
        comboRegularARS: regularTotal,
        comboPriceARS: packPrice,
        savingARS: regularTotal - packPrice,
        unitProfitARS: Math.round(packProfit),
        marginPct: packMarginPct,
      },
    });
  }

  // ---- 7) RECORDATORIO — mensaje casual, top 3 destacados ----
  const top3 = inStock.slice(0, 3);
  if (top3.length > 0) {
    ideas.push({
      id: "recordatorio",
      category: "recordatorio",
      icon: "💬",
      title: "Recordatorio casual",
      reason: "Hacerse presente sin push fuerte. Ideal después de varias ofertas",
      products: top3.map(s => ({ product: s.product })),
      offerType: "recordatorio",
      impact: {
        productsShown: top3.length,
      },
    });
  }

  // ---- 8) DROP — sabores agregados al catálogo en últimos 14 días ----
  const NOW_MS = Date.now();
  const DAYS_14 = 14 * MS_PER_DAY;
  const recent = products.filter(p => {
    if (!p || p.isDeleted) return false;
    if ((Number(p.stock) || 0) <= 0) return false;
    const created = p.createdAt ? new Date(p.createdAt).getTime() : 0;
    return created > 0 && (NOW_MS - created) < DAYS_14;
  });
  if (recent.length > 0) {
    ideas.push({
      id: "drop",
      category: "drop",
      icon: "🆕",
      title: `Drop nuevo — ${recent.length} sabor${recent.length === 1 ? "" : "es"}`,
      reason: `Productos agregados en las últimas 2 semanas`,
      products: recent.slice(0, 8).map(p => ({ product: p })),
      offerType: "drop",
      impact: {
        newProducts: recent.length,
      },
    });
  }

  // ---- 9) MIX 3x2 — selección curada con margen para regalar el más barato ----
  // Marketing: el regalo (≈33% off) se cubre con el ticket de 3 unidades.
  // Necesita margen alto en cada uno para que no perdamos plata.
  const mixPool = Object.values(statsMap)
    .filter(s => {
      if (!s.product || s.product.isDeleted) return false;
      if ((Number(s.product.stock) || 0) < 3) return false;
      const g = maxDiscountForMargin(s.product, 20);
      return g && g.currentMarginPct >= 30;
    })
    .sort((a, b) => (b.velocity30dPerDay || 0) - (a.velocity30dPerDay || 0))
    .slice(0, 5);
  if (mixPool.length >= 3) {
    ideas.push({
      id: "mix3x2",
      category: "mix",
      icon: "🤝",
      title: `3x2 mixto — ${mixPool.length} sabores`,
      reason: `Llevan 3, pagan 2 (el más barato va de regalo). Empuja a probar varios sabores en una compra.`,
      products: mixPool.map(s => ({ product: s.product })),
      suggestedDiscountPct: 33,
      offerType: "mix3x2",
      comboQty: 3,
      impact: {
        productCount: mixPool.length,
        effectiveDiscount: 33,
      },
    });
  }

  // ---- 10) COMBO MARCA — N sabores de la marca con más sabores en stock ----
  // Marketing: clientes que ya conocen una marca suelen probar más sabores
  // de la misma marca antes que cambiar de marca.
  const flavorsByBrand = {};
  Object.values(statsMap).forEach(s => {
    if (!s.product || s.product.isDeleted || !s.product.brand) return;
    if ((Number(s.product.stock) || 0) <= 0) return;
    const b = s.product.brand;
    if (!flavorsByBrand[b]) flavorsByBrand[b] = [];
    flavorsByBrand[b].push(s);
  });
  const bestBrandEntry = Object.entries(flavorsByBrand)
    .sort((a, b) => b[1].length - a[1].length)[0];
  if (bestBrandEntry && bestBrandEntry[1].length >= 3) {
    const [brandName, brandFlavors] = bestBrandEntry;
    const picks = brandFlavors
      .sort((a, b) => (b.velocity30dPerDay || 0) - (a.velocity30dPerDay || 0))
      .slice(0, 5);
    const comboQty = Math.min(3, picks.length);
    const regularTotal = picks.slice(0, comboQty)
      .reduce((sum, s) => sum + productPriceARS(s.product, exchangeRate), 0);
    const comboPrice = applyDiscount(regularTotal, 12);
    ideas.push({
      id: `combomarca_${brandName.replace(/\s+/g, "_")}`,
      category: "combomarca",
      icon: "🎯",
      title: `Combo ${brandName} — elegí ${comboQty}`,
      reason: `${brandFlavors.length} sabores de ${brandName} con stock. Pack de ${comboQty} a -12%: ticket más alto, mismo cliente.`,
      products: picks.map(s => ({ product: s.product })),
      suggestedDiscountPct: 12,
      offerType: "combomarca",
      comboQty,
      comboPriceARS: comboPrice,
      impact: {
        comboRegularARS: regularTotal,
        comboPriceARS: comboPrice,
        savingARS: regularTotal - comboPrice,
        brand: brandName,
        flavorsAvailable: brandFlavors.length,
      },
    });
  }

  // ---- 11) DUPLA PACK — 2da unidad al 50%, sabores con margen alto ----
  // Marketing: psicológicamente "2da al 50%" pega más que "25% off" aunque
  // matemáticamente es lo mismo si llevan 2.
  const duplaPool = Object.values(statsMap)
    .filter(s => {
      if (!s.product || s.product.isDeleted) return false;
      if ((Number(s.product.stock) || 0) < 2) return false;
      const g = maxDiscountForMargin(s.product, 15);
      return g && g.currentMarginPct >= 40;
    })
    .sort((a, b) => (b.velocity30dPerDay || 0) - (a.velocity30dPerDay || 0))
    .slice(0, 6);
  if (duplaPool.length >= 3) {
    ideas.push({
      id: "duplapack",
      category: "dupla",
      icon: "🎁",
      title: `2da al 50% — ${duplaPool.length} sabores`,
      reason: `Sabores con margen suficiente. "2da al 50%" pega más que "-25%" — empuja al cliente a llevar par.`,
      products: duplaPool.map(s => ({ product: s.product })),
      suggestedDiscountPct: 25,
      offerType: "duplapack",
      impact: {
        productCount: duplaPool.length,
        effectiveDiscount: 25,
      },
    });
  }

  return ideas;
}

function money(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString("es-AR")}`;
}
