# 🗺️ Mapa del sistema — Imports Zona Norte

Guía para entender de qué está compuesto todo el sistema, organizado de dos
maneras: **(1) lo que ves y usás** (las pantallas), y **(2) cómo está armado
por dentro** (el código). Pensado para tener una visión clara del conjunto.

> Para el detalle técnico profundo, ver `CLAUDE.md`. Este es el mapa "humano".

---

## PARTE 1 — Lo que ves y usás (las pantallas)

La app se navega desde el menú lateral. Las pantallas están agrupadas por para qué sirven:

### 👁️ Ver / decidir
| Pantalla | Para qué |
|---|---|
| **📊 Dashboard** | La home. KPIs del día/semana/mes, alertas inteligentes, socios del mes, actividad reciente, top productos, acción del día. |
| **📈 Análisis** | Hub financiero con 7 sub-pestañas (ver abajo). Toda la salud del negocio. |

**Sub-pestañas de Análisis:**
- **Resumen** — salud del negocio (score 0-100) + proyección de cierre de mes + KPIs.
- **Proyecciones** — forecast de cierre, flujo de caja, rentabilidad por SKU.
- **Contabilidad** — plan de cuentas, estados contables, conciliación, reporte fiscal.
- **Resultados** — P&L, COGS, inventario valorizado, flujo de caja.
- **Reportes** — ventas por marca/canal/método, break-even, ABC, inteligencia de producto.
- **Patrimonio (Socios)** — patrimonio del negocio + balance 50/50 Diego/Gustavo.
- **Cierres** — foto financiera mensual + detector de inconsistencias.

### 🛠️ Operación diaria
| Pantalla | Para qué |
|---|---|
| **🛒 Ventas** | Registrar ventas (picker marca→modelo→sabor, pago mixto, deudas, cupones). |
| **🚚 Compras** | Importaciones de Paraguay: proveedor, estados, costos, lotes, kanban. |
| **📦 Stock** | CRUD de productos, precios, costos, badges de inteligencia. |
| **💰 Caja** | 6 cuentas (MP Diego/Gustavo, Lemon, Cash), movimientos, cierre diario, conciliación. |
| **📲 Mensajes** | Generador de mensajes para WhatsApp/Instagram (ofertas, combos, stock, catálogo). |
| **👥 Clientes** | Ficha de clientes + 🧠 panel de inteligencia (segmentos, alertas, a tocar). |

### 📋 Gestión
| Pantalla | Para qué |
|---|---|
| **💸 Gastos** | Gastos por categoría. |
| **📉 Mermas** | Consumo propio, garantías, canjes (descuenta stock). |

### 🗄️ Registros / utilidades
| Pantalla | Para qué |
|---|---|
| **💲 Precios** | Editor masivo de precios por modelo + historial. |
| **📋 Historial** | Log de movimientos de stock. |
| **💱 Cotizaciones** | Blue/Oficial/MEP/USDT + exchanges. |
| **📥 Exportar** | CSVs, backup JSON, libro mayor contable. |
| **🔍 Auditoría** | Registro de quién hizo qué. |
| **🗑️ Papelera** | Borrados recuperables (soft-delete). |

### ⚡ Accesos rápidos (botones flotantes en mobile)
- **Venta rápida** (FAB) — registrar una venta en 2 toques.
- **Merma rápida** (FAB) — registrar consumo en 2 toques.
- **⌘K** — paleta de comandos (buscar/crear/navegar).

---

## PARTE 2 — Cómo está armado por dentro (el código)

El sistema está organizado en **capas**. De arriba (lo que ves) hacia abajo (los datos):

```
┌─────────────────────────────────────────────────────────┐
│  1. CÁSCARA       App.jsx · main.jsx                      │  ← navegación, login, layout
├─────────────────────────────────────────────────────────┤
│  2. PANTALLAS     src/components/*.jsx                    │  ← cada módulo de la Parte 1
│     + sub-piezas  src/components/{cash,clients,sales,     │
│                   purchases,supplier,analisis}/           │
├─────────────────────────────────────────────────────────┤
│  3. EL "CEREBRO"  cálculos puros (sin pantalla)           │  ← toda la matemática del negocio
│     calcs · pricing · finance · productIntelligence ·    │
│     clientIntelligence · executiveMetrics · collaboration│
├─────────────────────────────────────────────────────────┤
│  4. UTILIDADES    src/lib/*  (~48 archivos)               │  ← funciones especializadas
├─────────────────────────────────────────────────────────┤
│  5. DATOS+SYNC    firebase · useFirebaseSync · constants  │  ← guardar/leer en la nube
├─────────────────────────────────────────────────────────┤
│  6. BACKEND       api/ · scripts/ · .github/workflows/    │  ← push, backups, crons
└─────────────────────────────────────────────────────────┘
```

### Capa 1 — Cáscara
- `App.jsx` — el esqueleto: menú, login, ruteo entre pantallas, presencia de socios, FABs.
- `main.jsx` — arranque de la app + service worker.

### Capa 2 — Pantallas (`src/components/`)
Cada archivo `.jsx` es una pantalla de la Parte 1 (Dashboard.jsx, Sales.jsx,
CashBox.jsx, etc.). Las pantallas grandes se parten en sub-carpetas:
- `cash/` — formulario y helpers de Caja.
- `clients/` — ficha, historial, panel de inteligencia de Clientes.
- `purchases/` + `supplier/` — kanban, análisis y procesador de listas de Compras.
- `analisis/` — las sub-pestañas del hub de Análisis.
- `sales/` — la tarjeta de venta.
- `UI.jsx` — las piezas reusables (botones, modales, inputs, tablas, cards). **La base visual de todo.**

### Capa 3 — El "cerebro" (cálculos puros, sin pantalla)
Acá vive toda la matemática del negocio, separada para poder testearla (837 tests):
| Archivo | Calcula |
|---|---|
| `calcs.js` | Ganancias, balances de socios (split 50/50), resumen mensual, saldos de cuenta. |
| `finance.js` | P&L, COGS, inventario, flujo de caja, KPIs. |
| `pricing.js` | Cupones, bundles, descuentos por volumen/tier. |
| `productIntelligence.js` | ABC, rotación, cross-sell, elasticidad, dead stock. |
| `clientIntelligence.js` | Segmentos, churn, predicción de próxima compra, alertas. |
| `executiveMetrics.js` | Score de salud del negocio + proyección de cierre. |
| `collaboration.js` | Presencia, tiempo relativo, feed de actividad. |

### Capa 4 — Utilidades (`src/lib/`)
~48 funciones especializadas, agrupadas por tema:
- **Marketing/ofertas:** offers, smartOffers, offerAudiences, offerCalendar, offerHistory, messageTones, messageCooldown, weeklyPromo, dailyPlan, clientMessage, whatsappMessage, storyImageGenerator, publicCatalog.
- **Clientes:** clientSegments, clientInsights, loyalty.
- **Finanzas/contabilidad:** financeForecast, financeInsights, financialStatements, fiscalReport, chartOfAccounts, reconciliation, warrantyProvision, skuProfitability, whatIfSimulator.
- **Compras/proveedores:** eoq, leadTimeTracking, shippingCalc, rmaWorkflow, purchaseAnalytics, purchaseRecommendations, supplierComparison, supplierParser, supplierProfiles, fuzzyMatch.
- **Pricing:** wholesalePricing.
- **Dashboard:** dashboardAction, dashboardAlerts, dashboardGoal.
- **Notificaciones:** notifications, push, pushConfig, pushWindow.
- **Datos/sync:** arrayMerge (merge concurrente), schemas, backupValidator.
- **Recibos:** saleReceipt.
- **Infra:** errorReporter.

### Capa 5 — Datos + sincronización
- `firebase.js` — conexión a la nube (Firestore), auth, presencia, push.
- `useFirebaseSync.js` — el corazón del sync: mantiene todo en vivo entre dispositivos sin que se pisen Diego y Gustavo (merge atómico). Colecciones mayoristas nuevas: `prospects`, `visits`, `routes`.
- `constants.js` + `constants/` — marcas, productos pre-cargados, cuentas, enums (incl. enums B2B: CLIENT_TYPES, WHOLESALE_TIERS, PIPELINE_STAGES, etc.).
- `theme.js` — colores y tipografías. `settings.js` — preferencias configurables (incl. `businessMode` mayorista/minorista).
- `wholesaleMigration.js` — migración idempotente al modelo mayorista (setea type/saleType/fulfillmentStatus en data previa).

### 🏪 Capa mayorista (pivote a kioscos — en construcción)
Ver `docs/PLAN_MAYORISTA.md` (roadmap fase por fase). FASE 0 (cimientos) ✅ hecha:
schema B2B, colecciones prospects/visits/routes, migración, y selector de modo
Mayorista/Minorista en el topbar. Las pantallas de negocio (Kioscos, Pipeline, Mapa,
Pedido mayorista, Rutas) llegan en fases 1–3.

### Capa 6 — Backend (corre fuera del navegador)
- `api/send-daily-push.js` — función que dispara las notificaciones push.
- `.github/workflows/push-cron.yml` — el reloj que la llama cada 10 min.
- `scripts/` — backup automático, creación de usuarios, migraciones.
- `firestore.rules` — reglas de seguridad de la base.

---

## 📚 Dónde está cada documentación

| Archivo | Qué tiene | Cómo se mantiene |
|---|---|---|
| `docs/MAPA_DEL_SISTEMA.md` | **Este archivo** (el mapa humano: pantallas + capas). | Manual, cuando hay cambios estructurales grandes. |
| `docs/ESTRUCTURA.md` | **Snapshot exhaustivo y al día** de cada archivo, sus líneas, qué hace. | **Automático cada noche** (`structure-snapshot.yml` lo regenera leyendo el código; solo commitea si cambió). |
| `CLAUDE.md` | Documentación técnica completa + historia. | Manual via `/persist-session`. |
| `docs/SESSION_*.md` | Journal de cada sesión de trabajo (el "por qué"). | Manual via `/persist-session`. |
| `docs/PLAN_S14_S22.md` | Roadmap de mejoras. | Manual. |
| `docs/SECURITY.md` | Checklist de seguridad. | Manual. |
| `docs/PUSH_SETUP.md` · `BACKUP_SETUP.md` | Guías de setup. | Manual. |

---

*Mapa generado el 2026-06-23. Si la estructura cambia mucho, regenerar.*
