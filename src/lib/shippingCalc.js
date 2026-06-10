// src/lib/shippingCalc.js
//
// Calculadora simple de costo de envío por zona. Diego puede customizar
// los valores; estos son defaults sensatos para zona norte GBA.
//
// Cost incluye: viaje + tiempo + margen logístico.
//
// Funciones PURAS.

// Zonas + costos default (ARS). Diego puede override desde Settings si quiere.
export const SHIPPING_ZONES = [
  { id: "nordelta",     label: "Nordelta",                 costARS: 0,     minOrderForFree: 0,     freeFromUnits: 0,  notes: "GRATIS" },
  { id: "pacheco",      label: "General Pacheco",          costARS: 0,     minOrderForFree: 0,     freeFromUnits: 0,  notes: "GRATIS" },
  { id: "san_isidro",   label: "San Isidro",               costARS: 2000,  minOrderForFree: 50000, freeFromUnits: 3 },
  { id: "tigre",        label: "Tigre / Don Torcuato",     costARS: 2000,  minOrderForFree: 50000, freeFromUnits: 3 },
  { id: "vicente_lopez", label: "Vicente López",           costARS: 2500,  minOrderForFree: 50000, freeFromUnits: 3 },
  { id: "caba",         label: "CABA",                     costARS: 3000,  minOrderForFree: 60000, freeFromUnits: 4 },
  { id: "gba_oeste",    label: "GBA Oeste",                costARS: 3500,  minOrderForFree: 70000, freeFromUnits: 4 },
  { id: "gba_sur",      label: "GBA Sur",                  costARS: 3500,  minOrderForFree: 70000, freeFromUnits: 4 },
  { id: "interior",     label: "Interior (correo)",        costARS: 4500,  minOrderForFree: null,  freeFromUnits: null, notes: "Andreani / Correo Argentino" },
];

export function getShippingZone(id) {
  return SHIPPING_ZONES.find(z => z.id === id);
}

// Calcula el costo de envío efectivo para un pedido.
// Devuelve { costARS, free, reason }
export function calcShipping({ zoneId, orderTotalARS = 0, totalUnits = 0 }) {
  const zone = getShippingZone(zoneId);
  if (!zone) return { costARS: 0, free: false, reason: "Zona no definida" };

  // GRATIS hard-coded
  if (zone.costARS === 0) {
    return { costARS: 0, free: true, reason: zone.notes || "Envío gratis en esta zona" };
  }

  // GRATIS por umbral de monto
  if (zone.minOrderForFree && orderTotalARS >= zone.minOrderForFree) {
    return {
      costARS: 0, free: true,
      reason: `Pedido >= $${zone.minOrderForFree.toLocaleString("es-AR")}`,
    };
  }
  // GRATIS por umbral de unidades
  if (zone.freeFromUnits && totalUnits >= zone.freeFromUnits) {
    return {
      costARS: 0, free: true,
      reason: `${totalUnits}+ unidades en el pedido`,
    };
  }

  // Pagar envío
  return {
    costARS: zone.costARS,
    free: false,
    reason: zone.notes || "Costo de envío estándar",
  };
}

// Qué le faltaría al pedido para que el envío sea gratis (incentivo upsell)
export function shippingUpsell({ zoneId, orderTotalARS = 0, totalUnits = 0 }) {
  const zone = getShippingZone(zoneId);
  if (!zone || zone.costARS === 0) return null;

  const result = calcShipping({ zoneId, orderTotalARS, totalUnits });
  if (result.free) return null;

  // Camino más cercano a free: monto o unidades?
  const toMonto = zone.minOrderForFree ? zone.minOrderForFree - orderTotalARS : null;
  const toUnits = zone.freeFromUnits ? zone.freeFromUnits - totalUnits : null;

  if (toMonto != null && toUnits != null) {
    if (toMonto / orderTotalARS < 0.3) {
      return { type: "monto", message: `Te faltan $${Math.round(toMonto).toLocaleString("es-AR")} para que el envío sea gratis` };
    }
    return { type: "units", message: `Llevá ${toUnits} unidad${toUnits === 1 ? "" : "es"} más y el envío te sale gratis` };
  }
  if (toMonto != null) {
    return { type: "monto", message: `Te faltan $${Math.round(toMonto).toLocaleString("es-AR")} para envío gratis` };
  }
  if (toUnits != null) {
    return { type: "units", message: `${toUnits} unidad${toUnits === 1 ? "" : "es"} más y envío gratis` };
  }
  return null;
}
