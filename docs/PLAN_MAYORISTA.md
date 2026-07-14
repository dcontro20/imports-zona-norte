# Plan maestro — Pivote a venta MAYORISTA (kioscos)

> **Fuente de verdad** del pivote de modelo de negocio de minorista → mayorista.
> Formato hermano de `docs/PLAN_S14_S22.md`. Si una sesión pregunta "cómo va lo
> mayorista" o "qué falta del pivote a kioscos", abrir este doc.
>
> **Escrito:** 2026-07-13. Diseño acordado con Diego en sesión de chat (Opus).
> Este plan lo ejecuta Claude Code fase por fase.
>
> **Estado de ejecución:** ver el bloque final "Progreso de ejecución" + el
> bloque "Estado del proyecto" de `CLAUDE.md`. FASE 0 ✅ completa (2026-07-14).

---

## 🎯 Contexto del pivote (leer antes de tocar nada)

Diego y Gustavo **dejan de priorizar la venta minorista**. Vender de a una unidad
con delivery individual, coordinar cada pedido y cada entrega ya no es rentable en
tiempo ni en plata. **El nuevo foco es venderle a KIOSCOS** (mayorista) por CABA y
algunos en Tigre.

**Decisiones de negocio ya tomadas (NO re-preguntar):**

1. **Transición HÍBRIDA.** Mayorista pasa a ser el foco principal. Minorista NO se
   elimina — queda como canal residual pero 100% funcional. Todo lo construido en
   S1–S22 sigue vivo y operativo. Esto es ADITIVO, no un reemplazo.

2. **Precios por TIER de kiosco A/B/C.** Cada kiosco tiene un tier según su volumen
   de compra. Cada tier tiene su lista de precios mayorista. NO es "minorista con
   descuento" — es su propia lista por volumen.

3. **Los kioscos pagan al recibir (contra entrega).** Por la situación económica,
   ninguno va a adelantar plata. PERO construimos la cuenta corriente COMPLETA
   (crédito, mora, pagos parciales) con **default APAGADO**. El día que un kiosco
   grande pida fiado, se activa por kiosco sin tocar código. Mismo patrón que el
   monotributo (feature completa, default off).

4. **Rutas de reparto BÁSICAS ahora, preparadas para escalar.** Hoy hay CERO
   kioscos. Al principio van a ser pocos. Entonces: ruta manual (Diego ordena las
   paradas) + hoja de ruta simple. PERO el modelo de datos queda listo para
   optimización automática y confirmación por parada. NO codeamos la optimización
   todavía (sería trabajar de más para cero kioscos), pero los campos existen.

5. **Alcance: TODO lo propuesto, en fases priorizadas.** Ver roadmap abajo.

**Principio rector de TODO el plan:**
> **Construir la estructura completa, activar lo mínimo.** El esqueleto queda listo
> para crecer mucho; se encienden features a medida que el negocio las pide. Es
> preferible dejar un campo/flag preparado y apagado que tener que rediseñar cuando
> aparezca el volumen.

---

## 🧱 Principios de arquitectura (respetar el sistema actual)

- **Stack intacto:** React 18 + Vite 5, Firestore real-time, Vitest, CSS-in-JS
  inline con tokens de `src/theme.js`. NADA de frameworks CSS nuevos.
- **Paleta REAL:** tema CLARO cálido. Fuente de verdad = `src/theme.js` (objeto `T`):
  - bg `#F8F2E7` (cream) · card `#FFFFFF` · border `#E5DAC2` · borderSoft `#EFE5CE`
  - text `#1E2B4A` (navy) · textSub `#3A4868` · textMuted `#6B7794` · textFaint `#9AA2B3`
  - primary `#1E2B4A` · primarySoft `#E8EBF2`
  - green `#0F6B5C` · amber `#B07A1F` · blue `#1F5DB8` · red `#B83232` · purple `#5B3592`
  - Fuente Inter/Rubik. Radius: sm 6 / base 10 / lg 14.
  - **(Hecho en 0.1: bloque "Diseño" de CLAUDE.md actualizado al tema claro real.)**
- **Reusar componentes UI, no crear nuevos:** `Card`, `Btn`, `Badge`, `StatCard`,
  `Modal`, `Input`, `Select`, `Table`, `SearchBar` de `UI.jsx`.
- **Lógica pura y testeable:** módulos puros estilo `calcs.js` / `pricing.js` con su
  `.test.js` hermano en Vitest. Los componentes solo renderizan.
- **Soft delete siempre:** `isDeleted` + `deletedAt` + `deletedBy`, memos `active*`
  en App.jsx, restaurable desde Papelera.
- **Sync:** nuevas colecciones se registran en `DATA_KEYS` de `useFirebaseSync.js`
  y en `setterMap`. Escritura SOLO vía `smartSave`. Arrays con items por `id`
  entran solos al merge atómico concurrente.
- **Firestore:** colección `appData`, un doc por key, `{ data: JSON string, updatedAt }`.
- **Mobile-first (obligatorio):** iPhone 375px. Cada pantalla nueva con variante mobile.
- **i18n:** todo en español (negocio). Componentes/funciones en inglés.
- **Commits:** uno por bloque, `feat: ...` en español, `npm run build` + `npm test`
  verdes antes de cada commit.

---

## 🗂️ Modelo de datos nuevo (el corazón del pivote)

### Decisión central: MAYORISTA = CLIENTE con `type` (paraguas)

**(Ajuste 2026-07-14: el eje es "mayorista", no "kiosco".)** Un cliente mayorista
es un `client` con `type: "mayorista"` y campos B2B adicionales. NO es
necesariamente un kiosco — puede ser maxikiosco, druguería, distribuidor, almacén,
etc. El tipo de comercio se guarda aparte en `businessType` (solo clasificación/
filtro). Los minoristas existentes quedan `type: "minorista"` (default por
migración). Así toda la inteligencia de cliente existente (churn, cadencia, LTV,
predicción — en `src/clientIntelligence.js`; segmentos en `lib/clientSegments.js` +
`lib/clientInsights.js`) funciona sobre clientes mayoristas sin reescribir nada.

**Extensión del schema `client` (campos nuevos, todos opcionales)** — implementado
en `lib/schemas.js` (ClientSchema):

```js
type: "minorista" | "mayorista",   // default "minorista" — EJE GRANDE del negocio
businessType: "kiosco" | "maxikiosco" | "drugueria" | "distribuidor" | "almacen" | "otro" | null,  // clasificación/filtro
businessName, cuit, address, zone, lat, lng, contactName, contactPhone, openingHours,
wholesaleTier: "A" | "B" | "C" | null,
pipelineStage: "prospecto" | "contactado" | "visitado" | "primera_compra" | "activo" | "en_pausa",
source,
creditEnabled: false, creditLimitARS: 0,   // cuenta corriente (apagada por default)
lastVisitAt,
```

Enums en `constants/enums.js`: `CLIENT_TYPES = ["minorista","mayorista"]`,
`BUSINESS_TYPES = ["kiosco","maxikiosco","drugueria","distribuidor","almacen","otro"]`.
Las pantallas pueden mantener el label "Kioscos" en la UI (la mayoría lo son), pero
el modelo y el filtro son por `type: "mayorista"` + filtro opcional por `businessType`.

### Colecciones NUEVAS en Firestore (registradas en 0.4)

- **`prospects`** — leads mayoristas sin convertir. Al llegar a "primera_compra" se
  promociona a `client` con `type=mayorista`.
- **`visits`** — bitácora de visitas comerciales (CRM).
- **`routes`** — rutas de reparto. Estructura lista para escalar; uso básico.

**`wholesalePrices`** → NO se crea colección. Se usa `product.priceByChannel` con
claves `mayorista_a/b/c` (aliases agregados a `pricing.js` en 0.3).

### Extensión del schema `sale` (implementado en 0.2)

```js
saleType: "minorista" | "mayorista",  // default "minorista"
routeId: null,
fulfillmentStatus: "pendiente" | "armado" | "en_ruta" | "entregado" | "cobrado",
```

### `CHANNELS` — "Mayorista" agregado (0.3).

### Migración `migrateToWholesaleModel(clients, sales)` (0.5)

Módulo puro `src/wholesaleMigration.js` + test. Idempotente: setea type/saleType/
fulfillmentStatus en data previa. Corre al arranque (App.jsx, al pasar a "online"),
persiste solo si hubo cambios.

---

## 🗺️ Módulos nuevos (pantallas) y dónde viven

| Pantalla | Archivo | Qué hace |
|---|---|---|
| **Kioscos** | `Kioscos.jsx` | Lista/ficha de kioscos (clientes type=kiosco). |
| **Pipeline B2B** | `Pipeline.jsx` | Kanban de captación (patrón del kanban de Compras). |
| **Mapa prospección** | `ProspectMap.jsx` | Mapa por zona con pins. |
| **Pedido mayorista** | `WholesaleOrder.jsx` | Carga rápida, precio por tier + margen en vivo. |
| **Rutas** | `Routes.jsx` | Armado de ruta por zona (manual). Hoja de ruta. |

Módulos puros nuevos (con `.test.js`): `src/wholesale.js`, `src/prospecting.js`,
`src/routes.js`, `src/wholesaleIntelligence.js`. Utilidades en `src/lib/`:
`creditAccount.js`, `routeSheet.js`, `wholesaleMessage.js`.

### Navegación / modo Mayorista ↔ Minorista (0.6, hecho)

Selector en topbar + `businessMode` en settings (default "mayorista") +
`orderNavByMode()` reordena NAV_ITEMS por modo sin ocultar nada.

---

## 🚦 Roadmap por fases

Convenciones: 🔴 crítico · 🟠 alto · 🟡 medio · 🟢 nice-to-have.

### **FASE 0 — Cimientos** 🔴 ✅ COMPLETA (2026-07-14)
- 0.1 ✅ CLAUDE.md "Diseño" al tema claro real.
- 0.2 ✅ Schema `client` (B2B) + `sale` (saleType, fulfillment) en `lib/schemas.js` + enums.
- 0.3 ✅ "Mayorista" en CHANNELS + aliases `mayorista_a/b/c` en `pricing.js`.
- 0.4 ✅ Colecciones `prospects`/`visits`/`routes` en sync + memos + Papelera.
- 0.5 ✅ `migrateToWholesaleModel()` puro + 8 tests + corrida en arranque.
- 0.6 ✅ Selector de modo + `businessMode` en settings + NAV por modo.

### **FASE 1 — Kioscos + Pricing por tier** 🔴 (SIGUIENTE)
- 1.1 `wholesale.js` + test: `resolveTierPrice`, `minOrderForTier`, `volumeDiscount`, `orderMargin`.
- 1.2 `Kioscos.jsx`: lista type=kiosco, filtros tier/zona/estado, StatCards.
- 1.3 Ficha de kiosco + convertir minorista → kiosco.
- 1.4 Editor de listas de precio por tier (priceByChannel.mayorista_a/b/c + margin guard).
- 1.5 `WholesaleOrder.jsx`: pedido con precio por tier + margen + validar mínimo.
- 1.6 Pedido recurrente (repetir último).

### **FASE 2 — Captación: Pipeline + Mapa + Visitas** 🟠
- 2.1 `prospecting.js` + test. 2.2 `Pipeline.jsx` (kanban). 2.3 `ProspectMap.jsx` (alta manual).
- 2.4 `visits` CRM. 2.5 (opcional) Google Places.

### **FASE 3 — Logística: Rutas** 🟠
- 3.1 `routes.js` + test (stub `optimizeStops`). 3.2 `Routes.jsx`. 3.3 `routeSheet.js`.
- 3.4 Estados de fulfillment.

### **FASE 4 — Cuenta corriente B2B (completa, apagada)** 🟠
- 4.1 `creditAccount.js` + test. 4.2 toggle en ficha. 4.3 pedido respeta modo.
- 4.4 vista de cuentas corrientes. 4.5 `wholesaleMessage.js` cobranza.

### **FASE 5 — Inteligencia B2B + Dashboard mayorista** 🟡
- 5.1 `wholesaleIntelligence.js` + test. 5.2 Dashboard modo mayorista. 5.3 reservar stock.
- 5.4 P&L mayorista vs minorista.

### **FASE 6 — Pulido, mobile y power-user B2B** 🟢
- 6.1 mobile. 6.2 bulk actions. 6.3 empty states. 6.4 export CSV. 6.5 ⌘K.

---

## 🔌 Decisión pendiente: búsqueda automática de kioscos (Google Places)

FASE 2 arranca con **alta MANUAL** (MVP, cero costo). Places (2.5) es opcional y
requiere API key de Google (costo por uso) — se suma sólo si la prospección manual
se vuelve cuello de botella. No bloquear el pivote por esto.

---

## ✅ Qué se REUSA (grep antes de crear)

- **Inteligencia de cliente**: `src/clientIntelligence.js` (buildClientStats,
  classifyClient, predictNextPurchase, clientAlerts, segmentBreakdown,
  clientsToReach) → churn/cadencia/predicción B2B. `lib/clientSegments.js` +
  `lib/clientInsights.js` → segmentación (complementarios, NO sustitutos).
- **Pricing** (`pricing.js`): `resolveChannelPrice`, `hasChannelPriceOverride`,
  `calcMarginGuard`, `calcTierDiscountPct`.
- **Kanban de Compras** (`components/purchases/KanbanBoard.jsx`): patrón para Pipeline.
- **Saldos de cliente** (`balance`, `reverseSaleBalanceDelta` en calcs.js).
- **Sugeridor de compra** (`purchaseRecommendations`, `eoq`).
- **Generador de mensajes** (`lib/clientMessage.js`, `lib/whatsappMessage.js`).
- **Reportes/P&L por canal**: separan mayorista con solo agregar el canal.
- **UI.jsx completo**. **Sync, soft-delete, papelera, auditoría**.

---

## 🧪 Tests y calidad

- Cada módulo puro nuevo con su `.test.js`. Baseline verde actual: **875** (era 837
  en el plan; se actualizó tras el redactor IA + fix de skuProfitability).
- `npm run build` + `npm test` verdes antes de CADA commit.
- Grep primero para no duplicar features ya hechas.
- Mobile: probar mentalmente cada pantalla a 375px.

---

## 🗒️ REGLA PERMANENTE — resumen MD al cerrar cada bloque grande

> **Acordado con Diego el 2026-07-14. Es un hábito AUTOMÁTICO, no algo que haya que
> pedir.** Aplica al: fin de fase, refactor importante, decisión de arquitectura, o
> cualquier cambio significativo.

Al cerrar un bloque grande, SIEMPRE:

1. **Commit(s) `feat:`/`refactor:`** con build + tests verdes.
2. **`/persist-session`** — journal (`docs/SESSION_YYYY-MM-DD_*.md`) + actualizar el
   bloque "Estado del proyecto" de `CLAUDE.md` + memorias.
3. **Actualizar `docs/MAPA_DEL_SISTEMA.md`** si hubo cambios estructurales.
4. **Generar un RESUMEN en Markdown autocontenido** siguiendo el estándar de
   `IZN_Pivote_Mayorista_Fase0_Resumen.md`. Debe capturar, sin omitir nada:
   - qué se hizo · decisiones y su porqué · archivos tocados · commits (con hash) ·
     estado de tests/build · próximos pasos.
   - **Doble propósito:** queda en la documentación del proyecto Y se le entrega a
     Diego para descargar/cargar en el chat de diseño para revisión.
   - Formato: `.md` (texto plano, ideal para project knowledge). Front-matter YAML
     arriba con metadata (fase, estado, fecha, branch, tests). Nombre:
     `IZN_Pivote_Mayorista_FaseN_Resumen.md`.

Este resumen se entrega vía archivo descargable al usuario Y se puede versionar en
`docs/` como copia.

---

## 📌 Progreso de ejecución

| Fase | Estado | Fecha | Notas |
|---|---|---|---|
| 0 — Cimientos | ✅ Completa | 2026-07-14 | 6 bloques, +8 tests (875 total). Branch `claude/mayorista`. Ver `docs/SESSION_2026-07-14_mayorista_fase0.md`. |
| 1 — Kioscos + Pricing tier | ⏳ Siguiente | — | — |
| 2 — Captación | ⬜ Pendiente | — | — |
| 3 — Rutas | ⬜ Pendiente | — | — |
| 4 — Cuenta corriente B2B | ⬜ Pendiente | — | — |
| 5 — Inteligencia + Dashboard | ⬜ Pendiente | — | — |
| 6 — Pulido | ⬜ Pendiente | — | — |

---

*Escrito 2026-07-13 (Opus + Diego). Ejecuta Claude Code, fase por fase, respetando
el sistema existente y sin tirar nada de lo minorista.*
