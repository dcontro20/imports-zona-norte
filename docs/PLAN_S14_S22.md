# Plan maestro de mejoras S14–S22 — Imports Zona Norte

> **Fuente de verdad** del plan post-auditoría 360° (abril 2026).
> Si una sesión nueva pregunta "qué viene después de Sxx", abrir este doc.

**Contexto:** este sistema es 100% INTERNO (Diego + Gustavo). La presencia
pública (catálogo web, SEO, QR) se construye separadamente con Claude Design.
Acá solo se trabajan herramientas internas de gestión, inteligencia y
generación de outputs para marketing manual.

**Estado al 2026-04-29:**
- S1–S13 completadas (commits anteriores a `aff00ae`)
- Bug fixes críticos post-S13 (`aff00ae`)
- **S14 COMPLETA** (commits `cc8c570` → `a367bb9`, 6 bloques)
- Pendiente: S15 a S22

---

## Mapa de las 9 secciones

| Sección | Tema | Mejoras | Estado |
|---------|------|---------|--------|
| **S14** | Bugs críticos + Precisión contable | 16 | ✅ COMPLETA |
| **S15** | Inteligencia de Producto | 16 | ✅ COMPLETA (15/16, 15.16 diferido) |
| **S16** | Sistema de promos y pricing | 19 | Pendiente |
| **S17** | Inteligencia de cliente avanzada | 15 | Pendiente |
| **S18** | Marketing Hub interno (generadores output) | 16 | Pendiente |
| **S19** | Dashboards y métricas ejecutivas | 15 | Pendiente |
| **S20** | Operativa diaria pulida | 18 | Pendiente |
| **S21** | Robustez y confiabilidad | 17 | Pendiente |
| **S22** | Power user y atajos | 14 | Pendiente |

**Total:** 146 mejoras (S15–S22) restantes + S14 ya cerrada (16) = **162 ítems planeados**.

Convenciones:
- 🔴 crítico · 🟠 alto · 🟡 medio · 🟢 nice-to-have
- Esfuerzo: **bajo** (~hs), **medio** (~1 día), **alto** (>2 días)

---

## ✅ S14 — Bugs críticos + Precisión contable (CERRADA)

**Cerrada el 2026-04-29.** Ver `docs/SESSION_2026-04-29_S14.md` para journal completo.

| # | Mejora | Status | Commit |
|---|--------|--------|--------|
| 14.1 | Validación crypto sin amountUSDT | ✅ | cc8c570 |
| 14.2 | Detección race concurrent writes (versión pragmática) | ✅ | c559b21 |
| 14.3 | Field-level Firestore writes | ⏸️ Diferido | — |
| 14.4 | calcMonthSummary única función pura | ✅ | 49ce12b |
| 14.5 | Congelar closures (advertencia bloqueante) | ✅ | 49ce12b |
| 14.6 | Mermas separadas en Closures | ✅ | 49ce12b |
| 14.7 | Crédito-vuelto como pasivo en runway | ✅ | 49ce12b |
| 14.8 | safeWithdraw cap por balance real | ✅ | bb12170 |
| 14.9 | Tax tracking monotributo | ✅ | bb12170 |
| 14.10 | Detector de inconsistencias entre módulos | ✅ | 49ce12b |
| 14.11 | Tests financieros faltantes (+21 tests) | ✅ | a367bb9 |
| 14.12 | rateUSDT separado de exchangeRate | ✅ | 0e570cf |
| 14.13 | equityDiff: 4 números separados | ✅ | bb12170 |
| 14.14 | Migration de ventas pre-feature | ✅ | 0e570cf |
| 14.15 | Validación person en consumoPersonal | ✅ | cc8c570 |
| 14.16 | Reportes contables CSV debe/haber | ✅ | a367bb9 |

**Deuda técnica documentada:** S14.3 (field-level Firestore writes) requiere
refactor profundo del path de saveToFirestore. La detección informativa de
S14.2 mitiga el riesgo. Sprint dedicado a futuro.

---

## ✅ S15 — Inteligencia de Producto (CERRADA)

**Cerrada el 2026-04-29.** 15 de 16 mejoras implementadas (15.16 diferido).

**Objetivo cumplido:** el sistema ahora dice qué vender más, qué descontar,
qué dejar de pedir, con badges inline en Products + reportes panorámicos
en Reports + sugeridor activo en Purchases + alertas en Dashboard.

| # | Mejora | Status | Commit |
|---|--------|--------|--------|
| 15.1 | Velocity dashboard | ✅ | 69b446b |
| 15.2 | ABC analysis Pareto 80/20 | ✅ | b52e00d |
| 15.3 | Margen real por producto | ✅ | 69b446b |
| 15.4 | Top slow movers + sugerencias | ✅ | 69b446b |
| 15.5 | Comparativa rentabilidad por marca | ✅ | b52e00d |
| 15.6 | Dead stock identifier | ✅ | 69b446b |
| 15.7 | Sugeridor de qty a pedir Paraguay | ✅ | 62d4148 |
| 15.8 | Alertas de pérdida de velocidad | ✅ | 62d4148 |
| 15.9 | Lifecycle de producto | ✅ | 69b446b |
| 15.10 | Matriz correlación productos (cross-sell) | ✅ | 22c8a3c |
| 15.11 | Patrones por día de semana | ✅ | 22c8a3c |
| 15.12 | Análisis de elasticidad precio-demanda | ✅ | a88893e |
| 15.13 | Sell-through rate (STR) por lote | ✅ | 22c8a3c |
| 15.14 | Dashboard salud inventario | ✅ | b52e00d |
| 15.15 | ROI ranking | ✅ | b52e00d |
| 15.16 | Stock vs shelf space (puffs proxy) | ⏸️ Diferido | — |

**Archivos clave creados:**
- `src/productIntelligence.js` (685 líneas, 15 funciones puras)
- `src/productIntelligence.test.js` (38 tests, 134 totales en proyecto)

**Decisión de S15.16 diferido:** "stock vs shelf space" usaba puffs como proxy
de espacio físico. Para vapes de Paraguay esto agrega complejidad sin un
ROI claro vs los 4 reportes (ABC, brand, salud, ROI ranking) que ya cubren
las decisiones críticas de inventario. Se reactiva si Diego lo pide.

---

## 💲 S16 — Sistema de promos y pricing

**Objetivo:** automatizar descuentos inteligentes, sacar promos justificadas con datos, manejar canales con precios distintos.
**KPI que mueve:** ticket promedio, rotación de slow movers, margen ponderado.

| # | Mejora | Prio | Esfuerzo |
|---|--------|------|----------|
| 16.1 | **Sistema de cupones formal** — código, % o $, válido desde/hasta, max usos, audiencia (todos/VIP/cliente específico). Aplicar en Sales | 🔴 | Medio |
| 16.2 | **Pricing dinámico por canal** — campo `priceMP`, `pricePresencial`, `priceML` por producto. Auto-aplicar en Sales según `channel` | 🔴 | Medio |
| 16.3 | **Descuentos automáticos por volumen** — config: 5+ uds = -5%, 10+ = -10%, 20+ = -15%. Visible en tiempo real al cargar | 🔴 | Bajo |
| 16.4 | **Calculadora "hasta cuánto descuento manteniendo margen"** — modal: "mantener 30% margen → precio mínimo $X / desc máx Y%" | 🟠 | Bajo |
| 16.5 | **Detector candidatos a promo** — algoritmo: stock alto + bajo movimiento + expiry próximo → recomienda "promo -20% por 7 días" | 🟠 | Alto |
| 16.6 | **Sugeridor de liquidación** — botón "🚨 Liquidar" en slow movers con 2-3 escenarios (descuento × velocidad esperada) | 🟠 | Alto |
| 16.7 | **Clearance automática por expiry** — si <30d -5%, <14d -15%, <7d -25%. Auto-aplicado | 🟠 | Bajo |
| 16.8 | **Alertas de oportunidad de margen** — si modelo tiene margen <15% rojo, <20% ámbar | 🟠 | Bajo |
| 16.9 | **Descuentos por tier de cliente** — VIP -5% siempre, Diamante -10%. Auto en Sales | 🟠 | Bajo |
| 16.10 | **Bundles/combos preconfigurados** — "5x Lost Mary @ $X" como producto especial. Aplicar en Sales con 1-click | 🟠 | Alto |
| 16.11 | **Oferta "última unidad"** — si stock=1 sugerir -10% con 1-click | 🟡 | Bajo |
| 16.12 | **Happy hour temporal** — ej: viernes 18-20hs -15% Lost Mary, auto-aplicado | 🟡 | Alto |
| 16.13 | **Histórico de promos + analytics** — qué promo se usó, conversión, ROI | 🟡 | Medio |
| 16.14 | **Recomendador precio óptimo** — basado en histórico de cambios + ventas, sugiere ajuste | 🟡 | Alto |
| 16.15 | **Pricing por cantidad-objetivo** — si vendiste 100 este mes, subir $1; si solo 40, bajar $1 | 🟡 | Medio |
| 16.16 | **A/B testing de precios** — 2 precios alternados, mide cuál convirtió más | 🟡 | Alto |
| 16.17 | **Pricing dinámico por escasez** — stock <5 en top seller → +10%; cuando reabastece → vuelve a base | 🟡 | Alto |
| 16.18 | **Matriz sensibilidad precio** — tabla "si bajo Elf Bar 5%, revenue ±X%" | 🟡 | Alto |
| 16.19 | **Descuento fidelización por compras del mes** — cliente con 10+ compras este mes → -5% próxima | 🟡 | Medio |

---

## 👥 S17 — Inteligencia de cliente avanzada

**Objetivo:** entender comportamiento individual y grupal de clientes para tomar acción precisa.
**KPI que mueve:** retención, frecuencia de compra, conversión a VIP.

| # | Mejora | Prio | Esfuerzo |
|---|--------|------|----------|
| 17.1 | **Casi-VIP detector** — clientes a 1 compra de subir tier. Badge "falta $X para ser VIP" | 🔴 | Bajo |
| 17.2 | **Churn risk score** — alerta si días sin compra > 2× su frecuencia normal. Visible en ClientCard | 🔴 | Bajo |
| 17.3 | **Mapeo de gustos individual** — top 3 sabores por cliente con confidence score. Guardar en `client.flavorPrefs` | 🔴 | Bajo |
| 17.4 | **Estado del cliente del día** — modal: "Compra cada 14d, ya pasaron 18 — contactá" | 🟠 | Bajo |
| 17.5 | **Frecuencia esperada visible** — popup: "Próxima compra estimada: {fecha}" basado en avgDays | 🟠 | Bajo |
| 17.6 | **Micro-segmentación expandida** — sumar a VIP/Regular/Dormido: "casi-vip", "vip-en-riesgo", "nuevo prometedor" | 🟠 | Bajo |
| 17.7 | **Recomendación automática de producto al ver cliente** — "Compraste Mango Ice 3 veces hace 45d, hay stock" | 🟠 | Bajo |
| 17.8 | **Predictor de siguiente compra con confianza** — fecha + intervalo (±N días) | 🟡 | Medio |
| 17.9 | **Notas inteligentes auto-sugeridas** — campo notes con sugerencias por patrón ("VIP dormido", "siempre paga efectivo") | 🟡 | Medio |
| 17.10 | **Detección de balance fantasma** — cliente con balance alto + sin uso = inactividad inversa | 🟡 | Medio |
| 17.11 | **LTV proyectado vs actual** — card en HistoryModal: "actual $X / proyectado 12m $Y" | 🟡 | Medio |
| 17.12 | **Cohort analysis** — clientes adquiridos en mes X → revenue mes 1, 2, 3 | 🟡 | Medio |
| 17.13 | **Patrones de compra individuales** — "Martin compra siempre viernes", "siempre 2 sabores" | 🟡 | Medio |
| 17.14 | **Perfil ideal VIP** — qué tienen en común tus VIP (zona, ticket, marcas, canal) | 🟡 | Medio |
| 17.15 | **Histórico de gestos (garantías/regalos) por cliente** — patterns: "siempre falla Mango Ice" | 🟠 | Bajo |

---

## 📣 S18 — Marketing Hub interno (generadores output)

**Objetivo:** el sistema arma mensajes/listas/links accionables; Diego solo copia y pega afuera.
**Cero automatización de envío** — sólo herramientas de productividad para mensajería manual.
**KPI que mueve:** velocidad de outreach, calidad/personalización del mensaje, re-engagement de dormidos.

| # | Mejora | Prio | Esfuerzo |
|---|--------|------|----------|
| 18.1 | **"Lista del día" — pantalla nueva accionable** — segmentos: cumples hoy, re-compra esperada, dormidos para reactivar, lead sin convertir. Cada uno con # y botón "Generar mensajes" | 🔴 | Medio |
| 18.2 | **Mensaje WA personalizado con merge tags** — `{nombre}`, `{ultima_compra}`, `{sabor_favorito}`, `{dias_inactivo}`, `{descuento_personal}`. Genera link wa.me listo | 🔴 | Medio |
| 18.3 | **Templates por evento** — cumple, re-compra esperada, dormido, llegó marca favorita, nuevo lote, "te quedaste pensando" (lead), aniversario | 🔴 | Bajo |
| 18.4 | **Mensaje "primer aviso" VIP** — al cargar nuevo lote, alerta: "Avisar a 5 VIPs de Lost Mary: [msg pre-armado]" — botón abre wa.me cliente por cliente | 🔴 | Bajo |
| 18.5 | **Mensaje de reactivación con código personalizado** — dormido → "Hola {nombre}, código WELCOME10 sólo para vos" | 🔴 | Bajo |
| 18.6 | **Mensaje bienvenida automático con código** — al crear cliente nuevo: botón "👋 Bienvenida" con código único pre-generado | 🟠 | Bajo |
| 18.7 | **Bulk message generator** — selecciono 10 clientes → 10 wa.me URLs con mensaje personalizado por cada uno | 🟠 | Medio |
| 18.8 | **Calendario de marketing** — vista semanal: "Lunes 3 cumples, martes 8 re-compras esperadas, miércoles 5 dormidos" | 🟠 | Medio |
| 18.9 | **Generador de combos sugeridos por cliente** — basado en favProducts + stock + margen. "Para Martin: Mango Ice + Watermelon = $X" | 🟠 | Medio |
| 18.10 | **Generador de promo para slow movers segmentado** — el slow mover Y → mensaje a clientes que tienen ese sabor en favProducts | 🟠 | Medio |
| 18.11 | **A/B variantes de templates con tracking manual** — guardar 2 versiones, marcar manualmente cuál convirtió mejor | 🟡 | Medio |
| 18.12 | **Generador de mensaje cobranza** — clientes con balance < 0 → mensaje pre-armado "saldo pendiente $X, ¿cómo lo saldamos?" | 🟡 | Bajo |
| 18.13 | **Generador de mensaje oferta flash** — "FLASH: últimas 5 uds Lost Mary @ $X" segmentable | 🟡 | Bajo |
| 18.14 | **Templates con merge de promo activa** — si hay cupón vigente, lo merge en el template automáticamente | 🟡 | Medio |
| 18.15 | **Scripts para llamadas/reuniones presenciales** — checklist con datos del cliente al hacer llamada | 🟢 | Bajo |
| 18.16 | **Export de lista clientes activos para mailing/IG** — CSV con nombre, tel, email, sabores fav | 🟡 | Bajo |

---

## 📊 S19 — Dashboards y métricas ejecutivas

**Objetivo:** ver de un vistazo el estado del negocio y detectar anomalías sin abrir 10 pantallas.
**KPI que mueve:** velocidad de toma de decisión, detección temprana de problemas/oportunidades.

| # | Mejora | Prio | Esfuerzo |
|---|--------|------|----------|
| 19.1 | **Dashboard "modo socio" (1-página)** — vista única: revenue mes, top 3 productos, 3 alertas, runway, cumples del día, % margen actual | 🔴 | Bajo |
| 19.2 | **P&L por canal completo** — tabla: WA / IG / Delivery / Presencial / ML × (Revenue / COGS / Gastos asignados / Profit / Margen %) | 🔴 | Alto |
| 19.3 | **Anomaly detection alerts** — "Hoy vendiste 50% menos que tu promedio de 14 días" / "Lost Mary vende 3x más que lo normal" | 🟠 | Medio |
| 19.4 | **Comparativa períodos** — "este mes vs anterior", "este trimestre vs anterior", YoY (cuando haya histórico) | 🟠 | Bajo |
| 19.5 | **Pulse "¿cómo va el mes?"** — semáforo verde/ámbar/rojo vs meta configurable | 🟠 | Bajo |
| 19.6 | **Predictor de cierre del mes** — "Al ritmo actual: cerrás en $X revenue, $Y profit" | 🟠 | Bajo |
| 19.7 | **CLV proyectado** — card: "Lifetime value actual $X / proyectado 12m $Y" | 🟠 | Bajo |
| 19.8 | **AOV por cliente / canal / mes** — dropdown filtrable + sparkline trend | 🟡 | Bajo |
| 19.9 | **KPIs por socio** — Diego vs Gustavo: ventas, % por canal, descuentos aplicados | 🟡 | Bajo |
| 19.10 | **Métricas salud del negocio** — gross margin, contribution margin, breakeven units | 🟠 | Medio |
| 19.11 | **Funnel leads → 1ra venta → 2da → VIP** — visual con conversion % entre pasos | 🟡 | Alto |
| 19.12 | **Retention curves** — % que vuelve mes 1, 2, 3 (cohort) | 🟡 | Medio |
| 19.13 | **CAC manual + ratio LTV/CAC** — si Diego ingresa "marketing $X" mensual, sistema calcula | 🟡 | Medio |
| 19.14 | **Reports filtros canal/pago/fecha custom** — refactor de las 11 secciones que usan getMonth() inline | 🟡 | Alto |
| 19.15 | **Alertas push de oportunidad smart** — "Lost Mary stock low + es viernes (día pico) → subir precio 10%" | 🟢 | Alto |

---

## ⚙️ S20 — Operativa diaria pulida

**Objetivo:** menos clicks, menos errores, flujos rápidos para tareas frecuentes.
**KPI que mueve:** tiempo de operación diaria, errores por mala carga.

| # | Mejora | Prio | Esfuerzo |
|---|--------|------|----------|
| 20.1 | **Cierre rápido diario con check inconsistencias** — modal al final del día: "vendiste $50k, caja vio $40k, diferencia $10k" + sugerencias | 🔴 | Medio |
| 20.2 | **Plantillas de venta por cliente recurrente** — al elegir cliente, botón "Repetir última venta" precarga items + canal | 🔴 | Bajo |
| 20.3 | **Validaciones bloqueantes pre-guardado** — precio 0, stock negativo, fecha futura, sale sin items, email/tel inválido | 🔴 | Bajo |
| 20.4 | **Toast undo 5s post-eliminación** — "Producto eliminado · Deshacer". Restaura `isDeleted: false` | 🟠 | Bajo |
| 20.5 | **Banner de sync más visible** — hoy es dot pequeño; usuario en mobile no nota cuando está syncing/offline | 🟠 | Bajo |
| 20.6 | **Bulk edit de productos por marca** — selecciono N productos → "Cambiar priceUSD +10%" en bulk + audit | 🟠 | Medio |
| 20.7 | **Quick actions en FAB expandido** — comprar dolar, transferir entre cuentas frecuentes, reset diario | 🟠 | Medio |
| 20.8 | **Filtros guardados expandidos** — Products, Clients, Purchases (Sales ya tiene) | 🟠 | Bajo |
| 20.9 | **Confirmación visual post-acción** — toast verde "✅ Guardado" en lugar de save silencioso | 🟡 | Bajo |
| 20.10 | **Resumen matutino al abrir** — "Ayer vendiste $X, ganancia $Y, balance $Z, 3 últimas ventas: ..." | 🟡 | Bajo |
| 20.11 | **Indicador cambios sin guardar** — badge naranja en nav item con cambios pendientes | 🟠 | Bajo |
| 20.12 | **Modo "kiosco rápido" para presenciales** — full-screen sin sidebar, teclado numérico para qty | 🟡 | Medio |
| 20.13 | **Autocomplete inteligente en notas** — sugiere texto frecuente | 🟡 | Bajo |
| 20.14 | **Notificación saldo bajo en caja** — alerta si pesosCash + lemonPesos < threshold configurable | 🟠 | Bajo |
| 20.15 | **Gastos recurrentes con scheduler real** — hoy es manual; auto-generar día 1 del mes | 🟡 | Medio |
| 20.16 | **Empty states con CTA** — "Aún no hay X — [crear]" en vez de mensaje seco | 🟡 | Bajo |
| 20.17 | **Spinner "Importando..." en bulk CSV** — hoy CSV grande hace freeze sin feedback | 🟡 | Bajo |
| 20.18 | **Aria labels y Escape para cerrar modales** — accessibility + UX power user | 🟢 | Bajo |

---

## 🔧 S21 — Robustez y confiabilidad

**Objetivo:** que el sistema NO pierda datos, NO se rompa en producción, y permita escalar features sin miedo.
**KPI que mueve:** uptime, integridad de datos, velocidad de iteración.

| # | Mejora | Prio | Esfuerzo |
|---|--------|------|----------|
| 21.1 | **CI/CD con GitHub Actions** — `npm test` + lint en PR, bloquea merge si fallan | 🔴 | Bajo |
| 21.2 | **ESLint + Prettier + pre-commit hook (husky)** — formato y lint automático | 🟠 | Bajo |
| 21.3 | **Tests de componentes mínimos** — 10-15 smoke tests con vitest+RTL para flujos críticos (crear venta, edit producto, restore trash, conciliar caja) | 🔴 | Medio |
| 21.4 | **Schema versioning de localStorage + migration** — `vapestock_filterPresets_v2` con migrations | 🟠 | Bajo |
| 21.5 | **Logging de errores (Sentry)** — captura uncaught + ErrorBoundary con contexto | 🟠 | Medio |
| 21.6 | **Quota localStorage con feedback** — warning si >5MB, bloqueo si >8MB | 🟡 | Bajo |
| 21.7 | **uid() con crypto.randomUUID()** — evita colisiones estadísticas | 🟠 | Bajo |
| 21.8 | **Error boundaries por módulo** — Sales, Dashboard, CashBox aislados (no crash global) | 🟠 | Bajo |
| 21.9 | **Retry automático en network errors** — 3 intentos con backoff exponencial | 🟠 | Medio |
| 21.10 | **Firestore rules estrictas para roles** — Gustavo NO lee partnerWithdrawals ni closures privados | 🟠 | Medio |
| 21.11 | **Audit log con TTL en subcollection** — hoy `slice(0, 2000)` se pierde; subcollection con auto-delete a 6 meses | 🟡 | Medio |
| 21.12 | **PWA manifest mejorado** — maskable_icon, screenshots, banner offline visible | 🟢 | Bajo |
| 21.13 | **Healthcheck del backup** — verificar que corrió ayer; alerta a mail si falló | 🟠 | Bajo |
| 21.14 | **Rate limiting en Firestore rules** — prevenir spam de ediciones | 🟢 | Bajo |
| 21.15 | **Validación integridad de datos** — script semanal: items en sales referencian products existentes | 🟠 | Bajo |
| 21.16 | **Splittear componentes >1500L** — Sales, Withdrawals, Reports, Dashboard en sub-componentes con memo | 🟡 | Alto |
| 21.17 | **Workload Identity para backup** — reemplaza GitHub Secrets por OAuth federation | 🟢 | Medio |

**Nota:** S14.3 (field-level Firestore writes) técnicamente pertenece a esta
sección. Cuando se haga S21, considerar incluirla.

---

## ⚡ S22 — Power user y atajos

**Objetivo:** hacer ergonómico el uso intensivo diario para Diego/Gustavo.
**KPI que mueve:** productividad personal, satisfacción de uso.

| # | Mejora | Prio | Esfuerzo |
|---|--------|------|----------|
| 22.1 | **Cmd+K command palette global** — search + create + navegar (con fuzzy + categorías) | 🟠 | Medio |
| 22.2 | **Atajos de teclado documentados** — Cmd+N nueva venta, Cmd+E gasto, Cmd+W consumo, ? para help | 🟠 | Bajo |
| 22.3 | **Keyboard navigation en modales** — Enter submit, Escape close, Tab orden lógico | 🟠 | Bajo |
| 22.4 | **Bulk actions en Products / Clients / Purchases** — multi-select + acciones masivas | 🟠 | Medio |
| 22.5 | **Pinned favorites** — productos pinned al top de Products list (⭐) | 🟡 | Bajo |
| 22.6 | **Recent actions (últimas 10)** — menu global con quick-repeat | 🟡 | Bajo |
| 22.7 | **Comparativa side-by-side** — 2 productos / 2 clientes / 2 meses lado a lado | 🟡 | Medio |
| 22.8 | **Quick switcher (Cmd+J)** — 15 últimos items abiertos | 🟡 | Medio |
| 22.9 | **Export selectivo con multi-select** — selecciono N items → CSV solo de esos | 🟡 | Bajo |
| 22.10 | **Snippet expansion en notas** — "inv" → "Investigar..." personalizable | 🟡 | Medio |
| 22.11 | **Search dentro de modales** — Cmd+F inline en modales con muchas opciones | 🟢 | Bajo |
| 22.12 | **Drag & drop para reorden** — Withdrawals: arrastrar a otro mes/socio | 🟢 | Alto |
| 22.13 | **Multi-tab en lista** — abrir 3 productos en tabs paralelos | 🟢 | Alto |
| 22.14 | **Macros de acciones repetidas** — grabar y reproducir secuencias frecuentes | 🟢 | Alto |

---

# 🎯 Top 10 Quick Wins (alto impacto / bajo esfuerzo)

Si querés arrancar por lo que más mueve la aguja con menos esfuerzo:

| # | Mejora | Sección | Por qué |
|---|--------|---------|---------|
| 1 | **14.1** Validación crypto sin amountUSDT | Bugs | ✅ HECHO en S14 |
| 2 | **14.6** Mermas: separar común vs personal | Contable | ✅ HECHO en S14 |
| 3 | **14.9** Tax tracking monotributo | Contable | ✅ HECHO en S14 |
| 4 | **15.2** ABC analysis Pareto | Producto | Le dice exactamente qué pedir más en próxima compra |
| 5 | **15.4** Top slow movers | Producto | Identifica candidatos a promo/liquidación |
| 6 | **17.1** Casi-VIP detector | Cliente | Convertir clientes a tier mayor con 1 empuje |
| 7 | **17.2** Churn risk score | Cliente | Saca foto del que está por irse, antes que pase |
| 8 | **18.3** Templates por evento | Marketing | Lista de mensajes pre-armados, listo para WA |
| 9 | **20.2** Plantilla "repetir última venta" | Operativa | Ahorra 10 min por venta recurrente |
| 10 | **19.1** Dashboard modo socio 1-página | Métricas | Resumen instantáneo al abrir la app |

---

# 🗓️ Roadmap recomendado de sprints

### **Sprint A — S15 Inteligencia de Producto (~3-5 días)**
- 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7
- Resultado: velocity dashboard, ABC, slow movers, sugerencia qty Paraguay, márgenes visibles.

### **Sprint B — S17 + S18 (Cliente + Marketing Hub) (~5 días)**
- 17.1, 17.2, 17.3, 18.1, 18.2, 18.3, 18.4, 18.5, 17.4, 20.2
- Resultado: lista del día con segmentos, templates con merge tags, casi-VIP/churn risk visible, plantilla repetir venta.

### **Sprint C — S16 Promos y pricing (~5 días)**
- 16.1, 16.2, 16.3, 16.4, 16.7, 16.8, 16.9, 16.10
- Resultado: cupones formales, pricing por canal, descuentos automáticos por volumen + tier, clearance por expiry, combos.

### **Sprint D — S19 + S20 (Métricas + Operativa) (~5 días)**
- 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 20.1, 20.3, 20.4, 20.5, 20.7, 20.11
- Resultado: dashboard socio, P&L por canal, anomaly detection, cierre rápido diario, validaciones bloqueantes, undo, banner sync.

### **Sprint E — S21 + S22 (Robustez + Power) (~5 días)**
- 21.1, 21.2, 21.3, 21.4, 21.5, 21.7, 21.8, 21.10, 22.1, 22.2, 22.3, 22.4
- Resultado: CI/CD + linter + tests, error boundaries, Firestore rules estrictas, Cmd+K, atajos de teclado, bulk actions expandidas.

---

# 📌 Bugs nuevos detectados durante la auditoría 360°

Estado al cierre de S14:

| # | Bug | Severidad | Status |
|---|-----|-----------|--------|
| B1 | crypto_buy/sell sin amountUSDT corrompe balance | 🔴 | ✅ Resuelto en 14.1 |
| B2 | Race en concurrent writes Diego/Gustavo | 🔴 | ✅ Detección informativa en 14.2. Solución completa en S14.3 (diferida) |
| B3 | exchangeRate locked en edit no visible en UI | 🟠 | ✅ Resuelto en S14 bloque 5 |
| B4 | consumoPersonal silent return 0 si person inválida | 🟠 | ✅ Resuelto en 14.15 |
| B5 | clientCredit puede corromperse en edit | 🟠 | ✅ Verificado: lógica actual correcta |
| B6 | localStorage quota fail silencioso | 🟠 | ✅ Resuelto en S14 bloque 2 |
| B7 | Sync timeout sin notificación clara | 🟡 | Pendiente (S20.5) |
| B8 | Doble contabilización vueltos frágil | 🟠 | ✅ Protegido por test (75/75) |
| B9 | Tax/IVA no trackeado en Expenses | 🟠 | ✅ Resuelto en 14.9 |
| B10 | Garantía sin failedProductId rechazada de más | 🟡 | ✅ Verificado: comportamiento correcto |

---

# 📚 Referencias

- **Plan original (chat)**: armado el 2026-04-29 con 4 agentes paralelos
- **Journal de S14**: `docs/SESSION_2026-04-29_S14.md`
- **Tests**: `src/calcs.test.js` (96 tests al cierre de S14)
- **Cálculos centralizados**: `src/calcs.js` (función `calcMonthSummary`)
- **CLAUDE.md raíz**: contiene resumen de estado del proyecto

**Última actualización:** 2026-04-29 (post S14)
