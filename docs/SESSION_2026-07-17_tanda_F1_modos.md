# SESSION 2026-07-17 — Tanda F.1: modos mayorista/minorista como mundos separados

## TL;DR

El toggle 🏪/🛒 pasó de reordenar el menú a **filtrarlo**: cada modo ve solo
sus pantallas + las compartidas (grupo bajo divisor), arranca en su propio
panel y redirige al cambiar de modo si hacía falta. Datos 100% conectados
(solo navegación). `1967729` deployado. **1023 tests (+1).**
Resumen: `docs/IZN_Tanda_F1_Modos_Resumen.md`.

## Cómo llegamos acá

Diego usó el sistema en producción y encontró el problema de UX: con el
reorder de Fase 0.6 "se ven todas las pantallas mezcladas todo el tiempo y
no se entiende en qué mundo estás — reordenar no es separar". Pidió el
rediseño con validación previa de la clasificación de pantallas. Se le
presentó la clasificación con porqués; aprobó todo tal cual (y corrigió su
propia lista: Compras es compartida, no minorista).

## Decisiones clave (para Claudes futuros)

- **La clasificación vive en `NAV_ITEMS[].group`** (mayorista/minorista/
  shared). Cambiar una pantalla de mundo = cambiar una palabra ahí. El único
  cambio de grupo de esta tanda: `dashboard` shared → minorista.
- **`navItemsForMode` filtra Y agrupa** (modo arriba, shared abajo): en
  `NAV_ITEMS` las compartidas están intercaladas con las minoristas, así que
  solo filtrar rompía el divisor. No reordenar `NAV_ITEMS` a mano: el orden
  relativo dentro de cada grupo se respeta.
- **Sin lockout, a propósito** (aprobado por Diego): `renderPage` renderiza
  cualquier pantalla aunque no esté en el nav del modo — ⌘K, alertas y
  deep-links del otro mundo abren igual. NO agregar guards de "pantalla no
  permitida en este modo": la separación es visual, los datos son uno.
- **Redirect con `setPage(prev => pageAfterModeSwitch(prev, mode))`** en un
  effect con dep `[settings.businessMode]` — funcional para no depender de
  `page` (evita re-runs y loops). Corre en mount y es no-op (el estado
  inicial ya es el home del modo).
- **Regla post-`4c02968` verificada explícitamente**: hooks nuevos (useMemo
  del nav + effect de redirect) antes de los early returns de loading/login.
- **Gotcha de test descubierto**: con `globals: false` en vitest,
  testing-library NO auto-registra su cleanup → los renders se acumulan
  entre tests del mismo archivo y las queries devuelven duplicados. Todo
  archivo de test de componentes con 2+ renders necesita
  `afterEach(cleanup)` explícito (App.test.jsx ya lo tiene).
- **La aserción inversa es el guard del filtro**: `within(nav)` +
  `queryByText("Ventas")).toBeNull()` en modo mayorista. Si alguien vuelve
  el filtro a reorder, el smoke lo caza.

## Estado final

- `1967729` en main (rebasado sobre el snapshot nocturno del bot), deploy
  Vercel automático.
- 1023 tests verdes · build OK · smoke 3× estable.
- Docs de usuario actualizadas en el mismo commit (guía sección toggle +
  checklist paso 1).
- Tanda F: F.1 ✅ (era el ítem prioritario surgido del uso real). F.2–F.6
  siguen esperando OK de Diego ítem por ítem.

---

*Escrito 2026-07-17 al cerrar la Tanda F.1.*
