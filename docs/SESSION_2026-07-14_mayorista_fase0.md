# Sesión 2026-07-14 — Pivote mayorista: FASE 0 (cimientos)

Branch: `claude/mayorista` (dedicada al pivote, creada desde el estado con el
Agente Redactor + baseline estabilizado).

Arranque de la ejecución del `docs/PLAN_MAYORISTA.md`. Fase 0 completa: schema,
migración, sync, navegación. Sin UI de negocio nueva todavía — terreno listo,
cero regresiones.

## Contexto previo (misma sesión)

Antes de la Fase 0, en esta sesión se hizo:
- **Agente Redactor IA** del mensaje de stock diario (banco de copys, sin costo de
  API, refrescable con `/regenerar-banco-mensajes`). Ver `docs/AGENTE_REDACTOR.md`.
  Vive en la branch `claude/claude-md-docs-oNlms`.
- Se creó `claude/mayorista` desde ese estado para el pivote.

## Reality-check previo (grep antes de codear)

Se verificó contra el código real (el plan pedía esto explícitamente):
- ✅ Tema CLARO real en `theme.js` (CLAUDE.md decía "oscuro" — se corrigió).
- ✅ `pricing.js`: resolveChannelPrice / hasChannelPriceOverride / calcMarginGuard /
  calcTierDiscountPct existen; mapa de aliases de canal existe.
- ✅ `CHANNELS`, `DATA_KEYS`/`setterMap`, `migrateLegacySales`, `reverseSaleBalanceDelta`,
  `priceByChannel`, kanban de Compras, `client.tier` — todo confirmado.
- ✅ **Corrección de Diego:** `src/clientIntelligence.js` SÍ existe (churn/cadencia/
  predicción, 6 funciones + 17 tests + `components/clients/ClientIntelligence.jsx`).
  Los de `lib/` (clientSegments/clientInsights) son segmentación, complementarios.

## Bug pre-existente estabilizado (antes de arrancar)

`skuProfitability.test.js` tenía **3 tests en rojo** (venían de `main`):
`rankSkuProfitability` aceptaba `now` pero no lo pasaba a `buildProductSalesStats`,
que caía a `new Date()` real → con ventana de 30 días, los tests con fechas fijas
fallaban a medida que avanzaba el reloj. **Fix de 1 línea** (`commit fix(sku)`).
Baseline estabilizado en **867 verdes** antes de tocar el pivote.

## Fase 0 — qué se hizo (6 bloques, 6 commits)

| Bloque | Cambio | Archivos |
|---|---|---|
| 0.1 | CLAUDE.md "Diseño" → tema CLARO real (cream/navy), nota de que theme.js es la verdad | `CLAUDE.md` |
| 0.2 | ClientSchema (14 campos B2B opcionales) + SaleSchema (saleType/routeId/fulfillmentStatus) + enums B2B | `lib/schemas.js`, `constants/enums.js` |
| 0.3 | "Mayorista" en CHANNELS + aliases `mayorista_a/b/c` en pricing.js | `constants/enums.js`, `pricing.js` |
| 0.4 | Colecciones `prospects`/`visits`/`routes` en sync (DATA_KEYS+state+setterMap+return), memos `active*`, Papelera | `useFirebaseSync.js`, `App.jsx`, `Trash.jsx` |
| 0.5 | `migrateToWholesaleModel()` puro + 8 tests + corrida idempotente en arranque | `wholesaleMigration.js` (+test), `App.jsx` |
| 0.6 | Selector de modo mayorista/minorista en topbar + `businessMode` en settings + `orderNavByMode()` | `settings.js`, `App.jsx` |

## Decisiones de implementación (el POR QUÉ)

- **Schemas con `.passthrough()`**: los campos B2B ya estaban técnicamente
  permitidos; agregarlos explícitos es validación + documentación. Todos opcionales
  para no romper data histórica.
- **`wholesalePrices` NO es colección**: se usa `product.priceByChannel.mayorista_a/b/c`
  reusando el motor de `pricing.js`. Un lugar menos donde inventar.
- **Migración corre al pasar a "online"** (no hay `dataReady` destructurado en App;
  se usa `syncStatus`), guardada por ref, **persiste solo si `didChange`** para no
  escribir a Firestore de gusto. `migrateLegacySales` existía pero NO se invocaba en
  arranque, así que se estableció el patrón acá.
- **NAV por modo con `group` tag**: minorista = orden histórico intacto; mayorista =
  compartido arriba, minorista abajo. Las pantallas mayoristas (Fase 1+) entran con
  `group:"mayorista"` y suben solas. No se oculta nada — ambos modos ven todo.
- **`businessMode` default "mayorista"** (decisión del plan) aunque hoy hay 0 kioscos.

## Estado

- **875 tests verdes** (867 baseline + 8 de la migración). `npm run build` OK.
- Sistema anda igual que antes; sólo cambia el orden del nav según el modo.
- **Cero pantallas de negocio nuevas** todavía (eso es Fase 1).

## Siguiente: FASE 1 — Kioscos + Pricing por tier

`wholesale.js` (resolveTierPrice/minOrderForTier/volumeDiscount/orderMargin) +
`Kioscos.jsx` + ficha + editor de precios por tier + `WholesaleOrder.jsx`.
