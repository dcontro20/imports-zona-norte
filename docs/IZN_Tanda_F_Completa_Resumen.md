# IZN — Tanda F completa: 7 mejoras de producto · 2026-07-24

> Resumen autocontenido (regla permanente). Cierra la Tanda F de
> `docs/PLAN_MEJORAS_MAYORISTA.md` (todas aprobadas por Diego de una).
> Journal: `docs/SESSION_2026-07-24_tanda_F_completa.md`.

---

## TL;DR

Las 7 mejoras implementadas y deployadas en un solo commit (`2e4ac01`).
Las dos primeras eran lógica ya testeada sin pantalla — puro cablear.
**1030 tests verdes (+6)**, build OK, primitivos de UI.jsx en todo,
mobile-first, cero botones custom nuevos.

## Qué entró y dónde (con el porqué de las decisiones delegadas)

**F.1 — Productos por zona → en 🗺️ Prospección** (decisión delegada).
`productsByZone` (finding A.3, testeado y huérfano) ahora renderiza la card
"🏆 Qué se vende por zona" (top 3 por unidades). Fue a Prospección y no al
Panel porque esa es la pantalla zona-céntrica: al decidir qué zona atacar,
ver qué pega en las vecinas te arma la oferta de entrada. El Panel ya está
denso de KPIs y no es donde planificás la calle.

**F.2 — Próximas recompras → bloque en 🏪 Kioscos** (decisión delegada).
Card "🔔 Próximas recompras" con `expectedRepurchase`: kiosco, cadencia
("compra cada ~Nd"), fecha esperada y chip de estado (🔴 Atrasado primero,
🟡 Por comprar, 🟢 Al día). En Kioscos y no pantalla propia: la acción
("llamalo") vive en esa lista, y con pocos kioscos una pantalla aparte
sería un desierto.

**F.3 — Nota por pedido.** Campo "Nota para la entrega (opcional)" en el
Pedido mayorista → `sale.orderNote` → aparece 📝 en la parada de Rutas y en
la **hoja de ruta copiable** (donde de verdad sirve) y en el CSV de ruta.

**F.4 — Duplicar pedido histórico.** Botón "🗂 Duplicar un pedido…" (aparece
con 2+ pedidos) abre un modal con el historial del cliente (fecha, unidades,
total, primeros ítems) → "Usar" clona cantidades con los **precios de tier
de HOY**. Mismo `loadFromSale` que "repetir último" (refactor, no duplicado).

**F.5 — Badge nuevo vs recurrente.** En las cards de Kioscos: 🆕 "1er pedido"
(azul) para el primer pedido, 🔁 "N pedidos" para recurrentes.

**F.6 — Cobro esperado por método en la ruta.** Card "💰 Cobro esperado por
método" en el detalle: cuánto efectivo/MP/etc. se espera traer. El método por
kiosco se **deriva de su historial de pagos** (el más frecuente) — sin campo
nuevo que cargar; mejora sola con el uso. Suma lo PENDIENTE (no el total del
pedido) y agrupa lo desconocido en "❔ Sin historial". Funciones puras
`expectedPayMethod` + `routeTotalsByExpectedMethod` en `routes.js` (+4 tests).

**F.7 — Ruta a CSV.** `routeToCSV` en `wholesaleExport.js` (+2 tests): una
fila por parada en orden de reparto (cliente, dirección, zona, unidades,
total, pendiente, estado, nota). Botón "📥 CSV" junto a "📋 Copiar hoja".

## Higiene que salió al paso

`downloadCSV` estaba **duplicado** en Kioscos y Pipeline; el tercer uso
(Rutas) lo unificó como helper compartido en `UI.jsx` (DOM-dependiente, por
eso no va en las libs puras).

## Estado

| | |
|---|---|
| Commit | `2e4ac01` en `main` — deploy automático Vercel |
| Tests | **1030 verdes** (+6) · build OK |
| Plan de mejoras | Tandas A–F ✅ COMPLETAS |
| Afuera (por decisión) | Places (API key tuya), optimización de rutas (stub), S17–S22 (dormido), S14.3 (sprint dedicado) |
| Siguiente | Bloque 2 — front de ventas (mensaje de presentación B2B + lista de precios compartible), esperando tu OK |
