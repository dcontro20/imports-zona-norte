// src/productIntelligence.js
//
// Funciones PURAS de inteligencia de producto.
// Todas reciben los datos como argumentos (no leen state global) y devuelven
// estructuras predecibles. Testeables en aislamiento. Consumidas por:
//   - Products.jsx (badges inline: velocity, slow mover, dead stock, lifecycle)
//   - Reports.jsx (sección "Inteligencia de productos": ABC, brand, salud)
//   - Purchases.jsx (sugeridor de qty a pedir)
//   - Dashboard.jsx (alertas de pérdida de velocidad)
//
// Convención de fechas: las funciones esperan strings ISO o YYYY-MM-DD en los
// objetos sale.date / product.createdAt. Comparaciones internas usan
// `new Date(x)` y diff en ms.

import { safeRate } from "./helpers.js";

const MS_PER_DAY = 86400000;

/**
 * Construye un mapa { productId: stats } con métricas crudas en UN paso.
 * Optimización: en lugar de iterar `sales` 5 veces (uno por feature), agrupamos
 * todas las estadísticas que dependen de "ventas por producto" en un solo
 * paso O(N×items). Las funciones de más alto nivel consumen este mapa.
 *
 * stats por producto:
 *   - totalQty: unidades vendidas en todo el histórico (no-deleted)
 *   - totalRevenueARS: revenue ARS-equivalente generado por este producto
 *   - lastSaleDate: ISO string de la última venta (null si nunca se vendió)
 *   - daysSinceLastSale: enteros (Infinity si nunca vendió)
 *   - velocity30d: unidades vendidas en los últimos 30 días
 *   - velocity60d, velocity90d: idem
 *   - velocity30dPerDay: velocity30d / 30 (uds/día)
 *   - velocity7d: últimos 7 días (para detectar cambios bruscos vs 30d)
 *   - saleDates: array de ISO strings (para análisis avanzados como elasticidad)
 */
export function buildProductSalesStats(products, sales, exchangeRate, now = new Date()) {
  const map = {};
  (products || []).forEach(p => {
    if (!p || p.isDeleted) return;
    map[p.id] = {
      productId: p.id,
      product: p,
      totalQty: 0,
      totalRevenueARS: 0,
      lastSaleDate: null,
      lastSaleTimestamp: 0,
      saleDates: [],
      velocity7d: 0,
      velocity30d: 0,
      velocity60d: 0,
      velocity90d: 0,
    };
  });
  const nowMs = now.getTime();
  const cut7 = nowMs - 7 * MS_PER_DAY;
  const cut30 = nowMs - 30 * MS_PER_DAY;
  const cut60 = nowMs - 60 * MS_PER_DAY;
  const cut90 = nowMs - 90 * MS_PER_DAY;
  const rate = safeRate(exchangeRate);

  (sales || []).forEach(sale => {
    if (!sale || sale.isDeleted || !sale.date) return;
    const saleMs = new Date(sale.date).getTime();
    if (!Number.isFinite(saleMs)) return;
    const saleRate = safeRate(sale.exchangeRate || exchangeRate);
    (sale.items || []).forEach(it => {
      if (!it || !it.productId) return;
      const stat = map[it.productId];
      if (!stat) return;
      const qty = Number(it.qty) || 0;
      stat.totalQty += qty;

      // Revenue por item: priority customPrice > sale-level extrapolation
      // (customPrice se setea en items con precio custom; sino usamos product.priceUSD)
      const priceUSD = Number(it.customPrice ?? stat.product.priceUSD) || 0;
      const priceARS = Number(stat.product.priceARS) || (priceUSD * saleRate);
      const cur = sale.currency || "ARS";
      const itemRevenueARS = (cur === "USD" || cur === "USDT")
        ? priceUSD * qty * saleRate
        : priceARS * qty;
      stat.totalRevenueARS += itemRevenueARS;

      stat.saleDates.push(sale.date);
      if (saleMs > stat.lastSaleTimestamp) {
        stat.lastSaleTimestamp = saleMs;
        stat.lastSaleDate = sale.date;
      }
      if (saleMs >= cut7) stat.velocity7d += qty;
      if (saleMs >= cut30) stat.velocity30d += qty;
      if (saleMs >= cut60) stat.velocity60d += qty;
      if (saleMs >= cut90) stat.velocity90d += qty;
    });
  });

  // Derivar campos calculados
  Object.values(map).forEach(stat => {
    stat.velocity30dPerDay = stat.velocity30d / 30;
    stat.velocity7dPerDay = stat.velocity7d / 7;
    stat.daysSinceLastSale = stat.lastSaleTimestamp
      ? Math.floor((nowMs - stat.lastSaleTimestamp) / MS_PER_DAY)
      : Infinity;
  });
  // Suprime el aviso de variable rate sin usar (mantiene API consistent)
  void rate;
  return map;
}

/**
 * S15.3 — Margen real por producto.
 * Devuelve { marginUSD, marginPct, roiPct } o null si no hay datos suficientes.
 *
 * marginUSD = priceUSD - costUSDT
 * marginPct = (priceUSD - costUSDT) / priceUSD × 100
 * roiPct    = (priceUSD - costUSDT) / costUSDT × 100   (más representativo
 *              cuando se quiere comparar inversión vs retorno por unidad)
 */
export function calcProductMargin(product) {
  if (!product) return null;
  const price = Number(product.priceUSD) || 0;
  const cost = Number(product.costUSDT) || 0;
  if (price <= 0) return null;
  const marginUSD = price - cost;
  const marginPct = (marginUSD / price) * 100;
  const roiPct = cost > 0 ? (marginUSD / cost) * 100 : null;
  return {
    marginUSD: Math.round(marginUSD * 100) / 100,
    marginPct: Math.round(marginPct * 10) / 10,
    roiPct: roiPct !== null ? Math.round(roiPct * 10) / 10 : null,
  };
}

/**
 * S15.1 — Velocity tier de un producto.
 * Devuelve un tag textual y un color sugerido según uds/día últimos 30d:
 *   "hot"   ≥ 1     uds/día
 *   "warm"  ≥ 0.3   uds/día
 *   "cold"  < 0.3   y > 0
 *   "frozen" 0
 */
export function classifyVelocity(velocity30dPerDay) {
  const v = Number(velocity30dPerDay) || 0;
  if (v >= 1) return { tier: "hot", label: "🔥 Top mover", color: "#E03E3E" };
  if (v >= 0.3) return { tier: "warm", label: "✓ Activo", color: "#0F7B6C" };
  if (v > 0) return { tier: "cold", label: "🐢 Lento", color: "#CB912F" };
  return { tier: "frozen", label: "❄️ Sin venta 30d", color: "#6B7794" };
}

/**
 * S15.2 — ABC analysis (Pareto 80/20).
 * Recibe el sales-stats map (de buildProductSalesStats) y devuelve un array
 * ordenado por revenue descendente con clasificación A/B/C:
 *   - A: top productos que acumulan los primeros 80% de revenue
 *   - B: los siguientes 15% (hasta 95%)
 *   - C: el último 5%
 *
 * Cada item incluye: { productId, product, totalRevenueARS, totalQty,
 *                      cumulativePct, classification }
 *
 * Productos sin ventas se incluyen al final como "C" con cumulativePct=100.
 */
export function calcABCAnalysis(statsMap) {
  const stats = Object.values(statsMap || {});
  if (stats.length === 0) return [];
  const sorted = [...stats].sort((a, b) => b.totalRevenueARS - a.totalRevenueARS);
  const totalRevenue = sorted.reduce((s, x) => s + x.totalRevenueARS, 0);
  let cumul = 0;
  return sorted.map(s => {
    cumul += s.totalRevenueARS;
    const cumulativePct = totalRevenue > 0 ? (cumul / totalRevenue) * 100 : 0;
    let classification = "C";
    if (cumulativePct <= 80) classification = "A";
    else if (cumulativePct <= 95) classification = "B";
    return {
      productId: s.productId,
      product: s.product,
      totalRevenueARS: s.totalRevenueARS,
      totalQty: s.totalQty,
      cumulativePct: Math.round(cumulativePct * 10) / 10,
      revenuePct: totalRevenue > 0 ? (s.totalRevenueARS / totalRevenue) * 100 : 0,
      classification,
    };
  });
}

/**
 * S15.4 — Slow movers candidates.
 * Devuelve productos que cumplen TODAS estas condiciones:
 *   - Tienen stock > 0
 *   - daysSinceLastSale ≥ minDaysSilent (default 30)
 *   - velocity30dPerDay × 30 < stock (queda más stock que ventas mensuales)
 *
 * Ordenados por daysSinceLastSale descendente (los más viejos primero).
 * Cada item incluye sugerencia textual de acción.
 */
export function findSlowMovers(statsMap, products, options = {}) {
  const { minDaysSilent = 30, minStock = 1 } = options;
  const stats = Object.values(statsMap || {});
  const slow = stats.filter(s => {
    if (!s.product) return false;
    const stock = Number(s.product.stock) || 0;
    if (stock < minStock) return false;
    if (s.daysSinceLastSale < minDaysSilent) return false;
    // Si vende rápido pero hay mucho stock, no es slow mover (es alto inventario)
    const monthlyVelocity = s.velocity30dPerDay * 30;
    if (monthlyVelocity >= stock * 0.5) return false; // vende ≥50% del stock al mes = OK
    return true;
  });
  return slow
    .sort((a, b) => {
      const days = (b.daysSinceLastSale === Infinity ? 9999 : b.daysSinceLastSale) -
                   (a.daysSinceLastSale === Infinity ? 9999 : a.daysSinceLastSale);
      return days;
    })
    .map(s => {
      const stock = Number(s.product.stock) || 0;
      const days = s.daysSinceLastSale;
      let suggestion = "";
      if (days === Infinity) suggestion = `Nunca vendido. Stock ${stock} uds — considerar liquidar o reasignar.`;
      else if (days >= 90) suggestion = `${days} días sin venta. Bajar precio 25% o liquidar urgente.`;
      else if (days >= 60) suggestion = `${days} días sin venta. Promo -15% o samplear con próxima compra.`;
      else suggestion = `${days} días sin venta. Considerar promo -10% o destacar.`;
      return { ...s, suggestion };
    });
}

/**
 * S15.6 — Dead stock identifier (más estricto que slow movers).
 * Productos que NO se vendieron NUNCA (lastSaleDate === null) o
 * llevan ≥ deadDays sin movimiento Y tienen stock significativo.
 */
export function findDeadStock(statsMap, options = {}) {
  const { deadDays = 90, minStock = 3 } = options;
  return Object.values(statsMap || {})
    .filter(s => {
      if (!s.product) return false;
      const stock = Number(s.product.stock) || 0;
      if (stock < minStock) return false;
      return s.daysSinceLastSale >= deadDays;
    })
    .map(s => ({
      ...s,
      stockValueUSD: (Number(s.product.stock) || 0) * (Number(s.product.priceUSD) || 0),
    }))
    .sort((a, b) => b.stockValueUSD - a.stockValueUSD);
}

/**
 * S15.5 — Comparativa de rentabilidad por marca.
 * Agrupa todos los productos por brand y calcula:
 *   - totalRevenueARS, totalQty
 *   - avgMarginPct (ponderado por qty)
 *   - skuCount, productsWithStock
 *   - velocity30dTotal
 *   - stockValueUSD, stockUnits
 *
 * Útil para decidir qué marca priorizar en la próxima compra Paraguay.
 */
export function calcBrandPerformance(statsMap, products) {
  const byBrand = {};
  Object.values(statsMap || {}).forEach(s => {
    if (!s.product) return;
    const brand = s.product.brand || "Sin marca";
    if (!byBrand[brand]) {
      byBrand[brand] = {
        brand,
        totalRevenueARS: 0,
        totalQty: 0,
        velocity30dTotal: 0,
        skuCount: 0,
        productsWithStock: 0,
        stockUnits: 0,
        stockValueUSD: 0,
        marginSum: 0,
        marginQtyWeighted: 0,
      };
    }
    const b = byBrand[brand];
    b.totalRevenueARS += s.totalRevenueARS;
    b.totalQty += s.totalQty;
    b.velocity30dTotal += s.velocity30d;
    b.skuCount += 1;
    const stock = Number(s.product.stock) || 0;
    if (stock > 0) b.productsWithStock += 1;
    b.stockUnits += stock;
    b.stockValueUSD += stock * (Number(s.product.priceUSD) || 0);
    const margin = calcProductMargin(s.product);
    if (margin && s.totalQty > 0) {
      b.marginSum += margin.marginPct * s.totalQty;
      b.marginQtyWeighted += s.totalQty;
    }
  });
  return Object.values(byBrand)
    .map(b => ({
      ...b,
      avgMarginPct: b.marginQtyWeighted > 0
        ? Math.round((b.marginSum / b.marginQtyWeighted) * 10) / 10
        : null,
    }))
    .sort((a, b) => b.totalRevenueARS - a.totalRevenueARS);
}

/**
 * S15.7 — Sugeridor de qty a pedir Paraguay.
 * Para cada producto, sugiere la cantidad que mantendría stock para los
 * próximos `coverDays` días según su velocidad actual, considerando un buffer
 * de seguridad y el lead time típico de importación.
 *
 *   suggestedQty = max(0, ceil((velocity × (leadTime + coverDays + safetyDays))) - stockActual)
 *
 * Si el producto vendió 0 en 30d, suggestedQty = 0 (no pedir, salvo override
 * manual). Si vendió bien y stock está bajo, sugiere reposición.
 *
 * @param {object} options
 *   leadTimeDays: días que tarda en llegar Paraguay (default 30)
 *   coverDays: cuánto stock querés tener cuando llega el envío (default 30)
 *   safetyDays: buffer adicional (default 7)
 */
export function suggestPurchaseQty(statsMap, options = {}) {
  const { leadTimeDays = 30, coverDays = 30, safetyDays = 7 } = options;
  const horizon = leadTimeDays + coverDays + safetyDays;
  return Object.values(statsMap || {})
    .map(s => {
      if (!s.product) return null;
      const stock = Number(s.product.stock) || 0;
      const velocity = s.velocity30dPerDay;
      if (velocity <= 0) {
        return {
          productId: s.productId,
          product: s.product,
          velocity30dPerDay: 0,
          stockActual: stock,
          target: 0,
          suggestedQty: 0,
          reason: "Sin ventas últimos 30d",
        };
      }
      const target = Math.ceil(velocity * horizon);
      const suggestedQty = Math.max(0, target - stock);
      return {
        productId: s.productId,
        product: s.product,
        velocity30dPerDay: Math.round(velocity * 100) / 100,
        stockActual: stock,
        target,
        suggestedQty,
        reason: suggestedQty > 0
          ? `Cubre ${horizon}d (lead ${leadTimeDays} + cover ${coverDays} + safety ${safetyDays})`
          : "Stock suficiente",
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.suggestedQty - a.suggestedQty);
}

/**
 * S15.8 — Alerta de pérdida de velocidad.
 * Compara velocity de los últimos 7d (×4 para extrapolar a 30d) contra los
 * 30d reales. Si la velocity proyectada del último período es <50% de la del
 * mes completo, hay pérdida de tracción.
 *
 * Devuelve productos con caída significativa.
 */
export function findVelocityDrops(statsMap, options = {}) {
  const { minMonthlyQty = 5, minDropPct = 50 } = options;
  return Object.values(statsMap || {})
    .filter(s => {
      if (!s.product) return false;
      if (s.velocity30d < minMonthlyQty) return false; // ignorar productos con poca data
      const projectedFromLastWeek = s.velocity7d * (30 / 7);
      const dropPct = ((s.velocity30d - projectedFromLastWeek) / s.velocity30d) * 100;
      return dropPct >= minDropPct;
    })
    .map(s => {
      const projectedFromLastWeek = s.velocity7d * (30 / 7);
      const dropPct = ((s.velocity30d - projectedFromLastWeek) / s.velocity30d) * 100;
      return {
        ...s,
        velocityProjected30d: Math.round(projectedFromLastWeek * 10) / 10,
        dropPct: Math.round(dropPct),
      };
    })
    .sort((a, b) => b.dropPct - a.dropPct);
}

/**
 * S15.9 — Lifecycle stage de un producto.
 * Estados:
 *   "new"      — creado <30d (independiente de ventas)
 *   "rising"   — vendiendo bien y velocidad creciente
 *   "mature"   — vendiendo estable
 *   "declining" — caída de ≥40% vs 30d
 *   "dead"     — sin ventas hace ≥60d
 *
 * Si no hay createdAt, se usa la fecha de la primera venta como proxy.
 */
export function classifyLifecycle(stat, now = new Date()) {
  if (!stat || !stat.product) return { stage: "unknown", label: "—" };
  const product = stat.product;
  const nowMs = now.getTime();

  // "Nuevo": creado/primera venta hace <30d
  const referenceDate = product.createdAt ||
    (stat.saleDates.length > 0 ? stat.saleDates.sort()[0] : null);
  if (referenceDate) {
    const daysSinceCreated = (nowMs - new Date(referenceDate).getTime()) / MS_PER_DAY;
    if (daysSinceCreated < 30 && stat.totalQty > 0) {
      return { stage: "new", label: "🆕 Nuevo", color: "#1E2B4A" };
    }
  }

  // "Dead": sin ventas hace ≥60d
  if (stat.daysSinceLastSale >= 60) {
    return { stage: "dead", label: "💀 Sin movimiento", color: "#6B7794" };
  }

  // Comparar velocity proyectada vs 30d
  if (stat.velocity30d >= 5) {
    const projectedFromLastWeek = stat.velocity7d * (30 / 7);
    const change = (projectedFromLastWeek - stat.velocity30d) / stat.velocity30d;
    if (change <= -0.4) return { stage: "declining", label: "📉 En caída", color: "#E03E3E" };
    if (change >= 0.3) return { stage: "rising", label: "📈 Creciendo", color: "#0F7B6C" };
    return { stage: "mature", label: "🟢 Estable", color: "#0F7B6C" };
  }
  return { stage: "low", label: "🟡 Bajo volumen", color: "#CB912F" };
}

/**
 * S15.10 — Matriz de correlación de productos (cross-sell).
 * Para cada producto, encuentra los TOP N productos que se compraron en la
 * misma sale (co-ocurrencia). Útil para sugerir cross-sell y combos.
 *
 * Devuelve { [productId]: [{ productId, co, productName }] } donde `co` es
 * la cantidad de sales en que ambos aparecen juntos.
 */
export function calcProductCoOccurrence(sales, products, topN = 3) {
  const productMap = {};
  (products || []).forEach(p => { if (p && !p.isDeleted) productMap[p.id] = p; });
  const co = {}; // co[A][B] = count
  (sales || []).forEach(sale => {
    if (!sale || sale.isDeleted) return;
    const itemIds = Array.from(new Set(
      (sale.items || []).map(i => i.productId).filter(Boolean)
    ));
    if (itemIds.length < 2) return;
    for (let i = 0; i < itemIds.length; i++) {
      for (let j = 0; j < itemIds.length; j++) {
        if (i === j) continue;
        const a = itemIds[i];
        const b = itemIds[j];
        if (!co[a]) co[a] = {};
        co[a][b] = (co[a][b] || 0) + 1;
      }
    }
  });
  const result = {};
  Object.entries(co).forEach(([a, partners]) => {
    const list = Object.entries(partners)
      .map(([b, count]) => ({
        productId: b,
        co: count,
        product: productMap[b] || null,
        productName: productMap[b]
          ? `${productMap[b].brand} ${productMap[b].model}${productMap[b].flavor ? ` - ${productMap[b].flavor}` : ""}`
          : "(producto desconocido)",
      }))
      .filter(x => x.product) // descartar productos eliminados
      .sort((x, y) => y.co - x.co)
      .slice(0, topN);
    if (list.length > 0) result[a] = list;
  });
  return result;
}

/**
 * S15.11 — Patrones por día de la semana.
 * Para un producto (o todos), devuelve qty vendida por día de la semana en los
 * últimos N días. Útil para detectar "vende más los viernes".
 *
 * Devuelve [{ dow: 0..6, label: "Dom"..."Sáb", qty }] (7 elementos siempre).
 */
const DOW_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export function calcDayOfWeekPattern(sales, productId = null, days = 90, now = new Date()) {
  const cut = now.getTime() - days * MS_PER_DAY;
  const buckets = DOW_LABELS.map((label, dow) => ({ dow, label, qty: 0 }));
  (sales || []).forEach(sale => {
    if (!sale || sale.isDeleted) return;
    const ms = new Date(sale.date).getTime();
    if (!Number.isFinite(ms) || ms < cut) return;
    const dow = new Date(sale.date).getDay();
    (sale.items || []).forEach(it => {
      if (productId && it.productId !== productId) return;
      buckets[dow].qty += Number(it.qty) || 0;
    });
  });
  return buckets;
}

/**
 * S15.13 — Sell-through rate por lote (purchase).
 * Para cada compra verificada (purchase.status === "verificado"), calcula
 * cuánto del stock comprado ya se vendió:
 *
 *   strPct = qtySoldDespuésDelLote / qtyComprada × 100
 *
 * Es una aproximación: asume FIFO simple (si compraste 100 y vendiste 60
 * desde la fecha de la compra, STR = 60%).
 *
 * Devuelve [{ purchaseId, supplier, date, items, strPct, daysSinceArrived }].
 */
export function calcSellThroughRate(purchases, sales) {
  const verifiedPurchases = (purchases || []).filter(
    p => p && !p.isDeleted && p.status === "verificado"
  );
  return verifiedPurchases
    .map(p => {
      const arrivedMs = new Date(p.date).getTime();
      const items = p.items || [];
      let totalQty = 0;
      let totalSold = 0;
      items.forEach(it => {
        const qty = Number(it.qty) || 0;
        totalQty += qty;
        // Sumar ventas de ese productId desde arrivedMs
        const soldQty = (sales || []).reduce((sum, sale) => {
          if (!sale || sale.isDeleted) return sum;
          const saleMs = new Date(sale.date).getTime();
          if (saleMs < arrivedMs) return sum;
          const matched = (sale.items || [])
            .filter(si => si.productId === it.productId)
            .reduce((s2, si) => s2 + (Number(si.qty) || 0), 0);
          return sum + matched;
        }, 0);
        totalSold += Math.min(soldQty, qty); // cap al qty del lote (FIFO simple)
      });
      const strPct = totalQty > 0 ? Math.round((totalSold / totalQty) * 100) : 0;
      const daysSinceArrived = Math.floor((Date.now() - arrivedMs) / MS_PER_DAY);
      return {
        purchaseId: p.id,
        supplier: p.supplier || "?",
        date: p.date,
        loteNumber: p.loteNumber || "",
        totalQty,
        totalSold,
        strPct,
        daysSinceArrived,
      };
    })
    .sort((a, b) => b.daysSinceArrived - a.daysSinceArrived);
}

/**
 * S15.12 — Análisis de elasticidad precio-demanda.
 *
 * Para cada producto con cambios de precio en el priceLog, compara la
 * velocity de venta antes vs después del cambio. Devuelve productos con
 * señal clara de elasticidad:
 *
 *   - elasticity = (% cambio en demanda) / (% cambio en precio)
 *
 * Ejemplo: bajaste precio 10% y la velocity subió 30% → elasticity = -3
 * (muy elástico — bajar precio rinde mucho).
 *
 * Por simplicidad usamos ventanas de 30d antes y 30d después del cambio.
 * Devuelve solo productos con al menos 3 ventas en cada ventana.
 *
 * Convención: elasticity NEGATIVA significa que demanda y precio se mueven
 * inverso (lo normal). |elasticity| > 1 = elástico, < 1 = inelástico.
 */
export function calcPriceElasticity(products, sales, priceLog, options = {}) {
  const { windowDays = 30, minSales = 3 } = options;
  const result = [];
  (priceLog || []).forEach(entry => {
    if (!entry || !entry.productId || !entry.date) return;
    const oldPrice = Number(entry.oldPrice) || 0;
    const newPrice = Number(entry.newPrice) || 0;
    if (oldPrice <= 0 || newPrice <= 0 || oldPrice === newPrice) return;
    const product = (products || []).find(p => p.id === entry.productId);
    if (!product || product.isDeleted) return;
    const changeMs = new Date(entry.date).getTime();
    if (!Number.isFinite(changeMs)) return;
    const beforeStart = changeMs - windowDays * MS_PER_DAY;
    const afterEnd = changeMs + windowDays * MS_PER_DAY;
    let beforeQty = 0;
    let afterQty = 0;
    (sales || []).forEach(sale => {
      if (!sale || sale.isDeleted) return;
      const ms = new Date(sale.date).getTime();
      if (!Number.isFinite(ms)) return;
      const isBefore = ms >= beforeStart && ms < changeMs;
      const isAfter = ms >= changeMs && ms < afterEnd;
      if (!isBefore && !isAfter) return;
      const qty = (sale.items || [])
        .filter(it => it.productId === entry.productId)
        .reduce((s, it) => s + (Number(it.qty) || 0), 0);
      if (isBefore) beforeQty += qty;
      else afterQty += qty;
    });
    if (beforeQty < minSales || afterQty < minSales) return;
    const pricePctChange = ((newPrice - oldPrice) / oldPrice) * 100;
    const demandPctChange = ((afterQty - beforeQty) / beforeQty) * 100;
    const elasticity = pricePctChange !== 0
      ? Math.round((demandPctChange / pricePctChange) * 100) / 100
      : 0;
    result.push({
      productId: entry.productId,
      product,
      date: entry.date,
      oldPrice,
      newPrice,
      pricePctChange: Math.round(pricePctChange * 10) / 10,
      beforeQty,
      afterQty,
      demandPctChange: Math.round(demandPctChange * 10) / 10,
      elasticity,
      // Categorización útil para UX
      category: Math.abs(elasticity) > 1 ? "elastic" : "inelastic",
      direction: elasticity < 0 ? "normal" : "anomalous", // negative is healthy
    });
  });
  return result.sort((a, b) => Math.abs(b.elasticity) - Math.abs(a.elasticity));
}

/**
 * S15.14 — Salud de inventario (KPIs globales).
 *
 *   inventoryTurnover = COGS_period / avgInventoryValue   (anualizado)
 *   daysInventoryOutstanding (DIO) = avgInventoryValue / dailyCOGS
 *   fillRate = % productos con stock > 0
 *   deadStockValuePct = valor dead stock / valor total stock
 */
export function calcInventoryHealth(products, purchases, sales, statsMap, options = {}) {
  const { periodDays = 90 } = options;
  const activeProducts = (products || []).filter(p => p && !p.isDeleted);
  const stockUnits = activeProducts.reduce((s, p) => s + (Number(p.stock) || 0), 0);
  const stockValueUSD = activeProducts.reduce(
    (s, p) => s + (Number(p.stock) || 0) * (Number(p.priceUSD) || 0),
    0
  );
  const stockValueAtCost = activeProducts.reduce(
    (s, p) => s + (Number(p.stock) || 0) * (Number(p.costUSDT) || Number(p.priceUSD) * 0.5 || 0),
    0
  );
  const productsWithStock = activeProducts.filter(p => (Number(p.stock) || 0) > 0).length;
  const fillRatePct = activeProducts.length > 0
    ? Math.round((productsWithStock / activeProducts.length) * 100)
    : 0;

  const cutoff = Date.now() - periodDays * MS_PER_DAY;
  const periodCOGS = (purchases || [])
    .filter(p => p && !p.isDeleted && p.status === "verificado" && new Date(p.date).getTime() >= cutoff)
    .reduce((s, p) => s + (Number(p.totalUSDT) || 0), 0);

  const avgInventoryValue = stockValueAtCost; // proxy: el actual; ideal sería avg histórico
  const turnoverAnnualized = avgInventoryValue > 0
    ? (periodCOGS / avgInventoryValue) * (365 / periodDays)
    : 0;
  const dailyCOGS = periodCOGS / periodDays;
  const dio = dailyCOGS > 0 ? Math.round(avgInventoryValue / dailyCOGS) : null;

  // Dead stock value (≥90d sin venta + stock significativo)
  const deadStock = findDeadStock(statsMap, { deadDays: 90, minStock: 1 });
  const deadStockValueUSD = deadStock.reduce((s, ds) => s + ds.stockValueUSD, 0);
  const deadStockPct = stockValueUSD > 0
    ? Math.round((deadStockValueUSD / stockValueUSD) * 100)
    : 0;

  return {
    skuCount: activeProducts.length,
    productsWithStock,
    fillRatePct,
    stockUnits,
    stockValueUSD: Math.round(stockValueUSD),
    stockValueAtCost: Math.round(stockValueAtCost),
    turnoverAnnualized: Math.round(turnoverAnnualized * 10) / 10,
    dio,
    deadStockValueUSD: Math.round(deadStockValueUSD),
    deadStockPct,
    deadStockCount: deadStock.length,
  };
}
