# SESSION 2026-07-24 (2) — borrar mayoristas, textos mobile y front de ventas B2B

## TL;DR

Tres partes pedidas por Diego en orden: (1) bug de Kioscos sin borrar →
soft-delete estándar + affordance de edición + editar ruta (`f0e2039`);
(2) auditoría y fix de textos cortados en 375px — los cortes reales eran 3
líneas en primitivos compartidos (`67f69c3`); (3) front de ventas B2B:
mensaje de presentación cableado en Pipeline y Kioscos (`9d8e9c0` +
`67f69c3`); la lista de precios compartible quedó en PROPUESTA DE FORMATO
esperando la elección de Diego. **1033 tests (+3).**
Resúmenes: `IZN_Fix_Borrar_Mayorista_Resumen.md` + `IZN_Textos_Mobile_Resumen.md`.

## Decisiones clave (para Claudes futuros)

- **Kioscos nunca tuvo delete** (gap de Fase 1, no regresión). El soft-delete
  usa el shape estándar y la Papelera lo cubre sin cambios (mayoristas son
  clients). El borrar vive DENTRO del modal de edición (no en la card) con
  confirm() — mismo criterio que los guards S14.5.
- **REGLA DE TEXTOS MOBILE** (de la auditoría, criterio de Diego): en filas
  `[texto variable | dato fijo]` → texto `flex:1+minWidth:0` y envuelve;
  dato `flexShrink:0`. PROHIBIDO `nowrap` en datos de negocio (nombres,
  montos, direcciones). `space-between` siempre con gap ≥8. Máx 2 datos
  concatenados con "·" por línea. El ellipsis solo para previews
  deliberados (ej: items del pedido en el modal de duplicar).
- **StatCard y Modal eran la raíz del 80% del daño** — al tocar primitivos
  de UI.jsx se arreglan las 7 pantallas de una. Buscar SIEMPRE la raíz en
  UI.jsx antes de parchear pantallas.
- **Mensaje de presentación**: `presentationMessage` vive en
  `wholesaleMessage.js` (reusa la infra — NO se creó una nueva). Los
  precios de gancho salen del tier elegido, SOLO productos con lista de
  tier Y stock; sin eso el mensaje sale sin precios (sigue siendo usable).
  Modal compartido `components/wholesale/PresentationMessageModal.jsx`
  (tier A/B/C + preview EDITABLE + copiar) montado en Pipeline (prospectos,
  default tier C) y Kioscos (default = tier del kiosco).
- **Ubicación de los botones 💬 Presentar** (delegada): cards de prospecto
  en Pipeline + cards de kiosco en Kioscos — el primer contacto pasa ahí
  (la intuición de Diego coincidió con el análisis).
- **Parte 3.2 (lista de precios) NO construida**: Diego pidió propuesta de
  formato ANTES. Propuesta enviada (texto WhatsApp / pantalla presentable /
  ambas). NO arrancar hasta su elección.

## Estado final

- Commits: `f0e2039` (parte 1) · `9d8e9c0` (3.1 base) · `67f69c3`
  (parte 2 + 3.1 cableado). Todo deployado.
- 1033 tests verdes (+3 de presentationMessage) · build OK.
- Pendiente: elección de formato de la lista de precios (3.2) → construirla
  → MD de la Parte 3 al cerrar.

---

*Escrito 2026-07-24.*
