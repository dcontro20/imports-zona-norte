// src/lib/realProducts.js
//
// "Producto real" = un producto que efectivamente forma parte del negocio
// de Diego. NO incluye los ~240 sabores pre-cargados del catálogo que nunca
// pasaron por una compra ni una venta.
//
// Un producto es real si cumple cualquiera de:
//   - Tiene stock actual > 0 (lo tenés ahora)
//   - Apareció en alguna venta (lo vendiste alguna vez)
//   - Apareció en alguna compra verificada (lo compraste alguna vez)
//
// Esto soluciona el bug "170 agotados" que contaba el catálogo entero como
// si fuera tu inventario.
//
// Funciones PURAS.

// Devuelve Set<productId> de los productos reales.
export function realProductIds(products, sales, purchases) {
  const ids = new Set();

  (products || []).forEach(p => {
    if (!p || p.isDeleted) return;
    if ((Number(p.stock) || 0) > 0) ids.add(p.id);
  });

  (sales || []).forEach(s => {
    if (!s || s.isDeleted) return;
    (s.items || []).forEach(i => {
      if (i.productId) ids.add(i.productId);
    });
  });

  (purchases || []).forEach(p => {
    if (!p || p.isDeleted) return;
    if (p.status !== "verificado") return; // solo compras concretadas
    (p.items || []).forEach(i => {
      if (i.productId) ids.add(i.productId);
    });
  });

  return ids;
}

// Filtra el array de productos dejando solo los reales.
export function filterRealProducts(products, sales, purchases) {
  const ids = realProductIds(products, sales, purchases);
  return (products || []).filter(p => p && ids.has(p.id));
}

// Útil para mostrar contadores: "tenés 35 productos en tu inventario real".
export function realProductsCount(products, sales, purchases) {
  return realProductIds(products, sales, purchases).size;
}
