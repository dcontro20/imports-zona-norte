// src/lib/supplierComparison.js
//
// Funciones PURAS para comparar listas de múltiples proveedores en simultáneo.
// El usuario carga 2+ listas (cada una con su proveedor), y el sistema arma
// una matriz: filas = productos, columnas = proveedores. Cada celda tiene
// precio, disponibilidad y diferencial vs el mejor precio.
//
// También calcula el "split óptimo": pedirle a cada proveedor solo los
// productos donde tiene el mejor precio (minimiza costo total).

// Tipo de entrada esperado:
//
//   lists: [
//     {
//       supplierId, supplierName, color,
//       items: [{ matchedProductId, qty, priceUSD, raw, brand, model, flavor }]
//     }, ...
//   ]
//
// Salida de buildComparisonMatrix:
//
//   {
//     products: [{ productId, brand, model, flavor, puffs }],
//     suppliers: [{ supplierId, supplierName, color }],
//     cells: { [productId]: { [supplierId]: { qty, priceUSD, raw } } },
//     bestBy: { [productId]: { supplierId, priceUSD } },
//     worstBy: { [productId]: { supplierId, priceUSD } },
//     diffPct: { [productId]: number }, // % diferencia entre best y worst
//   }

export function buildComparisonMatrix(lists, productCatalog = []) {
  const inputs = Array.isArray(lists) ? lists.filter(l => l && Array.isArray(l.items)) : [];
  if (inputs.length === 0) {
    return {
      products: [], suppliers: [], cells: {}, bestBy: {}, worstBy: {}, diffPct: {},
    };
  }

  const suppliers = inputs.map(l => ({
    supplierId: l.supplierId || l.supplierName || "?",
    supplierName: l.supplierName || "Sin nombre",
    color: l.color || "#5E6AD2",
  }));

  // Agrupar items por productId (los matcheados). Para los items sin
  // matchedProductId, usar como key una combinación normalizada de
  // brand+model+flavor — eso permite comparar productos que ninguno tiene
  // en el catálogo pero son el mismo entre proveedores.
  const productMap = {};
  const cells = {};

  inputs.forEach(list => {
    const supId = list.supplierId || list.supplierName || "?";
    (list.items || []).forEach(it => {
      if (!it) return;
      const productKey = it.matchedProductId
        || `_unmatched::${(it.brand || "").toLowerCase()}|${(it.model || "").toLowerCase()}|${(it.flavor || it.raw || "").toLowerCase().trim()}`;

      if (!productMap[productKey]) {
        // Si está matcheado, buscar info canónica del catálogo. Si no, usar lo del item.
        const catProduct = it.matchedProductId
          ? productCatalog.find(p => p.id === it.matchedProductId)
          : null;
        productMap[productKey] = {
          productId: productKey,
          isMatched: !!it.matchedProductId,
          brand: catProduct?.brand || it.brand || "?",
          model: catProduct?.model || it.model || "?",
          flavor: catProduct?.flavor || it.flavor || it.raw || "?",
          puffs: catProduct?.puffs || it.puffs || null,
        };
      }

      if (!cells[productKey]) cells[productKey] = {};
      cells[productKey][supId] = {
        qty: Number(it.qty) || 0,
        priceUSD: Number(it.priceUSD) || 0,
        raw: it.raw || "",
        available: (Number(it.qty) || 0) > 0,
      };
    });
  });

  // Calcular best/worst y diff pct por producto
  const bestBy = {};
  const worstBy = {};
  const diffPct = {};

  Object.keys(productMap).forEach(productId => {
    const supplierEntries = Object.entries(cells[productId] || {})
      .filter(([_, cell]) => cell.priceUSD > 0 && cell.available);
    if (supplierEntries.length === 0) return;

    let best = { supplierId: null, priceUSD: Infinity };
    let worst = { supplierId: null, priceUSD: 0 };
    supplierEntries.forEach(([supId, cell]) => {
      if (cell.priceUSD < best.priceUSD) best = { supplierId: supId, priceUSD: cell.priceUSD };
      if (cell.priceUSD > worst.priceUSD) worst = { supplierId: supId, priceUSD: cell.priceUSD };
    });
    if (best.supplierId) bestBy[productId] = best;
    if (worst.supplierId) worstBy[productId] = worst;
    if (best.priceUSD > 0 && worst.priceUSD > best.priceUSD) {
      diffPct[productId] = Math.round(((worst.priceUSD - best.priceUSD) / best.priceUSD) * 1000) / 10;
    }
  });

  const products = Object.values(productMap).sort((a, b) => {
    // Ordenar por marca, modelo, sabor
    return (a.brand || "").localeCompare(b.brand || "")
      || (a.model || "").localeCompare(b.model || "")
      || (a.flavor || "").localeCompare(b.flavor || "");
  });

  return { products, suppliers, cells, bestBy, worstBy, diffPct };
}

// Para una matriz, calcula el split óptimo: cuánto pedir a cada proveedor
// para minimizar costo total, dado una demanda objetivo por producto.
//
// demands: { [productId]: qtyNeeded }
//
// Retorna:
//   {
//     allocations: { [supplierId]: [{ productId, qty, priceUSD, subtotal }] }
//     totalCost: number
//     savingsVsWorst: number (cuánto ahorrás vs pedir todo al peor proveedor)
//     bySupplier: { [supplierId]: { totalUSD, itemCount } }
//   }
export function computeOptimalSplit(matrix, demands = {}) {
  if (!matrix || !matrix.products || matrix.products.length === 0) {
    return {
      allocations: {}, totalCost: 0, savingsVsWorst: 0, bySupplier: {},
    };
  }

  const allocations = {};
  const bySupplier = {};
  matrix.suppliers.forEach(s => {
    allocations[s.supplierId] = [];
    bySupplier[s.supplierId] = { totalUSD: 0, itemCount: 0, totalUnits: 0 };
  });

  let totalCost = 0;
  let worstCost = 0;

  matrix.products.forEach(p => {
    const qty = Number(demands[p.productId]) || 0;
    if (qty <= 0) return;

    const best = matrix.bestBy[p.productId];
    if (!best) return;

    const subtotal = qty * best.priceUSD;
    allocations[best.supplierId].push({
      productId: p.productId,
      brand: p.brand, model: p.model, flavor: p.flavor,
      qty, priceUSD: best.priceUSD, subtotal,
    });
    bySupplier[best.supplierId].totalUSD += subtotal;
    bySupplier[best.supplierId].itemCount += 1;
    bySupplier[best.supplierId].totalUnits += qty;
    totalCost += subtotal;

    const worst = matrix.worstBy[p.productId];
    if (worst) worstCost += qty * worst.priceUSD;
  });

  const savingsVsWorst = Math.max(0, worstCost - totalCost);

  return {
    allocations,
    totalCost,
    savingsVsWorst,
    bySupplier,
  };
}

// Para cada proveedor, agrega métricas resumen útiles para mostrar al usuario:
//   - exclusivos: productos que solo este proveedor tiene en stock
//   - mejorPrecioCount: cuántos productos donde es el más barato
//   - rangePremium: cuánto más caro es vs el mejor (en %)
export function buildSupplierSummary(matrix) {
  if (!matrix || matrix.suppliers.length === 0) return [];

  return matrix.suppliers.map(s => {
    let exclusiveCount = 0;
    let bestPriceCount = 0;
    let availableCount = 0;
    let totalProductsListed = 0;
    let avgPremiumVsBest = 0;
    const premiums = [];

    matrix.products.forEach(p => {
      const cell = matrix.cells[p.productId]?.[s.supplierId];
      if (!cell) return;
      totalProductsListed += 1;
      if (cell.available) {
        availableCount += 1;
        // Es exclusivo si ningún otro proveedor lo tiene disponible
        const others = matrix.suppliers.filter(o => o.supplierId !== s.supplierId);
        const someOther = others.some(o => {
          const c = matrix.cells[p.productId]?.[o.supplierId];
          return c && c.available;
        });
        if (!someOther) exclusiveCount += 1;
      }
      const best = matrix.bestBy[p.productId];
      if (best && best.supplierId === s.supplierId) bestPriceCount += 1;
      if (best && best.priceUSD > 0 && cell.priceUSD > 0) {
        premiums.push(((cell.priceUSD - best.priceUSD) / best.priceUSD) * 100);
      }
    });

    if (premiums.length > 0) {
      avgPremiumVsBest = Math.round((premiums.reduce((a, b) => a + b, 0) / premiums.length) * 10) / 10;
    }

    return {
      supplierId: s.supplierId,
      supplierName: s.supplierName,
      color: s.color,
      totalProductsListed,
      availableCount,
      bestPriceCount,
      exclusiveCount,
      avgPremiumVsBest,
    };
  });
}

// Devuelve los productos donde el spread entre proveedores es más significativo,
// ordenados por % de diferencia (descendente). Sirve para resaltar oportunidades.
export function topSpreadProducts(matrix, limit = 10) {
  if (!matrix || !matrix.products) return [];
  return [...matrix.products]
    .filter(p => matrix.diffPct[p.productId] != null)
    .sort((a, b) => (matrix.diffPct[b.productId] || 0) - (matrix.diffPct[a.productId] || 0))
    .slice(0, limit)
    .map(p => ({
      ...p,
      diffPct: matrix.diffPct[p.productId],
      best: matrix.bestBy[p.productId],
      worst: matrix.worstBy[p.productId],
    }));
}

// Para un producto y matriz dadas, devuelve la lista de proveedores con su precio
// y disponibilidad, ordenados por precio asc (excluyendo no disponibles).
export function suppliersForProduct(matrix, productId) {
  if (!matrix || !matrix.suppliers) return [];
  const rows = matrix.suppliers.map(s => {
    const cell = matrix.cells[productId]?.[s.supplierId];
    return {
      supplierId: s.supplierId,
      supplierName: s.supplierName,
      color: s.color,
      priceUSD: cell?.priceUSD || 0,
      qty: cell?.qty || 0,
      available: !!cell?.available,
      hasListing: !!cell,
    };
  });
  return rows.sort((a, b) => {
    if (!a.available && b.available) return 1;
    if (a.available && !b.available) return -1;
    return a.priceUSD - b.priceUSD;
  });
}
