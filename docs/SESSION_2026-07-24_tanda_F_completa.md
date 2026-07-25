# SESSION 2026-07-24 — Tanda F completa (7 mejoras de producto)

## TL;DR

Las 7 mejoras de la Tanda F aprobadas por Diego, implementadas y deployadas
(`2e4ac01`): productos por zona en Prospección, próximas recompras en
Kioscos, nota por pedido (viaja a la hoja de ruta), duplicar pedido
histórico, badge 🆕/🔁, cobro esperado por método en rutas, ruta a CSV.
**1030 tests (+6).** Resumen: `docs/IZN_Tanda_F_Completa_Resumen.md`.
Con esto el plan de mejoras (tandas A–F) queda COMPLETO.

## Decisiones clave (para Claudes futuros)

- **Ubicaciones delegadas y su porqué**: productsByZone fue a Prospección
  (pantalla zona-céntrica, el Panel ya está denso); próximas recompras fue
  a Kioscos como bloque (la acción vive en esa lista; pantalla propia sería
  un desierto con pocos kioscos). Si el volumen crece y el bloque molesta,
  ahí sí evaluar pantalla propia.
- **`sale.orderNote`** es el campo de la nota del pedido (opcional, solo se
  setea si hay texto). La hoja de ruta imprime AMBAS notas si existen:
  `sale.orderNote` (del pedido) y `stop.notes` (de la parada — campo del
  modelo que aún no tiene UI de edición).
- **Método de cobro esperado se DERIVA, no se carga**: expectedPayMethod =
  método más frecuente en los pagos mayoristas históricos del cliente. Se
  descartó agregar un campo "método habitual" a la ficha (dato que alguien
  tiene que mantener); la derivación mejora sola con el uso. Con 0 historial
  todo cae en "Sin historial" — es esperable al principio.
- **`routeTotalsByExpectedMethod` suma lo PENDIENTE** (total − pagos), no el
  total del pedido — "cuánto vas a cobrar en la calle", no "cuánto vale la
  ruta". Acepta `saleOutstandingFn` inyectable para no acoplar routes.js a
  creditAccount.js (los tests le pasan el default).
- **`loadFromSale(sale, label)`** es la única lógica de clonado de pedidos
  (repetir último y duplicar histórico la comparten). Siempre re-precia al
  tier ACTUAL — nunca copiar precios viejos.
- **`downloadCSV` vive en UI.jsx** (tercer uso lo unificó; estaba duplicado
  en Kioscos y Pipeline). Es DOM-dependiente — NO va en las libs puras.
- Todo con primitivos (Btn/Modal/Input/Card/StatCard); cero botones custom
  nuevos (regla post-mobile-hardening respetada).

## Estado final

- `main` = `2e4ac01` (rebasado sobre los snapshots nocturnos del bot).
- 1030 tests verdes (+4 routes, +2 wholesaleExport) · build OK.
- Plan `PLAN_MEJORAS_MAYORISTA.md`: tandas A–F ✅ COMPLETAS.
- Siguiente: Bloque 2 (front de ventas B2B: mensaje de presentación + lista
  de precios compartible) — la lista de precios requiere proponerle formato
  a Diego ANTES de construir. Esperando su OK para arrancar.

---

*Escrito 2026-07-24 al cerrar la Tanda F.*
