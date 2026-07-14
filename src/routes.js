// src/routes.js
//
// Lógica PURA de rutas de reparto mayorista. Nivel BÁSICO (acordado): agrupar
// pedidos pendientes por zona, orden MANUAL de paradas, totales. La optimización
// automática de recorrido queda como stub documentado (NO implementada — sería
// trabajar de más con poquísimos kioscos; los campos ya existen para el futuro).
//
// Modelo `route`: { id, date, name, status, stops:[{clientId, orderId, order,
//   status, deliveredAt, notes}], totalUnits, totalARS, estimatedKm, byUser, ... }

const saleUnits = (sale) => (sale?.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);

// Pedidos mayoristas listos para repartir: saleType=mayorista, no entregados/cobrados
// y todavía sin ruta asignada.
export function pendingWholesaleOrders(sales = []) {
  return (sales || [])
    .filter(s => s && !s.isDeleted && s.saleType === "mayorista")
    .filter(s => !s.routeId)
    .filter(s => s.fulfillmentStatus !== "entregado" && s.fulfillmentStatus !== "cobrado")
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

// Agrupa pedidos por zona del cliente. Devuelve [{ zone, orders:[], units, totalARS }].
export function groupOrdersByZone(orders = [], clients = []) {
  const byId = {};
  (clients || []).forEach(c => { if (c) byId[c.id] = c; });
  const map = {};
  (orders || []).forEach(o => {
    const zone = (byId[o.clientId]?.zone || "").trim() || "Sin zona";
    if (!map[zone]) map[zone] = { zone, orders: [], units: 0, totalARS: 0 };
    map[zone].orders.push(o);
    map[zone].units += saleUnits(o);
    map[zone].totalARS += Number(o.total) || 0;
  });
  return Object.values(map).sort((a, b) => b.totalARS - a.totalARS);
}

// Construye las paradas de una ruta a partir de pedidos elegidos (orden = orden de carga).
export function buildRouteStops(orders = []) {
  return (orders || []).map((o, i) => ({
    clientId: o.clientId,
    orderId: o.id,
    order: i,
    status: "pendiente",
    deliveredAt: null,
    notes: "",
  }));
}

// Resuelve una parada contra clients + sales para renderizar/imprimir.
// Devuelve { client, sale, name, address, zone, units, totalARS }.
export function resolveStop(stop, { clients = [], sales = [] } = {}) {
  const client = (clients || []).find(c => c.id === stop.clientId) || null;
  const sale = (sales || []).find(s => s.id === stop.orderId) || null;
  return {
    client, sale,
    name: client?.businessName || client?.name || "Cliente",
    address: client?.address || "",
    zone: client?.zone || "",
    units: saleUnits(sale),
    totalARS: Number(sale?.total) || 0,
  };
}

// Totales de una ruta (recorre sus paradas contra sales).
export function routeTotals(route, sales = []) {
  const byId = {};
  (sales || []).forEach(s => { if (s) byId[s.id] = s; });
  let totalUnits = 0, totalARS = 0;
  (route?.stops || []).forEach(st => {
    const sale = byId[st.orderId];
    totalUnits += saleUnits(sale);
    totalARS += Number(sale?.total) || 0;
  });
  return { totalUnits, totalARS, stops: (route?.stops || []).length };
}

// Reordena una parada hacia arriba/abajo (orden manual). Devuelve nuevo array
// con los `order` re-indexados. dir: -1 (subir) | +1 (bajar).
export function moveStop(stops = [], index, dir) {
  const arr = [...(stops || [])];
  const j = index + dir;
  if (index < 0 || index >= arr.length || j < 0 || j >= arr.length) return arr;
  [arr[index], arr[j]] = [arr[j], arr[index]];
  return arr.map((s, i) => ({ ...s, order: i }));
}

// STUB documentado — optimización automática de recorrido. NO implementada a
// propósito: con pocos kioscos no vale la pena, y el orden manual alcanza. El día
// que haya volumen, acá va el algoritmo (nearest-neighbor / TSP sobre lat/lng, o
// una API de rutas). Por ahora devuelve las paradas SIN cambios.
export function optimizeStops(stops = []) {
  // TODO(futuro): ordenar por cercanía geográfica usando client.lat/lng.
  return stops;
}
