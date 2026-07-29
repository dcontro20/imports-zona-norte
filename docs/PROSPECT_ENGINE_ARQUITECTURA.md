# Arquitectura del Prospect Engine

Cómo fluye la información desde Firestore hasta el ranking del Pipeline, y qué
responsabilidad tiene cada módulo. Complementa a `PROSPECT_ENGINE_CONTRATO.md`
(el contrato fino del motor). Para el porqué de cada decisión:
`PROSPECT_ENGINE_DESIGN.md` en el repo de Atlas.

## El pipeline

```
   Firestore (useFirebaseSync)                        Capa 5 · DATOS
   prospects · visits · clients · sales · products
                    │   props / useMemo (igual que todo Imports)
                    ▼
   src/lib/prospectSignals.js                         Capa 4 · ADAPTADOR
   prospectToSignals(prospect, {visits, clients, sales, products})
   → señales TRI { [id]: { valor: si|no|sin_datos, fuentes } }
                    │
                    │         src/lib/prospectRubric.js   Capa 4 · CONFIGURACIÓN
                    │         RUBRICA_IZN (izn-v1): filas {id, pregunta, peso,
                    ▼         fuente, frases} — datos, jamás lógica
   src/lib/prospectScoring.js                         Capa 4 · MOTOR
   construirScore(señales, rúbrica) → ScoreResult
   { opportunity, fit, prioridad, confidence, fortalezas, oportunidades }
                    │
                    ▼
   src/prospecting.js · prioritizeProspects(prospects, now, contexto?)
                                                      Capa 3 · CEREBRO
   sin contexto → orden histórico por recencia (compat total)
   con contexto → señales + motor: banda → oportunidad ↓ → fit ↓ → confianza ↓
                    │
                    ▼
   UI: Pipeline.jsx · DashboardMayorista.jsx · …      Capa 2 · PANTALLAS
   consume [{ prospect, stage, daysSinceContact, score, reason, scoreResult? }]
```

## Responsabilidades y límites

| Módulo | Hace | JAMÁS hace / importa |
|---|---|---|
| `prospectScoring.js` (motor) | Aritmética TRI: normaliza sobre lo conocido, coverage, confianza, gate, prioridad derivada, frases | No importa NADA. No conoce prospectos, zonas, visitas ni Firestore. Copiable a otro proyecto tal cual |
| `prospectRubric.js` (rúbrica) | Las filas de Imports como datos (8 oportunidad + 5 fit, pesos, frases tono IZN). Calibrar = editar filas + subir `version` | Sin lógica. Sin filas de Atlas. No importa nada |
| `prospectSignals.js` (adaptador) | El ÚNICO que conoce ambos mundos: documento → señales TRI con fuentes. Regla de honestidad: contexto no provisto ⇒ `sin_datos`; provisto y vacío ⇒ dato real | No importa componentes. No escribe nada |
| `prospecting.js` (cerebro) | Embudo + `prioritizeProspects` con dos caminos (recencia / motor). Punto único de enchufe del engine | No conoce React ni Firestore (puro, testeable) |
| UI (Capa 2) | Pasa colecciones por props y muestra el resultado | No arma señales ni calcula scores |

**Sentido de dependencia:** UI → prospecting → lib → nada. Hay un ciclo
deliberado y benigno `prospecting.js ⇄ prospectSignals.js` (el adaptador reusa
`zonesCoverage`/`lastVisitFor`): es seguro porque ambos solo se llaman en
runtime, nunca al evaluar el módulo. Si el motor alguna vez necesita saber qué
es una zona o una visita, el diseño se rompió — esa información entra solo como
señal ya traducida.

## Contratos (fijados en `PROSPECT_ENGINE_CONTRATO.md`)

1. **Señales**: `{ [id]: { valor, fuentes } }` — producidas por el adaptador.
2. **Rúbrica**: filas-dato con `version` explícita (`izn-v1`, congelada hasta
   tener uso real).
3. **ScoreResult**: la salida completa y explicable del motor; cada criterio
   arrastra sus fuentes (alimenta el "¿Por qué?" de la UI, Fase 4).

## Equivalencia con Atlas

El motor es un port de `atlas/prospect/{score,scorer}.py`. La fixture
`src/lib/prospectScoring.golden.json` (10 casos reales, byte-idéntica a la de
Atlas) corre en los tests de ambos repos; si alguno cambia, el otro se entera
por CI. Regenerarla: `python3 -m atlas.prospect.tests.export_golden_cases` (en
Atlas) → copiar acá.

## Estado por fases (plan del diseño §11)

- **F0 casos de oro** ✅ · **F1 motor** ✅ · **F2 rúbrica + señales** ✅
- **F3 enchufe en `prioritizeProspects`** — esta fase
- **F4 explicabilidad en UI + calificación de visita** · **F5 argumento de
  venta** — pendientes
- La calibración de pesos queda congelada hasta tener prospectos reales
  (bloqueada por B1, ver `BACKLOG_TECNICO_2026-07-28_prospeccion_y_sync.md`).
