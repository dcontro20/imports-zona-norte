// Enums del dominio — listas cerradas de valores que usan selects/filtros.

export const CHANNELS = ["WhatsApp", "Instagram", "Delivery", "Presencial", "Mayorista"];
export const PAYMENT_METHODS = ["Mercado Pago", "Lemon", "USD Cash", "USDT", "Pesos Cash"];
export const MP_ACCOUNTS = ["MP Diego", "MP Gustavo"];
export const EXPENSE_CATEGORIES = [
  "Flete Paraguay", "Comisiones Crypto", "Comisión pasero", "Comisión proveedor",
  "Envío Vía Cargo", "Packaging", "Envíos locales", "Publicidad", "Impuestos/Tasas",
  "Herramientas/Sistema", "Otro",
];
export const CURRENCIES = { ARS: "$", USD: "US$", USDT: "₮" };
export const WITHDRAW_PERSONS = ["Diego", "Gustavo"];

// WITHDRAW_TYPES: "Garantía / Devolución" renombrado a "Cambio por garantía".
// Datos viejos en Firestore con el string anterior se leen con el helper isGarantia().
export const WITHDRAW_TYPES = ["Consumo propio", "Cambio por garantía", "Regalo / Canje"];

export const DISCOUNT_REASONS = ["Promo", "Volumen (3+)", "Cliente frecuente", "Negociación", "Otro"];

// ============================================================================
// MAYORISTA / B2B — pivote a venta mayorista (ver docs/PLAN_MAYORISTA.md)
// ============================================================================

// Eje grande del negocio. Default "minorista" (migración de la base existente).
// "mayorista" es el paraguas: TODA la inteligencia (churn, pricing por tier,
// rutas) opera sobre este campo, sea el comercio un kiosco o no.
export const CLIENT_TYPES = ["minorista", "mayorista"];

// Tipo de comercio (solo clasificación/filtro para clientes type="mayorista").
// Opcional, default null. La mayoría serán kioscos pero no es obligatorio.
export const BUSINESS_TYPES = ["kiosco", "maxikiosco", "drugueria", "distribuidor", "almacen", "otro"];

// Tier mayorista por volumen de compra. Cada tier tiene su lista de precios
// (vive en product.priceByChannel.mayorista_a/b/c). null = sin asignar.
export const WHOLESALE_TIERS = ["A", "B", "C"];

// Embudo comercial completo (client type=mayorista).
export const PIPELINE_STAGES = ["prospecto", "contactado", "visitado", "primera_compra", "activo", "en_pausa"];
// Subconjunto para leads que todavía NO son clientes (colección `prospects`).
export const PROSPECT_STAGES = ["prospecto", "contactado", "visitado"];
export const PROSPECT_SOURCES = ["mapa", "referido", "manual", "descubrimiento"];

// Bitácora de visitas comerciales (colección `visits`).
export const VISIT_OUTCOMES = ["interesado", "no_interesado", "volver", "vendido", "sin_respuesta"];

// Rutas de reparto (colección `routes`).
export const ROUTE_STATUS = ["planificada", "en_curso", "cerrada"];
export const STOP_STATUS = ["pendiente", "entregado", "no_estaba", "reprogramar"];

// Pedidos mayoristas (extensión de `sale`).
export const SALE_TYPES = ["minorista", "mayorista"];
export const FULFILLMENT_STATUS = ["pendiente", "armado", "en_ruta", "entregado", "cobrado"];
