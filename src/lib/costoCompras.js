// costoCompras.js — referencia del costo desde el módulo Compras. Puro.
//
// Decisión #3 del Pricing Engine (cerrada en gate): la FICHA es la fuente de
// verdad del costo (costo de reposición, costUSDT); el costo de Compras es
// HISTÓRICO (lo que se pagó en el último lote) y funciona solo como
// referencia visible con warning de drift — mitiga el "riesgo de costo
// desactualizado" (doc estratégico §9) sin invertir la definición.

// Estados de compra donde la mercadería (y su costo) son reales, no promesa.
const ESTADOS_CON_COSTO = new Set(["recibido", "verificado"]);

// Último costo pagado por un producto en Compras: la compra más reciente
// (por fecha) recibida/verificada que lo incluya con costo > 0.
// Devuelve { costo, fecha, purchaseId } o null si nunca se compró.
export function ultimoCostoCompra(productId, purchases) {
  let mejor = null;
  for (const compra of purchases || []) {
    if (!compra || compra.isDeleted) continue;
    if (!ESTADOS_CON_COSTO.has(compra.status)) continue;
    const item = (compra.items || []).find(
      (it) => it.productId === productId && Number(it.unitCostUSDT) > 0
    );
    if (!item) continue;
    const fecha = String(compra.date || "");
    if (!mejor || fecha > mejor.fecha) {
      mejor = { costo: Number(item.unitCostUSDT), fecha, purchaseId: compra.id };
    }
  }
  return mejor;
}

// Drift entre el costo de la ficha y el último costo de Compras.
// Devuelve { pct, fueraDeUmbral } o null si falta alguno de los dos datos.
// El umbral es el mismo de recálculo de la política (RN-13): si el último
// lote se pagó más caro que lo que dice la ficha, la lista publicada está
// derivando de un costo viejo.
export function driftCostoFicha(costoFicha, costoCompra, umbralPct) {
  const ficha = Number(costoFicha);
  const compra = Number(costoCompra);
  if (!(ficha > 0) || !(compra > 0)) return null;
  const pct = Math.abs(compra - ficha) / ficha;
  return { pct, fueraDeUmbral: pct > (Number(umbralPct) || 0) + 1e-12 };
}
