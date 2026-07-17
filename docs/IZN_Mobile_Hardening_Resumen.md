# IZN — Mobile hardening completo + default minorista · 2026-07-17

> Resumen autocontenido (regla permanente). Respuesta a los screenshots de
> Diego desde el iPhone: topbar roto, barra fantasma, FAB tapando montos.
> Journal: `docs/SESSION_2026-07-17_mobile_hardening.md`.

---

## TL;DR

Auditoría mobile completa (topbar + 8 pantallas mayoristas + primitivos) y
fix en 3 bloques, todo deployado: **topbar rediseñado con presupuesto de
ancho** (el bug de encimado), scrollbar fantasma de iOS eliminado, FAB
achicado, tap targets a 44px en todas las pantallas B2B, cards mobile en el
Pedido, kanban compacto — y **el default de la app pasó a MINORISTA**.
**1024 tests verdes (+1: smoke del topbar mobile en 375px).**

## Punto por punto de lo reportado

| Síntoma | Causa raíz | Fix |
|---|---|---|
| Toggle encimado al logo, chips afuera, ☰ perdido | El cluster derecho del topbar exigía ~405px (todo `flexShrink:0`) contra 347px útiles; el texto del logo (nowrap) desbordaba su caja aplastada. El chip "💙 Gustavo" solo aparece con Gustavo online — por eso antes no se veía. | Topbar mobile con presupuesto (~220px): ☰ 44px + isotipo + toggle + dot de sync. Presencia, usuario, ⚙️ y cerrar sesión viven en el menú ☰ (presencia con MÁS info: pantalla + hace cuánto). Desktop intacto. |
| Barra vertical beige + contenido corrido | `::-webkit-scrollbar` estilizado (10px, thumb beige) — iOS/PWA lo renderiza PERSISTENTE y roba ancho. | Scopeado a `@media (pointer: fine)` (solo mouse). |
| FAB tapa los montos del P&L | FAB 60px fijo abajo-derecha sobre montos alineados a la derecha. | 52px en mobile + `paddingBottom` del contenido 90→120px. |
| "Dashboard mayorista" vs "Panel mayorista" | Título viejo en el h2. | Renombrado a "📊 Panel mayorista". |

**Nota honesta**: el Bloque 1 del plan no estaba deployado cuando mandaste
los screenshots — la sesión anterior cerró en el diagnóstico, esperando OK.
El scrollbar que "desapareció" era iOS ocultándolo sin scroll. Ahora sí está
TODO commiteado, pusheado y verificado en producción (ver abajo).

## Cambio de default: la app abre en MINORISTA

`businessMode` default pasó de "mayorista" a **"minorista"** (los fallbacks
de `navItemsForMode`/`pageAfterModeSwitch`/página inicial acompañan). La app
abre en el Dashboard minorista; el toggle y el filtro de nav siguen igual.

**⚠️ Qué tenés que hacer vos**: nada de resetear. Tu dispositivo tiene
guardado "mayorista" en settings (localStorage) y el valor guardado le gana
al default — **tocá 🛒 Minorista una vez en el toggle** y queda guardado
minorista. El default nuevo aplica solo a dispositivos sin preferencia
guardada (o después de cerrar sesión, que limpia el cache del dispositivo).

## Los 3 bloques (commits)

- **`ead72dc` Bloque 1 (P0)**: topbar + scrollbar + FAB + rename + default
  minorista + smoke test del topbar mobile (375px real: `window.innerWidth`).
- **`5c24a84` Bloque 2 (P1)**: `MiniBtn` compartido en UI.jsx (44px mobile,
  compacto desktop) que reemplaza los duplicados de 28/30px de Pipeline y
  Rutas; flechas ↑/↓ 44×44 con gap 10; líneas del Pedido mayorista como
  cards de 2 filas (el ✕ pasó de ~16px a 44); kanban con etapas vacías
  colapsadas en mobile.
- **`fc117a5` Bloque 3 (P2)**: barrido — fuera los `minHeight:38/40` que
  pisaban el 44 del Btn (Kioscos, Cuentas corrientes), toggle 30d/90d a 44,
  ✕ del Modal 36→44, inputs de precios por tier/canal 40→44, toasts con
  maxWidth. (Además `Products.jsx` quedó normalizado de CRLF a LF — era el
  único archivo del repo en formato Windows; diff real: 2 líneas.)

## Hallazgos de la auditoría que NO había en los screenshots

- **Cero overflow horizontal** en las 8 pantallas: el patrón
  `isMobile ? "1fr" : minmax(...)` está aplicado de verdad en toda la
  macro-estructura (el "mobile-first declarado" era real, salvo tap targets).
- La única pantalla con layout estructural no adaptado era el **Pedido
  mayorista** (fila-tabla de 5 elementos) — rediseñada.
- Los primitivos de UI.jsx estaban impecables (Modal bottom-sheet 92dvh,
  Table con variante cards, StatCard robusto) — el problema era no usarlos.

## Verificación en producción

Deploy de `fc117a5` verificado READY en Vercel y bundle por hash idéntico al
build local. Chequeá en tu iPhone: topbar limpio (☰ + escudo + toggle + dot),
usuario y Ajustes dentro del ☰, sin barra beige, FAB más chico.

| | |
|---|---|
| Tests | **1024 verdes** (+1) · build OK |
| Commits | `ead72dc` + `5c24a84` + `fc117a5` en `main` |
| Docs | GUIA + CHECKLIST actualizadas (default minorista, topbar mobile) |
| Pendiente tuyo | Tocar 🛒 una vez en tu iPhone (tu setting guardado le gana al default) |
