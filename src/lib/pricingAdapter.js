// pricingAdapter.js — ADAPTADOR entre el modelo de productos de IZN y el
// contrato del motor (docs/addendum-portabilidad-modulo.md, capa 2).
//
// El motor no sabe qué es un vape ni qué es un sabor. Acá se traduce:
//   - Los ~240 productos de la app viven a nivel SABOR (marca+modelo+sabor).
//   - La lista mayorista precia a nivel MODELO (marca+modelo): todos los
//     sabores de un modelo comparten precio. OJO: esto es solo del PRECIO —
//     el cotizador cuenta unidades a nivel sabor hacia el total del pedido
//     (RN-07, mezcla libre incluye sabores).
//   - costo (motor) ← costUSDT de la ficha (costo de reposición, decisión #3).
//   - precioReferencia ← priceUSD minorista propio: el MENOR del grupo (es el
//     techo más estricto para la validación de conflicto de canal).
//   - precioMercado ← streetPriceARS (precio de calle observado, campo que
//     carga F3) convertido a USD acá — el motor es agnóstico de moneda.
//
// Al portar el módulo a otro negocio se reescribe ESTE archivo, no el motor.

// Clave de agrupamiento de la lista: marca + modelo.
export function claveModelo(producto) {
  return `${producto?.brand || ""}|${producto?.model || ""}`;
}

// Traduce los productos de la app a la forma del motor, agrupando por modelo.
// Devuelve { productosMotor, inconsistencias }:
//   productosMotor: [{ id, marca, modelo, costo, precioReferencia?,
//                      precioMercado?, productIds, sabores }]
//   inconsistencias: [{ id, tipo: "costo"|"minorista", valores }] — sabores del
//     mismo modelo con datos distintos. Para el costo se usa el MÁXIMO
//     (conservador: precio derivado del costo más alto protege el margen);
//     para el minorista el MÍNIMO (validación de canal más estricta).
export function productosParaMotor(products, { fx = 0 } = {}) {
  const grupos = new Map();
  for (const p of products || []) {
    if (!p || p.isDeleted) continue;
    const clave = claveModelo(p);
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(p);
  }

  const productosMotor = [];
  const inconsistencias = [];
  for (const [clave, sabores] of grupos) {
    const [marca, modelo] = clave.split("|");
    const costos = [...new Set(sabores.map((s) => Number(s.costUSDT) || 0).filter((c) => c > 0))];
    const minoristas = [...new Set(sabores.map((s) => Number(s.priceUSD) || 0).filter((v) => v > 0))];
    const calles = [...new Set(sabores.map((s) => Number(s.streetPriceARS) || 0).filter((v) => v > 0))];

    if (costos.length > 1) inconsistencias.push({ id: clave, tipo: "costo", valores: costos });
    if (minoristas.length > 1) inconsistencias.push({ id: clave, tipo: "minorista", valores: minoristas });

    const producto = {
      id: clave,
      marca,
      modelo,
      costo: costos.length > 0 ? Math.max(...costos) : 0,
      productIds: sabores.map((s) => s.id),
      sabores: sabores.length,
    };
    if (minoristas.length > 0) producto.precioReferencia = Math.min(...minoristas);
    if (calles.length > 0 && Number(fx) > 0) producto.precioMercado = Math.min(...calles) / Number(fx);
    productosMotor.push(producto);
  }

  // Orden estable: por marca y modelo (la lista se lee agrupada por marca).
  productosMotor.sort((a, b) => a.marca.localeCompare(b.marca) || a.modelo.localeCompare(b.modelo));
  return { productosMotor, inconsistencias };
}
