// Fachada de re-export — mantiene todos los imports existentes funcionando.
// Contenido real en src/constants/*.js organizados por tema.
//
// Guía de dónde vive cada cosa:
//   - constants/brands.js    → BRANDS, BRAND_COLORS
//   - constants/enums.js     → CHANNELS, PAYMENT_METHODS, MP_ACCOUNTS, EXPENSE_CATEGORIES,
//                              CURRENCIES, WITHDRAW_PERSONS, WITHDRAW_TYPES, DISCOUNT_REASONS
//   - constants/warranty.js  → FAILURE_REASONS, FAILURE_REASON_CATEGORY, isGarantia
//   - constants/products.js  → DEFAULT_PRODUCTS (catálogo completo ~240 items)

export * from "./constants/brands.js";
export * from "./constants/enums.js";
export * from "./constants/warranty.js";
export * from "./constants/products.js";
