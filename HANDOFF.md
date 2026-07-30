# HANDOFF — Prospect Engine (branch `feature/prospect-engine`)

**Fecha de cierre:** 2026-07-29 · **Estado:** completo y listo para integrar.
Documentos complementarios en `docs/`: `PROSPECT_ENGINE_ARQUITECTURA.md` (mapa
de capas y contrato de consumo), `PROSPECT_ENGINE_CONTRATO.md` (contrato fino
del motor), `SESSION_2026-07-28_prospect_engine.md` (journal con el porqué de
cada decisión), `BACKLOG_TECNICO_2026-07-28_prospeccion_y_sync.md` (B1–B9).

---

## 1. Resumen de la implementación

El Pipeline mayorista dejaba de lado el criterio comercial: ordenaba prospectos
por recencia (`stageRank * 100 + días sin contacto`). Este branch incorpora el
**motor de evaluación de prospectos de Atlas** (proyecto Python de Gustavo,
`/Users/Gustavo/Desktop/atlas/`, módulo `atlas/prospect/`) portado a JavaScript
puro, de modo que el Pipeline ordene por **valor comercial explicado**: cuánto
se le puede vender × qué tan buen cliente sería, con la evidencia detrás de
cada conclusión, admitiendo cuándo se sabe poco, y diciendo siempre el próximo
paso.

Se portó **únicamente el núcleo determinista** del motor. No se trajo el CRM de
Atlas, ni su descubrimiento web, ni sus adapters, ni su infraestructura, ni su
rúbrica de marketing digital: la rúbrica de Imports se escribió desde cero con
criterios del negocio mayorista.

**Los cinco principios del motor** (innegociables — un port que pierda
cualquiera de ellos no es el motor):

1. Toda señal es TRI: `si | no | sin_datos`. "No tiene" ≠ "no sabemos".
2. Lo que no se sabe **no puntúa ni pesa**: el total se normaliza sobre lo
   conocido y el hueco queda registrado como cobertura.
3. La confianza es un **gate**, no un adorno: con cobertura global < 0.35 un
   prospecto no puede ser prioridad alta/muy_alta.
4. La prioridad es **derivada**, jamás manual.
5. Toda conclusión **arrastra su evidencia** (cada criterio lleva sus fuentes).

**Equivalencia verificada con la implementación de referencia:** 10 casos de oro
exportados de los 37 prospectos reales de Atlas corren en los tests de ambos
repos y dan **idénticos al decimal** (fixture `src/lib/prospectScoring.golden.json`,
espejo de `atlas/prospect/tests/golden_cases.json`).

---

## 2. Arquitectura final

```
   Firestore (useFirebaseSync)                        Capa 5 · DATOS
   prospects · visits · clients · sales · products
                    │  props / useMemo
                    ▼
   src/lib/prospectSignals.js                         Capa 4 · ADAPTADOR
   prospectToSignals(prospect, {visits, clients, sales, products})
   → señales TRI { [id]: { valor, fuentes } }
                    │
                    │      src/lib/prospectRubric.js  Capa 4 · CONFIGURACIÓN
                    │      RUBRICA_IZN (izn-v1) — filas-dato, jamás lógica
                    ▼
   src/lib/prospectScoring.js                         Capa 4 · MOTOR
   construirScore(señales, rúbrica) → ScoreResult
                    │
                    ▼
   src/lib/prospectDiagnosis.js                       Capa 4 · LENGUAJE
   diagnostico() · proximoPaso() · avisoLista()
                    │
                    ▼
   src/prospecting.js · prioritizeProspects(prospects, now, contexto?)
                                                      Capa 3 · CEREBRO
   sin contexto → orden histórico por recencia (compat total)
   con contexto → banda → oportunidad ↓ → fit ↓ → confianza ↓
                    │
                    ▼
   src/lib/prospectRanking.js                         Capa 3.5 · FACHADA
   buildProspectRanking({...}) → { items, porId }
                    │
                    ▼
   Pipeline.jsx · ProspectDiagnosisModal.jsx          Capa 2 · PANTALLAS
   solo renderizan; cero lógica de negocio
```

**Regla dura de la arquitectura:** React importa **únicamente**
`src/lib/prospectRanking.js`. Nunca `prospectScoring`, `prospectSignals`,
`prospectRubric`, `prospectDiagnosis` ni `prioritizeProspects` directo.

`prospectScoring.js` no importa nada — es copiable a otro proyecto tal cual
(verificado corriéndolo aislado con Node, fuera del repo).

---

## 3. API pública del engine

### Fachada (lo único que consume la UI)

```js
import {
  buildProspectRanking,          // ({prospects, visits, clients, sales, products, now}) → {items, porId}
  ETIQUETA_PRIORIDAD,            // banda → etiqueta legible
  ETIQUETA_TRI,                  // "si"|"no"|"sin_datos" → "Sí"|"No"|"Sin datos"
  CALIFICACION_CAMPOS,           // 5 controles data-driven del modal de visita
  calificacionActual,            // (prospect) → estado del formulario, normalizado
  aplicarCalificacion,           // (prospect, cambios, {autor, at}) → prospecto nuevo
} from "./lib/prospectRanking.js";
```

Cada `item` (ordenado; `posicion` 1..n) y para qué sirve:

| Campo | Uso en UI |
|---|---|
| `prospect`, `stage`, `daysSinceContact` | datos de la tarjeta |
| `posicion` | ordenar columnas del kanban |
| `chip: {prioridad, etiqueta, aviso}` | chip de banda + aviso de poca información |
| `diagnostico` | `veredicto`, `sentencia`, `razones[3]`, `senalesVisitaFaltantes`, `enDetalle`, `confianzaBaja` |
| `scoreResult` | el "¿Por qué?": `opportunity/fit.criterios[]` con pregunta, valor TRI, puntos y fuentes |
| `proximoPaso` | `{tono, icono, texto, pendientes}` |
| `reason` | resumen corto de una línea |
| `rankKey` | **NADA** — clave técnica de ordenamiento, jamás se muestra |

**Valores de negocio mostrables al usuario:** `scoreResult.opportunity.total`,
`scoreResult.fit.total` y `scoreResult.prioridad` (más `confidence`/coverage
como aviso de cuánto se sabe). `rankKey` no es una magnitud y no debe
interpretarse comercialmente.

### Motor (uso interno del dominio)

```js
import {
  TRI, PRIORIDADES, MIN_CONF_PRIORIDAD,
  construirScore,      // (senales, rubrica, {prospectId?, at?}?) → ScoreResult
  construirDimension, derivarPrioridad, validarScore, redondearPy,
} from "./lib/prospectScoring.js";
```

Contrato completo en `docs/PROSPECT_ENGINE_CONTRATO.md`.

---

## 4. Componentes y módulos modificados

**Nuevos (dominio):** `src/lib/prospectScoring.js` · `prospectScoring.golden.json`
· `prospectRubric.js` · `prospectSignals.js` · `prospectDiagnosis.js` ·
`prospectRanking.js` (+ un `.test.js` por módulo).

**Nuevos (UI):** `src/components/wholesale/ProspectDiagnosisModal.jsx` ·
`src/components/Pipeline.test.jsx`.

**Modificados:**

| Archivo | Cambio |
|---|---|
| `src/prospecting.js` | `prioritizeProspects` gana 3er parámetro `contexto` (opcional). Sin contexto, comportamiento histórico intacto |
| `src/components/Pipeline.jsx` | consume la fachada: orden por `posicion`, chip + aviso, ficha de diagnóstico, calificación rápida en la visita |
| `src/App.jsx` | +1 prop: `sales={activeSales}` al `<Pipeline>` |
| `CLAUDE.md`, `docs/*`, `.gitignore` | documentación y ruido de sesión |

**Sin tocar:** `useFirebaseSync.js`, colecciones, `DashboardMayorista.jsx`,
`ProspectMap.jsx`, rutas, cuentas corrientes, conversión a mayorista, y todo el
lado minorista.

---

## 5. Cómo integrar al proyecto principal

1. **Push del branch** (hoy bloqueado: el usuario `gcontro99` no tiene permiso
   de escritura sobre `dcontro20/imports-zona-norte` — error 403). Requiere que
   Diego lo agregue como colaborador, o pushear desde una cuenta con acceso:
   `git push -u origin feature/prospect-engine`.
2. **Merge a `main`** vía PR. El branch parte de `1d67ee8` y no toca archivos de
   otras features, así que no se esperan conflictos.
3. **No requiere migración de datos, ni cambios de reglas de Firestore, ni
   variables de entorno, ni dependencias nuevas** (`package.json` sin cambios).
   El campo `prospect.calificacion` es aditivo: los prospectos viejos rinden
   `sin_datos` y el motor los procesa igual.
4. **Deploy:** el push a `main` dispara Vercel como siempre.
5. **Verificación post-merge sugerida:** abrir Pipeline en modo mayorista →
   las tarjetas de prospectos muestran chip de prioridad y quedan ordenadas por
   mérito; tocar el encabezado abre la ficha con el "¿Por qué?"; registrar una
   visita a un prospecto ofrece la calificación rápida.
6. **Mantenimiento de la fixture de oro:** si cambia el motor o la rúbrica del
   lado de Atlas, regenerar allá con
   `python3 -m atlas.prospect.tests.export_golden_cases`, correr
   `python3 -m atlas.prospect.tests.test_golden_cases`, y copiar el JSON a
   `src/lib/prospectScoring.golden.json`. **Nunca editarla a mano.**
   ⚠️ Los entregables de la Fase 0 (`golden_cases.json`, `test_golden_cases.py`,
   `export_golden_cases.py`) siguen **sin commitear en el repo de Atlas**.

---

## 6. Pendientes conocidos

Ninguno bloquea el merge. Detalle completo en
`docs/BACKLOG_TECNICO_2026-07-28_prospeccion_y_sync.md`.

| # | Qué | Impacto sobre esta entrega |
|---|---|---|
| **B1** 🔴 | `prospects`, `visits` y `routes` **nunca se persisten**: faltan los 3 `useEffect` de autosave en `useFirebaseSync.js:314-331`. Bug pre-existente (commit `f111e5d`, Fase 0.4 del pivote mayorista) | La UI funciona completa, pero prospectos, visitas y **calificaciones** viven solo en la sesión y se pierden al refrescar. Decisión explícita: no es prerequisito de esta entrega. Además bloquea la calibración de la rúbrica con datos reales |
| **B2** 🔴 | La Papelera lista prospectos/visitas/rutas pero no puede restaurarlos ni purgarlos (los mapas de setters omiten los 3 tipos) — no-op silencioso | Independiente del engine |
| **B8** 🟡 | `src/lib/dailyPlan.test.js > weekKey` falla por timezone (`'2026-06-08'` vs `'2026-06-09'`). Pre-existente, ajeno al engine | Es el único test rojo de la suite |
| **B9** 🟡 | `src/App.test.jsx` es flaky por timeout (5000ms) en la suite completa; pasa 4/4 aislado siempre | Ruido de CI, no funcional |
| B3–B7 🟠🟢 | Sin schema/backup de prospectos · `lat`/`lng` write-only · doble enum de etapas · "mayorista activo" inconsistente · menores (incluye el import muerto `Card` en `Pipeline.jsx`, presente ya en `main`) | Ninguno afecta el engine |

**Fuera de alcance, ya diseñado:** Fase 5 del plan original — el argumento de
venta (port de `quickwin.py` con regalos B2B) conectado a
`PresentationMessageModal`. No iniciado.

**Rúbrica congelada:** los pesos de `prospectRubric.js` (izn-v1) son el borrador
del diseño. Se calibran mirando el ranking real "a ojo" cuando haya prospectos
persistidos (requiere B1). Al calibrar se editan **filas y pesos**, jamás el
motor.
