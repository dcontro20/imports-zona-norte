// src/lib/creditAccount.js
//
// Cuenta corriente B2B (mayorista). COMPLETA pero se ACTIVA por cliente con
// creditEnabled (default OFF: los mayoristas pagan contra entrega).
//
// DECISIÓN DE MODELO: el "adeudado" se deriva de las VENTAS mayoristas
// (total − pagos registrados en sale.payments), NO de client.balance. Motivos:
//   - client.balance ya tiene una convención retail (negativo = el cliente debe,
//     positivo = le debemos a favor). Reusarla con otro signo sería un bug.
//   - Los `payments` de una venta ya alimentan las cuentas de caja (ledger de
//     CashBox vía payMethodToAccountId). Cobrar = agregar un payment → la caja se
//     acredita sola, mismo camino que una venta retail, SIN doble conteo de
//     revenue (el revenue sale de sale.total una sola vez).
// Así hay una sola fuente de verdad y el puente con la caja es uniforme.
//
// Funciones PURAS.

const MS_DAY = 86400000;

const paidOf = (sale) => (sale?.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);

// Cuánto falta cobrar de una venta (total − pagos). Nunca negativo.
export function saleOutstanding(sale) {
  if (!sale || sale.isDeleted) return 0;
  const out = (Number(sale.total) || 0) - paidOf(sale);
  return out > 0 ? Math.round(out) : 0;
}

// Ventas mayoristas (no borradas) de un cliente.
export function clientMayoristaSales(client, sales) {
  if (!client) return [];
  return (sales || []).filter(s => s && !s.isDeleted && s.saleType === "mayorista" && s.clientId === client.id);
}

// Total adeudado por el cliente (suma de lo impago de sus ventas mayoristas).
export function clientOutstanding(client, sales) {
  return clientMayoristaSales(client, sales).reduce((s, sale) => s + saleOutstanding(sale), 0);
}

export const DEFAULT_CREDIT_TERM_DAYS = 30;

// Estado de crédito del cliente. availableARS = 0 si no tiene crédito habilitado.
export function creditStatus(client, sales) {
  const enabled = !!client?.creditEnabled;
  const limitARS = Math.max(0, Number(client?.creditLimitARS) || 0);
  const owedARS = clientOutstanding(client, sales);
  const availableARS = enabled ? Math.max(0, limitARS - owedARS) : 0;
  return { enabled, limitARS, owedARS, availableARS, overLimit: enabled && owedARS > limitARS };
}

// ¿Se puede dejar un pedido a cuenta (fiado) sin pasar el límite?
// Requiere creditEnabled. Si no está habilitado → false (paga contra entrega).
export function canChargeOnAccount(client, sales, orderTotal) {
  if (!client?.creditEnabled) return false;
  const { owedARS, limitARS } = creditStatus(client, sales);
  return (owedARS + (Number(orderTotal) || 0)) <= limitARS;
}

// Días desde la venta mayorista impaga más vieja del cliente (o null si no debe).
export function oldestUnpaidDays(client, sales, now = Date.now()) {
  const unpaid = clientMayoristaSales(client, sales).filter(s => saleOutstanding(s) > 0);
  if (unpaid.length === 0) return null;
  const oldest = unpaid.reduce((min, s) => {
    const t = new Date(s.date).getTime();
    return Number.isFinite(t) ? Math.min(min, t) : min;
  }, Infinity);
  if (!Number.isFinite(oldest)) return null;
  return Math.floor((now - oldest) / MS_DAY);
}

// ¿Está en mora? (debe algo y su venta impaga más vieja supera el plazo).
export function isOverdue(client, sales, termDays = DEFAULT_CREDIT_TERM_DAYS, now = Date.now()) {
  const d = oldestUnpaidDays(client, sales, now);
  return d != null && d >= termDays && clientOutstanding(client, sales) > 0;
}

// Distribuye un pago entre las ventas impagas del cliente (más viejas primero).
// Devuelve { updates: [{ saleId, amount, fullyPaid }], leftover }.
// El componente arma el payment {method, mpAccount, amount} y hace setSales.
export function allocatePayment(client, sales, amount) {
  let remaining = Math.round(Number(amount) || 0);
  const unpaid = clientMayoristaSales(client, sales)
    .filter(s => saleOutstanding(s) > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const updates = [];
  for (const sale of unpaid) {
    if (remaining <= 0) break;
    const out = saleOutstanding(sale);
    const pay = Math.min(out, remaining);
    updates.push({ saleId: sale.id, amount: pay, fullyPaid: pay >= out });
    remaining -= pay;
  }
  return { updates, leftover: Math.max(0, remaining) };
}
