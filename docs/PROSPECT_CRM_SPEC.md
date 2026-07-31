# PROSPECTOS — Mini CRM de Prospect Intelligence · Spec funcional

**Fecha:** 2026-07-31 · **Branch:** `feature/prospect-crm` (sobre
`feature/discovery-engine`; se rebasa a `main` cuando mergee el PR #4)
**Estado:** ✅ **CONGELADO** (aprobado por Gustavo, 2026-07-31). Las fases lo
implementan, no lo renegocian. Cambios de alcance = nuevo gate.

## Visión (fijada por Gustavo)

No es "una pantalla de captación": es un **mini CRM de Prospect Intelligence**
dentro de Imports. Toda la gestión de prospectos ocurre ahí: **descubrir,
revisar, priorizar, visitar, contactar, convertir y hacer seguimiento**.

**Data compartida entre usuarios** (un solo pozo de prospectos — el modelo de
todo Imports). El usuario sirve para **auditoría** (autoría visible: visitas
`byUser`, calificaciones `actualizadoPor`, descartes `por`, `logAudit`),
permisos, y a futuro asignaciones. No hay prospectos "de" cada usuario.

**Restricción dura:** el Prospect Engine, el Discovery Engine y sus contratos
NO se tocan. Esto es navegación, composición de vistas y una vista nueva
(Ficha). Cero migraciones, cero colecciones nuevas, cero cambios de reglas.

## Decisiones cerradas

| # | Decisión |
|---|---|
| D-1 | **Una sola puerta**: el ítem de nav "🎯 Prospectos" reemplaza a "Pipeline" **y** a "Prospección" (Zonas se absorbe como pestaña) |
| D-2 | Home del modo mayorista sigue siendo **Panel mayorista** |
| D-3 | **"Para hoy" Top 5** es el elemento principal de la pestaña Hoy |
| D-4 | El kanban pasa a ser la pestaña **Embudo** — vista, no centro |
| D-5 | **La Ficha entra al MVP** como centro operativo del prospecto, con sección **"Actividad"** prevista para crecer |
| D-A | Animaciones: micro-transiciones CSS puras (sin dependencias) propuestas; **alcance a confirmar en el gate de F4** (pulido) — no bloquean nada |

## Estructura del módulo

Nav mayorista queda: Panel mayorista · **🎯 Prospectos** · Kioscos · Pedido ·
Rutas · Cuentas corrientes · Precios. Adentro, pestañas (chips, mobile-first):

- **Hoy** (default) — el dashboard del módulo.
- **Embudo** — el kanban actual, puro (el discovery se muda a Hoy).
- **Zonas** — el ProspectMap actual, tal cual.
- **Ficha** — vista por prospecto (se abre al tocar un prospecto desde
  cualquier lado; no es pestaña fija).
- Revisión / Descartados / Búsqueda — modales existentes, desde Hoy.

Deep-links y ⌘K: los keys históricos `pipeline` y `prospectMap` siguen
funcionando como alias (abren el módulo en Embudo / Zonas). Sin lockout,
como la regla de modos.

## Pestaña Hoy

**Arriba de todo, "Para hoy" (Top 5)**: los mejores prospectos según
`buildProspectRanking` (etapas prospecto/contactado), cada card con: nombre,
zona, chip de prioridad, **próximo paso** del diagnóstico, última visita,
◍ si falta calificar. Acciones directas: 📋 Visita · 💬 Presentar · abrir
Ficha. Al lado, contador "N sin calificar".

Debajo:
- **Discovery**: descubiertos por revisar (card por búsqueda) · búsquedas en
  cola / en curso / con error (error textual) + cancelar · 🔎 nueva búsqueda ·
  ⛔ descartados (rehabilitar).
- **Funnel**: prospecto → contactado → visitado → mayoristas (`funnelSummary`).
- **Zonas resumidas**: con/sin mayorista (`zonesCoverage`) + atajo a la
  pestaña Zonas; "🔎 buscar en esta zona" pre-carga el form.
- **Últimas visitas** (quién, cuándo, resultado — autoría visible).
- **+ Nuevo prospecto** (alta manual, mismo modal de siempre).

## Ficha del prospecto (centro operativo)

Composición de piezas existentes + una sección nueva:

1. **Encabezado**: nombre, zona, etapa, chip de prioridad, ◍.
2. **Datos**: teléfono (tappeable `tel:`), dirección, contacto, notas; si
   vino del discovery: procedencia (término, fecha, rating/reviews, web/red).
3. **Diagnóstico del engine** (el contenido del modal actual): veredicto,
   razones, "¿por qué?" criterio a criterio, próximo paso.
4. **Calificación actual** (los 5 campos, con quién/cuándo).
5. **Actividad** — sección DISEÑADA PARA CRECER. v1 compone lo que ya existe,
   en lista cronológica inversa con ícono + texto + fecha + autor:
   - visitas (de `visits`: outcome + notas + byUser), y
   - eventos de `auditLog` del prospecto (create/update/qualify/convert/
     import/rehab — ya se registran hoy).
   Futuras iteraciones (fuera del MVP): notas manuales, recordatorios,
   mensajes enviados, asignaciones. El contrato de la sección es "lista de
   eventos tipados" para que agregar tipos no rediseñe nada.
6. **Acciones**: 📋 Visita (+ calificación) · 💬 Presentar · ✏️ Editar ·
   → Avanzar etapa · ✓ Convertir · 🗑 Borrar.

## Fuera del MVP (explícito)

Asignaciones por usuario · permisos por rol · agenda/recordatorios · push ·
timeline de auditoría más allá de Actividad v1 · mapa con pins · métricas
nuevas de captación · M-D1/M-D2 · B3 (backup — ciclo técnico aparte) ·
cambios a engine/discovery/contratos · otros módulos B2B.

## Plan de fases (gates de Gustavo entre cada una)

- **F1 — Shell del módulo**: `Prospectos.jsx` con pestañas; Embudo = Pipeline
  puro (el discovery se muda a Hoy); Zonas = ProspectMap; nav una-puerta +
  alias de deep-links; tests de módulo y no-regresión.
- **F2 — Hoy completo**: Para hoy Top 5 + funnel + zonas resumidas + últimas
  visitas + alta manual desde Hoy + "buscar en esta zona".
- **F3 — Ficha**: la vista completa + Actividad v1.
- **F4 — Pulido**: mobile fino, micro-animaciones (si D-A se aprueba), docs
  de cierre (journal + resumen — regla permanente).
