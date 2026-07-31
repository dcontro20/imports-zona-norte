# IZN · Prospectos — Mini CRM de Prospect Intelligence · Resumen

**Fecha:** 2026-07-31 · **Branch:** `feature/prospect-crm` (sobre
`feature/discovery-engine` — se rebasa a main tras el merge del PR #4) · **Sin mergear**
**Spec (congelado):** `docs/PROSPECT_CRM_SPEC.md` · **Journal:** `docs/SESSION_2026-07-31_prospect_crm.md`

---

## Qué es

**Un solo lugar para todo el trabajo con prospectos**: el ítem 🎯 Prospectos
del modo mayorista (reemplaza a "Pipeline" y "Prospección"). Adentro, tres
pestañas y una ficha:

- **☀️ Hoy** — la pantalla de trabajo diario. Arriba de todo, **"Para hoy"**:
  los 5 mejores prospectos según el motor, cada uno con su prioridad, su
  **próximo paso concreto** ("visitalo y calificá el local") y acciones de un
  toque (📋 visita, 💬 presentar). Debajo: los descubrimientos esperando
  revisión, las búsquedas en curso, el embudo en números, las zonas sin
  mayorista (con "🔎 buscar acá") y las últimas visitas con quién las hizo.
- **🎯 Embudo** — el kanban de siempre, tal cual, ahora como vista.
- **🗺️ Zonas** — la cobertura por zona de siempre.
- **La Ficha** — tocás cualquier prospecto y se abre su centro operativo:
  datos (con teléfono que marca al tocarlo y el origen si vino de una
  búsqueda), el diagnóstico completo del motor, la calificación con quién y
  cuándo, la **Actividad** (todo lo que pasó: visitas, altas, ediciones,
  conversiones) y TODAS las acciones — visitar, presentar, llamar, editar,
  avanzar, convertir, borrar. Se gestiona desde ahí, no solo se lee.

La data es compartida entre usuarios (un solo pozo); el usuario aparece como
autoría en visitas, calificaciones y descartes.

## Decisiones de diseño (todas con gate)

Una sola puerta (D-1) · Panel mayorista sigue de home (D-2) · Para hoy Top 5
protagonista (D-3) · kanban degradado a vista (D-4) · Ficha en el MVP como
centro operativo con **Actividad extensible** — lista de eventos tipados:
sumar notas/recordatorios/mensajes mañana es un builder en la lib, sin
rediseñar la pantalla (D-5) · microanimaciones con criterio conservador:
solo claridad, CSS puro, 150–250ms, `prefers-reduced-motion` las apaga (D-A).

**Restricción dura cumplida**: el Prospect Engine, el Discovery Engine y sus
contratos quedaron intactos. El módulo compone; el dominio decide.

## Números

- **1229 → 1254 tests** (+25 del bloque); las suites completas corren
  VERDES ENTERAS (B9 mitigado con causa validada — `067cecc`).
- 4 fases con gate: `580004b` (shell) · `8f840fb` (Hoy) · `2323144` (Ficha)
  · F4 (pulido + docs). Spec: `e60fd90`.
- Piezas compartidas nuevas (única fuente, kanban y Ficha usan lo mismo):
  ProspectFormModal, VisitModal, makeProspectActions, DiagnosisContent,
  prospectActividad.js.

## Pendientes de secuencia

1. Mergear **PR #4** (Discovery Engine) — ya CLEAN/CI verde.
2. Rebasar `feature/prospect-crm` a main → PR propio del CRM (mismo protocolo).
3. Tras el merge: los pendientes operativos del Discovery siguen vigentes
   (credencial a `.credentials/`, LaunchAgent, chowns — ver
   `docs/IZN_Discovery_Engine_Resumen.md`).

## Fuera del MVP (documentado, sin construir)

Asignaciones por usuario · permisos por rol · agenda/recordatorios · push ·
mapa con pins · métricas nuevas de captación · M-D1/M-D2 · B3 (backup de
colecciones nuevas — **sigue siendo el candidato fuerte a próximo ciclo
técnico**: hay data real fuera del backup de Drive).
