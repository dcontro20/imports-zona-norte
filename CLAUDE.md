# IMPORTS ZONA NORTE — Sistema de Gestión de Negocio de Vapes

## Qué es este proyecto

Sistema web de gestión completa para "Imports Zona Norte", un negocio de importación y reventa de vapes electrónicos operado por Diego Contró desde zona norte de Buenos Aires. Diego es **100% dueño** del negocio (single-user app desde 2026-05-22 — ex-socio Gustavo dejó de ser parte). La app está deployada en Vercel y usa Firebase Firestore como base de datos en tiempo real para operar desde cualquier dispositivo.

**URL de producción:** https://imports-zona-norte.vercel.app
**Repositorio:** github.com/dcontro20/imports-zona-norte
**Deploy automático:** push a `main` → Vercel detecta y deploya en 1-2 min

---

## Stack técnico

- **Frontend:** React 18 con Vite 5
- **Base de datos:** Firebase Cloud Firestore (proyecto `imports-zona-norte`, región `southamerica-east1`)
- **Hosting:** Vercel (deploy automático desde GitHub)
- **Testing:** Vitest (183 tests puros: calcs.js, pricing.js, productIntelligence.js)
- **Estilo:** CSS-in-JS inline (no hay framework CSS externo). Tokens centralizados en `src/theme.js`.
- **Diseño:** tema CLARO cálido estilo Notion/Linear (fondo cream #F8F2E7, cards blancas #FFFFFF, bordes beige #E5DAC2), texto navy #1E2B4A, acentos verde #0F6B5C, ámbar/cobre #B07A1F, azul #1F5DB8, rojo #B83232, púrpura #5B3592. Tipografía Inter/Rubik. **Fuente de verdad = `src/theme.js` (objeto `T`)**, NO este resumen.
- **API externa:** dolarapi.com para cotización blue venta automática

---

## Estructura del proyecto

```
imports-zona-norte/
├── index.html              # Entry point, meta tags PWA
├── package.json            # Deps: react, react-dom, firebase, vitest
├── vite.config.js          # Plugin React + manual chunks (firebase, react separados)
├── .gitignore
└── src/
    ├── main.jsx                    # ReactDOM.createRoot
    ├── App.jsx                     # Layout, nav, login, routing, ErrorBoundary, FABs (QuickSale + QuickWithdrawal)
    ├── useFirebaseSync.js          # Custom hook: toda la lógica de sync Firebase ↔ localStorage
    ├── useSettings.js              # Hook que consume settings.js y re-renderiza on change
    ├── AppContext.js               # React Context: currentUser, exchangeRate, logAudit, logStock
    ├── firebase.js                 # Config Firebase + helpers saveToFirestore/subscribeToFirestore + Auth
    ├── constants.js                # Re-export agregador (BRANDS, CHANNELS, DEFAULT_PRODUCTS, etc.)
    ├── constants/                  # Constantes del dominio modularizadas
    │   ├── brands.js               # BRANDS + BRAND_COLORS
    │   ├── enums.js                # CHANNELS, PAYMENT_METHODS, MP_ACCOUNTS, WITHDRAW_PERSONS
    │   ├── products.js             # DEFAULT_PRODUCTS (~240 sabores pre-cargados)
    │   └── warranty.js             # FAILURE_REASONS + helper isGarantia
    ├── helpers.js                  # uid, formatMoney, formatDate, loadData (sin saveData — ver anti-loop)
    ├── settings.js                 # Settings configurables (thresholds) en localStorage + DEFAULT_SETTINGS
    ├── theme.js                    # Tokens T (surfaces/text/status), AVATAR_PALETTE, pickAvatarColor
    ├── calcs.js                    # Funciones puras de cálculo financiero (calcMonthSummary, calcPartnerBalances, etc.)
    ├── calcs.test.js               # 96 tests financieros
    ├── productIntelligence.js      # S15: 15 funciones puras (ABC, turnover, cross-sell, elasticidad)
    ├── productIntelligence.test.js # 38 tests
    ├── pricing.js                  # S16: 17 funciones puras (cupones, bundles, descuentos por volumen/tier)
    ├── pricing.test.js             # 49 tests
    └── components/
        ├── UI.jsx                  # Card, Badge, Btn, StatCard, Modal, Input, Select, Table, SearchBar, FormRow
        ├── Dashboard.jsx           # KPIs, alertas inteligentes, balance cuentas, top productos
        ├── Products.jsx            # CRUD productos (con costUSDT, badges S15, default filter "Con stock")
        ├── Sales.jsx               # Ventas: cascading picker, pago mixto, deudas, precio custom, repetir, cupones
        ├── QuickSale.jsx           # Venta rápida mobile: buscar → qty → pagar → listo (FAB flotante)
        ├── QuickWithdrawal.jsx     # Merma rápida mobile: 2 toques desde FAB (consumo propio)
        ├── Purchases.jsx           # Importaciones: proveedor, estados, costos USDT, tracking lotes
        ├── Clients.jsx             # Clientes: cards con avatar, contact chips, historial sparkline, tier VIP
        ├── Expenses.jsx            # Gastos por categoría
        ├── Withdrawals.jsx         # Consumo propio (mermas): Diego/Gustavo, descuenta stock, guard mes cerrado
        ├── CashBox.jsx             # Caja multi-moneda + cierre de caja diario + conciliación
        ├── Reports.jsx             # Reportes, márgenes, break-even, Inteligencia de Producto (S15), elasticidad
        ├── WhatsApp.jsx            # Mensaje de stock: modo Completo + modo Stories (corto)
        ├── Partners.jsx            # "Mi Cartera": patrimonio + ROI + rendimiento + retiros (Diego 100%)
        ├── Closures.jsx            # Cierres mensuales: foto financiera del mes + detector inconsistencias
        ├── Export.jsx              # Exportar CSVs + backup JSON + libro mayor contable
        ├── PriceLog.jsx            # Editor masivo de precios por modelo + historial
        ├── StockLog.jsx            # Log de movimientos de stock (entradas, salidas, ajustes)
        ├── ExchangeMonitor.jsx     # Cotizaciones (Blue/Oficial/MEP/USDT) + cards exchanges preferidos
        ├── AuditLog.jsx            # Registro de auditoría (acciones por usuario)
        ├── Coupons.jsx             # S16: Hub de promos — cupones formales + bundles/combos
        ├── SettingsModal.jsx       # Configuración de thresholds (alertas, límites, recordatorios)
        ├── Trash.jsx               # Papelera: soft-delete, restaurar (incl. cupón usedCount), purge 30d
        ├── cash/                   # Modularización CashBox (MovementForm, shared helpers)
        ├── clients/                # Modularización Clients (HistoryModal, primitives, helpers)
        └── sales/                  # Modularización Sales (SaleCard)
```

---

## Firebase — Configuración

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyDAL85SFntaHyupAbrPxJGIpdSSSnecql4",
  authDomain: "imports-zona-norte.firebaseapp.com",
  projectId: "imports-zona-norte",
  storageBucket: "imports-zona-norte.firebasestorage.app",
  messagingSenderId: "255382859803",
  appId: "1:255382859803:web:e263d95ee4a57358d908be"
};
```

**Reglas Firestore:** cerradas — solo Diego puede leer/escribir.
- Owner (`dcontro20@gmail.com`): acceso total y único
- Cualquier otro email autenticado o anónimo: denied
- Deploy: `firebase deploy --only firestore:rules`

**Auth:** Firebase Auth email/password. Setup documentado en `docs/FIREBASE_AUTH_SETUP.md`. Usuarios creados con `scripts/create-users.mjs`.

**Colección principal:** `appData` — cada documento es una key (products, sales, purchases, clients, expenses, withdrawals, cashMovements, stockLog, priceLog, monthlyClosures, partnerWithdrawals, exchangeRate, auditLog). Cada doc tiene:
- `data`: string JSON con el array/valor
- `updatedAt`: ISO timestamp

---

## Sistema de sincronización Firebase ↔ localStorage

Toda la lógica vive en `src/useFirebaseSync.js` (custom hook).

### Flujo:
1. Al abrir la app, carga datos de **localStorage** como caché rápido (render inmediato)
2. Se suscribe a **Firestore en tiempo real** con `onSnapshot` para cada key
3. Cuando llegan datos de Firestore, pisa el state y actualiza localStorage
4. Un flag `firestoreReady` bloquea escrituras a Firestore hasta que **todas** las keys completen el initial load
5. Un flag `fromFirestore` por cada key evita que datos recibidos de Firestore se re-escriban (anti-loop)
6. Timeout de 8 segundos: si Firestore no responde, muestra datos locales en modo **read-only** (no habilita escrituras)

### Anti-loop (bug histórico resuelto):
Hubo un loop infinito donde onSnapshot → setState → useEffect → saveToFirestore → onSnapshot que quemó la cuota. Se resolvió con:
- `fromFirestore` ref que bloquea re-escritura de datos que vinieron de Firebase
- `firestoreReady` ref que bloquea TODA escritura hasta completar initial load
- `smartSave` como único punto de salida a Firestore
- La función `saveData()` de helpers.js fue eliminada por bypasear estas protecciones

### Race condition dólar blue:
La API de dolarapi.com solo actualiza el exchangeRate si Firestore no mandó uno primero (`fromFirestore["exchangeRate"]` check).

---

## Módulos funcionales — Detalle

### Dashboard
- KPIs con selector de período (Hoy / Semana / Mes)
- Ventas, ganancia neta, stock, velocidad de ventas
- Desglose por método de pago, marca, socio
- Balance estimado de cuentas (MP Diego, MP Gustavo, Lemon, Cash)
- Alertas inteligentes:
  - Stock agotado / stock bajo (≤3)
  - Productos populares agotados (vendidos ≥3/mes pero stock 0)
  - Proyección de agotamiento (se agotan en ≤7 días al ritmo actual)
  - Clientes con deuda pendiente / saldo a favor
  - Recordatorio de backup
  - Sin ventas hoy

### Productos (constants.js + Firestore)
- ~240 productos pre-cargados con estructura: `{ id, brand, model, flavor, puffs, stock, priceUSD, costUSDT }`
- Marcas: Elfbar, Geek Bar, Ignite, Lost Mary, Nikbar, Supreme
- Precios en USD, conversión automática a ARS con blue venta
- Agrupación visual por marca con filtros

### Ventas (Sales.jsx — flujo completo)
- Cascading picker: Marca → Modelo → Sabor (chips touch-friendly)
- Búsqueda de sabor cuando hay 8+ opciones
- Precio editable por item (para negociaciones)
- Multi-producto por venta con descuentos (%, fijo, por unidad)
- Pago mixto (split entre múltiples métodos)
- Auto-fill monto al elegir método de pago
- Deuda: cliente que debe / saldo a favor / vuelto como crédito
- Canal recordado en localStorage
- Validación inline (sin alert() nativos)
- Botón "Repetir venta" para clonar ventas anteriores
- Toast de éxito al registrar

### Venta Rápida (QuickSale.jsx)
- Botón flotante (FAB) visible solo en mobile
- Buscar producto → elegir cantidad → método de pago → confirmar
- 2 taps para registrar una venta simple

### Compras/Importaciones
- Proveedor (generalmente de Paraguay)
- Flujo de estados: Pedido → En camino → Recibido → Verificado
- Costos desglosados: USDT vapes + comisión proveedor + pasero + envío
- Actualiza stock al marcar como recibido

### Caja multi-moneda
- 6 cuentas: MP Diego, MP Gustavo, Lemon Pesos, Lemon USDT, USD Cash, Pesos Cash
- Movimientos entre cuentas, compra crypto
- **Cierre de caja diario**: snapshot de saldos por cuenta con historial
- Saldo inicial configurable (INITIAL_BALANCES en CashBox.jsx)

### Consumo propio (Mermas)
- Registra vapes consumidos por Diego o Gustavo
- 3 tipos: consumo propio, garantías, canjes
- Descuenta stock, calcula valor estimado perdido

### Mi Cartera (Partners)
- Dashboard personal de Diego (100% dueño). Reemplazó el módulo "Socios" tras la salida de Gustavo.
- **Patrimonio total**: cash ARS + USDT@rate + USD@rate + stock a costo (donut de composición)
- **ROI del período**: ganancia neta / capital invertido (compras + stock actual)
- **Rendimiento mensual**: bar chart 12 meses (revenue + ganancia operativa)
- **Evolución patrimonio**: línea acumulada con gradiente
- **3 cards**: lo que me llevé / capital trabajando / podés retirar (70% del balance)
- **Saldos por cuenta**: 5 cuentas (mpDiego, lemonPesos, lemonUSDT, usdCash, pesosCash) reusando `calcAccountBalance`
- **Saldos clientes**: deudas + créditos pendientes
- **Modal retiro/aporte** con toggle y hint contextual
- Usa `calcPartnerBalances()` y `calcMonthSummary()` de calcs.js (mismo path, simplificado para single-user)

### Cierres mensuales
- Foto financiera del mes: ingresos, costos, gastos, merma, ganancia neta
- Comparativo mes a mes en tabla

### WhatsApp
- Modo **Completo**: mensaje detallado con sabores y emojis por producto
- Modo **Stories**: versión corta con marca, modelo, precio y stock
- Solo muestra productos con stock > 0

### Reportes
- Ventas por marca, canal, método de pago (bar charts + pie chart)
- Resumen financiero mensual
- **Punto de equilibrio**: gastos fijos vs margen por unidad, barra de progreso
- Top 10 sabores más vendidos
- Evolución mensual

### Monitor de Cotizaciones (ExchangeMonitor)
- Blue, Oficial, MEP y USDT en tiempo real
- Brechas entre cotizaciones
- Tabla comparativa de exchanges USDT (CriptoYa)
- Historial de sesión

### Cotización dólar blue
- Se obtiene automáticamente de dolarapi.com/v1/dolares/blue (campo "venta")
- Se refresca cada 10 minutos
- Configurable manualmente en Caja
- Solo aplica si Firestore no envió un rate primero (anti-race condition)

---

## Arquitectura — Decisiones clave

### State management
- **useFirebaseSync** hook: maneja los 13 estados de datos + sync Firebase
- **AppContext**: provee `currentUser`, `exchangeRate`, `logAudit`, `logStock` vía Context
- Los componentes todavía reciben data por props (migración gradual a Context)
- **calcs.js**: funciones puras de cálculo financiero, extraídas para testeo

### ErrorBoundary
- Envuelve todo el contenido dentro de `<Suspense>`
- Si un componente crashea, muestra "Algo salió mal" con botón "Reintentar"
- Previene pantalla blanca

### Soft delete
- Todos los registros usan `isDeleted` flag en vez de eliminar
- `activeProducts`, `activeSales`, etc. filtran automáticamente
- Papelera muestra items borrados con opción de restaurar

### Login
- Firebase Auth con email/password — Diego es único usuario (owner).
- Setup en `docs/FIREBASE_AUTH_SETUP.md`; scripts en `scripts/create-users.mjs`

### Modelo de socios (al 2026-06-23)
- **Dos socios 50/50:** Diego (`dcontro20@gmail.com`) + Gustavo (`gcontro99@gmail.com`), ambos role `owner` con acceso total.
- **Corte por fecha:** `PARTNERSHIP_START = "2026-06-22"` en `calcs.js`. Las transacciones con `date < PARTNERSHIP_START` quedan 100% Diego (era pre-sociedad — Gustavo había estado afuera del 2026-05-22 al 2026-06-22); las `>= PARTNERSHIP_START` se reparten 50/50. El corte aplica solo a la GANANCIA del pozo común: consumo personal y retiros de capital siempre afectan al socio individual sin importar la era.
- `calcPartnerBalances` devuelve `poolSolo`, `poolSociedad`, `diegoPoolShare`, `gustavoPoolShare`, `{socio}Balance`, `consumo{Socio}`, `{socio}Total`. La firma acepta `partnershipStart` opcional para tests / futura reconfiguración.
- Cuentas de caja: `mpDiego` y `mpGustavo` separadas. `ACCOUNT_METHOD_MAP.mpDiego` absorbe los pagos MP sin `mpAccount` marcado (legacy pre-fase: antes existía una sola cuenta MP, eran de Diego). `mpGustavo` solo matchea `p.mpAccount === "MP Gustavo"`.
- Existe `scripts/migrate-remove-gustavo.mjs` (histórico) — la corrida del 2026-05-22 detectó 0 registros. **No** se creó el espejo de re-incorporación: como Gustavo nunca llegó a tener data, no hay nada que des-migrar.

---

## Problemas conocidos pendientes

1. **Field-level Firestore writes (deuda técnica S14.3)** — El path actual hace full-doc replace por key en `appData`. Si Diego y Gustavo editan el mismo array simultáneamente, una escritura puede pisar a la otra. Mitigado con detección informativa (toast S14.2), pero el refactor a writes granulares está diferido a sprint dedicado.
2. **Out of Memory potencial** — `constants/products.js` carga ~240 productos. Si el catálogo crece mucho, considerar paginación.
3. **Sin tests de componentes** — Solo hay tests de funciones puras (183 tests en `calcs.test.js`, `pricing.test.js`, `productIntelligence.test.js`). Los componentes React no tienen tests.

---

## Features pendientes

### Media prioridad
- [ ] Recibo/comprobante de venta para mandar por WhatsApp
- [ ] Modo catálogo público (link para que clientes vean disponibilidad)
- [ ] Backup automático programado

### Baja prioridad
- [ ] Ventas recurrentes (cliente frecuente, un click)
- [ ] Resumen para monotributo
- [ ] Notificaciones push de stock bajo

### Ya implementados (antes eran pendientes)
- [x] Responsive mejorado para mobile (useResponsive hook, sidebar overlay, padding adaptivo)
- [x] Venta rápida desde mobile (QuickSale.jsx con FAB) + Merma rápida (QuickWithdrawal.jsx)
- [x] Alertas de reposición cuando un sabor popular se agota
- [x] Proyección de stock por velocidad de venta (≤7 días)
- [x] Registro de deudas (balance por cliente en Sales)
- [x] Cierre de caja diario (CashBox.jsx)
- [x] Plantillas de mensaje WhatsApp (Completo + Stories)
- [x] Punto de equilibrio (Reports.jsx break-even)
- [x] Backup automático programado (LaunchAgent diario 3:03 AM ART, ver `scripts/BACKUP_SETUP.md`)
- [x] Settings configurables (thresholds de alertas) — SettingsModal.jsx + settings.js

---

## Convenciones de código

- Todo en español (labels, comentarios, variables de negocio)
- CSS inline con objetos de estilo (no clases)
- Tema CLARO cálido (Notion/Linear) — tokens en `src/theme.js` (objeto `T`, fuente de verdad):
  - Surfaces: fondo `#F8F2E7` (cream), cards `#FFFFFF`, bordes `#E5DAC2`, borderSoft `#EFE5CE`, primarySoft `#E8EBF2`
  - Texto: primario `#1E2B4A` (navy), secundario `#3A4868`, muted `#6B7794`, faint `#9AA2B3`
  - Acentos: primary `#1E2B4A`, verde `#0F6B5C`, ámbar/cobre `#B07A1F`, azul `#1F5DB8`, rojo `#B83232`, púrpura `#5B3592`
  - Cada acento trae su `Bg` (fondo tintado suave) y `Border` variant. Radius: sm 6 / base 10 / lg 14. Fuente Inter/Rubik.
  - **Nota histórica:** hubo un experimento de dark mode (revertido). Los scripts `scripts/dark-theme-swap*.mjs` son referencia histórica; el sistema vivo es CLARO.
- Componentes reusables en UI.jsx: `Card`, `Badge`, `Btn`, `StatCard`, `Modal`, `Input`, `Select`, `Table`, `SearchBar`
- IDs generados con helper `uid()` (timestamp base36 + random)
- Moneda formateada con `formatMoney()` (sin decimales, con separador de miles)
- Fechas con `formatDate()` (DD/MM/YY)
- Hook `useResponsive()` exportado desde App.jsx para breakpoints mobile/tablet/desktop
- No hay router — navegación por variable `page` + renderPage()
- Login con Firebase Auth email/password (`docs/FIREBASE_AUTH_SETUP.md`)
- Settings configurables vía `useSettings()` hook (lee de localStorage, re-renderiza en `izn:settings-changed`)

---

## Cómo hacer cambios y deployar

1. Clonar el repo: `git clone https://github.com/dcontro20/imports-zona-norte.git`
2. Instalar deps: `npm install`
3. Dev local: `npm run dev`
4. Tests: `npm test`
5. Hacer cambios en `src/`
6. Build: `npm run build`
7. Push a main: `git add . && git commit -m "descripción" && git push`
8. Vercel detecta el push y deploya automáticamente en 1-2 min

---

## Nota sobre el estado actual

A partir del 14/04/2026, GitHub está sincronizado y es la fuente de verdad del código. Todos los cambios se pushean directamente al repo. La versión en Vercel se deploya automáticamente desde main.

---

## Estado del proyecto al 14/07/2026

### 🏪 PIVOTE MAYORISTA — FASE 1 completa (docs/PLAN_MAYORISTA.md + docs/SESSION_2026-07-14_mayorista_fase1.md)

**Ajuste de modelo (importante):** el eje grande es **`type: "minorista" | "mayorista"`**
(NO "kiosco" — eso quedó como `businessType`, junto a maxikiosco/drugueria/etc.).
Toda la inteligencia opera sobre `type="mayorista"`. Enums `CLIENT_TYPES` +
`BUSINESS_TYPES` en `constants/enums.js`.

**Consolidación de pricing:** se borró `lib/wholesalePricing.js` (viejo, muerto,
colisionaba de nombre). El modelo primario son las listas por tier A/B/C en
`product.priceByChannel.mayorista_a/b/c`. El descuento por volumen escalonado revive
en `src/wholesale.js` como complemento opcional. "mayorista" salió del select de tier
retail (queda regular/vip/diamante).

**FASE 1 — núcleo comercial (6 bloques):**
- `src/wholesale.js` (puro, 22 tests): `resolveTierPrice`, `minOrderForTier` +
  `validateOrderMinimum`, `volumeDiscount` (opcional, parametrizable), `orderMargin`.
- `components/Kioscos.jsx`: lista de clientes mayoristas, filtros, KPIs, ficha,
  "convertir" candidatos (tier="mayorista" viejo). Reusa `clientIntelligence`.
- `components/Products.jsx`: editor de precios por tier (priceByChannel.mayorista_a/b/c)
  con margen en vivo.
- `components/WholesaleOrder.jsx`: pedido mayorista (precio por tier + margen + mínimo)
  → genera sale saleType=mayorista/channel=Mayorista/fulfillmentStatus=pendiente,
  descuenta stock. "Repetir último pedido". Cobranza/entrega = fases 3/4.

**Baseline:** 887 tests verdes. Build OK. Pantallas nuevas: Kioscos + Pedido mayorista.

**REGLA PERMANENTE nueva:** al cerrar cada bloque grande, además de `/persist-session`,
generar un resumen MD autocontenido (ver más abajo en "self-updating context").

**Siguiente:** FASE 2 — Captación (Pipeline + Mapa + Visitas).

**⚠️ Nota de branches:** pivote en `claude/mayorista`. Redactor IA en
`claude/claude-md-docs-oNlms`. Ninguno mergeado a `main`.

### 🏪 PIVOTE MAYORISTA — FASE 0 completa (docs/PLAN_MAYORISTA.md + docs/SESSION_2026-07-14_mayorista_fase0.md)

El negocio pivota de minorista → **mayorista (kioscos)** de forma HÍBRIDA: mayorista
es el foco, minorista queda 100% funcional como canal residual. Fuente de verdad del
pivote: **`docs/PLAN_MAYORISTA.md`** (roadmap de 7 fases 0–6). Se ejecuta fase por
fase en la branch **`claude/mayorista`**.

**FASE 0 — cimientos (6 bloques, todo verde, sin UI de negocio nueva):**
- Kiosco = `client` con `type:"kiosco"` (reusa toda la inteligencia de cliente).
  Schema `client` extendido con campos B2B + `sale` con `saleType`/`fulfillmentStatus`
  (`lib/schemas.js`, todos opcionales, `.passthrough()`).
- Enums B2B nuevos en `constants/enums.js` (CLIENT_TYPES, WHOLESALE_TIERS,
  PIPELINE_STAGES, VISIT_OUTCOMES, ROUTE_STATUS, FULFILLMENT_STATUS...). "Mayorista"
  agregado a CHANNELS. Aliases `mayorista_a/b/c` en `pricing.js` (precios por tier
  van en `product.priceByChannel`, NO en colección nueva).
- Colecciones nuevas en el sync: **`prospects`** (leads sin convertir), **`visits`**
  (CRM), **`routes`** (reparto). Registradas en `useFirebaseSync.js` + memos `active*`
  + Papelera.
- `src/wholesaleMigration.js` (puro, 8 tests): `migrateToWholesaleModel()` idempotente,
  corre en arranque, setea `type`/`saleType`/`fulfillmentStatus` en data previa.
- **Modo de negocio**: toggle en topbar (🏪 Mayorista / 🛒 Minorista), `businessMode`
  en settings (default "mayorista"), `orderNavByMode()` reordena el nav sin ocultar
  nada.

**Baseline:** 875 tests verdes (era 867; +8 migración). Antes se estabilizó un bug
pre-existente de `skuProfitability` (no pasaba `now` a `buildProductSalesStats`).

**Siguiente:** FASE 1 — Kioscos + pricing por tier (`wholesale.js`, `Kioscos.jsx`,
`WholesaleOrder.jsx`).

**⚠️ Nota de branches:** el pivote vive en `claude/mayorista`. El Agente Redactor IA
del mensaje diario (banco de copys, sin costo de API — ver `docs/AGENTE_REDACTOR.md`)
vive en `claude/claude-md-docs-oNlms`. Ninguno mergeado a `main` todavía.

---

## Estado del proyecto al 23/06/2026

### 🏗️ Hardening + S14.3 + 4 frentes (docs/SESSION_2026-06-23_hardening-y-4-frentes.md)

Sesión maratónica post-reincorporación de Gustavo: **7 commits, +88 tests
(749→837), 6 módulos puros nuevos**, todo deployado.

- **Seguridad** (`1d2ec51` + `docs/SECURITY.md`): passwords fuera del repo
  (env vars), endpoint timing-safe + sin filtrar errores, logout que borra
  cache del dispositivo, security headers (HSTS/CSP/X-Frame-Options),
  rules con validación de tamaño, scaffold App Check listo para activar.
  Pendiente de Diego en consolas: rotar passwords + llave admin, App Check,
  2FA. Repo PRIVADO descartado (GitHub Actions cobra en privado a */10min).
- **S14.3 — concurrencia resuelta** (`405bf3c`): nuevo `mergeIntoFirestore`
  con `runTransaction` que calcula diff por id y mergea atómicamente sobre
  el server. Ya no se pisan data Diego y Gus al escribir en paralelo. API
  hacia componentes SIN CAMBIOS — refactor invisible. `src/lib/arrayMerge.js`
  + 12 tests cubriendo todos los casos. Trade-off documentado: last-write-wins
  por item (raro, aceptable).
- **Front 1 — Colaboración 2 socios** (`35b9e70`): presencia en vivo (chip
  topbar "💙 Gustavo · Caja"), card "Socios del mes" + "Lo último que
  hicieron" en Dashboard, colección Firestore `presence/{uid}`.
- **Front 2 — Dashboards ejecutivos S19** (`6c88f82`): card "Salud del
  negocio" (score 0-100 con 4 factores) + proyección de cierre de mes.
- **Front 3 — Inteligencia cliente S17** (`9d164dc`): panel "🧠 Inteligencia"
  arriba de Clientes con segmentos, alertas accionables (VIP que se enfría,
  reactivar, deuda), "a tocar (por valor)" con predicción de próxima compra.
- **Front 4 — Marketing puente S17→S18** (`8eb7101`): NO dupliqué el hub
  (estaba 90% hecho). Agregué `clientMessage.js` que genera mensaje
  personalizado por cliente con sus favoritos en stock + recencia. Botón
  💬 en panel inteligencia → modal con copy + WhatsApp.

### 👥 Vuelve Gustavo: sociedad 50/50 restaurada (docs/SESSION_2026-06-23_vuelve-gustavo.md)

Diego abrió pidiendo "reconfigurá TODO, volvió Gustavo". Reversión completa
de la salida del 2026-05-22 en 4 fases (3 commits + setup manual):
- **Fase 1 backend** (`0c8308a`): `calcs.js` ahora parte el pozo común en
  dos eras con `PARTNERSHIP_START = "2026-06-22"`. Pre-corte → 100% Diego;
  post-corte → 50/50. Nueva cuenta `mpGustavo` con matcher que discrimina
  por `p.mpAccount` (el `mpDiego` absorbe legacy sin marcar).
- **Fase 3+4 UI** (`e441ca1`): `Partners.jsx` "Mi Cartera" → "Socios" con
  dos columnas de balance por socio; `Withdrawals` y `Reports` con
  StatCards/cards separadas Diego/Gustavo.
- **Fase 2 auth** (`4bb0d55`): `gcontro99@gmail.com` agregado a
  `USER_PROFILES` + `firestore.rules` (Diego lo creó vía Firebase Console
  web, no terminal). Login confirmado funcionando en prod.

**+14 tests (776 total).** Decisión clave: corte por fecha en vez de
retroactivo — evita inflar el saldo de Gustavo con histórico acumulado
de Diego, y no fuerza recalcular cierres ya cerrados. La sección
"Modelo de socios" más arriba está actualizada.

### 🔔 Notificaciones diarias: locales + push remotas FCM (docs/SESSION_2026-06-22_push-notifications.md)

Diego quería recordatorios a su iPhone para mandar los 2 mensajes de stock
diarios al grupo. Implementamos **2 capas**:
- **Locales** (`src/lib/notifications.js`): timers `setTimeout`, funcionan
  solo si abrió la app en el día. Fallback automático.
- **Push remotas FCM** (`src/lib/push.js` + `api/send-daily-push.js` +
  `.github/workflows/push-cron.yml`): llegan SIEMPRE, app cerrada incluida.
  Cron GitHub Actions (cada 10min) → Vercel Serverless Function (firebase-admin)
  → FCM → SW v30 renderiza. Dedupe atómico con Firestore `.create()`, ventana
  de tolerancia 45min, lógica pura testeada en `src/lib/pushWindow.js`.

App.jsx usa estrategia en capas: intenta remoto, cae a local si no configurado.
Configurable en ⚙️ Ajustes → "🔔 Recordatorios diarios" (toggle + horarios).
**Funcionando en producción** (probado end-to-end). Setup manual documentado
en `docs/PUSH_SETUP.md`. **773 tests** (+11).

**⚠️ Datos clave para futuro:**
- Hay **2 proyectos Vercel**: `imports-zona-norte` (app gestión, donde vive el
  endpoint `/api/send-daily-push`) y `importszn-shop` (catálogo público).
- El endpoint requiere env vars en Vercel (`FIREBASE_SERVICE_ACCOUNT` +
  `PUSH_CRON_SECRET`) + el mismo `PUSH_CRON_SECRET` como secret de GitHub Actions.
- Colecciones Firestore nuevas: `pushTokens` (1 doc/dispositivo) + `push`
  (config + dedupe `sent_{fecha}_{slot}`).

### 📋 Plan maestro de mejoras S14–S22

Después de S1–S13 + bug fixes (`aff00ae`), una auditoría 360° identificó
**155+ mejoras** y **10 bugs** organizados en 9 secciones nuevas.

**Plan completo:** `docs/PLAN_S14_S22.md` — fuente de verdad. Si una sesión
pregunta "qué viene después" o "qué hay en SXX", abrir ese doc.

| Sección | Tema | Estado |
|---------|------|--------|
| S14 | Bugs críticos + Precisión contable (16 ítems) | ✅ COMPLETA (2026-04-29) |
| S15 | Inteligencia de Producto (16) | ✅ COMPLETA (2026-04-29, 15/16) |
| S16 | Sistema de promos y pricing (19) | ✅ COMPLETA (2026-04-29, 14/19) |
| S17 | Inteligencia de cliente avanzada (15) | Pendiente |
| S18 | Marketing Hub interno — generadores output (16) | Pendiente |
| S19 | Dashboards y métricas ejecutivas (15) | Pendiente |
| S20 | Operativa diaria pulida (18) | Pendiente |
| S21 | Robustez y confiabilidad (17) | Pendiente |
| S22 | Power user y atajos (14) | Pendiente |

**Importante:** este sistema es 100% INTERNO (Diego + Gustavo). La presencia
pública (catálogo web, SEO, QR) se construye separadamente con Claude Design.
Las mejoras S14–S22 son TODAS herramientas internas de gestión, inteligencia
y generación de outputs para marketing manual (el sistema arma mensajes/listas;
Diego los pega afuera).

### ✅ S14 cerrada el 29/04/2026 (docs/SESSION_2026-04-29_S14.md)

**16 mejoras + 10 bugs verificados en 6 commits** (`cc8c570` → `a367bb9`).

Highlights:
- **`calcMonthSummary` única función pura** (S14.4) — Closures, Reports y
  Dashboard usan misma lógica. Cero drift entre módulos.
- **Mermas separadas correctamente** (S14.6) — consumo personal NO infla
  pérdida del mes; alineado con `calcPartnerBalances.netProfitComun`.
- **Closures congelados** (S14.5) — confirm explícito al editar/borrar items
  de mes cerrado en Sales/Purchases/Expenses.
- **Crédito-vuelto como pasivo** (S14.7) — runway descuenta créditos pendientes
  a clientes del cash disponible.
- **Tax monotributo** (S14.9) — alerta 75/85/100% del techo anual configurable.
- **Detección concurrent edits** (S14.2) — toast al usuario cuando Diego/Gustavo
  escriben en simultáneo. Field-level writes (S14.3) DIFERIDO a sprint dedicado.
- **Detector de inconsistencias** (S14.10) — botón en Closures que reporta drift
  entre snapshots y dato vivo.
- **Libro mayor CSV** (S14.16) — formato debe/haber para contador externo.
- **Tests**: 75 → **96** (+21 financieros). Bloquea regresiones críticas.

**Decisión arquitectónica clave:** S14.3 (field-level Firestore writes)
documentada como deuda técnica. Refactor masivo del path de saveToFirestore.
La detección informativa de S14.2 mitiga riesgo por ahora.

### ✅ S15 cerrada el 29/04/2026 — Inteligencia de Producto

**15/16 mejoras** (15.16 diferido). 6 commits (`c050a3f` → `a88893e`).

**Resultado:** el sistema ahora tiene una capa completa de inteligencia
de producto. Diego puede ver de un vistazo:
- Qué productos son top movers vs slow movers vs dead stock (badges inline)
- Margen y ROI real por producto (con costUSDT)
- ABC Analysis Pareto: los 20% productos que generan 80% del revenue
- Comparativa rentabilidad entre marcas (Lost Mary vs Elf Bar vs Geek Bar)
- Salud del inventario: turnover, DIO, fill rate, dead stock %
- Cross-sell: los que compran X también compran Y
- Patrones por día de la semana (cuándo mandar promos)
- Sell-through rate por lote Paraguay
- Sugeridor de qty a pedir basado en velocity × leadtime
- Alerta de pérdida de velocidad (Dashboard)
- Análisis de elasticidad precio-demanda (post-cambios de precio)

Archivos nuevos:
- `src/productIntelligence.js` (15 funciones puras, 685 líneas)
- `src/productIntelligence.test.js` (38 tests, 134 totales en proyecto)

Cambios estructurales:
- Campo `costUSDT` añadido al form de Products + bulk import CSV
- Nuevo `priceLog` pasado a Reports para análisis de elasticidad
- App.jsx pasa `activeSales` a Products y Purchases para cálculos

### ✅ S16 cerrada el 29/04/2026 — Sistema de promos y pricing

**14/19 mejoras** (5 diferidos por bajo ROI vs alta complejidad).
6 commits (`7148d45` → `3cc079f`).

**Resultado:** sistema completo de promociones internas. Diego ahora puede:
- Crear cupones formales con vigencia, max usos, audiencia (todos/VIP/cliente)
- Definir bundles/combos con precio especial y ver ahorro automático
- Aplicar pricing diferenciado por canal (WA, IG, ML, presencial, delivery)
- Recibir descuentos sugeridos automáticamente por volumen, tier de cliente
  y fidelización del mes (botón "Aplicar mejor descuento")
- Ver candidatos a promo con razones (vencimiento, slow, dormido, última ud)
- Simular 3 escenarios de liquidación por producto (conservador/moderado/agresivo)
- Calcular descuento máximo manteniendo margen 30% o 20%
- Recibir alertas Dashboard si hay productos con margen <15% (danger)
- Ver matriz de sensibilidad: simulador "qué pasa si subo/bajo precio X%"
- Trackear uso de cupones con ROI (revenue / descuento dado)

Archivos nuevos:
- `src/pricing.js` (17 funciones puras, 684 líneas)
- `src/pricing.test.js` (49 tests, 183 totales en proyecto)
- `src/components/Coupons.jsx` (Hub de Promos: cupones + bundles)

Cambios estructurales:
- Nueva colección Firestore `coupons` + `bundles`
- Sales: campos couponCode, couponDiscount + integración usedCount auto
- Clients: campo `tier` (regular/vip/diamante)
- Products: schema priceByChannel para overrides por canal
- Nav: nuevo item "🎟️ Promos" (ownerOnly)

Diferidos: 16.12 (happy hour), 16.14 (recomendador, ya cubierto por
elasticidad S15.12), 16.15 (cantidad-objetivo), 16.16 (A/B precios),
16.17 (escasez automática). Documentados con justificación.

### 🩹 Polish post-S16 + auditoría sistémica (29/04/2026 noche → 22/05/2026)

Después de cerrar S16, antes de entrar a S17, ronda corta de mobile polish
y auditoría cruzada de bugs de integridad. **5 commits, 183/183 tests OK.**

**Auditoría cross-module (`27158e1`) — 3 bugs reales encontrados:**
1. **Cupón `usedCount` drift al editar/borrar venta** — solo se incrementaba al
   crear. Fix simétrico en Sales (`deleteSale` decrementa, edit detecta cambio
   de código y ajusta delta) + Trash (`restore` y `bulkRestore` re-incrementan
   al restaurar). App.jsx pasa `coupons` + `setCoupons` a Trash.
2. **Withdrawals sin guard de mes cerrado** — Sales/Purchases/Expenses ya
   tenían el guard S14.5, pero mermas no. Como las mermas son COGS y afectan
   `calcMonthSummary`, podían modificar un mes cerrado sin confirmación.
   Fix: `Withdrawals` ahora recibe `monthlyClosures` y pide confirm explícito
   al editar/borrar items de mes cerrado.
3. **Cupón usedCount al borrar venta** — variante del bug #1 en `deleteSale`.

Validaciones positivas (sin bug): Sales→Stock simétrico, balance cliente
con `reverseSaleBalanceDelta` puro, Purchases→Stock solo si verificado,
CashBox vuelto-como-crédito no descuenta de caja, mermas separadas del net
profit (S14.6), `setState(prev =>)` en todos los setters críticos.

**Mobile-first polish:**
- `8d898be` Products mobile-friendly + remover badges Slow/Dead (poco
  accionables en lista; la info detallada vive en Reports → ABC + Salud).
- `da123c3` Stock arranca filtrado por "Con stock" (Diego prefiere ver
  disponible primero). Chip "Con stock" → "Todos" → "Sin stock".
- `2617bdb` ExchangeMonitor mobile-friendly (CSS grid auto-fit, sin overflow
  en 375px) + nuevo bloque "USDT/ARS por Exchange" con 6 exchanges curados
  (Lemon, Binance, Ripio, Buenbit, Belo, Fiwind), badge "MEJOR" automático,
  "Ver todos (N)" expande la tabla completa de CriptoYa.
- `becf1bc` Fix bid/ask invertidos en cotizaciones USDT + usar precio sin
  fees (ahora coincide con lo que Lemon muestra a Diego en la app).

### 🚪 Salida de Gustavo + rediseño "Mi Cartera" (22/05/2026)

Gustavo dejó de ser socio. Diego es ahora **único dueño 100%**. Refactor en 4 fases:

**Fase 1 — Migración data Firestore** (`scripts/migrate-remove-gustavo.mjs`):
Script con modos dry-run + --apply para reasignar `createdBy`/`person`/`mpAccount`
de "Gustavo" → "Diego". Corrido en dry-run contra prod: 0 registros afectados
(Gustavo nunca llegó a usar el sistema). El script queda para auditoría.

**Fase 2 — Limpieza backend** (`ce0ad2e`):
- `constants/enums.js`: MP_ACCOUNTS y WITHDRAW_PERSONS solo Diego
- `calcs.js`: VALID_PARTNERS=["Diego"], `calcPartnerBalances` ya no hace split.
  Diego se queda con todo. Campos `gustavo*` mantenidos en 0 por compat.
- `firebase.js`: USER_PROFILES solo Diego. isOwner/canDelete siempre true.
- `firestore.rules`: eliminado `isManager()`. Solo `dcontro20@gmail.com` permitido.
- `App.jsx`: eliminados flags `ownerOnly` de NAV_ITEMS. "Socios" → "Mi Cartera" 💼.
- `useFirebaseSync.js`: detector concurrent edit dice "otra sesión" en vez de "otro socio".
- Tests refactorizados: 182/182 pasando (antes 183, eliminé "acepta Gustavo").

**Fase 3 — Limpieza UI** (`d2b664b`):
- `cash/shared.js`: removido mpGustavo de ACCOUNTS, ACCOUNT_METHOD_MAP, INITIAL_BALANCES.
- `cash/MovementForm.jsx`: removido filtro "Por socio" del libro mayor.
- `Sales.jsx`, `QuickSale.jsx`: resolveAccount simplificado (MP siempre va a mpDiego).
- `Withdrawals.jsx`: removidos StatCard Gustavo, breakdown Diego/Gustavo,
  filtro person + select pills.
- `Dashboard.jsx`: removida card "Socios del mes". Alert consumo alto sin split.
- `Reports.jsx`: KPIs del mes 4→3 cols. Card "Gustavo" reemplazada por "Mi consumo".

**Fase 4 — Rediseño Partners → Mi Cartera** (`0909ae8`):
Reescritura completa del módulo Partners.jsx (392→646 líneas) como dashboard
financiero personal de Diego. Contenido:
- Header "💼 Mi Cartera" + period selector (YTD / 12m / Todo)
- **Patrimonio total** (hero con donut): cash ARS + USDT@rate + USD@rate + stock a costo.
  Composición visual con %. Stock a precio venta y potencial.
- **Saldos por cuenta**: grid de las 5 cuentas con balance ARS-equivalente.
- **ROI del período**: ganancia / capital invertido. Side-by-side con desglose
  (revenue − costos − gastos − mermas − consumo = neto).
- **Rendimiento mensual**: bar chart 12m con revenue + ganancia.
- **Evolución patrimonio**: línea acumulada de ganancia operativa con gradiente.
- **3 cards resumen**: lo que me llevé / capital trabajando / podés retirar
  (70% del balance, deja 30% como capital de trabajo).
- **Saldos clientes**: deudas + créditos pendientes (visible si hay).
- **Histórico**: tabla retiros + aportes, filtra `_historicalArchived` (futuro-proof).
- **Modal**: toggle retiro/aporte con hint contextual.

App.jsx pasa `products`, `cashMovements`, `clients` al componente para que
calcule patrimonio. Reusa `calcAccountBalance` y `calcMonthSummary` ya
existentes para mantener fuente única de verdad.

### 🏁 Big push 23-24 abril (docs/SESSION_2026-04-23_to_24_big_push.md)

**42 items cerrados en 33 commits** cubriendo la auditoría CTO completa (bugs, data, UX, features incompletos, deuda técnica, features nuevos). Highlights:

- **Seguridad**: `firestore.rules` cerradas deployadas + roles (owner Diego, manager Gustavo) + Firebase Auth email/password
- **Tests**: 37 → **75** pasando (`reverseSaleBalanceDelta`, `validateWithdrawalForm`, `calcAccountBalance` extraídos como puros)
- **Modular**: `components/sales/`, `components/cash/`, `components/clients/`, `constants/` — CashBox −45% (1801→996), Sales −13%, Clients −27%
- **PWA + offline**: `manifest.webmanifest`, service worker, Firestore `persistentLocalCache` con `persistentMultipleTabManager`
- **Features comerciales nuevos**: Cierre mensual 1-click (CSV+WhatsApp), ABC clientes, rentabilidad por marca, proyección de inventario, tracking lotes Paraguay, expiryDate, alertas stock→WhatsApp
- **Bugs críticos cerrados**: `safeRate` guard contra `exchangeRate=0`, Trash restore simétrico, vuelto como crédito validado, null-safety Dashboard COGS

**Ver** `docs/SESSION_2026-04-23_to_24_big_push.md` para journal completo con el POR QUÉ de cada decisión.

### Sesiones previas (docs/SESSION_2026-04-22.md para narrativa completa)

**Rediseños full estilo Notion/Linear** (21-22/04/2026):
- `Clients.jsx` — cards con avatar pastel, contact chips clickeables (tel/WA/IG), campo zona con sugerencias, historial modal con sparkline 6 meses
- `Dashboard.jsx` — period selector (Hoy/Semana/Mes), sparkline 14d, donut, activity feed unificado
- `Sales.jsx` — SaleCards con avatar del cliente, filtros pills, stats del mes (incluye deudas pendientes). Modal de venta NO se tocó
- `CashBox.jsx` — hero patrimonio, 6 cuentas con sparkline 30d, 5 tipos de movimiento, conciliación con ajustes, flow por período con chart barras

**Tema**: tema claro cálido Notion/Linear (`#FAFAF9` bg, `#37352F` text, `#5E6AD2` primary). Dark mode fue probado y revertido.

**Tokens centralizados**: `src/theme.js` exporta `T` (surfaces/texto/status/shadows/radius/fonts) + `AVATAR_PALETTE` + `pickAvatarColor(seed)` para identidades visuales consistentes (mismo cliente = mismo color en todas las vistas).

### Sistema de backup automático

**Corre solo todos los días a las 3:03 AM ART.** No depende de Claude.
- Script: `scripts/backup.mjs --upload --quiet`
- LaunchAgent: `scripts/com.izn.backup.plist` instalado en `~/Library/LaunchAgents/`
- Auth: OAuth 2.0 con cuenta Diego (refresh token en `.credentials/drive-oauth-token.json`, gitignoreado)
- Drive folder: `1d57fOksNJePjSM1oC4c994z_UdAUnnuv`
- Nombres: local `IZN_Backup_YYYY-MM-DD_HHhMM.json`, Drive `IZN · Backup del [día] DD Mmm YYYY · HHhMM · N registros.json`
- Doc completa y troubleshooting: `scripts/BACKUP_SETUP.md`

Para forzar un backup ahora: `launchctl kickstart -k gui/$(id -u)/com.izn.backup`

### Mobile-first (iPhone 375px)

Diego opera mucho desde el celular. Mobile es prioridad — no afterthought.

**Reglas al agregar/tocar componentes:**
- Hook `useResponsive()` desde App.jsx: `{ isMobile, isTablet, isDesktop }` (breakpoint mobile <768px)
- Tap targets mínimo 44px (padding vertical ≥11px, minHeight 44)
- Inputs con `fontSize: 16` en mobile para evitar zoom iOS
- Nunca grids 3+ cols sin variante isMobile
- Nunca `minWidth > 100` en flex rows (fuerza overflow horizontal)
- Forms con 2+ inputs lado a lado → `flexDirection: isMobile ? "column" : "row"` o usar `<FormRow>` de UI.jsx
- Empty states: `padding: isMobile ? "32px 16px" : 60` (padding 60 en 375px consume casi todo)
- Modales: `maxHeight: 92vh` + `overflowY: auto` (ya en UI.jsx Modal)
- Safe-area insets aplicados en topbar, main, FAB, sidebar
- Body scroll lock cuando sidebar mobile abierto

### Preferencias de colaboración (Diego)

- **Auto-commit**: después de cada cambio que compile OK, commit + push (hook post-commit). No preguntar antes.
- **Rediseños completos sobre parches**: cuando pide "mejorá/rediseñá X", hacer rewrite del render con tokens modernos, no edits quirúrgicos. Preservar lógica de negocio.
- **Velocidad > perfección**: Diego usa la app todos los días, prefiere cambios grandes y rápidos antes que optimizaciones sutiles.

---

## 🔄 Self-updating context (obligatorio al cerrar sesiones importantes)

> **REGLA PERMANENTE (2026-07-14): resumen MD al cerrar cada bloque grande.**
> Al terminar una fase, refactor importante, decisión de arquitectura o cambio
> significativo, además de `/persist-session` hay que **generar SIEMPRE un resumen
> autocontenido en Markdown** (estándar: `IZN_Pivote_Mayorista_Fase0_Resumen.md`)
> con qué se hizo, decisiones y porqué, archivos, commits, tests/build y próximos
> pasos. Se entrega descargable a Diego (para cargar al chat de diseño) y se puede
> versionar en `docs/`. Es hábito automático, no se pide. Detalle en
> `docs/PLAN_MAYORISTA.md` → "REGLA PERMANENTE".

El sistema de persistencia de contexto tiene 3 capas:
- **CLAUDE.md** (este archivo, se carga siempre)
- **`~/.claude/projects/-Users-Diego-Desktop-imports-zona-norte/memory/`** (se carga siempre)
- **`docs/SESSION_YYYY-MM-DD.md`** (journals narrativos, opt-in)

### Shortcut: `/persist-session`

El protocolo completo vive en **`.claude/commands/persist-session.md`**.
Diego (o cualquier Claude) puede tipear `/persist-session` para disparar
los 4 pasos automáticamente: journal → CLAUDE.md → memorias → commit.

**Comando auxiliar**: `/show-context` (ver `.claude/commands/show-context.md`)
muestra un resumen del estado del repo en <1 min — útil al arrancar
sesión nueva.

### Cuándo disparar `/persist-session`

Al cerrar una sesión donde hubo ALGUNA de estas cosas:
- Rediseño completo de un componente / sección nueva
- Decisión arquitectónica (nueva dependencia, cambio de stack)
- Cambio de preferencia explícito de Diego ("de ahora en más hacé X")
- Fix de un bug importante con un patrón aplicable a futuro
- Nuevo módulo / página / feature significativa

**Criterio rápido**: si dentro de 2 semanas un Claude nuevo que vea solo
`git log` va a entender el *por qué* de los cambios → no hace falta
journal. Si no va a entender → disparar `/persist-session`.

### Frases equivalentes

Diego también puede decir estas frases y se dispara lo mismo:
- "persistí esta sesión"
- "actualizá el contexto"
- "guardá todo antes de cerrar"

### Por qué existe esto

La ventana de conversación se comprime al llenarse el contexto y los
detalles se pierden. Los commits persisten el QUÉ, pero no el POR QUÉ ni
las decisiones descartadas. Este protocolo cierra ese gap.

<!-- Trigger Vercel redeploy 2026-04-22 20:52 tras switch a SSH -->

<!-- Webhook test post-reconnect 2026-04-23 00:44 -->
