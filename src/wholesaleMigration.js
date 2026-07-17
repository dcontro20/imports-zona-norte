// src/wholesaleMigration.js
//
// Migración idempotente al modelo mayorista (pivote a venta mayorista).
// Mismo espíritu que migrateLegacySales (S14.14): setea defaults en la data
// existente para que los campos nuevos del pivote no queden undefined.
//
// - client.type ??= "minorista"       → todos los clientes previos son minoristas
// - sale.saleType ??= "minorista"     → todas las ventas previas son minoristas
// - sale.fulfillmentStatus ??= "entregado" → las ventas viejas ya se entregaron
//
// PURA e IDEMPOTENTE: si el campo ya existe no lo toca, y sólo reporta cambio
// cuando realmente agregó algo. El caller decide si persistir (para no escribir
// a Firestore si no hubo nada que migrar).

// Devuelve { clients, sales, changed:{clients,sales}, didChange }.
export function migrateToWholesaleModel(clients = [], sales = []) {
  let clientChanges = 0;
  let saleChanges = 0;

  const migratedClients = (clients || []).map(c => {
    if (!c || c.type) return c; // ya migrado o inválido
    clientChanges += 1;
    return { ...c, type: "minorista" };
  });

  const migratedSales = (sales || []).map(s => {
    if (!s) return s;
    const needsType = !s.saleType;
    const needsFulfill = !s.fulfillmentStatus;
    if (!needsType && !needsFulfill) return s; // ya migrado
    saleChanges += 1;
    return {
      ...s,
      ...(needsType ? { saleType: "minorista" } : {}),
      ...(needsFulfill ? { fulfillmentStatus: "entregado" } : {}),
    };
  });

  return {
    clients: migratedClients,
    sales: migratedSales,
    changed: { clients: clientChanges, sales: saleChanges },
    didChange: clientChanges > 0 || saleChanges > 0,
  };
}
