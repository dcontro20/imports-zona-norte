# Sesión 2026-07-14 — Pivote mayorista: FASE 5 (Inteligencia B2B + Dashboard mayorista)

Branch: `claude/mayorista`. Continúa `docs/PLAN_MAYORISTA.md`. Fase 5 completa: la
capa que convierte el sistema en un ERP de distribución — decisiones data-driven.

## Fase 5 — qué se hizo

| Bloque | Cambio | Archivos |
|---|---|---|
| 5.1 | `wholesaleIntelligence.js` (11 tests): `expectedRepurchase` (recompra esperada por cadencia de pedidos mayoristas), `clientsAtRisk` (churn B2B), `rankByProfitability` (revenue−cogs por kiosco), `productsByZone`, `wholesaleKpis`, `committedUnits`, `plByChannel` | `src/wholesaleIntelligence.js` (+test) |
| 5.2 | `DashboardMayorista.jsx`: KPIs B2B (activos, pipeline, recompra, ticket B2B), facturación mayorista vs minorista (barra + %), alertas accionables, ranking por ganancia. Selector de período 30/90d | `src/components/DashboardMayorista.jsx`, `App.jsx` |
| 5.3 | Reserva de stock: **inherente** — el pedido descuenta stock al cargarse (Fase 1), así que lo comprometido ya está fuera del disponible. `committedUnits` da visibilidad de lo no entregado. Reposición por volumen se apoya en `purchaseRecommendations` (S15) | `wholesaleIntelligence.js` (committedUnits) |
| 5.4 | P&L mayorista vs minorista lado a lado (revenue/cogs/margen/margen%) | dentro de `DashboardMayorista.jsx` |

## Decisiones de implementación (el porqué)

- **Dashboard mayorista como pantalla dedicada** (no reescribir el Dashboard retail):
  un cockpit B2B enfocado, arriba del grupo mayorista. Menos riesgo, más claro.
- **COGS con costo snapshot:** `plByChannel`/`rankByProfitability` usan
  `item.costUSDTAtSale` (snapshot al vender) y caen al costo actual del producto si
  falta; convierten con el `exchangeRate` histórico de cada venta. Margen real.
- **Churn B2B reusa el patrón de cadencia** de clientIntelligence pero filtrado a
  ventas mayoristas — un kiosco recompra con patrón regular, así que "atrasado" =
  pasó su cadencia esperada.
- **Alertas accionables** combinan 3 fuentes ya puras: kioscos en riesgo
  (wholesaleIntelligence), zonas sin cerrar (prospecting.zonesWithoutCoverage) y
  prospectos estancados (prospecting.prioritizeProspects ≥14d sin contacto).
- **Reserva de stock (5.3):** no se agregó un mecanismo nuevo — el descuento al
  cargar el pedido ya evita vender lo prometido. `committedUnits` sólo lo hace
  visible. La reposición por volumen ya la cubre `purchaseRecommendations`.
- **UI 100% tokens `T` + componentes UI.jsx.** Mobile-first. Sin componentes nuevos.

## Estado

- **939 tests verdes** (928 + 11 de wholesaleIntelligence). Build OK. Cero regresiones.
- Pantalla nueva: **Panel mayorista** (7 pantallas mayoristas en total).

## Siguiente: FASE 6 — Pulido, mobile y power-user B2B

Variantes mobile finas de las pantallas nuevas, bulk actions en Kioscos, empty states
con CTA, export CSV de kioscos/prospectos, comando ⌘K con acciones mayoristas. Es la
última fase del pivote.
