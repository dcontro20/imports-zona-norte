# 📐 Estructura del sistema — snapshot automático

> Actualizado: **2026-08-31** · Generado por `scripts/generate-structure-doc.mjs`
> (cron nocturno). **No editar a mano** — los cambios se sobrescriben.
> Para la guía humana de cómo está organizado todo, ver `MAPA_DEL_SISTEMA.md`.
> Para decisiones y contexto, ver `CLAUDE.md` + `docs/SESSION_*.md`.

## 📊 Totales

| Capa | Archivos | Líneas (aprox.) |
|---|---:|---:|
| Componentes (pantallas + sub-piezas) | 83 | 30.444 |
| Módulos puros (cerebro de cálculos) | 20 | 2.609 |
| Utilidades (`src/lib/`) | 71 | 7.415 |
| Tests | 102 | — |
| Scripts | 18 | — |
| Endpoints serverless | 2 | — |
| Workflows GitHub Actions | 5 | — |
| Docs (.md) | 69 | — |

---

## 🖥️ Componentes — pantallas principales (`src/components/`)

Cada archivo `.jsx` es una pantalla o módulo visible en la nav. La columna
"Qué hace" sale de la primera línea de comentario del archivo.

| Archivo | Líneas | Qué hace |
|---|---|---|
| Analisis.jsx | 112 | Hub "📊 Análisis" — consolida toda la visión financiera del negocio en un solo lugar con tabs. Los módulos existentes entran en modo embedde |
| AuditLog.jsx | 143 | — |
| CashBox.jsx | 991 | — |
| Clients.jsx | 1048 | — |
| Closures.jsx | 457 | -- MONTHLY CLOSURES -- |
| CommandPalette.jsx | 170 | Command palette estilo Linear / Notion. Se abre con Cmd+K (Mac) o Ctrl+K (PC). Lista TODAS las acciones del sistema con fuzzy match. Diego s |
| Coupons.jsx | 577 | — |
| CuentasCorrientes.jsx | 114 | — |
| Dashboard.jsx | 1353 | ---------- helpers ---------- |
| DashboardMayorista.jsx | 114 | — |
| ExchangeMonitor.jsx | 592 | — |
| Expenses.jsx | 467 | Category colors |
| Export.jsx | 441 | URL de la carpeta de Drive donde van los backups automáticos |
| Finance.jsx | 219 | — |
| Kioscos.jsx | 368 | Pantalla de clientes MAYORISTAS (type="mayorista"). El label "Kioscos" se mantiene porque la mayoría lo son, pero el modelo/filtro es por ty |
| Logo.jsx | 94 | Logo de Imports Zona Norte — SVG inline. Replica el diseño del logo oficial: escudo con vape estilizado sobre un |
| Offers.jsx | 1398 | — |
| OnboardingTour.jsx | 123 | Onboarding tour mínimo. Se muestra UNA SOLA VEZ por device (localStorage flag). Sirve para explicarle a Diego (o a un usuario nuevo |
| Partners.jsx | 629 | — |
| PriceLog.jsx | 620 | -- PRICE MANAGEMENT -- |
| Procurement.jsx | 142 | Hub unificado de Abastecimiento — un solo punto de entrada para todo el ciclo de compra: Resumen (centro de comando) + Pedidos + Proveedores |
| Products.jsx | 1063 | — |
| ProspectMap.jsx | 128 | Mapa de prospección — VISTA POR ZONA (cobertura). El mapa geográfico con pins llega junto con Google Places (2.5, diferido). Por ahora, para |
| Prospectos.jsx | 277 | Prospectos.jsx — la estación de trabajo de ventas (ciclo v2, spec CONGELADO docs/PROSPECT_CRM_EJECUCION_SPEC.md). Una sola puerta para todo  |
| PublicCatalog.jsx | 218 | Vista pública del catálogo. Renderiza un snapshot decodificado del hash de la URL. NO requiere autenticación ni Firebase. NO tiene navegació |
| Purchases.jsx | 1067 | — |
| QuickSale.jsx | 334 | ============================================ QUICK SALE — Mobile-optimized one-tap sale |
| QuickWithdrawal.jsx | 332 | ============================================ QuickWithdrawal — registrar consumo propio en 2 toques desde mobile |
| Reports.jsx | 1744 | — |
| Routes.jsx | 298 | — |
| Sales.jsx | 1915 | — |
| SettingsModal.jsx | 269 | SettingsModal — configuración de thresholds del sistema. Owner ajusta cómo el sistema dispara alertas (stock bajo, caja baja, etc). |
| StockLog.jsx | 85 | -- STOCK LOG -- |
| SupplierMonitor.jsx | 206 | SupplierMonitor — módulo principal de gestión de proveedores. 3 tabs: |
| Trash.jsx | 378 | — |
| UI.jsx | 400 | Mobile-first: altura mínima 44px en todo lo tocable (Apple HIG). padding: 12px vertical + 14px horizontal + fontSize: 14 ≈ 44px. |
| WhatsApp.jsx | 172 | — |
| WholesaleOrder.jsx | 438 | Pedido MAYORISTA (F5: conectado al motor): elegís un cliente → los precios salen de la LISTA PUBLICADA al escalón del total de unidades (RN- |
| Withdrawals.jsx | 1610 | -- MERMAS: Consumo propio, Garantías, Canjes -- Ventana de detección de duplicados (5 min) |

## 📂 Componentes — sub-carpetas

### `src/components/analisis/` (3 archivos)

| Archivo | Líneas | Qué hace |
|---|---|---|
| AccountingPanel.jsx | 311 | Sección de contabilidad formal: P&L + Balance + Cash Flow + Conciliación + Provisión garantías |
| AnalysisSummary.jsx | 236 | — |
| FinanceProjections.jsx | 390 | Sub-componentes inline para mantener el archivo manejable |

### `src/components/cash/` (2 archivos)

| Archivo | Líneas | Qué hace |
|---|---|---|
| MovementForm.jsx | 681 | — |
| shared.js | 56 | Constantes compartidas por CashBox y sus sub-componentes. Centralizadas para evitar duplicación y permitir split en múltiples archivos. |

### `src/components/clients/` (4 archivos)

| Archivo | Líneas | Qué hace |
|---|---|---|
| ClientIntelligence.jsx | 164 | — |
| HistoryModal.jsx | 257 | HistoryModal — modal de historial completo del cliente con tabs (Resumen, Compras, Regalos, Saldo). Extraído de Clients.jsx. |
| helpers.js | 15 | Helpers compartidos entre Clients.jsx y sus sub-componentes. |
| primitives.jsx | 58 | Primitivas de UI compartidas entre Clients.jsx y HistoryModal. |

### `src/components/purchases/` (11 archivos)

| Archivo | Líneas | Qué hace |
|---|---|---|
| AutoFillModal.jsx | 229 | Modal de "Auto-fill con reposición sugerida". Llama a suggestPurchaseQty(velocity × leadtime) y muestra todos los productos |
| BulkPasteModal.jsx | 275 | Modal de "Pegar lista cruda" para armar un pedido en segundos. El usuario pega texto tipo: |
| KanbanBoard.jsx | 88 | Vista Kanban: 4 columnas verticales, una por status. Cada columna scrollea independientemente si tiene muchas cards. |
| ListView.jsx | 59 | Vista lista: cards full-width, una debajo de la otra, ordenadas por fecha desc. Es la vista por default en mobile y opcional en desktop. |
| ProcurementSummary.jsx | 210 | — |
| PurchaseAnalytics.jsx | 306 | — |
| PurchaseCard.jsx | 287 | — |
| PurchaseDetailDrawer.jsx | 254 | — |
| QuickAddSearch.jsx | 122 | Buscador con autocomplete para agregar productos al pedido rápido. Tipeás y muestra top 8 matches del catálogo. Click → agrega como item con |
| RecommendedOrdersPanel.jsx | 280 | — |
| purchaseHelpers.js | 137 | src/components/purchases/purchaseHelpers.js Funciones PURAS de soporte para la vista de Compras. |

### `src/components/sales/` (1 archivos)

| Archivo | Líneas | Qué hace |
|---|---|---|
| SaleCard.jsx | 255 | SaleCard — una fila visual por venta en la lista de Sales.jsx. Extraído de Sales.jsx. Envuelto en memo al final del archivo para evitar |

### `src/components/supplier/` (9 archivos)

| Archivo | Líneas | Qué hace |
|---|---|---|
| AddNewProductModal.jsx | 67 | Modal para crear producto nuevo en el catálogo, precargado con datos del proveedor. |
| CompareTab.jsx | 657 | — |
| ItemRow.jsx | 268 | Fila de item en la tabla de procesamiento. Profesional, agradable, con: - estado match (🟢🟡🔴) o "aprendido" si vino de alias |
| ProcessTab.jsx | 802 | — |
| ProfilesTab.jsx | 123 | Tab 3: Gestión de proveedores Muestra: |
| Sparkline.jsx | 57 | Sparkline mínimo, sin deps. Render SVG con polyline + fill area. Usado en cards de proveedor para mostrar 6m de gasto. |
| SupplierProfileCard.jsx | 147 | Card de un perfil de proveedor con sus stats principales. 3 variantes: |
| SupplierProfileModal.jsx | 145 | — |
| processHelpers.js | 91 | src/components/supplier/processHelpers.js Helpers compartidos entre las tabs del módulo de Proveedores. |

### `src/components/wholesale/` (14 archivos)

| Archivo | Líneas | Qué hace |
|---|---|---|
| CallOutcomeModal.jsx | 25 | Modal de DESENLACE de llamada (gate G3, 2026-08-11) — el gemelo telefónico de la confirmación de WhatsApp: tocar 📞 abre el discador y NO re |
| ColasProspectos.jsx | 310 | ColasProspectos.jsx — la pantalla ☀️ Hoy del sistema de ejecución comercial (ciclo v2 F3, spec docs/PROSPECT_CRM_EJECUCION_SPEC.md §6): el s |
| Cotizador.jsx | 442 | Cotizador.jsx — 🧮 presupuestos mayoristas (Pricing Engine F5). El flujo real: la lista completa ya está en el teléfono del cliente → el |
| DiscoveryReview.jsx | 108 | DiscoveryReview.jsx — la superficie del discovery en la app: nueva búsqueda, estado de las búsquedas en curso y descartados con memoria (con |
| EmbudoOperativo.jsx | 153 | EmbudoOperativo.jsx — la pestaña 🎯 Embudo: dónde está parado todo. Rediseño 2026-08-07, después de prospectar de verdad. La versión anterio |
| PresentationMessageModal.jsx | 84 | Modal compartido (Prospectos + Kioscos) para el mensaje de PRIMER CONTACTO. Preview EDITABLE → mandar por WhatsApp o copiar. Pensado para el |
| PriceListScreen.jsx | 433 | — |
| PricingPolicyScreen.jsx | 249 | PricingPolicyScreen.jsx — ⚙️ Política comercial del Pricing Engine. Acá el operador CONFIGURA (RN-19: ningún número de la política vive en e |
| ProspectDiagnosisModal.jsx | 90 | Ficha de diagnóstico de un prospecto. RENDER PURO de lo que la fachada del Prospect Engine ya dejó listo (item.diagnostico / item.scoreResul |
| ProspectFicha.jsx | 155 | ProspectFicha.jsx — la FICHA del prospecto: el EXPEDIENTE PERMANENTE, y el centro operativo del módulo. Se abre desde cualquier vista (colas |
| ProspectFormModal.jsx | 65 | ProspectFormModal.jsx — alta/edición de prospecto. Extraído de Pipeline en F2 del mini CRM (spec docs/PROSPECT_CRM_SPEC.md) para usarlo tamb |
| ProspectMapsLine.jsx | 21 | ProspectMapsLine.jsx — el renglón de datos de Google Maps en las cards del CRM (micro-iteración post-cierre aprobada por Gustavo 2026-08-01) |
| VisitModal.jsx | 79 | VisitModal.jsx — registro de visita + calificación rápida (Prospect Engine). Extraído de Pipeline en F2 del mini CRM (spec docs/PROSPECT_CRM |
| prospectActions.js | 97 | prospectActions.js — las acciones de gestión del prospecto como ÚNICA fuente: las usan las colas de ☀️ Hoy y la Ficha. Si divergieran, dos |

## 🧠 Módulos puros — el "cerebro" de cálculos (`src/`)

Funciones puras del negocio: matemática financiera, inteligencia de
producto/cliente, métricas, sync. Sin pantalla → testeable.

| Archivo | Líneas | Qué hace |
|---|---|---|
| AppContext.js | 7 | Shared context for the most commonly prop-drilled values Components can gradually migrate from props to useAppContext() |
| calcs.js | 380 | Pure calculation functions extracted for testability Used by Partners, CashBox, Reports, Dashboard |
| clientIntelligence.js | 93 | Inteligencia de cliente (S17) — lógica pura, testeable. Construye stats por cliente, los segmenta, predice próxima compra y genera |
| collaboration.js | 36 | Helpers puros para las features de colaboración entre socios (Diego + Gustavo). Sin side effects — testeables. |
| constants.js | 4 | Fachada de re-export — mantiene todos los imports existentes funcionando. Contenido real en src/constants/*.js organizados por tema. |
| executiveMetrics.js | 43 | Métricas ejecutivas — lógica pura para el panorama "salud del negocio en 1 pantalla" (S19). Sin side effects, testeable. |
| finance.js | 222 | src/finance.js Motor financiero PURO. Funciones de costeo real, COGS devengado, valuación |
| firebase.js | 189 | — |
| helpers.js | 38 | — |
| pricing.js | 307 | src/pricing.js Funciones PURAS de pricing y promos. Sin state. Reciben datos por |
| productIntelligence.js | 467 | src/productIntelligence.js Funciones PURAS de inteligencia de producto. |
| prospecting.js | 91 | src/prospecting.js Lógica PURA de captación mayorista: embudo (pipeline), priorización de |
| routes.js | 91 | src/routes.js Lógica PURA de rutas de reparto mayorista. Nivel BÁSICO (acordado): agrupar |
| settings.js | 48 | Settings configurables por el usuario. Persisten en localStorage. Si en el futuro queremos sync entre devices, se migra a Firestore key. |
| theme.js | 49 | Paleta inspirada en el logo de Imports Zona Norte: navy profundo + cream cálido. El navy se usa como primary y para texto. El cream da una a |
| useFirebaseSync.js | 336 | safeSetItem — escribe a localStorage manejando QuotaExceededError. Si el storage llena (típicamente 5-10MB en mobile/Safari), el setItem |
| useSettings.js | 11 | Hook para consumir settings configurables. Re-renderiza cuando se emiten cambios (event "izn:settings-changed"). |
| wholesale.js | 37 | src/wholesale.js Margen del pedido MAYORISTA. Funciones PURAS. |
| wholesaleIntelligence.js | 133 | src/wholesaleIntelligence.js Inteligencia B2B (mayorista). Funciones PURAS. Opera sobre clientes |
| wholesaleMigration.js | 27 | src/wholesaleMigration.js Migración idempotente al modelo mayorista (pivote a venta mayorista). |

## 🛠️ Utilidades — `src/lib/`

| Archivo | Líneas | Qué hace |
|---|---|---|
| arrayMerge.js | 54 | Diff + merge para arrays de items con `id`. CONTEXTO: el sync con Firestore guarda cada "tabla" (sales, products, etc.) |
| backupValidator.js | 90 | src/lib/backupValidator.js Validador de integridad de backups JSON. Calcula un checksum determinístico |
| chartOfAccounts.js | 76 | src/lib/chartOfAccounts.js Plan de cuentas estandarizado tipo PCGA (Principios Contables Generalmente |
| clientInsights.js | 57 | src/lib/clientInsights.js Inteligencia del cliente para mostrar en el momento de la venta. |
| clientMessage.js | 43 | clientMessage.js — genera un mensaje PERSONALIZADO para un cliente puntual, basado en su historial real: sus sabores favoritos que están EN  |
| clientSegments.js | 109 | src/lib/clientSegments.js Clasifica clientes en segmentos para personalizar mensajes y priorización. |
| costoCompras.js | 24 | costoCompras.js — referencia del costo desde el módulo Compras. Puro. Decisión #3 del Pricing Engine (cerrada en gate): la FICHA es la fuent |
| cotizador.js | 240 | cotizador.js — COTIZACIÓN Y PRESUPUESTOS del Pricing Engine (F5). Puro. El flujo real (definido por Gustavo en gate F4): el presupuesto lo a |
| creditAccount.js | 56 | src/lib/creditAccount.js Cuenta corriente B2B (mayorista). COMPLETA pero se ACTIVA por cliente con |
| dailyPlan.js | 105 | src/lib/dailyPlan.js "Plan de hoy" — el corazón del hábito diario de mensajes. |
| dashboardAction.js | 46 | src/lib/dashboardAction.js "Acción del día" — la próxima jugada concreta para vender más. |
| dashboardAlerts.js | 213 | src/lib/dashboardAlerts.js Genera alertas del Dashboard con jerarquía y acción concreta. |
| dashboardGoal.js | 35 | src/lib/dashboardGoal.js Meta del mes — progreso de ventas vs un objetivo configurable. |
| eoq.js | 57 | src/lib/eoq.js EOQ (Economic Order Quantity) — fórmula clásica de gestión de inventario |
| errorReporter.js | 79 | src/lib/errorReporter.js Error tracking lightweight. Captura errores no manejados (window.onerror y |
| financeForecast.js | 114 | src/lib/financeForecast.js Proyecciones financieras: cierre del mes actual + cash flow 30/60/90 días. |
| financeInsights.js | 157 | src/lib/financeInsights.js Tres análisis adicionales para el módulo Análisis Financiero: |
| financialStatements.js | 150 | src/lib/financialStatements.js Estados financieros formales generados a partir del plan de cuentas: |
| fiscalReport.js | 92 | src/lib/fiscalReport.js Reporte fiscal mensual exportable. Genera un CSV con resumen consolidado |
| fuzzyMatch.js | 140 | src/lib/fuzzyMatch.js Funciones PURAS de fuzzy matching para emparejar ítems de listas de proveedores |
| leadTimeTracking.js | 58 | src/lib/leadTimeTracking.js Tracking de lead time por proveedor (Paraguay 1, Paraguay 2, etc.). |
| loyalty.js | 69 | src/lib/loyalty.js Sistema simple de puntos de fidelidad. Reglas: |
| messageAgent.js | 88 | src/lib/messageAgent.js 🤖 AGENTE REDACTOR — capa de IA que escribe el COPY HUMANO que envuelve el |
| messageCooldown.js | 68 | src/lib/messageCooldown.js Anti-saturación de mensajes. Lee el auditLog (entries entityType="offer") |
| messageCopyBank.js | 113 | src/lib/messageCopyBank.js 🎨 BANCO DE COPYS — el material creativo del Agente Redactor. |
| messageTones.js | 101 | src/lib/messageTones.js Manifiesto de marca + pools rotativos de openers/closers/CTAs. |
| notifications.js | 95 | src/lib/notifications.js Wrapper sobre la Notification API + scheduler de notificaciones LOCALES |
| offerAudiences.js | 64 | src/lib/offerAudiences.js Audiencias para ofertas de WhatsApp. Cada una tiene un tono distinto que |
| offerCalendar.js | 68 | src/lib/offerCalendar.js Plan semanal sugerido de ofertas: qué audiencia y qué tipo de mensaje |
| offerHistory.js | 115 | src/lib/offerHistory.js Historial de ofertas mandadas + tracking de conversión. |
| offers.js | 319 | src/lib/offers.js Generador de mensajes de oferta para WhatsApp. Funciones PURAS que arman |
| parseCostos.js | 80 | parseCostos.js — PEGAR la lista del proveedor en vez de tipear campo por campo. Cada vez que el proveedor manda precios nuevos hay que actua |
| priceLists.js | 169 | priceLists.js — LISTAS DE PRECIOS VERSIONADAS E INMUTABLES (RN-12, RN-13). Una lista publicada es un SNAPSHOT: congela la política, los cost |
| pricingAdapter.js | 35 | pricingAdapter.js — ADAPTADOR entre el modelo de productos de IZN y el contrato del motor (docs/addendum-portabilidad-modulo.md, capa 2). |
| pricingEngine.js | 151 | pricingEngine.js — NÚCLEO PORTABLE del Pricing Engine. Funciones PURAS. Contrato (docs/addendum-portabilidad-modulo.md): el motor no sabe qu |
| pricingPolicy.js | 85 | pricingPolicy.js — POLÍTICA COMERCIAL como datos (capa de integración). Acá vive lo que el negocio configura y el código jamás fija (RN-19): |
| prospectActividad.js | 64 | prospectActividad.js — la sección Actividad de la Ficha (spec §Ficha.5, docs/PROSPECT_CRM_SPEC.md) como LISTA DE EVENTOS TIPADOS: |
| prospectDiagnosis.js | 115 | prospectDiagnosis.js — número → LENGUAJE. Port de la mecánica de prospect_crm/diagnosis.py de Atlas (la palabra lidera, el número respalda, |
| prospectEtapas.js | 107 | prospectEtapas.js — el dominio de ETAPAS OPERATIVAS del sistema de ejecución comercial (spec CONGELADO: docs/PROSPECT_CRM_EJECUCION_SPEC.md, |
| prospectHechos.js | 32 | prospectHechos.js — los HECHOS que las pantallas capturan con un tap (spec CONGELADO docs/PROSPECT_CRM_EJECUCION_SPEC.md §2, F3 del ciclo v2 |
| prospectRanking.js | 38 | prospectRanking.js — LA FACHADA del Prospect Engine para la UI. Este es el ÚNICO módulo del engine que la capa de React debe importar. |
| prospectRubric.js | 61 | prospectRubric.js — la rúbrica de Imports para el Prospect Engine, como DATOS. Versión izn-v1 · BORRADOR del diseño §7 (PROSPECT_ENGINE_DESI |
| prospectScoring.js | 126 | prospectScoring.js — MOTOR genérico de evaluación de prospectos. Port fiel del núcleo puro de Atlas Prospect Intelligence (score.py + scorer |
| prospectSignals.js | 113 | prospectSignals.js — ADAPTADOR prospecto → señales TRI del Prospect Engine. El ÚNICO módulo que conoce ambos mundos: el documento Firestore  |
| publicCatalog.js | 122 | src/lib/publicCatalog.js Sistema de catálogo público compartible. Genera un "snapshot" del stock |
| purchaseAnalytics.js | 197 | src/lib/purchaseAnalytics.js Funciones PURAS de análisis de compras: gasto por proveedor, lead times, |
| purchaseRecommendations.js | 189 | src/lib/purchaseRecommendations.js Genera recomendaciones de pedidos cruzando datos de TODO el sistema: |
| push.js | 91 | Cliente de push REMOTAS (Firebase Cloud Messaging). Flujo completo: |
| pushConfig.js | 1 | Configuración de Web Push (FCM). VAPID_PUBLIC_KEY es la clave PÚBLICA de Web Push del proyecto Firebase. |
| pushWindow.js | 37 | Lógica PURA de scheduling de push remotas. Sin side effects — la usa tanto el endpoint serverless (api/send-daily-push.js) como los tests. |
| realProducts.js | 28 | src/lib/realProducts.js "Producto real" = un producto que efectivamente forma parte del negocio |
| reconciliation.js | 91 | src/lib/reconciliation.js Conciliación bancaria: cruza ventas con un CSV de movimientos de la cuenta |
| rmaWorkflow.js | 92 | src/lib/rmaWorkflow.js Workflow simple de RMA (Return Merchandise Authorization) / garantías. |
| routeSheet.js | 33 | src/lib/routeSheet.js Genera la HOJA DE RUTA en texto plano — imprimible y compartible (WhatsApp / |
| saleReceipt.js | 139 | src/lib/saleReceipt.js Genera un recibo PDF profesional de una venta, con el branding de |
| schemas.js | 164 | src/lib/schemas.js Schemas Zod para validar datos antes de escribir a Firestore o de procesar |
| shippingCalc.js | 59 | src/lib/shippingCalc.js Calculadora simple de costo de envío por zona. Diego puede customizar |
| skuProfitability.js | 94 | src/lib/skuProfitability.js Rentabilidad REAL por SKU = no es solo el margen unitario, es cuánto |
| smartOffers.js | 441 | src/lib/smartOffers.js Motor de "Ideas de venta": analiza estadísticas y genera ofertas concretas |
| storyImageGenerator.js | 134 | src/lib/storyImageGenerator.js Genera una imagen PNG 1080×1920 (formato Stories de Instagram/WhatsApp) |
| supplierComparison.js | 184 | src/lib/supplierComparison.js Funciones PURAS para comparar listas de múltiples proveedores en simultáneo. |
| supplierParser.js | 245 | src/lib/supplierParser.js Funciones PURAS de parsing de listas de proveedores. NO leen archivos — |
| supplierProfiles.js | 221 | src/lib/supplierProfiles.js Funciones PURAS para gestión de perfiles de proveedores, diccionario de |
| warrantyProvision.js | 69 | src/lib/warrantyProvision.js Provisión para garantías y devoluciones. Reserva un % del revenue mensual |
| weeklyPromo.js | 44 | src/lib/weeklyPromo.js "Promo de la semana" — UNA promo elegida por impacto económico, estable |
| whatIfSimulator.js | 95 | src/lib/whatIfSimulator.js Simulador what-if para tomar decisiones financieras informadas: |
| whatsappMessage.js | 115 | src/lib/whatsappMessage.js Generadores del mensaje de stock para WhatsApp. Funciones PURAS extraídas |
| whatsappMigration.js | 26 | whatsappMigration.js — estampa telefonoWa / telefonoInvalido sobre los prospectos (handoff 2026-08-10, Cambio 1). Pura e idempotente, mismo  |
| whatsappPhone.js | 28 | whatsappPhone.js — normalización de teléfonos AR al formato que WhatsApp exige en sus links (549 + área + abonado, sin 0 y sin 15) + el buil |
| wholesaleExport.js | 53 | src/lib/wholesaleExport.js Export a CSV de clientes mayoristas, prospectos y rutas. Funciones PURAS |
| wholesaleMessage.js | 152 | src/lib/wholesaleMessage.js Generadores de mensajes B2B (mayorista): COBRANZA y PRESENTACIÓN. |

## ☁️ Backend — corre fuera del navegador

### Endpoints serverless (`api/`)

| Endpoint | Qué hace |
|---|---|
| generate-daily-message.js | Vercel Serverless Function: 🤖 AGENTE REDACTOR (versión sin costo de API). Genera el mensaje de stock diario y lo guarda en Firestore para q |
| send-daily-push.js | Vercel Serverless Function: dispara las push remotas diarias vía FCM. Lo llama un cron de GitHub Actions cada ~10 min (.github/workflows/pus |

### Workflows automáticos (`.github/workflows/`)

| Workflow | Ruta |
|---|---|
| backup-diario.yml | .github/workflows/backup-diario.yml |
| ci.yml | .github/workflows/ci.yml |
| message-agent-cron.yml | .github/workflows/message-agent-cron.yml |
| push-cron.yml | .github/workflows/push-cron.yml |
| structure-snapshot.yml | .github/workflows/structure-snapshot.yml |

### Scripts (`scripts/`)

| Script | Qué hace |
|---|---|
| actualizar-costos-2026-08.mjs | actualizar-costos-2026-08.mjs — lista de costos del proveedor de agosto 2026. QUÉ HACE: |
| audit-cash.mjs | — |
| audit-integrity.mjs | — |
| audit-withdrawals.mjs | — |
| auth-oauth.mjs | — |
| backup-drive.mjs | — |
| backup.mjs | — |
| cleanup-maggie-dup.mjs | — |
| com.izn.backup.plist | — |
| create-users.mjs | One-time script to create Firebase Auth users Run: node scripts/create-users.mjs |
| dark-theme-swap-pass2.mjs | — |
| dark-theme-swap.mjs | — |
| generar-fixture-pricing.mjs | generar-fixture-pricing.mjs — regenera docs/pricing_fixture_v2026-08.csv desde el motor (src/lib/pricingEngine.js) y lo VERIFICA contra la g |
| generate-structure-doc.mjs | — |
| impacto-lista-v2026-08.mjs | impacto-lista-v2026-08.mjs — TABLA DE IMPACTO POR CLIENTE (solo lectura). Insumo para la decisión abierta #1 del brief del Pricing Engine (t |
| light-theme-restore.mjs | — |
| migrate-remove-gustavo.mjs | — |
| migrate-v250-colores.mjs | migrate-v250-colores.mjs — unifica "V250 Black / Gold / Pink" en UN modelo "V250" con el color plegado al sabor. |

## 🧪 Tests

Tests detectados: **102**. Para correrlos: `npm test`.

- `src/App.test.jsx`
- `src/calcs.test.js`
- `src/clientIntelligence.test.js`
- `src/collaboration.test.js`
- `src/components/ProspectMap.test.jsx`
- `src/components/Prospectos.test.jsx`
- `src/components/UI.test.jsx`
- `src/components/purchases/purchaseHelpers.test.js`
- `src/components/wholesale/DiscoveryReview.test.jsx`
- `src/components/wholesale/EmbudoOperativo.test.jsx`
- `src/components/wholesale/PresentationMessageModal.test.jsx`
- `src/components/wholesale/PriceListScreen.test.jsx`
- `src/components/wholesale/prospectActions.test.js`
- `src/executiveMetrics.test.js`
- `src/finance.test.js`
- `src/lib/arrayMerge.test.js`
- `src/lib/backupCoverage.test.js`
- `src/lib/backupValidator.test.js`
- `src/lib/cashBridge.edge.test.js`
- `src/lib/chartOfAccounts.test.js`
- `src/lib/clientInsights.test.js`
- `src/lib/clientMessage.test.js`
- `src/lib/clientSegments.test.js`
- `src/lib/costoCompras.test.js`
- `src/lib/cotizador.test.js`
- `src/lib/creditAccount.edge.test.js`
- `src/lib/creditAccount.test.js`
- `src/lib/dailyPlan.test.js`
- `src/lib/dashboardAlerts.test.js`
- `src/lib/dashboardGoal.test.js`
- `src/lib/discovery/discoverRun.test.js`
- `src/lib/discovery/discoveryImport.test.js`
- `src/lib/discovery/gosomParse.test.js`
- `src/lib/discovery/identity.test.js`
- `src/lib/discovery/izn_discovery.golden.test.js`
- `src/lib/discovery/mapProspect.test.js`
- `src/lib/errorReporter.test.js`
- `src/lib/financeForecast.test.js`
- `src/lib/financeInsights.test.js`
- `src/lib/financialStatements.test.js`
- `src/lib/fiscalReport.test.js`
- `src/lib/fuzzyMatch.test.js`
- `src/lib/loyalty.test.js`
- `src/lib/messageAgent.test.js`
- `src/lib/messageCooldown.test.js`
- `src/lib/messageCopyBank.test.js`
- `src/lib/messageTones.test.js`
- `src/lib/notifications.test.js`
- `src/lib/offerAudiences.test.js`
- `src/lib/offerCalendar.test.js`
- `src/lib/offerHistory.test.js`
- `src/lib/offers.test.js`
- `src/lib/operationsCap7.test.js`
- `src/lib/parseCostos.test.js`
- `src/lib/priceLists.test.js`
- `src/lib/pricingAdapter.test.js`
- `src/lib/pricingEngine.golden.test.js`
- `src/lib/pricingEngine.test.js`
- `src/lib/pricingPolicy.test.js`
- `src/lib/pricingPolicy.wiring.test.js`
- `src/lib/prospectActividad.test.js`
- `src/lib/prospectDiagnosis.test.js`
- `src/lib/prospectEtapas.test.js`
- `src/lib/prospectHechos.test.js`
- `src/lib/prospectRanking.test.js`
- `src/lib/prospectRubric.test.js`
- `src/lib/prospectScoring.test.js`
- `src/lib/prospectSignals.test.js`
- `src/lib/publicCatalog.test.js`
- `src/lib/purchaseAnalytics.test.js`
- `src/lib/purchaseRecommendations.test.js`
- `src/lib/pushWindow.test.js`
- `src/lib/realProducts.test.js`
- `src/lib/reconciliation.test.js`
- `src/lib/schemas.test.js`
- `src/lib/skuProfitability.test.js`
- `src/lib/smartOffers.test.js`
- `src/lib/storyImageGenerator.test.js`
- `src/lib/supplierComparison.test.js`
- `src/lib/supplierParser.test.js`
- `src/lib/supplierProfiles.test.js`
- `src/lib/warrantyProvision.test.js`
- `src/lib/whatIfSimulator.test.js`
- `src/lib/whatsappMessage.test.js`
- `src/lib/whatsappMigration.test.js`
- `src/lib/whatsappPhone.test.js`
- `src/lib/wholesaleExport.test.js`
- `src/lib/wholesaleMessage.escalones.test.js`
- `src/lib/wholesaleMessage.test.js`
- `src/mayorista.integration.test.js`
- `src/pricing.test.js`
- `src/productIntelligence.test.js`
- `src/prospecting.test.js`
- `src/routes.edge.test.js`
- `src/routes.test.js`
- `src/useFirebaseSync.autosave.test.js`
- `src/wholesale.edge.test.js`
- `src/wholesale.test.js`
- `src/wholesaleIntelligence.edge.test.js`
- `src/wholesaleIntelligence.test.js`
- `src/wholesaleMigration.edge.test.js`
- `src/wholesaleMigration.test.js`

## 📦 Public (PWA + assets)

- `public/apple-touch-icon.svg`
- `public/icon-maskable.svg`
- `public/icon.svg`
- `public/manifest.webmanifest`
- `public/sw.js`

## 📚 Documentación (`docs/`)

- `docs/AGENTE_REDACTOR.md`
- `docs/BACKLOG_TECNICO_2026-07-28_prospeccion_y_sync.md`
- `docs/BACKUP_AUTOMATION.md`
- `docs/CHECKLIST_PRIMER_USO.md`
- `docs/DISCOVERY_ENGINE_CONTRATO.md`
- `docs/ESTRUCTURA.md`
- `docs/FIREBASE_AUTH_SETUP.md`
- `docs/GUIA_MAYORISTA.md`
- `docs/INTEGRACION_PROSPECT_ENGINE.md`
- `docs/IZN_Backup_Hardening_Resumen.md`
- `docs/IZN_CRM_Ejecucion_Resumen.md`
- `docs/IZN_Discovery_Engine_Resumen.md`
- `docs/IZN_Fix_Borrar_Mayorista_Resumen.md`
- `docs/IZN_Front_Ventas_Resumen.md`
- `docs/IZN_Llamadas_Cola_SinWhatsApp_Resumen.md`
- `docs/IZN_Merge_Mayorista_Resumen.md`
- `docs/IZN_Mobile_Hardening_Resumen.md`
- `docs/IZN_Pricing_Engine_F0_F1_Resumen.md`
- `docs/IZN_Pricing_Engine_Resumen.md`
- `docs/IZN_Prospect_CRM_Resumen.md`
- `docs/IZN_Prospect_Engine_Resumen.md`
- `docs/IZN_Tanda_E_Docs_Resumen.md`
- `docs/IZN_Tanda_F1_Modos_Resumen.md`
- `docs/IZN_Tanda_F_Completa_Resumen.md`
- `docs/IZN_Textos_Mobile_Resumen.md`
- `docs/IZN_WhatsApp_Contacto_Resumen.md`
- `docs/MAPA_DEL_SISTEMA.md`
- `docs/PLAN_MAYORISTA.md`
- `docs/PLAN_MEJORAS_MAYORISTA.md`
- `docs/PLAN_S14_S22.md`
- `docs/PROSPECT_CRM_EJECUCION_SPEC.md`
- `docs/PROSPECT_CRM_SPEC.md`
- `docs/PROSPECT_ENGINE_ARQUITECTURA.md`
- `docs/PROSPECT_ENGINE_CONTRATO.md`
- `docs/PUSH_SETUP.md`
- `docs/SECURITY.md`
- `docs/SESSION_2026-04-22.md`
- `docs/SESSION_2026-04-23_to_24_big_push.md`
- `docs/SESSION_2026-04-29_S14.md`
- `docs/SESSION_2026-06-22_push-notifications.md`
- `docs/SESSION_2026-06-23_hardening-y-4-frentes.md`
- `docs/SESSION_2026-06-23_vuelve-gustavo.md`
- `docs/SESSION_2026-07-14_mayorista_fase0.md`
- `docs/SESSION_2026-07-14_mayorista_fase1.md`
- `docs/SESSION_2026-07-14_mayorista_fase2.md`
- `docs/SESSION_2026-07-14_mayorista_fase3.md`
- `docs/SESSION_2026-07-14_mayorista_fase4.md`
- `docs/SESSION_2026-07-14_mayorista_fase5.md`
- `docs/SESSION_2026-07-14_mayorista_fase6.md`
- `docs/SESSION_2026-07-14_mejoras_tandas_ABCD.md`
- `docs/SESSION_2026-07-17_backup_hardening.md`
- `docs/SESSION_2026-07-17_merge_mayorista.md`
- `docs/SESSION_2026-07-17_mobile_hardening.md`
- `docs/SESSION_2026-07-17_tanda_E_docs.md`
- `docs/SESSION_2026-07-17_tanda_F1_modos.md`
- `docs/SESSION_2026-07-24_fixes_y_front_ventas.md`
- `docs/SESSION_2026-07-24_tanda_F_completa.md`
- `docs/SESSION_2026-07-28_prospect_engine.md`
- `docs/SESSION_2026-07-30_discovery_engine.md`
- `docs/SESSION_2026-07-31_prospect_crm.md`
- `docs/SESSION_2026-08-01_b3_backup.md`
- `docs/SESSION_2026-08-07_pricing_engine.md`
- `docs/SESSION_2026-08-10_whatsapp_contacto.md`
- `docs/SESSION_2026-08-11_llamadas_cola_sin_whatsapp.md`
- `docs/TEST_ENV_SETUP.md`
- `docs/addendum-portabilidad-modulo.md`
- `docs/brief-implementacion-claude-code.md`
- `docs/documento-estrategico-comercial-v1.md`
- `docs/impacto-lista-v2026-08.md`
