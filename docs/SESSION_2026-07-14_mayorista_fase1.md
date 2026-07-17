# Sesión 2026-07-14 — Pivote mayorista: FASE 1 (Kioscos + Pricing por tier)

Branch: `claude/mayorista`. Continúa la ejecución del `docs/PLAN_MAYORISTA.md`.
Fase 1 completa: el núcleo comercial. Ya se le puede vender a un cliente mayorista
de punta a punta.

## Ajustes previos a la fase (acordados con Diego)

### Consolidación de pricing viejo
`src/lib/wholesalePricing.js` (modelo viejo: % de descuento sobre minorista por
unidades) estaba **muerto** — solo lo importaba su propio test, y su export
`WHOLESALE_TIERS` chocaba con el enum A/B/C de Fase 0. **Borrado** (módulo + test).
El concepto útil (descuento escalonado por volumen) revivió en `wholesale.js` como
complemento **opcional y desacoplado del tier del cliente**. Se sacó "mayorista"
del select de tier retail en Clients.jsx (queda regular/vip/diamante, alineado con
`DEFAULT_TIER_DISCOUNTS`); se mantiene en el enum del schema para compat.

### Cambio de eje del modelo: "mayorista", no "kiosco"
El eje grande pasa a ser **`type: "minorista" | "mayorista"`** (antes "kiosco"). Un
mayorista NO es necesariamente un kiosco (puede ser maxikiosco, druguería,
distribuidor, almacén...). Se agregó **`businessType`** (kiosco/maxikiosco/
drugueria/distribuidor/almacen/otro/null) como clasificación/filtro, con enum
`BUSINESS_TYPES`. Toda la inteligencia opera sobre `type="mayorista"`. Se actualizó
todo lo de Fase 0 (enums, schema, migración test, comentarios). La migración sigue
seteando `type ??= "minorista"`.

### Regla permanente nueva
Al cerrar cada bloque grande: `/persist-session` + **generar SIEMPRE un resumen MD
autocontenido** (estándar `IZN_Pivote_Mayorista_Fase0_Resumen.md`). Documentado en
`PLAN_MAYORISTA.md` → "REGLA PERMANENTE" y en `CLAUDE.md` (self-updating context).

## Fase 1 — qué se hizo (6 bloques)

| Bloque | Cambio | Archivos |
|---|---|---|
| 1.1 | `wholesale.js` (puro, 22 tests): `resolveTierPrice`, `hasTierPrice`, `minOrderForTier` + `validateOrderMinimum`, `volumeDiscount` (opcional, breakpoints parametrizables), `applyPct`, `orderMargin` (usa costo real avgCostUSDT) | `src/wholesale.js` (+test) |
| 1.2/1.3 | `Kioscos.jsx`: lista de clientes type=mayorista, filtros (búsqueda/businessType/tier/pipeline), KPIs (activos, ticket B2B, recompra 30d), cards con segmento + predicción de recompra (reusa `clientIntelligence`). Ficha crear/editar. Candidatos (tier="mayorista" viejo) → "convertir" (setea type + tier + businessType, normaliza tier retail a regular) | `src/components/Kioscos.jsx`, `App.jsx` |
| 1.4 | Editor de precios por tier en el modal de Products (bloque plegable, priceByChannel.mayorista_a/b/c + margen en vivo por tier con colores) | `src/components/Products.jsx` |
| 1.5 | `WholesaleOrder.jsx`: pedido mayorista — elegís cliente → precios de su tier + margen en vivo por línea y total + descuento por volumen opcional + validación de mínimo → genera sale (saleType=mayorista, channel=Mayorista, fulfillmentStatus=pendiente) + descuenta stock | `src/components/WholesaleOrder.jsx`, `App.jsx` |
| 1.6 | "🔁 Repetir último pedido" precarga los items del último pedido mayorista del cliente | `WholesaleOrder.jsx` |

## Decisiones de implementación (el porqué)

- **`resolveTierPrice` delega en `resolveChannelPrice`** (pricing.js) mapeando tier→
  `mayorista_a/b/c`. Un solo motor de precios, cero duplicación.
- **`volumeDiscount` desacoplado del tier del cliente**: precio base = lista del tier;
  el volumen es un extra opcional que Diego activa por pedido (checkbox). Breakpoints
  parametrizables (default 24/60/120u → 3/6/10%, tunables).
- **El pedido mayorista NO toca pagos/caja/balance en Fase 1.** Nace con
  `fulfillmentStatus="pendiente"` y `payments:[]`. Cobranza (contra entrega) y crédito
  son fases 3/4. Sí descuenta stock + registra el sale (para COGS/reportes).
- **Candidatos a mayorista se MARCAN, no se auto-convierten** (decisión de Diego): la
  migración no los toca; en Kioscos aparecen con botón "convertir" uno por uno.
- **UI 100% con tokens T + componentes de UI.jsx** (Card, Btn, Modal, Input, Select,
  StatCard). Cero hex hardcodeado en las pantallas nuevas. Mobile-first 375px.

## Estado

- **887 tests verdes** (era 865 tras borrar el módulo viejo; +22 de wholesale.js).
- `npm run build` OK. Cero regresiones.
- Pantallas nuevas visibles en modo Mayorista: **Kioscos** + **Pedido mayorista**
  (ambas arriba en el nav por el group:"mayorista").

## Siguiente: FASE 2 — Captación (Pipeline + Mapa + Visitas)

`prospecting.js` + `Pipeline.jsx` (kanban prospecto→activo) + `ProspectMap.jsx`
(alta manual) + CRM de `visits`. Google Places (2.5) queda opcional.
