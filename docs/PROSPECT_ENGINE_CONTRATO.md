# Contrato público del motor — `src/lib/prospectScoring.js`

Motor genérico de evaluación de prospectos. Port fiel del núcleo puro de Atlas
Prospect Intelligence (`score.py` + `scorer.py`), verificado idéntico al decimal
contra 10 casos de oro reales (`src/lib/prospectScoring.golden.json`).

Este documento ES el contrato: alcanza para usar el motor sin leer la
implementación. Diseño de origen: `PROSPECT_ENGINE_DESIGN.md` (repo Atlas) §3–5.

---

## 1. Qué es

Una librería **pura y determinista** que convierte señales TRI sobre un
prospecto en un score explicable de dos dimensiones (oportunidad y encaje) con
prioridad derivada y confianza explícita. Sin I/O, sin red, sin reloj, sin
aleatoriedad, sin dependencias — ni de npm ni de Imports. Corre igual en
browser, Node o cualquier bundler con ES modules y BigInt.

**El motor no sabe qué es un prospecto, una visita, una zona ni Firestore.**
Todo conocimiento del negocio entra por dos vías de datos: las señales (las
produce un adaptador externo) y la rúbrica (configuración).

## 2. Qué recibe

### Señales — `{ [id]: { valor, fuentes } }`

| Campo | Tipo | Semántica |
|---|---|---|
| `valor` | `"si" \| "no" \| "sin_datos"` | TRI. "No" y "no sabemos" son cosas distintas |
| `fuentes` | `string[]` | ids opacos de evidencia (`"visita_2026-07-25"`, `"zonesCoverage"`). El motor no los interpreta, solo los arrastra |

- Señal **ausente** para una fila de la rúbrica ⇒ se evalúa `sin_datos`
  (prospecto viejo + señal nueva degrada honesto, sin migración).
- El motor **no defiende** valores fuera de TRI (fidelidad al original, donde
  los evaluadores garantizan TRI): un valor extraño cuenta como conocido sin
  puntos. `validarScore` lo reporta como GRAVE.

### Rúbrica — `{ version, oportunidad: [fila], fit: [fila] }`

Cada fila es **dato, no código**:
`{ id, pregunta, peso, fraseOportunidad, fraseFortaleza }` con `peso` numérico
positivo y frases `string | null`. Cambiar la rúbrica = editar filas y subir
`version`; el motor no se toca jamás.

### Opciones — `{ prospectId?, at? }`

Metadata de passthrough: viajan al resultado sin interpretarse. `at` NO se usa
para ningún cálculo (no hay lógica de fechas en el motor: si una señal depende
del tiempo, la evalúa el adaptador).

## 3. Qué devuelve — `ScoreResult`

```js
{
  prospectId: "",            // passthrough
  at: "",                    // passthrough
  rubricVersion: "izn-v1",   // rubrica.version
  opportunity: {             // y fit, con la misma forma
    total: 60,               //   0..100 normalizado sobre lo CONOCIDO, redondeo 1
                             //   decimal — o null si ninguna señal es conocida
    coverage: 0.526,         //   pesoConocido/pesoTotal, 0..1, redondeo 3 — null
                             //   solo si la rúbrica está vacía
    resumen: "2/3 criterios con datos",
    criterios: [             //   EN EL ORDEN de la rúbrica, uno por fila
      { id, pregunta, valor, //   valor TRI evaluado
        puntos,              //   peso si "si", 0 si "no" o "sin_datos"
        fuentes }            //   evidencia solo si valor es "si"/"no"; si no, []
    ],
  },
  fit: { … },
  prioridad: "alta",         // "muy_alta"|"alta"|"media"|"baja" — DERIVADA; ""
                             // si alguna dimensión quedó sin total
  confidence: 0.409,         // peso conocido global / peso total global, redondeo 3
  fortalezas: ["…"],         // frases: fit que dispara + oportunidad en "no"; dedup
  oportunidades: ["…"],      // frases de oportunidad que disparan ("si"); dedup
}
```

## 4. Invariantes que garantiza

1. **Determinismo puro**: misma entrada ⇒ mismo resultado, siempre. No lee
   reloj, entorno ni estado. No muta sus entradas.
2. **Lo que no se sabe no puntúa ni pesa**: `sin_datos` queda fuera del
   numerador y del denominador; el total se normaliza sobre lo conocido y el
   hueco queda registrado en `coverage`/`confidence`.
3. **La prioridad es derivada, jamás manual**: bandas por totales (ambas ≥80 ⇒
   muy_alta; ambas ≥60 ⇒ alta; una sola ≥60 ⇒ media; nada ⇒ baja) y **gate de
   confianza**: con `confidence < 0.35` (estricto), alta/muy_alta degradan a
   media. `confidence null` desactiva el gate (compat histórica).
4. **Toda conclusión arrastra su evidencia**: cada criterio medido conserva sus
   `fuentes`; `sin_datos` viaja con evidencia vacía, nunca inventada.
5. **Equivalencia numérica con el engine Python de Atlas**: el redondeo replica
   `round()` de Python (half-to-even sobre el binario exacto — `redondearPy`).
   Verificado por los 10 casos de oro, idénticos al decimal, en CI de ambos
   repos (`test_golden_cases.py` en Atlas, `prospectScoring.test.js` acá).
6. **Orden estable**: criterios en el orden de la rúbrica; fortalezas = fit
   primero, luego oportunidad; dedup conserva primera aparición.

## 5. Qué deliberadamente NO hace

- **No evalúa prospectos**: no conoce el documento Firestore ni ninguna otra
  forma de prospecto. Traducir prospecto→señales es de `prospectSignals.js`
  (Fase 2).
- **No trae rúbrica**: no hay ni una fila embebida. La rúbrica de Imports vive
  en `prospectRubric.js` (Fase 2); la de Atlas jamás entra a producción.
- **No persiste ni lee** nada. El score es derivado y reproducible
  ("derivar, no almacenar").
- **No lanza excepciones por scores inválidos**: a diferencia del `build_score`
  original (que hace `raise` con GRAVEs), acá `validarScore(score)` devuelve la
  lista de problemas y el llamador decide la política.
- **No ordena listas de prospectos** (eso es el cuerpo nuevo de
  `prioritizeProspects()`, Fase 3), **no genera lenguaje** (diagnóstico y
  argumento son `prospectDiagnosis.js`, Fases 4–5), **no interpreta fechas**.
- **No porta la capa interpretada de Atlas** (`lecturas`, `provenance`): solo
  la capa medida determinista.

## 5.bis Qué mostrar al usuario

Los valores de negocio del ScoreResult son `opportunity.total`, `fit.total` y
`prioridad` (con `confidence` como aviso de cobertura y los criterios/frases
como explicación). El `rankKey` que `prioritizeProspects` deriva de este
resultado (ver `PROSPECT_ENGINE_ARQUITECTURA.md`) es una clave técnica de
ordenamiento: **jamás se muestra ni se interpreta comercialmente**.

## 6. Fuera de contrato

`derivarPrioridad` exige totales numéricos; llamarla con `null` no está
definido (el original Python tira TypeError; en JS `Number(null)=0`).
`construirScore` nunca la llama con totales null — deriva `prioridad: ""`.

## 7. API

```js
import {
  TRI, PRIORIDADES, MIN_CONF_PRIORIDAD,          // catálogos/constante del gate
  construirScore,      // (senales, rubrica, {prospectId?, at?}?) → ScoreResult
  construirDimension,  // (senales, filas, {esOportunidad}) → {dimension, fortalezas, disparos, pesoConocido, pesoTotal}
  derivarPrioridad,    // (oppTotal, fitTotal, confidence?, minConf?) → banda
  validarScore,        // (score) → ["GRAVE: …", …]  (vacío = válido)
  redondearPy,         // (x, ndigits) → number — round() de Python exacto
} from "./prospectScoring.js";
```

La fixture `prospectScoring.golden.json` es copia byte-idéntica de
`atlas/prospect/tests/golden_cases.json`. Si Atlas cambia el engine o la
rúbrica: regenerar allá (`export_golden_cases.py`), correr sus tests, y copiar
el archivo acá. Nunca editarla a mano.
