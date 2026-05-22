// Enums del dominio — listas cerradas de valores que usan selects/filtros.

export const CHANNELS = ["WhatsApp", "Instagram", "Delivery", "Presencial"];
export const PAYMENT_METHODS = ["Mercado Pago", "Lemon", "USD Cash", "USDT", "Pesos Cash"];
export const MP_ACCOUNTS = ["MP Diego"];
export const EXPENSE_CATEGORIES = [
  "Flete Paraguay", "Comisiones Crypto", "Comisión pasero", "Comisión proveedor",
  "Envío Vía Cargo", "Packaging", "Envíos locales", "Publicidad", "Impuestos/Tasas",
  "Herramientas/Sistema", "Otro",
];
export const CURRENCIES = { ARS: "$", USD: "US$", USDT: "₮" };
export const WITHDRAW_PERSONS = ["Diego"];

// WITHDRAW_TYPES: "Garantía / Devolución" renombrado a "Cambio por garantía".
// Datos viejos en Firestore con el string anterior se leen con el helper isGarantia().
export const WITHDRAW_TYPES = ["Consumo propio", "Cambio por garantía", "Regalo / Canje"];

export const DISCOUNT_REASONS = ["Promo", "Volumen (3+)", "Cliente frecuente", "Negociación", "Otro"];
