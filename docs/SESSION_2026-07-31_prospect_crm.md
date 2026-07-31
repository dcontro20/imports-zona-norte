# SESSION 2026-07-31 — Prospectos: el mini CRM de Prospect Intelligence (F1–F4)

Sesión dirigida por Gustavo con gates por fase (continuación inmediata del
Discovery Engine — PR #4 abierto y CI verde, ver
`docs/SESSION_2026-07-30_discovery_engine.md`). Branch: `feature/prospect-crm`
(sobre `feature/discovery-engine`; **rebasar a main cuando mergee el PR #4**).
Spec CONGELADO: `docs/PROSPECT_CRM_SPEC.md`.

## El pivote conceptual (otra vez una frase de Gustavo reordenó el diseño)

La propuesta v1 era un "dashboard de captación". Gustavo la subió de categoría:
*"No quiero pensar este módulo solo como una pantalla de Captación. Quiero que
sea un mini CRM de Prospect Intelligence dentro de Imports"* — descubrir,
revisar, priorizar, visitar, contactar, convertir y seguir, todo en un lugar;
data compartida entre usuarios (el usuario es autoría/permisos/futuras
asignaciones, no separación); una sola puerta; el kanban degradado a vista; y
la Ficha como pieza que convierte "un dashboard con otro nombre" en un CRM.

Decisiones cerradas D-1..D-5 + D-A en el spec. Restricción dura cumplida:
**cero cambios en engine, discovery o contratos** — todo el bloque es
navegación, composición y una vista nueva.

## Las fases

- **F1 — Shell** (`580004b`): módulo `Prospectos.jsx` con pestañas Hoy /
  Embudo / Zonas. El nav mayorista pierde DOS ítems (Pipeline y Prospección)
  y gana UNO (🎯 Prospectos); los keys históricos quedan como alias de
  deep-link/⌘K con `tabInicial` (sin lockout). El discovery entero se mudó de
  Pipeline a Hoy; **Pipeline volvió a ser kanban puro**.
- **F2 — Hoy completo** (`8f840fb`): "Para hoy" Top 5 (D-3) como protagonista
  — el engine propone (chip + próximo paso del diagnóstico), el operador
  ejecuta (visita/presentar/diagnóstico). Funnel de 4 etapas, zonas sin
  mayorista con "🔎 buscar en esta zona" (pre-carga el form — el ciclo
  descubrir→trabajar→descubrir en una pantalla), últimas visitas con autoría,
  alta manual. Para no duplicar lógica, los modales de alta/edición y
  visita+calificación se EXTRAJERON de Pipeline como compartidos
  (`ProspectFormModal` / `VisitModal`).
- **F3 — Ficha** (`2323144`): el centro operativo. Acciones arriba (visita,
  presentar, 📞 llamar con tel:, editar, avanzar, convertir, borrar), datos
  con procedencia del discovery, diagnóstico embebido (`DiagnosisContent`
  extraído del modal — mismo render puro), calificación con autoría, y
  **Actividad como lib pura de eventos tipados** (`prospectActividad.js`:
  {tipo, icono, titulo, detalle, at, por}; tipo nuevo = builder en la lib, la
  pantalla no cambia; v1 = visitas ricas + auditLog del prospecto, audit
  "visit" excluido para no duplicar, acciones desconocidas se ignoran).
  `makeProspectActions` unificó avanzar/convertir/borrar entre kanban y Ficha.
- **F4 — Pulido** (este cierre): D-A resuelta con el criterio conservador de
  Gustavo — SOLO claridad: fade de pestaña (180ms), entrada del banner
  (200ms), pulso en "buscando..." (trabajo en curso); `prefers-reduced-motion`
  apaga todo; el Modal global NO se animó (compartido, fuera de alcance). Fix
  de HTML inválido (button dentro de anchor en 📞 Llamar).

## El patrón de refactor del bloque

Cada extracción usó **los 15 tests existentes de Pipeline como árbitro**: se
movió código, se corrieron, pasaron sin tocarse — tres veces (form modal,
visit modal, acciones). Piezas compartidas nuevas: ProspectFormModal,
VisitModal, makeProspectActions, DiagnosisContent, PRIORIDAD_COLOR exportado,
DiscoverySearchModal.inicial.

## B9: de flake a resuelto (la saga completa)

Durante F1 el flake se volvió insostenible (llegó a fallar aislado con la
máquina caliente). **Experimento de control con stash** (con/sin F1,
intercalado): la correlación con el código era ESPURIA — el smoke corría al
límite del default (5.96s de tests vs 5000ms/test). Con OK de Gustavo:
`vi.setConfig({ testTimeout: 15000 })` (`067cecc`) + backlog actualizado con
la regla "si reaparece con 15000ms, ahí sí sospechar del código". Resultado:
**las suites completas corren verdes ENTERAS** (1243, 1254 — primera vez en
la historia reciente del repo).

## Datos técnicos que valen memoria

- `proximoPaso` de la fachada es OBJETO {tono, icono, texto, pendientes}.
- Entrada de auditLog: {id, timestamp, user, action, entityType, entityId,
  description, details} (cap 2000).
- `funnelSummary().counts` trae los 4 números por etapa.
- El chip "Alta" (prioridad) colisiona textualmente con "Alta" (evento de
  actividad) — los tests asertan por detalle, no por título.
- **Atlas siguió evolucionando por su lado** (verticales abiertas, sistema de
  búsquedas con specs/runs): la divergencia del fork asumido del Discovery ya
  empezó. A Imports no lo afecta — la copia es soberana y las fixtures son la
  referencia del momento del port.

## Estado al cierre

- Branch `feature/prospect-crm`: spec + 5 commits de código/docs sobre el
  Discovery. **1254 tests** (1229 → 1254 en el bloque), suites completas
  verdes, build OK.
- **Pendientes de secuencia** (no de trabajo): mergear PR #4 (Discovery) →
  rebasar esta branch a main → PR propio del CRM con el mismo protocolo.
- Fuera del MVP (documentado en spec): asignaciones, permisos por rol,
  agenda/recordatorios, push, mapa con pins, métricas nuevas, M-D1/M-D2, B3.
