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
   src/lib/prospectRanking.js                         Capa 3.5 · FACHADA
   buildProspectRanking({prospects, visits, clients, sales, products, now})
   → { items, porId } — TODO ya digerido para renderizar
                    │
                    ▼
   UI: Pipeline.jsx · DashboardMayorista.jsx · …      Capa 2 · PANTALLAS
   solo renderiza items; cero lógica de negocio
```

## La fachada: el único import de la UI

**Regla dura: la capa de React importa ÚNICAMENTE `src/lib/prospectRanking.js`.**
Jamás `prospectScoring`, `prospectSignals`, `prospectRubric` ni
`prospectDiagnosis` directamente — quien implemente la interfaz no necesita
entender el engine.

`buildProspectRanking(...)` devuelve `{ items, porId }`; cada item (ya ordenado
por valor comercial, `posicion` 1..n):

| Campo | Para qué lo usa la UI |
|---|---|
| `prospect`, `stage`, `daysSinceContact` | datos de la tarjeta, como siempre |
| `posicion` | ordenar columnas del kanban (U2): sort por este número |
| `chip: { prioridad, etiqueta, aviso }` | chip de banda en la tarjeta (U3); `aviso` ("todavía con poca información" o `null`) es el indicador de confianza baja |
| `diagnostico` | bloque Diagnóstico del modal: `veredicto`, `sentencia`, `razones[3]`, `senalesVisitaFaltantes`, `enDetalle`, `confianzaBaja` |
| `scoreResult` | el "¿Por qué?": `opportunity/fit.criterios[]` con pregunta, valor TRI, puntos y fuentes |
| `proximoPaso` | `{ tono, icono, texto, pendientes }` — cierre del modal |
| `reason` | resumen corto (provisorio de F3) |
| `rankKey` | NADA — clave técnica, jamás se muestra |

Para el **modal de visita**, la fachada re-exporta `CALIFICACION_CAMPOS`
(los 5 controles data-driven; cada campo trae `opciones: [{valor, etiqueta}]` —
la UI no traduce nada), `calificacionActual(prospect)` (estado del formulario,
normalizado, para preseleccionar) y `aplicarCalificacion(prospect, cambios,
{autor, at})` (merge honesto + sellado — la UI hace
`setProspects(prev => prev.map(...))` + `logAudit` y nada más). Para mostrar
valores TRI en cualquier lado (p. ej. `criterios[].valor` del "¿Por qué?"):
`ETIQUETA_TRI`.

### Notas de integración (leer antes de escribir el primer componente)

- **Memoizar**: `buildProspectRanking` corre el motor completo — llamarla
  dentro de `useMemo` con las colecciones como deps (patrón estándar de la
  casa). El orden es independiente del reloj; `now` solo afecta
  `daysSinceContact`.
- **Ordenar una columna del kanban (U2)**:
  `[...lista].sort((a, b) => (porId[a.id]?.posicion ?? Infinity) - (porId[b.id]?.posicion ?? Infinity))`.
- **`at` de `aplicarCalificacion`**: ISO — `new Date().toISOString()`.
- **`fuentes` de los criterios** son strings legibles por diseño
  (`"visita_2026-07-25"`, `"zonesCoverage"`): se muestran tal cual en el
  "¿Por qué?".
- **"Faltan N señales de visita"** ya viene redactado en
  `proximoPaso.pendientes` — no armar el texto a mano.
- **Recordatorio B1**: los prospectos (y por lo tanto la calificación) hoy NO
  persisten a Firestore — data efímera de sesión hasta resolver B1 (aceptado).

## Contrato de `prioritizeProspects` (cerrado 2026-07-28)

## Contrato de `prioritizeProspects` (cerrado 2026-07-28)

Dos shapes según el camino, ambos estables:

- **Legacy (sin contexto)**: `{ prospect, stage, daysSinceContact, score, reason }`
  — intacto. `score` conserva su significado histórico (heurística de recencia)
  hasta que este camino eventualmente desaparezca.
- **Motor (con contexto)**: `{ prospect, stage, daysSinceContact, rankKey,
  reason, scoreResult }`.

Reglas de consumo (obligatorias para toda UI):

1. **`rankKey` es una clave TÉCNICA de ordenamiento** — el embedding del orden
   banda → oportunidad → fit → confianza en un entero (`rankKey(a) > rankKey(b)
   ⟺ a precede a b`). **Jamás se muestra en la interfaz ni se usa como
   indicador comercial**: no es una magnitud (diferencias y cocientes no
   significan nada) y no es comparable entre versiones de rúbrica.
2. **Los únicos valores de negocio mostrables al usuario son
   `scoreResult.opportunity.total`, `scoreResult.fit.total` y
   `scoreResult.prioridad`** (con `confidence`/coverage como aviso de cuánto se
   sabe, y `fortalezas`/`oportunidades`/criterios para la explicación).
3. **`scoreResult` es la única fuente de verdad del diagnóstico**: la UI lo
   consume tal cual — nunca re-ejecuta el motor ni reconstruye el contexto por
   su cuenta. Orden, veredicto, "¿Por qué?", fortalezas y oportunidades salen
   del mismo cálculo que ordenó la lista.

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
