# Sesión 2026-07-28 — Prospect Engine: capa de dominio completa (Fases 0–4b)

Sesión dirigida por **Gustavo** (gates de aprobación por fase, decisiones de
arquitectura siempre expuestas antes de implementar). Branch:
`feature/prospect-engine`. **Arquitectura CERRADA por Gustavo al final de la
sesión; queda exclusivamente la etapa de UI.**

## Contexto de arranque (importante para no repetir la confusión)

Los documentos de referencia `PROSPECT_ENGINE_DESIGN.md` y
`ARCHITECTURE_HANDOFF.md` NO están en este repo: viven en el **repo de Atlas**
(`/Users/Gustavo/Desktop/atlas/`), la plataforma Python de Gustavo cuyo módulo
`atlas/prospect/` es la implementación de referencia. "Atlas" ≠ MongoDB.
El plan: portar SOLO el núcleo puro del motor (~1.290 líneas sin I/O) a JS.
Prohibido portar: CRM, scraping, adapters, rúbrica de marketing de Atlas.

## Qué se construyó (fase por fase)

- **F0 — Casos de oro** (en el repo de Atlas): `export_golden_cases.py`
  re-puntuó los 37 prospectos reales → **0 drift** vs. scores persistidos;
  seleccionó 10 casos (4 bandas, firmas de señales únicas) →
  `golden_cases.json` + `test_golden_cases.py` (valida identidad al decimal
  usando las funciones REALES del engine con señales de la fixture). Los
  archivos quedaron **sin commitear en Atlas** (ese repo no trackea tests/).
  Sin PII; mapeo golden_NN→prospect_id solo en Atlas.
- **F1 — Motor** `src/lib/prospectScoring.js` (33 tests): TRI, lo-no-sabido no
  puntúa ni pesa, coverage, gate de confianza (<0.35 estricto), prioridad
  derivada, frases con dedup. Pieza clave: `redondearPy` — réplica del
  `round()` half-to-even de Python sobre el binario exacto (toFixed(100) +
  BigInt); sin eso el port no es idéntico al decimal (los empates binarios son
  alcanzables: pesos enteros pueden sumar potencias de 2). Fixture copiada
  byte-idéntica (`prospectScoring.golden.json`, sha b29ed2ed) — **se regenera
  SOLO en Atlas y se vuelve a copiar; jamás editarla acá**. 10/10 casos
  idénticos. Motor 100% desacoplado (probado corriéndolo solo con Node pelado).
- **F2 — Rúbrica + señales** (26 tests): `prospectRubric.js` (izn-v1 como
  datos, 8 oportunidad/peso 88 + 5 fit/peso 80, borrador §7 del diseño, frases
  tono IZN, campo `fuente: auto|visita`) + `prospectSignals.js`
  (`prospectToSignals`; regla de honestidad: contexto NO provisto ⇒ sin_datos,
  provisto y vacío ⇒ dato real medido). **Rúbrica CONGELADA** hasta calibrar
  con prospectos reales (decisión explícita — el orden C-vs-B del demo queda
  para el ojo del vendedor cuando haya data).
- **F3 — Enchufe** (8 tests): `prioritizeProspects(prospects, now, contexto=null)`.
  Sin contexto ⇒ camino histórico por recencia byte a byte (tests legacy
  intactos). Con contexto ⇒ orden de rank.py: banda → opp ↓ → fit ↓ → conf ↓,
  prioridad "" al final. Contrato CERRADO: `rankKey` (clave técnica, JAMÁS
  mostrar), `scoreResult` aditivo (única fuente del diagnóstico), valores de
  negocio = opportunity.total / fit.total / prioridad. Ciclo benigno
  prospecting ⇄ prospectSignals documentado. Ningún componente cambiado.
- **F4a — Diagnóstico** (16 tests): `prospectDiagnosis.js` — port de
  diagnosis.py (la palabra lidera, el número respalda, umbrales 0.66/0.45/0.60/
  0.50) + `proximoPaso` por etapa (patrón estadoActual de la Ficha de Atlas).
- **F4b — Fachada** (15 tests): `prospectRanking.js` —
  `buildProspectRanking({prospects, visits, clients, sales, products, now})` →
  `{ items, porId }` con todo digerido (posicion, chip, diagnostico,
  proximoPaso, scoreResult). Re-exporta `CALIFICACION_CAMPOS` (5 controles;
  decisorVisto AFUERA por D2) y `aplicarCalificacion` (merge honesto sellado).
  **REGLA DURA: la UI importa SOLO este módulo.**

**Tests: 1036 → 1134 (+98, todos verdes). Build verde en cada fase.**

## Decisiones aprobadas por Gustavo (no reabrir sin él)

- **D1** `op_sin_competencia_visible` se queda; campo provisional
  `calificacion.competenciaVisible` (gap del diseño §7 vs §6.2).
- **D2** `fit_decisor` SOLO de la ficha (contactName+phone); `decisorVisto` no
  se captura ni consume (la visita no duplica la responsabilidad de la ficha).
- **D3** Asimetría: ficha vacía ⇒ "no" (el registro ES la identificación);
  source vacío ⇒ sin_datos (origen desconocido).
- **D4** Señales de zona heredan el criterio de `zonesCoverage` (ignora
  `c.inactive`) hasta resolver B6 — no divergir del resto del sistema.
- **D5** Datasets provistos sin ventas en la zona ⇒ "no" (medido).
- **D6** Outcomes positivos: interesado, volver, vendido.
- **D7** Firma del contexto refleja necesidades reales (incluye sales/products).
- **Contrato prioritizeProspects**: Opción A — `rankKey` en camino motor,
  `score` legacy hasta extinguirse.
- **UI (aprobada, SIN construir)**: U1 pasar `sales={activeSales}` a Pipeline ·
  U2 columnas del kanban ordenadas por `posicion` · U3 chip de banda + aviso
  de poca información en tarjeta · U4 DashboardMayorista intacto (fuera de v1).
- **B1 NO es prerequisito**: la calificación de visita será efímera hasta
  resolverlo como tarea independiente.

## Bugs hallados — SOLO documentados (orden explícita de no corregir)

`docs/BACKLOG_TECNICO_2026-07-28_prospeccion_y_sync.md`: **B1** prospects/
visits/routes sin autosave en useFirebaseSync (data efímera; bloquea la
calibración con data real y el backup de estos datos) · **B2** Papelera no
restaura/purga esos 3 tipos · B3 sin schema/backup · B4 lat/lng write-only ·
B5 doble enum de etapas · B6 "mayorista activo" inconsistente · B7 menores ·
**B8** dailyPlan.test.js roto pre-existente (timezone) · **B9** App.test.jsx
flaky por timeout en suite completa (pasa aislado).

## Estado de git

11 commits de la sesión en `feature/prospect-engine` (F0→F4b + docs + backlog).
**Push bloqueado: `gcontro99` sin permiso de escritura en
`dcontro20/imports-zona-norte` (403).** Todo el trabajo está SOLO local.
Pendientes fuera de este repo: commitear los entregables de F0 en Atlas.

## Próxima sesión (etapa de UI — especificación completa lista)

Leer `docs/PROSPECT_ENGINE_ARQUITECTURA.md` (tabla campo → uso en UI) y
`docs/IZN_Prospect_Engine_Resumen.md`. Consumir SOLO `buildProspectRanking()`;
prohibido importar prospectSignals/prospectScoring/prospectDiagnosis/
prioritizeProspects directo o reimplementar reglas. Alcance: U1+U2+U3 en
Pipeline, bloque Diagnóstico + "¿Por qué?" en modal de prospecto, calificación
rápida en modal de visita (CALIFICACION_CAMPOS + aplicarCalificacion +
logAudit). Después: F5 (argumento de venta en PresentationMessageModal, port de
quickwin.py con regalos B2B — NO iniciado).
