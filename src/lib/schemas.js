// src/lib/schemas.js
//
// Schemas Zod para validar datos antes de escribir a Firestore o de procesar
// en cálculos. Atrapa data malformada que de otro modo rompería los cálculos
// silenciosamente (ej: total como string "123abc", productId nulo).
//
// Estrategia: validación SUAVE — no bloquea, solo loguea warning. Los datos
// históricos pueden tener problemas que NO queremos que rompan la app, pero
// SÍ queremos visibilidad.

import { z } from "zod";

// === HELPERS ===

// Número que acepta string convertible. Útil porque algunos inputs guardan strings.
const numLoose = z.coerce.number().optional().nullable();
const strOpt = z.string().optional().nullable();
const boolOpt = z.boolean().optional().nullable();

// === PRODUCT ===
export const ProductSchema = z.object({
  id: z.string().min(1),
  brand: z.string().min(1),
  model: strOpt,
  flavor: strOpt,
  puffs: numLoose.transform(v => v ?? 0),
  stock: numLoose.transform(v => v ?? 0),
  priceUSD: numLoose.transform(v => v ?? 0),
  priceARS: numLoose,
  costUSDT: numLoose,
  createdAt: strOpt,
  isDeleted: boolOpt,
}).passthrough(); // permite campos adicionales

// === SALE ITEM ===
const SaleItemSchema = z.object({
  productId: z.string().min(1).nullable().optional(),
  name: strOpt,
  qty: numLoose.transform(v => v ?? 1),
  priceUSD: numLoose,
  customPrice: numLoose,
  costUSDTAtSale: numLoose,
}).passthrough();

// === PAYMENT ===
const PaymentSchema = z.object({
  method: strOpt,
  mpAccount: strOpt,
  amount: numLoose.transform(v => v ?? 0),
  account: strOpt,
}).passthrough();

// === SALE ===
export const SaleSchema = z.object({
  id: z.string().min(1),
  date: z.string().min(1),
  items: z.array(SaleItemSchema).optional().default([]),
  total: numLoose.transform(v => v ?? 0),
  currency: z.enum(["ARS", "USD", "USDT"]).optional().default("ARS"),
  payments: z.array(PaymentSchema).optional().default([]),
  paymentMethod: strOpt,
  channel: strOpt,
  clientId: strOpt,
  clientName: strOpt,
  exchangeRate: numLoose,
  createdBy: strOpt,
  isDeleted: boolOpt,
  linkedOfferId: strOpt,

  // --- Mayorista (pedidos a kioscos, todos opcionales) ---
  saleType: z.enum(["minorista", "mayorista"]).optional().default("minorista"),
  routeId: strOpt,          // si el pedido entra en una ruta de reparto
  fulfillmentStatus: z.enum(["pendiente", "armado", "en_ruta", "entregado", "cobrado"]).optional().nullable(),
}).passthrough();

// === CLIENT ===
export const ClientSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  phone: strOpt,
  email: strOpt,
  instagram: strOpt,
  zona: strOpt,
  tier: z.enum(["regular", "vip", "diamante", "mayorista"]).optional().default("regular"),
  balance: numLoose.transform(v => v ?? 0),
  dateOfBirth: strOpt,
  inactive: boolOpt,
  inactiveReason: strOpt,
  isBlocked: boolOpt,
  isDeleted: boolOpt,
  createdAt: strOpt,

  // --- B2B / mayorista (pivote a kioscos, todos opcionales) ---
  type: z.enum(["minorista", "kiosco"]).optional().default("minorista"),
  businessName: strOpt,   // nombre del kiosco/comercio
  cuit: strOpt,
  address: strOpt,
  zone: strOpt,           // barrio/zona — clave para rutas
  lat: numLoose,
  lng: numLoose,
  contactName: strOpt,
  contactPhone: strOpt,
  openingHours: strOpt,
  wholesaleTier: z.enum(["A", "B", "C"]).optional().nullable(),
  pipelineStage: z.enum(["prospecto", "contactado", "visitado", "primera_compra", "activo", "en_pausa"]).optional().nullable(),
  source: strOpt,
  creditEnabled: boolOpt,   // cuenta corriente: default off (paga contra entrega)
  creditLimitARS: numLoose,
  lastVisitAt: strOpt,      // última visita comercial (≠ última compra)
}).passthrough();

// === EXPENSE ===
export const ExpenseSchema = z.object({
  id: z.string().min(1),
  date: z.string().min(1),
  category: strOpt,
  description: strOpt,
  amountARS: numLoose.transform(v => v ?? 0),
  amountUSD: numLoose,
  isDeleted: boolOpt,
}).passthrough();

// === PURCHASE ===
export const PurchaseSchema = z.object({
  id: z.string().min(1),
  date: z.string().min(1),
  supplier: strOpt,
  status: z.enum(["pedido", "en_camino", "recibido", "verificado", "cancelado"])
    .optional().default("pedido"),
  items: z.array(z.object({
    productId: strOpt,
    qty: numLoose.transform(v => v ?? 0),
  }).passthrough()).optional().default([]),
  totalUSDT: numLoose,
  isDeleted: boolOpt,
}).passthrough();

// === VALIDADOR SOFT ===
// Devuelve { valid: bool, data?, errors? }
// No tira excepciones — perfecto para validar data histórica sin romper.
export function validateSoft(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return { valid: true, data: result.data };
  return {
    valid: false,
    errors: result.error.issues.map(i => ({
      path: i.path.join("."),
      message: i.message,
    })),
  };
}

// === VALIDAR LOTE DE DATOS ===
// Útil para corridas batch: "validar todos los productos de Firestore".
// Devuelve { totalChecked, valid, invalid, invalidEntries: [{id, errors}] }
export function validateBatch(schema, items) {
  let valid = 0;
  let invalid = 0;
  const invalidEntries = [];
  (items || []).forEach(item => {
    const r = validateSoft(schema, item);
    if (r.valid) valid += 1;
    else {
      invalid += 1;
      invalidEntries.push({ id: item?.id || "?", errors: r.errors });
    }
  });
  return {
    totalChecked: (items || []).length,
    valid,
    invalid,
    invalidEntries,
  };
}
