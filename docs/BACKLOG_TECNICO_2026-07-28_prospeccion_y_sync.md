# Backlog técnico — hallazgos del relevamiento Prospect Engine (2026-07-28)

Observaciones detectadas durante el relevamiento previo al port del Prospect
Engine (ver `PROSPECT_ENGINE_DESIGN.md` y `ARCHITECTURE_HANDOFF.md` en el repo
de Atlas). **Decisión explícita de Gustavo: documentar, NO corregir ahora.**
Ningún fix de esta lista se aplica sin OK; el orden de fases del port no cambia
por estos hallazgos.

Verificados sobre `feature/prospect-engine` @ `1d67ee8` (clon 2026-07-28).

---

## 🔴 B1 — `prospects`, `visits` y `routes` nunca se persisten

> ✅ **RESUELTO 2026-07-30** (`60b368b`, branch `feature/discovery-engine`),
> con OK explícito de Gustavo como prerequisito del Discovery Engine: 3
> autosaves espejo + test de paridad `useFirebaseSync.autosave.test.js`
> (invariante sobre el fuente: toda key de DATA_KEYS tiene su smartSave —
> cubre la clase del bug). B2 y B3 siguen abiertos.

**Dónde:** `src/useFirebaseSync.js:314-331`.

Las tres colecciones están registradas en `DATA_KEYS` (`:55-57`), en el state
(`:83-85`), en el `setterMap` del onSnapshot (`:144`) y en el return del hook
(`:376`) — por eso la **lectura** desde Firestore funciona. Pero en el bloque de
autosaves (`useEffect(() => smartSave(key, value), [value])`, líneas 314-331)
**faltan los tres `useEffect`**. Toda mutación local — alta de prospecto,
edición, avance de etapa, conversión, registro de visita, rutas — no llega ni a
Firestore ni a localStorage: **se pierde al refrescar la página**.

- Origen: commit `f111e5d` (Fase 0.4 del pivote mayorista) agregó el registro
  de las colecciones y omitió los autosaves. `git log -S'smartSave("prospects"'`
  confirma que nunca existieron.
- Consecuencia directa para el port: la Fase 2 (calibración de la rúbrica
  "sobre los prospectos reales de Firestore") asume data real persistida que
  probablemente no exista. **Decisión pendiente antes de Fase 2.**
- Fix estimado cuando se apruebe: 3 `useEffect` siguiendo el patrón existente.

## 🔴 B2 — La Papelera no puede restaurar ni purgar prospectos/visitas/rutas

**Dónde:** `src/components/Trash.jsx`.

Los tres tipos se listan (`:62-73`) con un campo `_setter` correcto, pero
`_setter` no se lee nunca. Las rutas de acción resuelven el setter con mapas que
omiten los tres tipos: `setterByType` (`:88-95`, usado por `bulkRestore` `:158`
y `bulkDeleteForever` `:175`), `restore` (`:242-248`) y `permanentDelete`
(`:267-273`), todos con guard `if (!setter) return;`. Resultado: "Restaurar" o
"Eliminar permanentemente" sobre un prospecto/visita/ruta es un **no-op
silencioso**. El comentario de `:87` todavía enumera solo los 6 tipos originales.

## 🟠 B3 — Prospectos sin red de seguridad de datos

No existe `ProspectSchema` ni `VisitSchema` en `src/lib/schemas.js` (sí existe
`ClientSchema` con campos B2B). `lib/backupValidator.js`, `components/Export.jsx`
y `scripts/` no mencionan `prospects`: **no entran en el backup diario a Drive
ni en el export manual**. Combinado con B1, hoy no hay ninguna vía de
recuperación de estos datos.

## 🟠 B4 — `lat`/`lng` del prospecto son write-only y se pierden al convertir

Se capturan en el form (`Pipeline.jsx:193-194`) y se normalizan (`:60`), pero
ningún módulo los lee (ProspectMap es vista por zona, no geográfica;
`optimizeStops` de `routes.js:127` es stub). En la conversión a cliente
(`Pipeline.jsx:90-98`) no se copian: la geolocalización cargada a mano se pierde.

## 🟡 B5 — Doble fuente de verdad para las etapas del pipeline

`PIPELINE_STAGES` y `PROSPECT_STAGES` en `constants/enums.js:38-40` duplican
conceptualmente `PIPELINE_FULL_ORDER` / `PROSPECT_STAGES_ORDER` de
`src/prospecting.js:15-17`. El kanban usa las de `prospecting.js`; `Kioscos.jsx`
usa `PIPELINE_STAGES` en dos selects. `PROSPECT_STAGES` y `CLIENT_TYPES`
(`enums.js:27`) tienen **cero consumidores**. Agregar una etapa en un solo lado
desincroniza el otro sin que nada falle.

## 🟡 B6 — Definición inconsistente de "mayorista activo"

`prospecting.js:20` (`activeMayorista`) no filtra `c.inactive`;
`wholesaleIntelligence.js:58` y `:119` sí. Tres pantallas pueden mostrar tres
números distintos para "mayoristas activos": DashboardMayorista (KPI),
ProspectMap (suma de `zonesCoverage`) y Pipeline (StatCard de `funnelSummary`).
Además `zonesCoverage` compara zonas case-sensitive ("Palermo" ≠ "palermo").

## 🟡 B8 — Test pre-existente roto: `dailyPlan.test.js` (weekKey, timezone)

`src/lib/dailyPlan.test.js > weekKey > "misma semana → misma key (lunes a
domingo)"` falla en esta máquina (ART): `expected '2026-06-08' to be
'2026-06-09'`. Falla aislado y sobre archivos no tocados por el port (feature
"Plan de hoy", commits `1fdd087`/`93e2e10`, posterior al baseline de 1036
tests). Huele a parseo de fecha date-only (UTC) + `getDay()` local — el clásico
corrimiento de un día según timezone. Detectado el 2026-07-28 al correr la
suite completa durante la Fase 1 del Prospect Engine; **no** fue introducido
por el port (sus 33 tests pasan y ningún archivo previo cambió).

## 🟡 B9 — `App.test.jsx` flaky por timeout en suite completa

En corridas de la suite COMPLETA, tests del smoke de App fallan intermitente
con `Error: Test timed out in 5000ms` (una corrida 4 fallos, la siguiente 1,
aislado pasa 4/4 siempre). Es la familia de flakiness ya documentada en
CLAUDE.md (lazy chunks / EnvironmentTeardownError), variante timeout bajo
carga. Observado por primera vez el 2026-07-28 tras la Fase 3 del Prospect
Engine: `prospecting.js` ahora importa 3 módulos de lib/, lo que engorda
levemente los lazy chunks que App monta en el smoke — posible afeitada del
margen de 5000ms, no un problema funcional (los tests pasan aislados y el
camino legacy está intacto). Mitigación candidata cuando se decida:
`testTimeout` mayor para App.test.jsx o drenar lazy chunks con más margen.

**Actualización 2026-07-30 (F2/F3 del Discovery Engine):** el flake se
AMPLIFICÓ — ahora falla ~1 test por corrida completa de forma casi
consistente, y una vez falló 4/4 incluso aislado con la máquina cargada
(post-build; re-corrido dos veces dio 4/4). Causa probable acumulada: App
monta 2 suscripciones más (discoveryResults + discoveryJobs) y el chunk de
Pipeline creció con la UI de revisión. Sigue sin ser funcional. Decisión de
Gustavo (gate F3): queda en backlog, NO se corrige mezclado con la
validación del Discovery. Mitigación recomendada al retomarlo: subir
`testTimeout` de App.test.jsx (p. ej. 15000) — es un smoke de montaje, no
un test de latencia.

## 🟢 B7 — Menores

- `docs/PLAN_MAYORISTA.md:158-159` desactualizado: dice `businessMode` default
  `"mayorista"` (real: `"minorista"`, `src/settings.js:13`) y menciona
  `orderNavByMode()` que "no oculta nada" (real: `navItemsForMode()` en
  `App.jsx:269` sí filtra por modo — cambio Tanda F.1).
- Exports sin consumidor externo: `pipelineCounts`, `daysSince`,
  `PIPELINE_FULL_ORDER` (`prospecting.js`), `clientWholesaleSales`
  (`wholesaleIntelligence.js`) — solo uso interno + tests.
- Import muerto: `Card` en `Pipeline.jsx:4`.
- `activeVisits`/`activeRoutes` (`App.jsx:591-592`) se calculan y nunca se
  pasan a ningún componente.

---

## Nota de contexto — Fase 0 del Prospect Engine (cerrada 2026-07-28)

Los casos de oro se exportaron y validaron en el repo de Atlas
(`atlas/prospect/tests/golden_cases.json` + `test_golden_cases.py` +
`export_golden_cases.py`): 37/37 prospectos reales re-puntuados con **0 drift**
contra los scores persistidos; 10 casos seleccionados (4 bandas de prioridad,
firmas de señales únicas) verificados **idénticos al decimal** contra el engine
Python. La fixture viaja a este repo recién en Fase 1 (junto con
`prospectScoring.js` + su test espejo).

Decisión de Fase 0 (ratificada): la rúbrica de Atlas viaja **como datos dentro
de la fixture de test** (ids, pesos, frases) para poder verificar equivalencia
Python↔JS. La prohibición del diseño ("las filas de Atlas no entran al repo de
Imports") aplica al código de producción — `prospectRubric.js` se escribe desde
cero con criterios del negocio mayorista, jamás con los de Atlas.

Hallazgo de cobertura: en los 37 casos reales el **gate de confianza nunca
actúa** (ningún caso con base alta/muy_alta y confidence < 0.35). El gate queda
sin caso de oro real; la Fase 1 debe cubrirlo con tests unitarios propios del
motor JS (o casos sintéticos marcados, a decidir).

---

## Mejoras futuras del Discovery Engine (observadas en F4, 2026-07-31)

Decisión de Gustavo (gate F4): quedan DOCUMENTADAS, sin cambiar comportamiento
antes de cerrar esta versión.

### M-D1 — Duplicado por teléfono compartido entre sucursales

En la corrida real de Martínez, "Kiosko y almacén lo del PELA II" cayó como
duplicado de "lo del PELA": dos sucursales del mismo dueño que comparten
teléfono (la clave fuerte `tel:` de la capa de import las une; el runner NO las
unió porque nombre+dirección difieren — el layering funcionó como se diseñó).
Para B2B es defendible (mismo decisor), pero Diego podría querer visitar ambas
ubicaciones. Mejora candidata: permitir importar un "duplicado" igual, con
confirmación explícita en el modal de revisión (hoy los duplicados no son
accionables).

### M-D2 — Zona del lote vs. ubicación real del negocio

La búsqueda de Martínez trajo un kiosco de Benavídez (Maps decide el radio) y
quedó estampado `zone: "Martínez"` — el riesgo de aproximación documentado en
el plan. Mitigación vigente: la zona es editable en la revisión/ficha. Mejora
candidata: detectar discrepancia dirección↔zona en el modal (aviso suave), o
derivar zona de la dirección cuando difiere de la del job.
