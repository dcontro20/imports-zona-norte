# Sesión 2026-07-14 — Pivote mayorista: FASE 6 (Pulido + power-user B2B) — CIERRE

Branch: `claude/mayorista`. Última fase del `docs/PLAN_MAYORISTA.md`. Con esto el
pivote a venta mayorista queda **completo (fases 0–6)**. **NO se mergea a main** —
Diego hace revisión final + prueba antes de mergear.

## Fase 6 — qué se hizo

| Bloque | Cambio | Archivos |
|---|---|---|
| 6.5 | ⌘K: grupo "Mayorista" en la command palette existente (7 accesos + "nuevo pedido mayorista"). No se creó palette nueva — se extendió la de S22 | `src/components/CommandPalette.jsx` |
| 6.4 | Export CSV: `lib/wholesaleExport.js` (puro, 5 tests: toCSV, kioscosToCSV, prospectsToCSV) + botón "📥 CSV" en Kioscos y Pipeline | `src/lib/wholesaleExport.js` (+test), `Kioscos.jsx`, `Pipeline.jsx` |
| 6.2 | Bulk actions en Kioscos: modo selección (checkboxes) + aplicar **tier** o **zona** en lote a varios | `src/components/Kioscos.jsx` |
| 6.1 / 6.3 | Mobile-first y empty states: las 8 pantallas nuevas ya se construyeron mobile-first (isMobile, tap 44px, inputs 16px) y con empty states guía. Se verificaron; sin cambios extra | — |

## Decisiones de implementación (el porqué)

- **Reusar la command palette existente** (había ⌘K de S22) en vez de crear una —
  se agregó sólo el grupo "Mayorista". Menos código, misma UX.
- **Export CSV con lógica pura + download en el componente** — mismo escaping que
  Export.jsx; el string CSV es testeable, el Blob/download vive en el componente.
- **Bulk actions acotadas a tier y zona** (lo que pide el plan) — cambios masivos
  típicos al organizar la cartera. Modo selección con checkboxes, no destructivo.
- **6.1/6.3 sin código redundante:** todo lo nuevo ya era mobile-first y con empty
  states desde su fase; agregar "otra vez" no aportaba. Se transparenta la decisión.

## Estado

- **944 tests verdes** (939 + 5 de wholesaleExport). Build OK. Cero regresiones.
- **Pivote completo:** 8 pantallas mayoristas (Panel, Kioscos, Pedido, Pipeline,
  Prospección, Rutas, Cuentas corrientes + el toggle de modo).

## 🏁 Pivote mayorista COMPLETO (fases 0–6)

Resumen de todo el pivote:
- **F0** cimientos (schema/migración/sync/nav) · **F1** Kioscos + pricing por tier ·
  **F2** captación (Pipeline/Prospección/visitas) · **F3** rutas de reparto ·
  **F4** cuenta corriente B2B + puente con la caja · **F5** inteligencia B2B +
  dashboard · **F6** pulido + power-user.
- Baseline: **867 → 944 tests** (+77 en el pivote, todos verdes).
- Módulos puros nuevos: `wholesale`, `wholesaleMigration`, `prospecting`, `routes`,
  `creditAccount`, `wholesaleMessage`, `wholesaleIntelligence`, `wholesaleExport`,
  `routeSheet`.
- Todo en `claude/mayorista`. **NO mergeado a main.** PR #2 draft.

## Siguiente

Revisión final + prueba de Diego. Recién después: mergear `claude/mayorista` a `main`
(y decidir qué hacer con el Agente Redactor de `claude/claude-md-docs-oNlms`).
