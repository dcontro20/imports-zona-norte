# IMPORTS ZONA NORTE — Sistema de Gestión de Negocio de Vapes

## Qué es este proyecto

Sistema web de gestión completa para "Imports Zona Norte", un negocio de importación y reventa de vapes electrónicos operado por Diego Contró y su socio Gustavo desde zona norte de Buenos Aires. La app está deployada en Vercel y usa Firebase Firestore como base de datos en tiempo real para que ambos socios puedan operar simultáneamente desde cualquier dispositivo.

**URL de producción:** https://imports-zona-norte.vercel.app
**Repositorio:** github.com/dcontro20/imports-zona-norte
**Deploy automático:** push a `main` → Vercel detecta y deploya en 1-2 min

---

## Stack técnico

- **Frontend:** React 18 con Vite 5
- **Base de datos:** Firebase Cloud Firestore (proyecto `imports-zona-norte`, región `southamerica-east1`)
- **Hosting:** Vercel (deploy automático desde GitHub)
- **Testing:** Vitest (23 tests de cálculos financieros)
- **Estilo:** CSS-in-JS inline (no hay framework CSS externo). Tokens centralizados en `src/theme.js`.
- **Diseño:** tema oscuro profesional (#0F172A fondo, #1E293B cards, #334155 bordes), acentos violeta (#6366f1), verde (#22C55E), rojo (#EF4444), ámbar (#F59E0B). Tipografía Rubik + Nunito Sans.
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
    ├── main.jsx            # ReactDOM.createRoot
    ├── App.jsx             # Layout, nav, login, routing, ErrorBoundary, QuickSale FAB
    ├── useFirebaseSync.js  # Custom hook: toda la lógica de sync Firebase ↔ localStorage
    ├── AppContext.js        # React Context: currentUser, exchangeRate, logAudit, logStock
    ├── firebase.js         # Config Firebase + helpers saveToFirestore/subscribeToFirestore
    ├── constants.js        # DEFAULT_PRODUCTS (catálogo ~240 productos), BRANDS, CATEGORIES
    ├── helpers.js          # loadData, uid, formatMoney, formatDate
    ├── calcs.js            # Funciones puras de cálculo financiero (testeadas)
    ├── calcs.test.js       # 23 tests unitarios (vitest)
    └── components/
        ├── UI.jsx           # Card, Badge, Btn, StatCard, Modal, Input, Select, Table, SearchBar
        ├── Dashboard.jsx    # KPIs, alertas inteligentes, balance cuentas, top productos
        ├── Products.jsx     # CRUD productos: marca, modelo, sabor, puffs, stock, precio USD/ARS
        ├── Sales.jsx        # Ventas: cascading picker, pago mixto, deudas, precio custom, repetir
        ├── QuickSale.jsx    # Venta rápida mobile: buscar → qty → pagar → listo (FAB flotante)
        ├── Purchases.jsx    # Importaciones: proveedor, estados, costos USDT
        ├── Clients.jsx      # Clientes: nombre, teléfono, Instagram, balance, historial
        ├── Expenses.jsx     # Gastos por categoría
        ├── Withdrawals.jsx  # Consumo propio (mermas): Diego/Gustavo, descuenta stock
        ├── CashBox.jsx      # Caja multi-moneda + cierre de caja diario
        ├── Reports.jsx      # Reportes, márgenes, punto de equilibrio (break-even)
        ├── WhatsApp.jsx     # Mensaje de stock: modo Completo + modo Stories (corto)
        ├── Partners.jsx     # División 50/50 Diego & Gustavo (usa calcs.js)
        ├── Closures.jsx     # Cierres mensuales: foto financiera del mes
        ├── Export.jsx       # Exportar CSVs + backup JSON
        ├── PriceLog.jsx     # Editor masivo de precios por modelo + historial
        ├── StockLog.jsx     # Log de movimientos de stock (entradas, salidas, ajustes)
        ├── ExchangeMonitor.jsx # Monitor cotizaciones: Blue, Oficial, MEP, USDT en tiempo real
        ├── AuditLog.jsx     # Registro de auditoría (acciones por usuario)
        └── Trash.jsx        # Papelera: soft-delete, restaurar, limpieza automática 30 días
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

**Reglas Firestore:** (open access, sin autenticación)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if true; }
  }
}
```

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

### Socios (Partners)
- Usa `calcPartnerBalances()` de calcs.js (testeado)
- Normaliza todas las monedas a ARS antes de calcular
- División 50/50 automática con historial de retiros

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
- Contraseña simple por socio (sessionStorage)
- Diego: `Poncharelo20!`, Gustavo: `Gus2026!`
- Sin Firebase Auth (reglas abiertas)

---

## Problemas conocidos pendientes

1. **Reglas Firestore abiertas** — `allow read, write: if true`. Funciona pero no tiene seguridad. Idealmente agregar Firebase Auth con un login simple
2. **Out of Memory potencial** — constants.js carga ~240 productos. Si el catálogo crece mucho, considerar paginación
3. **Sin tests de componentes** — Solo hay tests de funciones puras (calcs.js). Los componentes React no tienen tests

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
- [x] Venta rápida desde mobile (QuickSale.jsx con FAB)
- [x] Alertas de reposición cuando un sabor popular se agota
- [x] Proyección de stock por velocidad de venta (≤7 días)
- [x] Registro de deudas (balance por cliente en Sales)
- [x] Cierre de caja diario (CashBox.jsx)
- [x] Plantillas de mensaje WhatsApp (Completo + Stories)
- [x] Punto de equilibrio (Reports.jsx break-even)

---

## Convenciones de código

- Todo en español (labels, comentarios, variables de negocio)
- CSS inline con objetos de estilo (no clases)
- Tema dark — tokens en `src/theme.js`:
  - Surfaces: fondo `#0F172A`, cards `#1E293B`, inputs `#0F172A`, bordes `#334155`, borderSoft `#273246`
  - Texto: primario `#F8FAFC`, secundario `#CBD5E1`, muted `#94A3B8`, faint `#64748B`
  - Acentos: violeta `#6366f1`, verde `#22C55E`, rojo `#EF4444`, azul `#3B82F6`, ámbar `#F59E0B`, púrpura `#8B5CF6`
  - Convención: status colors usan su `Bg` variant (18% opacity) como fondo tintado y `Border` (40%) como borde
- Scripts helper en `scripts/dark-theme-swap*.mjs` para migrar colores light→dark en batch (ya ejecutados, referencia histórica)
- Componentes reusables en UI.jsx: `Card`, `Badge`, `Btn`, `StatCard`, `Modal`, `Input`, `Select`, `Table`, `SearchBar`
- IDs generados con helper `uid()` (timestamp base36 + random)
- Moneda formateada con `formatMoney()` (sin decimales, con separador de miles)
- Fechas con `formatDate()` (DD/MM/YY)
- Hook `useResponsive()` exportado desde App.jsx para breakpoints mobile/tablet/desktop
- No hay router — navegación por variable `page` + renderPage()
- Login por contraseña simple (sessionStorage)

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

## Estado del proyecto al 29/04/2026

### 📋 Plan maestro de mejoras S14–S22

Después de S1–S13 + bug fixes (`aff00ae`), una auditoría 360° identificó
**155+ mejoras** y **10 bugs** organizados en 9 secciones nuevas.

**Plan completo:** `docs/PLAN_S14_S22.md` — fuente de verdad. Si una sesión
pregunta "qué viene después" o "qué hay en SXX", abrir ese doc.

| Sección | Tema | Estado |
|---------|------|--------|
| S14 | Bugs críticos + Precisión contable (16 ítems) | ✅ COMPLETA (2026-04-29) |
| S15 | Inteligencia de Producto (16) | Pendiente |
| S16 | Sistema de promos y pricing (19) | Pendiente |
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
