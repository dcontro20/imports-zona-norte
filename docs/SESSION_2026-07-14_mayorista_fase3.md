# Sesión 2026-07-14 — Pivote mayorista: FASE 3 (Logística — Rutas de reparto)

Branch: `claude/mayorista`. Continúa `docs/PLAN_MAYORISTA.md`. Fase 3 completa,
nivel BÁSICO como se acordó: agrupar pedidos por zona, orden manual de paradas,
hoja de ruta imprimible, y el stub de optimización documentado sin implementar.

## Fase 3 — qué se hizo (4 bloques)

| Bloque | Cambio | Archivos |
|---|---|---|
| 3.1 | `routes.js` (puro, 12 tests con 3.3): `pendingWholesaleOrders` (pedidos mayoristas sin ruta, no entregados/cobrados), `groupOrdersByZone`, `buildRouteStops`, `resolveStop`, `routeTotals`, `moveStop` (orden manual re-indexado), `optimizeStops` (STUB documentado) | `src/routes.js` (+test) |
| 3.2 | `Routes.jsx`: crear ruta (fecha + nombre) eligiendo pedidos pendientes agrupados por zona; detalle con paradas ordenables a mano (↑/↓), KPIs (paradas/unidades/a cobrar) | `src/components/Routes.jsx`, `App.jsx` |
| 3.3 | `lib/routeSheet.js`: hoja de ruta en texto (paradas ordenadas, dirección, items, total a cobrar por parada + total de ruta) → botón "📋 Copiar hoja" | `src/lib/routeSheet.js` |
| 3.4 | Fulfillment: ruta planificada → en_curso → cerrada; por parada entregado / no_estaba / reprogramar + "💵 cobrado". Sincroniza `sale.fulfillmentStatus` (armado → en_ruta → entregado → cobrado) y `sale.routeId` | dentro de `Routes.jsx` |

## Decisiones de implementación (el porqué)

- **Nivel básico, a propósito:** `optimizeStops` es un **stub documentado** que
  devuelve las paradas sin cambios. Con pocos kioscos el orden manual (↑/↓) alcanza;
  el algoritmo real (nearest-neighbor sobre lat/lng, o API de rutas) va cuando haya
  volumen. Los campos (`estimatedKm`, `lat/lng`) ya existen para el futuro.
- **La ruta mueve el `fulfillmentStatus` del pedido:** al agregar a ruta → `armado`;
  al iniciar la ruta (en_curso) → `en_ruta`; al marcar la parada entregada → `entregado`;
  "cobrado" → `cobrado`. Así el estado del pedido refleja la logística real.
- **"Cobrado" es sólo un flag de estado en Fase 3** (no crea movimiento de caja).
  La cobranza contra-entrega con caja/crédito es Fase 4.
- **Borrar una ruta libera los pedidos:** vuelven a `pendiente` sin `routeId` (salvo
  los ya entregados/cobrados), para poder re-armar.
- **Hoja de ruta = texto copiable** (WhatsApp/imprimir desde el navegador), coherente
  con el patrón de mensajes del sistema. Anda en mobile.
- **UI 100% tokens `T` + componentes UI.jsx.** Mobile-first. Sin componentes nuevos.

## Estado

- **912 tests verdes** (900 + 12 de routes.js/routeSheet.js). Build OK. Cero regresiones.
- Pantallas nuevas en modo Mayorista: **Rutas** (5 en total con Kioscos, Pedido
  mayorista, Pipeline, Prospección).

## Siguiente: FASE 4 — Cuenta corriente B2B (completa, apagada por default)

`creditAccount.js` (saldo/límite/mora/pagos parciales) + toggle `creditEnabled` en
ficha de mayorista + pedido respeta el modo (contra entrega vs fiado) + vista de
cuentas corrientes + `wholesaleMessage.js` (cobranza). Todo con default OFF.
