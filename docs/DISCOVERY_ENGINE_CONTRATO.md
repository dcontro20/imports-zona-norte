# DISCOVERY ENGINE — Contrato de integración (F0)

**Fecha:** 2026-07-30 · **Branch:** `feature/discovery-engine` · **Estado:** propuesto (gate F0)

Contrato entre el Discovery Engine de Atlas (Python, repo
`/Users/Gustavo/Desktop/atlas/`) e Imports Zona Norte, bajo la **Opción B
aprobada**: cola de jobs en Firestore + worker en la Mac. Una vez aprobado en el
gate, este documento se CONGELA igual que `PROSPECT_ENGINE_CONTRATO.md`: las
fases F1–F4 lo implementan, no lo renegocian.

**Principio rector (fijado por Gustavo):** reutilizar el Discovery Engine al
máximo y **no bifurcar lógica respecto de Atlas**. El worker invoca exactamente
el mismo flujo que hoy usa Atlas.

---

## 1. Qué invoca el worker (mismo flujo que Atlas, verificado)

El CLI de Atlas (`prospectar.py descubrir`) es un envoltorio de ~10 líneas
alrededor de dos llamadas de dominio. El worker hace **esas mismas dos
llamadas**, con parámetros que ya existen:

```python
from atlas.prospect.discover import descubrir, get_discoverer
from atlas.prospect.prospect import Encargo

res = descubrir(
    Encargo(emisor=..., vertical="kiosco", ubicacion=job.ubicacion,
            fecha=hoy, tope_resultados=job.tope),
    get_discoverer("gosom"),
    root=IZN_ROOT,          # parámetro existente (default DATA de Atlas)
    termino=job.termino,    # parámetro existente (evita TERMINOS_POR_VERTICAL)
)
```

Invariantes de Atlas de las que este contrato depende (verificadas 2026-07-30):

| Invariante | Dónde | Efecto |
|---|---|---|
| `descubrir(encargo, discoverer, root=DATA, termino="")` | `discover.py:117` | `root` dedicado aísla TODO: store de prospectos, ledger de suprimidos, dedup por identidad y secuencia de ids |
| `termino` explícito ⇒ `TERMINOS_POR_VERTICAL` no se toca | `discover.py:127` | el término lo escribe Diego en el job; el catálogo médico queda intacto |
| `validate_encargo` exige vertical no-vacía y de catálogo, tope ≤ 100 | `prospect.py:214-227` | ver §2 (única alta requerida en Atlas) y techo del job |
| `Discoverer` es Protocol; adapter referenciado en un solo import lazy | `ports.py`, `discover.py:45` | la futura extracción a servicio (F5) no toca el dominio |
| Fail-loud: encargo inválido o prospecto con GRAVEs ⇒ excepción | `discover.py:121-153` | el worker NO traga errores: los sube al campo `error` del job |
| Idempotencia por identidad (`url:` / `nd:nombre\|dirección`) contra el root | `discover.py:79-85,142-149` | re-correr un job no duplica en el store IZN |

**Root IZN dedicado:** el store del worker vive FUERA del `.data` de Atlas
(propuesta: `~/.izn-discovery/`, gitignoreado en todos lados). Los prospectos
médicos de la agencia y los kioscos de IZN no se mezclan jamás — ni en el
store, ni en supresiones, ni en el dedup.

## 2. Único cambio requerido en Atlas (pendiente de OK explícito)

`validate_encargo` rechaza cualquier vertical fuera de `VERTICALES`
(`prospect.py:23`, hoy solo 4 verticales médicas), y con razón: el catálogo es
cerrado y crece "por gate, no por código" (filosofía documentada en
`discover.py:40-43`). El alta que este contrato necesita:

```python
# atlas/prospect/prospect.py
VERTICALES = ("dermatologia", "clinica_dermatologica", "cirugia_plastica",
              "medicina_estetica", "kiosco")
# atlas/prospect/discover.py
TERMINOS_POR_VERTICAL = { ..., "kiosco": "kiosco" }
```

Dos líneas de **datos** (el término del catálogo es solo default: el worker
siempre pasa `termino` explícito). Cero cambio de lógica, cero efecto sobre las
verticales existentes. Alternativas descartadas: vertical vacía (GRAVE: encargo
incompleto) y vertical falsa reutilizando una médica (mentira en la data; el
prefijo del `prospect_id` la arrastraría para siempre).

## 3. Contrato del job — colección `discoveryJobs`

Un documento por búsqueda de Diego. Fuera de `appData` (doc propio, no
JSON-string).

```
{
  id: string,               // uid() de IZN
  termino: string,          // lo que Diego escribió: "quioscos", "maxikiosco"...
  ubicacion: string,        // para Google Maps: "Palermo, CABA, Argentina"
  zona: string,             // etiqueta de zona IZN que se estampa al importar: "Palermo"
  tope: number,             // default 60 (TOPE_DEFAULT de Atlas) · techo 100 (anti-crawling de Atlas)
  status: "pendiente" | "en_curso" | "listo" | "error",
  counts: { descubiertos, suprimidos, duplicados } | null,   // resumen que devuelve descubrir()
  error: string,            // fail-loud: el texto de la excepción de Atlas, sin resumir
  createdBy: string, createdAt: ISO,
  startedAt: ISO, finishedAt: ISO,
}
```

**Quién escribe qué:** la app crea el doc en `pendiente` (única escritura de la
app sobre el job, salvo cancelar uno `pendiente`); el worker lo toma
(`en_curso` + `startedAt`), y lo cierra (`listo` con `counts`, o `error` con el
mensaje completo). `ubicacion` ≠ `zona` a propósito: una es el string para
Maps, la otra es la etiqueta que consumen las 3 señales de zona del Prospect
Engine.

## 4. Contrato del staging — colección `discoveryResults`

Un documento por job terminado, escrito por el worker vía Admin SDK. **El
worker jamás escribe `appData`** — el merge transaccional (S14.3) es de la app
y de nadie más.

```
{
  id: <jobId>,              // 1:1 con el job
  jobId, zona, termino, at: ISO,
  prospectos: [ <prospecto IZN, ya mapeado — ver §5> ],
}
```

La app lee el staging, muestra el modal de revisión (F2), y lo que Diego
confirma entra por `setProspects` → `smartSave` → merge S14.3 — el mismo camino
que el alta manual. Nada entra al Pipeline sin confirmación humana.

## 5. Mapping `Prospect` (Atlas) → prospecto IZN

Fuente: el `Prospect` que `descubrir()` devuelve/persiste (`_a_prospect`,
`discover.py:97-114`). Destino: el shape del alta manual de Pipeline
(`Pipeline.jsx:39`) + campos passthrough (los schemas son `.passthrough()`).

| Atlas | IZN | Nota |
|---|---|---|
| `negocio.nombre` | `businessName` | |
| `negocio.direccion` | `address` | |
| `negocio.telefono` | `phone` | clave fuerte de dedup (§6) |
| — (zona del **job**) | `zone` | editable en la revisión; alimenta `op_zona_sin_mayorista`, `fit_zona_reparto`, `op_producto_vecino` |
| — | `source: "descubrimiento"` | valor NUEVO en `PROSPECT_SOURCES` (cambio F2 en Imports; `op_referido` no se afecta: ≠"referido" ⇒ "no") |
| — | `contactName: ""` | el scraping no identifica decisor ⇒ `fit_decisor` rinde "no", honesto |
| `prospect_id` | `atlasProspectId` | passthrough; idempotencia de re-import (§6) |
| `negocio.web` / `redes[].url` | `web` | passthrough; Atlas ya separó red-social-como-web |
| `negocio.categoria`, `negocio.email` | `categoria`, `email` | passthrough |
| `google_business.rating` / `.reviews_count` / `.horarios_completos` | `rating`, `reviewsCount`, `horariosCompletos` | passthrough; **hoy NO alimentan señales** (rúbrica izn-v1 congelada) — se preservan para la calibración futura |
| `sources[0].via`, `encargo.{ubicacion,fecha}` | `via`, `descubiertoEn`, `descubiertoAt` | passthrough; procedencia (P1 de Atlas) |

Reglas: `id` y `createdAt` los pone el import de la app (el prospecto nace en
IZN al confirmarse, no antes); `pipelineStage: "prospecto"`; `calificacion`
ausente ⇒ las señales de visita rinden `sin_datos` ⇒ **el descubierto entra con
confianza baja, aviso ◍ y prioridad capada por el gate del engine — ese es el
comportamiento correcto y ya testeado, no un defecto**.

**Observación (sin acción):** `lat`/`lng` no viajan — Atlas los descarta en
`_a_prospect` (el `Prospect` persistido no tiene coordenadas). Costo real hoy:
cero — en IZN son write-only (B4, cero consumidores). Si algún día se quieren,
es un alta de campo en Atlas por su propio gate; no se bifurca acá.

## 6. Dedup del import (implementa F2, en JS puro)

Contra `activeProspects` **y** `activeClients` (aprobado: no prospectar a un
cliente actual). Claves, en orden de fuerza:

1. `atlasProspectId` igual ⇒ re-import del mismo descubrimiento (idempotencia).
2. Teléfono normalizado (solo dígitos, sin prefijo AR) ⇒ misma entidad.
3. Nombre+dirección normalizados (ascii-fold + minúsculas + colapso de
   no-alfanuméricos — la misma filosofía que `_claves_de`/`slug` de Atlas).

Duplicado ⇒ se reporta en el modal con su motivo, no se importa. La decisión
final es de Diego (el dedup contra clientes es imperfecto: clientes sin
dirección, teléfonos en formatos dispares).

## 7. Reglas Firestore (implementan F2/F3)

- `discoveryJobs`: read/write solo Diego (mismo criterio que el resto).
- `discoveryResults`: read solo Diego; escribe el worker vía Admin SDK (service
  account — precedente: `api/send-daily-push.js` — que no pasa por rules).

## 8. Compromisos verificables

1. **Ningún archivo del Prospect Engine se toca** (`src/lib/prospect*.js`,
   `prospecting.js`): los descubiertos entran por el camino del alta manual y
   el ranking existente los ordena solo.
2. **Ninguna lógica de Atlas se copia ni se bifurca**: el worker importa y
   llama; el único cambio en Atlas es el alta de catálogo del §2.
3. **El worker jamás escribe `appData`** (§4).
4. **Fail-loud punta a punta**: errores de Atlas llegan textuales al job.

## 9. Prerequisito B1 — resuelto en esta branch

`prospects`, `visits` y `routes` ahora persisten: 3 autosaves espejo en
`useFirebaseSync.js` + test de paridad `useFirebaseSync.autosave.test.js`
(invariante: toda key de `DATA_KEYS` tiene su `smartSave`; cubre la clase del
bug, no solo la instancia). B2 (Papelera sin estas colecciones) sigue en el
backlog — fuera de alcance acá.

## 10. Decisiones abiertas para el gate F0

- **D-F0.1** — OK para el alta de catálogo `"kiosco"` en Atlas (§2). Sin esto
  no hay encargo válido.
- **D-F0.2** — Dónde vive el puente F1 (mapping §5 + su test): (a) junto al
  worker en `scripts/discovery/` del repo de Imports (recomendado: el código
  IZN-specific no entra al repo de Atlas; tests pytest locales), o (b) en Atlas
  como `export_izn.py` (gana la infra pytest de Atlas, pero mete un consumidor
  externo adentro del dominio de la agencia).
