// pricingEngine.js — NÚCLEO PORTABLE del Pricing Engine. Funciones PURAS.
//
// Contrato (docs/addendum-portabilidad-modulo.md): el motor no sabe qué se
// vende, en qué país, ni con qué moneda. Cero red, cero base de datos, cero
// React, cero imports del sistema anfitrión. Recibe productos con costo y una
// política; devuelve precios por escalón y validaciones. Todo lo demás
// (persistencia, pantallas, tipo de cambio, WhatsApp) vive en la integración.
//
// Reglas de negocio que implementa (docs/documento-estrategico-comercial-v1.md §7):
//   RN-01 costo real = costo × (1 + costoAdicionalPct)
//   RN-02 precio por escalón desde costo real y margen objetivo del escalón
//   RN-03 redondeo al múltiplo configurado (dirección configurable)
//   RN-04 anti-colapso: cada escalón estrictamente menor que el anterior,
//         con diferencia mínima igual al múltiplo de redondeo
//   RN-05 piso de margen: BLOQUEANTE (ningún escalón debajo del margen mínimo)
//   RN-06 el escalón se determina por el total según metricaEscalon
//   RN-09 nudge de frontera: a menos del umbral del siguiente escalón, avisar
//   RN-14/RN-15 precioReferencia y precioMercado NO participan del cálculo:
//         solo alimentan validaciones (opcionales, desactivables)
//   RN-18 producto sin costo: no se calcula, no se publica, no se cotiza
//
// ---------------------------------------------------------------------------
// CONTRATO DE DATOS
//
// producto: {
//   id,                  // identificador del sistema anfitrión (opaco)
//   costo,               // costo de compra al proveedor (número > 0)
//   precioReferencia?,   // precio propio de otro canal (validación conflicto de canal)
//   precioMercado?,      // precio de venta al público observado (validación margen cliente)
// }
// Todos los precios/costos en UNA MISMA moneda, la que sea. Si el dato de
// mercado vive en otra moneda, el ADAPTADOR lo convierte antes de entrar.
//
// politica: {
//   costoAdicionalPct,   // ej. 0.13 — envío del proveedor como % del costo
//   escalones,           // [{ desde, hasta, margen }] — hasta: null = sin techo.
//                        //   Cantidad libre (2, 4, 6...). El motor JAMÁS asume 4.
//   metricaEscalon,      // "unidades" — nombre explícito de la métrica del total
//   redondeo,            // { multiplo, direccion: "arriba" | "abajo" }
//   margenMinimo,        // ej. 0.15 — piso duro, bloqueante (universal)
//   validaciones: {      // opcionales: desactivadas o sin dato ⇒ no corren, no rompen
//     conflictoCanal: { activa, umbral },  // alerta si p(escalón 1) > umbral × precioReferencia
//     margenCliente:  { activa, umbral },  // alerta si margen del cliente < umbral
//   },
// }
// ---------------------------------------------------------------------------

const EPS = 1e-9;

// Mata el ruido de punto flotante sin alterar el valor real (10 decimales).
const limpiar = (x) => Number(x.toFixed(10));

// RN-01 — costo real: costo de compra + costo adicional proporcional.
export function costoReal(costo, costoAdicionalPct = 0) {
  return limpiar(Number(costo) * (1 + Number(costoAdicionalPct || 0)));
}

// RN-03 — redondeo al múltiplo, con dirección. Epsilon-safe: un valor que YA
// es múltiplo exacto no salta al siguiente (11.5/0.5 = 23.000000000000004).
export function redondear(valor, redondeo) {
  const m = Number(redondeo?.multiplo) || 0;
  if (m <= 0) return limpiar(valor);
  const fn = redondeo?.direccion === "abajo" ? Math.floor : Math.ceil;
  const ajuste = redondeo?.direccion === "abajo" ? EPS : -EPS;
  return limpiar(fn(valor / m + ajuste) * m);
}

// ¿El producto tiene costo válido? (RN-18: sin costo no hay cálculo posible)
export function tieneCosto(producto) {
  return Number(producto?.costo) > 0;
}

// Escalones ordenados por `desde` ascendente (defensivo: el motor no asume
// que la política los trae ordenados).
function escalonesOrdenados(politica) {
  return [...(politica?.escalones || [])].sort((a, b) => a.desde - b.desde);
}

// RN-02 + RN-03 + RN-04 — precios de un producto en TODOS los escalones.
// Devuelve un ARREGLO (jamás campos fijos p1..pN):
//   [{ desde, hasta, margen, precio, margenReal, ajustadoAnticolapso }]
// Anti-colapso: si el redondeo iguala (o invierte) dos escalones consecutivos,
// el escalón de más volumen baja hasta quedar `multiplo` debajo del anterior.
// margenReal se recalcula sobre el precio FINAL (post ajuste): es lo que
// audita el piso de margen.
export function preciosProducto(costoRealUnitario, politica) {
  const escalones = escalonesOrdenados(politica);
  const multiplo = Number(politica?.redondeo?.multiplo) || 0;
  const out = [];
  for (const esc of escalones) {
    const margen = Number(esc.margen) || 0;
    let precio = redondear(costoRealUnitario / (1 - margen), politica.redondeo);
    let ajustado = false;
    const prev = out[out.length - 1];
    if (prev && multiplo > 0) {
      const tope = limpiar(prev.precio - multiplo);
      if (precio > tope + EPS) {
        precio = tope;
        ajustado = true;
      }
    }
    out.push({
      desde: esc.desde,
      hasta: esc.hasta ?? null,
      margen,
      precio,
      margenReal: precio > 0 ? limpiar((precio - costoRealUnitario) / precio) : 0,
      ajustadoAnticolapso: ajustado,
    });
  }
  return out;
}

// RN-05 + RN-14 + RN-15 — capa de validación, SEPARADA del cálculo.
// Devuelve { bloqueantes: [...], alertas: [...] }. Cada entrada: { regla, ...datos }.
//   - margenMinimo (BLOQUEANTE, universal): algún escalón debajo del piso.
//   - conflictoCanal (alerta, opcional): precio del primer escalón supera el
//     umbral del precioReferencia. Sin dato o desactivada ⇒ no corre.
//   - margenCliente (alerta, opcional): margen del cliente contra su precio de
//     venta observado queda debajo del umbral. Sin dato o desactivada ⇒ no corre.
export function validarProducto(producto, precios, politica) {
  const bloqueantes = [];
  const alertas = [];

  const piso = Number(politica?.margenMinimo) || 0;
  for (const esc of precios) {
    if (esc.margenReal < piso - EPS) {
      bloqueantes.push({
        regla: "margenMinimo",
        desde: esc.desde,
        margenReal: esc.margenReal,
        minimo: piso,
      });
    }
  }

  const primero = precios[0];
  const vCanal = politica?.validaciones?.conflictoCanal;
  const referencia = Number(producto?.precioReferencia) || 0;
  if (vCanal?.activa && referencia > 0 && primero) {
    const techo = limpiar(referencia * Number(vCanal.umbral));
    if (primero.precio > techo + EPS) {
      alertas.push({
        regla: "conflictoCanal",
        precio: primero.precio,
        techo,
        ratio: limpiar(primero.precio / referencia),
      });
    }
  }

  const vCliente = politica?.validaciones?.margenCliente;
  const mercado = Number(producto?.precioMercado) || 0;
  if (vCliente?.activa && mercado > 0 && primero) {
    const margenCliente = limpiar((mercado - primero.precio) / mercado);
    if (margenCliente < Number(vCliente.umbral) - EPS) {
      alertas.push({
        regla: "margenCliente",
        margenCliente,
        minimo: Number(vCliente.umbral),
      });
    }
  }

  return { bloqueantes, alertas };
}

// Cálculo completo de UN producto: costo real + precios + validaciones.
// Sin costo (RN-18) ⇒ { sinCosto: true } y nada más: no hay precio posible.
export function calcularProducto(producto, politica) {
  if (!tieneCosto(producto)) {
    return { id: producto?.id, sinCosto: true, publicable: false };
  }
  const real = costoReal(producto.costo, politica?.costoAdicionalPct);
  const precios = preciosProducto(real, politica);
  const { bloqueantes, alertas } = validarProducto(producto, precios, politica);
  return {
    id: producto.id,
    sinCosto: false,
    costo: Number(producto.costo),
    costoReal: real,
    precios,
    bloqueantes,
    alertas,
    publicable: bloqueantes.length === 0,
  };
}

// Lista completa. Los productos sin costo quedan EXCLUIDOS de las filas y
// reportados aparte (RN-18). `publicable` global: hay filas y ninguna está
// bloqueada — si algún producto viola el piso, la publicación exige decisión
// humana (RN-05); el motor solo reporta, la integración decide la UX.
export function generarLista(productos, politica) {
  const filas = [];
  const sinCosto = [];
  const bloqueados = [];
  for (const p of productos || []) {
    const calc = calcularProducto(p, politica);
    if (calc.sinCosto) {
      sinCosto.push(p?.id);
      continue;
    }
    filas.push(calc);
    if (!calc.publicable) bloqueados.push(p.id);
  }
  return {
    filas,
    sinCosto,
    bloqueados,
    publicable: filas.length > 0 && bloqueados.length === 0,
  };
}

// RN-06 — escalón aplicable para un total (en la métrica de la política).
// Debajo del primer escalón ⇒ null (el pedido no alcanza el mínimo de volumen).
export function escalonParaTotal(total, politica) {
  const n = Number(total) || 0;
  for (const esc of escalonesOrdenados(politica)) {
    if (n >= esc.desde && (esc.hasta == null || n <= esc.hasta)) return esc;
  }
  return null;
}

// RN-09 — nudge de frontera: si al total le falta menos de `umbral` (proporción
// del límite del siguiente escalón) para alcanzarlo, devolver ese escalón y
// cuánto falta. Si no hay escalón siguiente o está lejos ⇒ null.
// El cálculo del ahorro concreto es del cotizador (necesita las líneas del pedido).
export function nudgeProximoEscalon(total, politica, umbral = 0.1) {
  const n = Number(total) || 0;
  const siguiente = escalonesOrdenados(politica).find((e) => e.desde > n);
  if (!siguiente) return null;
  const faltan = siguiente.desde - n;
  if (faltan / siguiente.desde < umbral - EPS) {
    return { desde: siguiente.desde, hasta: siguiente.hasta ?? null, margen: siguiente.margen, faltan };
  }
  return null;
}
