# IZN · Prospect Engine — Resumen autocontenido (Fases 0–4b)

**Fecha:** 2026-07-28 · **Branch:** `feature/prospect-engine` (11 commits, SIN
pushear — falta permiso de escritura de gcontro99) · **Tests:** 1036 → 1134
(+98 del engine, todos verdes) · **Estado:** capa de dominio e integración
COMPLETA y aprobada; queda exclusivamente la UI.

## Qué es

El Pipeline mayorista deja de ordenar prospectos por recencia
(`stageRank*100 + días`) y pasa a ordenarlos por **valor comercial explicado**:
cuánto se le puede vender × qué tan buen cliente sería, con evidencia detrás de
cada conclusión, admitiendo cuándo sabe poco, y diciendo siempre el próximo
paso. Es el port del motor de Atlas Prospect Intelligence (Python) a JS puro.

## Los 5 principios del motor (innegociables)

1. Toda señal es TRI (`si | no | sin_datos`) — "no tiene" ≠ "no sabemos".
2. Lo que no se sabe no puntúa NI pesa (normalización sobre lo conocido).
3. La confianza es un gate: cobertura < 0.35 ⇒ nunca prioridad alta/muy_alta.
4. La prioridad es derivada, jamás manual.
5. Toda conclusión arrastra sus fuentes (el "¿Por qué?" siempre disponible).

## Archivos (todos en `src/lib/`, todos con test colocado)

| Archivo | Rol |
|---|---|
| `prospectScoring.js` | MOTOR genérico — port fiel, cero imports, portable tal cual. `redondearPy` replica el round() de Python (idéntico al decimal) |
| `prospectScoring.golden.json` | 10 casos de oro reales — copia byte-idéntica de la fixture de Atlas; se regenera SOLO allá |
| `prospectRubric.js` | Rúbrica izn-v1 como datos (8 oportunidad + 5 fit) — **CONGELADA** hasta calibrar con prospectos reales |
| `prospectSignals.js` | Adaptador prospecto→señales TRI + `CALIFICACION_CAMPOS` + `aplicarCalificacion` |
| `prospectDiagnosis.js` | Número → lenguaje: veredicto, 3 razones, sentencia, próximo paso por etapa |
| `prospectRanking.js` | **LA FACHADA** — único import permitido para la UI |

Más: `src/prospecting.js` ganó el tercer parámetro `contexto` en
`prioritizeProspects` (sin contexto = comportamiento histórico intacto).

## El contrato para quien haga la UI

```js
import { buildProspectRanking, CALIFICACION_CAMPOS, aplicarCalificacion }
  from "../lib/prospectRanking.js";   // ÚNICO import del engine

const { items, porId } = buildProspectRanking({ prospects, visits, clients, sales, products });
```

Cada item: `posicion` (ordenar columnas), `chip {prioridad, etiqueta, aviso}`
(tarjeta), `diagnostico` (modal), `scoreResult` (el "¿Por qué?" criterio a
criterio con fuentes), `proximoPaso`, `prospect/stage/daysSinceContact`.
**`rankKey` jamás se muestra**; los valores de negocio mostrables son
`opportunity.total`, `fit.total` y `prioridad`. Detalle campo por campo:
`docs/PROSPECT_ENGINE_ARQUITECTURA.md`.

**Alcance UI aprobado:** Pipeline con `sales={activeSales}` (U1), columnas por
`posicion` (U2), chip + aviso (U3), bloque Diagnóstico + "¿Por qué?" en el
modal del prospecto, calificación rápida en el modal de visita (5 controles
data-driven + `aplicarCalificacion` + `logAudit`). DashboardMayorista NO se
toca (U4). Nada de esto está construido.

## Decisiones cerradas (Gustavo) y avisos

- D1–D7 (semántica de señales) y el contrato `rankKey`/`scoreResult`: ver
  `docs/SESSION_2026-07-28_prospect_engine.md`. No reabrir sin Gustavo.
- **B1**: los prospectos/visitas NO se persisten a Firestore (bug pre-existente
  solo documentado) ⇒ la calificación de visita será **efímera** hasta que B1
  se resuelva como tarea independiente. Aceptado explícitamente.
- Backlog completo B1–B9: `docs/BACKLOG_TECNICO_2026-07-28_prospeccion_y_sync.md`.
- Fase 5 (argumento de venta con quickwin B2B en PresentationMessageModal):
  diseñada en el plan de Atlas, NO iniciada.

## Verificación de equivalencia Python ↔ JS

Los 10 casos de oro corren en ambos repos: `test_golden_cases.py` (Atlas) y
`prospectScoring.test.js` (acá). Si Atlas cambia el engine o su rúbrica, su
test detecta la fixture vieja; se regenera con
`python3 -m atlas.prospect.tests.export_golden_cases` y se copia el JSON acá.

## Commits de la sesión

`2def3be` backlog B1–B7 · `25d2031` F1 motor · `32ddb43` B8 · `744890d`
contrato del motor · `6f3a017` F2 rúbrica+señales · `e1305bd` doc arquitectura
· `44085b7` F3 enchufe · `33a6062` B9 · `76d2cb3` rankKey + contrato cerrado ·
`3dcfc8f` F4a diagnóstico · `33ec3a0` F4b fachada.
