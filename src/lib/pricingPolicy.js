// pricingPolicy.js — POLÍTICA COMERCIAL como datos (capa de integración).
//
// Acá vive lo que el negocio configura y el código jamás fija (RN-19): los
// parámetros del núcleo (contrato de pricingEngine.js) más los parámetros de
// cotización/presupuesto que son de ESTE negocio (mínimos, buffer FX, vigencia,
// recargo por plazo). La política se persiste en appData/pricingPolicy vía
// useFirebaseSync; el motor la recibe por parámetro y no sabe de dónde salió.
//
// Cambiar la política NO cambia precios publicados: habilita republicar la
// lista (las listas publicadas son snapshots inmutables — RN-12, fase F2).

export const DEFAULT_PRICING_POLICY = {
  // ---- Núcleo (contrato pricingEngine.js) — valores v2026-08 aprobados ----
  costoAdicionalPct: 0.13,          // envío del proveedor, % sobre costo (RN-01 / §5.6)
  metricaEscalon: "unidades",       // el escalón se determina por unidades totales (§5.3)
  escalones: [                      // §5.4 + §5.7 — arreglo, cantidad libre
    { desde: 20, hasta: 49, margen: 0.28 },
    { desde: 50, hasta: 99, margen: 0.24 },
    { desde: 100, hasta: 199, margen: 0.21 },
    { desde: 200, hasta: null, margen: 0.18 },
  ],
  redondeo: { multiplo: 0.5, direccion: "arriba" }, // §5.8 (RN-03)
  margenMinimo: 0.15,               // piso duro bloqueante (§5.10, RN-05)
  margenAlerta: 0.2,                // aviso temprano de erosión de margen (alerta, no bloqueo)
  validaciones: {
    conflictoCanal: { activa: true, umbral: 0.85 }, // §5.11 (RN-14)
    margenCliente: { activa: true, umbral: 0.3 },   // §5.12 (RN-15)
  },

  // ---- Cotización / presupuesto (integración de este negocio) ----
  pedidoMinimo: { unidades: 20, ticketUSD: 220 },   // §5.1 (RN-08)
  nudgeUmbralPct: 0.1,              // RN-09: a menos del 10% del siguiente escalón, avisar
  bufferFxPct: 0.03,                // §5.14 (RN-10): FX del día + buffer
  vigenciaHoras: 48,                // §5.14 (RN-11): vencimiento del presupuesto en pesos
  recargoPlazo: { pct: 0.03, dias: 7 }, // §5.13 (RN-17): contado; plazo con recargo explícito
  umbralRecalculoPct: 0.03,         // §5.17 (RN-13): recalcular solo si el costo real se movió más que esto
  fxSanidadPct: 0.1,                // banda de sanidad: un salto mayor del FX automático no se aplica solo
};

// Merge defensivo contra los defaults: una política guardada con un esquema
// viejo (campos faltantes) sale completa; los campos que trae ganan.
// Los objetos anidados se mergean nivel a nivel; `escalones` se toma entero
// del guardado si es un arreglo válido no vacío (jamás se mezclan arreglos).
export function normalizarPolitica(raw) {
  const base = DEFAULT_PRICING_POLICY;
  if (!raw || typeof raw !== "object") return { ...base };
  return {
    ...base,
    ...raw,
    escalones: Array.isArray(raw.escalones) && raw.escalones.length > 0
      ? raw.escalones.map((e) => ({ desde: e.desde, hasta: e.hasta ?? null, margen: e.margen }))
      : base.escalones,
    redondeo: { ...base.redondeo, ...(raw.redondeo || {}) },
    validaciones: {
      conflictoCanal: { ...base.validaciones.conflictoCanal, ...(raw.validaciones?.conflictoCanal || {}) },
      margenCliente: { ...base.validaciones.margenCliente, ...(raw.validaciones?.margenCliente || {}) },
    },
    pedidoMinimo: { ...base.pedidoMinimo, ...(raw.pedidoMinimo || {}) },
    recargoPlazo: { ...base.recargoPlazo, ...(raw.recargoPlazo || {}) },
  };
}

// Problemas de consistencia de una política editada. Devuelve array de strings
// (vacío = válida). La pantalla de configuración bloquea el guardado si hay errores.
export function validarPolitica(politica) {
  const errores = [];
  const escalones = [...(politica?.escalones || [])].sort((a, b) => a.desde - b.desde);
  if (escalones.length === 0) errores.push("Tiene que haber al menos un escalón.");
  escalones.forEach((esc, i) => {
    const margen = Number(esc.margen);
    if (!(margen > 0 && margen < 1)) errores.push(`Escalón ${i + 1}: el margen tiene que estar entre 0% y 100%.`);
    if (!(Number(esc.desde) > 0)) errores.push(`Escalón ${i + 1}: "desde" tiene que ser mayor que 0.`);
    if (esc.hasta != null && Number(esc.hasta) < Number(esc.desde)) {
      errores.push(`Escalón ${i + 1}: "hasta" no puede ser menor que "desde".`);
    }
    if (i > 0) {
      const prev = escalones[i - 1];
      if (prev.hasta == null) errores.push(`Escalón ${i}: solo el último escalón puede no tener techo.`);
      else if (Number(esc.desde) !== Number(prev.hasta) + 1) {
        errores.push(`Escalón ${i + 1}: tiene que arrancar donde termina el anterior (${Number(prev.hasta) + 1}).`);
      }
      if (Number(esc.margen) >= Number(prev.margen)) {
        errores.push(`Escalón ${i + 1}: el margen tiene que ser menor que el del escalón anterior.`);
      }
    }
  });
  const margenMinimo = Number(politica?.margenMinimo);
  if (!(margenMinimo >= 0 && margenMinimo < 1)) errores.push("El margen mínimo tiene que estar entre 0% y 100%.");
  const margenAlerta = Number(politica?.margenAlerta) || 0;
  if (margenAlerta > 0 && margenAlerta < margenMinimo) {
    errores.push("La alerta de margen tiene que ser mayor o igual al piso (si no, nunca avisa antes de bloquear).");
  }
  if (!(Number(politica?.redondeo?.multiplo) > 0)) errores.push("El múltiplo de redondeo tiene que ser mayor que 0.");
  if (!(Number(politica?.pedidoMinimo?.unidades) >= 0)) errores.push("El mínimo de unidades no puede ser negativo.");
  if (!(Number(politica?.pedidoMinimo?.ticketUSD) >= 0)) errores.push("El mínimo de ticket no puede ser negativo.");
  return errores;
}

// Banda de sanidad del FX automático: ¿el valor nuevo está dentro de la banda
// tolerada respecto del último conocido? Sin último conocido ⇒ se acepta.
// Un valor fuera de banda NO se aplica solo: la app avisa y espera confirmación
// (un glitch de la API no puede repreciar la lista entera).
export function fxDentroDeBanda(actual, nuevo, umbralPct) {
  const a = Number(actual);
  const n = Number(nuevo);
  if (!(n > 0)) return false;
  if (!(a > 0)) return true;
  const umbral = Number(umbralPct);
  if (!(umbral > 0)) return true; // banda desactivada
  return Math.abs(n - a) / a <= umbral + 1e-12;
}
