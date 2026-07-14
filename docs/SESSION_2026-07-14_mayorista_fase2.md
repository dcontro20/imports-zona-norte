# Sesión 2026-07-14 — Pivote mayorista: FASE 2 (Captación)

Branch: `claude/mayorista`. Continúa `docs/PLAN_MAYORISTA.md`. Fase 2 completa:
herramientas para salir a buscar y trackear clientes mayoristas. Alta MANUAL de
prospectos (Google Places diferido, decisión de Diego).

## Contexto de la sesión

- Se descartó armar un entorno de prueba con Firebase de test (mucha vuelta para
  esta etapa). Quedó preparado sin usar: `firebaseConfig` por env vars
  (`VITE_FIREBASE_*` con fallback a prod, commit `07de7dc`) + `docs/TEST_ENV_SETUP.md`.
  **Producción y `main` intactos** (verificado: ningún commit del pivote es ancestro
  de `origin/main`; main sigue en `3f1c4a9`). Todo el trabajo vive en `claude/mayorista`
  (PR #2 draft, sin mergear).

## Fase 2 — qué se hizo (4 bloques; 2.5 Places diferido)

| Bloque | Cambio | Archivos |
|---|---|---|
| 2.1 | `prospecting.js` (puro, 13 tests): `pipelineCounts` (embudo prospectos + mayoristas), `prioritizeProspects` (más avanzados y más fríos primero), `zonesCoverage` + `zonesWithoutCoverage`, `lastVisitFor`, `funnelSummary` | `src/prospecting.js` (+test) |
| 2.2 | `Pipeline.jsx`: kanban SIN drag (botones de avance, anda en mobile). Prospectos en prospecto/contactado/visitado; mayoristas en primera_compra/activo/en_pausa. Alta/edición de prospecto, avanzar etapa, convertir a mayorista al llegar a "visitado" | `src/components/Pipeline.jsx`, `App.jsx` |
| 2.3 | `ProspectMap.jsx`: vista de cobertura por zona (mayoristas vs prospectos por zona) + "zonas a cerrar" (prospectos sin mayorista). Mapa geográfico con pins diferido con Places | `src/components/ProspectMap.jsx`, `App.jsx` |
| 2.4 | Visitas (CRM): modal registrar visita (outcome + notas) desde prospecto o cliente en el kanban → colección `visits` + actualiza `lastContactAt`/`lastVisitAt` | dentro de `Pipeline.jsx` |
| 2.5 | Google Places → **DIFERIDO** (decisión de Diego). Alta 100% manual por ahora | — |

## Decisiones de implementación (el porqué)

- **Kanban sin drag-and-drop:** botones "→ Avanzar" / "✓ Convertir" en cada card.
  Más robusto en mobile (iPad/celu) que arrastrar, y sin sumar una lib de DnD.
- **Convertir prospecto → mayorista:** crea `client` type="mayorista" con
  `pipelineStage="primera_compra"` y `wholesaleTier=null` (Diego asigna el tier
  después en Kioscos). El prospecto queda con `convertedClientId` + soft-delete
  (sale del board activo, recuperable en Papelera).
- **Mapa = vista por zona, no geográfico:** sin Places no hay búsqueda ni basemap;
  lo accionable para prospección manual es **dónde hay cobertura y dónde falta**
  (zonas con prospectos y 0 mayoristas = "a cerrar"). El mapa con pins llega con Places.
- **Visitas integradas en el kanban** (no pantalla aparte): se registran desde la
  card del prospecto/cliente, que es donde estás trabajando el embudo.
- **UI 100% tokens `T` + componentes UI.jsx** (Card, Btn, Modal, Input, Select,
  StatCard). Mobile-first. Sin componentes UI nuevos.

## Estado

- **900 tests verdes** (887 + 13 de prospecting.js). Build OK. Cero regresiones.
- Pantallas nuevas en modo Mayorista: **Pipeline** + **Prospección** (además de
  Kioscos + Pedido mayorista de Fase 1).

## Siguiente: FASE 3 — Logística (Rutas de reparto)

`routes.js` (agrupar pedidos pendientes por zona, orden manual de paradas, stub
`optimizeStops`) + `Routes.jsx` + `routeSheet.js` (hoja de ruta imprimible) +
estados de fulfillment (armado → en_ruta → entregado → cobrado).
