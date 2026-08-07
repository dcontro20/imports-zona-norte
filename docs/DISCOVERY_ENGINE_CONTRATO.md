# DISCOVERY ENGINE — Contrato (v2, capacidad propia)

**Fecha:** 2026-07-30 · **Branch:** `feature/discovery-engine` · **Estado:** ✅ **CONGELADO** (gate F1 aprobado por Gustavo, 2026-07-30)

**v2 reemplaza a v1** (misma fecha): la v1 describía un puente donde el worker
invocaba código de Atlas en runtime. Por decisión de Gustavo, el objetivo es
otro: **el Prospect Intelligence es una capacidad PROPIA de Imports**. Atlas
queda únicamente como **implementación de referencia** — genera las fixtures y
valida el port, igual que con el Prospect Engine. Ningún código de Atlas corre
en producción de Imports. Al aprobarse el gate, este documento se CONGELA.

Lo que NO cambió de v1: la topología aprobada (Opción B — cola de jobs en
Firestore + worker en la Mac + staging + revisión de Diego — la revisión pasó
a ser la etapa `por_analizar` por la enmienda del §4), los shapes de
`discoveryJobs` y `discoveryResults`, el dedup del import y los compromisos de
escritura. B1 sigue resuelto como prerequisito.

---

## 1. Arquitectura: los módulos propios

**Dominio puro** — `src/lib/discovery/` (en la suite de Vitest; ESM plano,
ejecutable por la app y por Node):

| Módulo | Port de (referencia) | Rol |
|---|---|---|
| `gosomParse.js` | `parse_gosom_record` + `_horarios_completos` (`discover_gosom.py`) | registro NDJSON → RawBusiness. P6 en origen: reviews/fotos/owner/popular_times/about se descartan acá |
| `identity.js` | `slug` / `_claves_de` / `_red_de` (`discover.py`) | **única fuente de identidad** del discovery: la usan el runner, el dedup del import (F2) y la supresión. Incluye la semántica netloc de urlparse (web sin esquema ⇒ no es red) |
| `discoverRun.js` | núcleo de decisiones de `descubrir()` (`discover.py`) | runner PURO por inyección: `{raws, tope, existentes, suprimidos}` → `{descubiertos, saltadosSuprimidos, saltadosDuplicados}`. P2 (tope manda, techo 100), P5 (suprimido antes que duplicado), idempotencia, fail-loud. + `validarBusqueda` (el validate_encargo de IZN) |
| `mapProspect.js` | — (especifica el §5; sin equivalencia que validar) | RawBusiness → prospecto IZN directo. El envoltorio de dominio de Atlas (Prospect/Encargo/Source) no se porta: era su dominio, el nuestro es el doc de Pipeline |

**Efectful** — `scripts/discovery/` (F3, territorio de `backup.mjs`): adapter
del binario gosom en Node (misma invocación: depth por tope, `-c 1`,
`-exit-on-inactivity 3m`, timeout 1800s, telemetría off), worker de jobs,
LaunchAgent. El binario (tercero: gosom/google-maps-scraper v1.17.2) es copia
PROPIA gestionada por Imports — nada apunta al repo de Atlas.

**Diferencia arquitectónica deliberada respecto de la referencia:** en Atlas el
estado del runner (identidades vistas, suprimidos) sale del filesystem; acá lo
inyecta el llamador (el worker lo arma desde Firestore). Mismo comportamiento,
validado por fixture; más testeable.

## 2. Rol de Atlas: referencia y nada más

- **Fixtures golden**: `izn_discovery_golden.json` se genera SOLO en Atlas
  (`atlas/prospect/tests/export_izn_discovery_fixtures.py`) con una corrida
  REAL de gosom (kiosco / Palermo) + replays determinísticos, y se copia
  **byte-idéntica** a `src/lib/discovery/izn_discovery.golden.json`. Misma
  regla que `prospectScoring.golden.json`.
- **Equivalencia sin tolerancias** (`izn_discovery.golden.test.js`): parser
  registro a registro (26 casos: 20 reales + 6 sintéticos que fuerzan las
  mañas), identidad (claves/red/slug) por registro, y decisiones del runner en
  3 corridas (root limpio / idempotencia / supresión P5). Si un test falla, el
  port está mal — la fixture no se "ajusta".
- **Alta `kiosco` en Atlas** (aprobada con rol acotado): 2 líneas de catálogo
  (`VERTICALES` + `TERMINOS_POR_VERTICAL`), usadas SOLO para generar fixtures
  y medir calidad de data. No son dependencia de producción.
- **P6 también en la fixture**: los registros crudos se proyectan a los campos
  que el parser lee; el contenido descartado (reviews con copyright, fotos,
  datos del dueño) no se versiona en ningún repo.
- **Fork asumido**: después de la validación, la copia de Imports es soberana.
  Si el discovery de Atlas evoluciona, Imports no lo hereda — el mismo trato
  que el Prospect Engine.

## 3. Contrato del job — colección `discoveryJobs`

Un documento por búsqueda de Diego. Fuera de `appData` (doc propio, no
JSON-string).

```
{
  id: string,               // uid() de IZN
  termino: string,          // lo que Diego escribió: "quioscos", "maxikiosco"...
  ubicacion: string,        // para Google Maps: "Palermo, CABA, Argentina"
  zona: string,             // etiqueta de zona IZN que se estampa al importar: "Palermo"
  tope: number,             // default 60 · techo 100 (anti-crawling, heredado como regla propia)
  status: "pendiente" | "en_curso" | "listo" | "error",
  counts: { descubiertos, suprimidos, duplicados } | null,
  error: string,            // fail-loud: el error textual, sin resumir
  createdBy: string, createdAt: ISO,
  startedAt: ISO, finishedAt: ISO,
}
```

**Quién escribe qué:** la app crea el doc en `pendiente` (y puede cancelar uno
`pendiente`); el worker lo toma (`en_curso`) y lo cierra (`listo`/`error`).
`ubicacion` ≠ `zona` a propósito: una va al proveedor, la otra la consumen las
3 señales de zona del Prospect Engine. `validarBusqueda` corre en la app al
crear Y en el worker antes de scrapear (P2: validar antes de tocar la red).

## 4. Contrato del staging — colección `discoveryResults`

Un documento por job terminado, escrito por el worker vía Admin SDK. **El
worker jamás escribe `appData`** — el merge transaccional (S14.3) es de la app.

```
{
  id: <jobId>, jobId, zona, termino, at: ISO,
  prospectos: [ <prospecto IZN, ya mapeado — §5> ],
}
```

La app lee staging y lo ingiere; las altas entran por `setProspects` →
`smartSave` → merge S14.3 — el camino del alta manual.

> ### ⚠️ ENMIENDA (2026-08-06 · ciclo v2 F2 · aprobada por Gustavo)
>
> **Lo que decía:** *"la app muestra el modal de revisión (F2) y lo que Diego
> confirma entra… Nada entra al Pipeline sin confirmación humana."*
>
> **Lo que rige ahora:** la app **ingiere el staging al llegar** — sin modal.
> Los descubiertos entran solos como prospectos en la etapa operativa
> `por_analizar` (`ingresoAutomatico: true`, sin `analizadoAt`) y el análisis
> humano dejó de ser un modal para ser una **etapa del trabajo**.
>
> **El compromiso que reemplaza al viejo:** *nada se **CONTACTA** sin análisis
> humano.* Un prospecto en `por_analizar` no se propone para trabajar en la
> pantalla Hoy ni admite acción de contacto; sale de ahí con el tap "✓
> Trabajar" (o se descarta).
>
> **Lo que NO cambió:** el worker (idéntico, sigue sin tocar `appData`), el
> shape del staging, el dedup (§6 — las MISMAS funciones puras, ahora dentro
> de `ingestarDescubiertos()`), la supresión con memoria (§7) y las reglas
> (§8). El filtro de rubro sigue siendo humano: se ejerce al analizar en vez
> de al importar.
>
> **Nuevo por la enmienda:** ids **determinísticos** — `dsc_<placeId>`, o
> `dsc_nd_<hash djb2 de la clave nd>` sin placeId. Sin humano que confirme, el
> id no puede ser aleatorio: dos clientes abiertos ingiriendo el mismo staging
> tienen que producir el mismo prospecto para que el merge S14.3 lo absorba.
> Un descubierto sin placeId **y** sin nombre+dirección no tiene identidad
> derivable: recibe `uid()` y su ingesta no es idempotente (el mismo caso que
> ya no se puede suprimir, por la misma razón).
>
> Origen: `docs/PROSPECT_CRM_EJECUCION_SPEC.md` §5.

## 5. Mapping RawBusiness → prospecto IZN (`mapProspect.js`)

| Origen (RawBusiness) | Prospecto IZN | Nota |
|---|---|---|
| `nombre` | `businessName` | |
| `direccion` | `address` | |
| `telefono` | `phone` | clave fuerte de dedup (§6) |
| zona del **job** | `zone` | editable en la revisión; no se infiere de la dirección |
| — | `source: "descubrimiento"` | valor nuevo en `PROSPECT_SOURCES` (F2); `op_referido` no se afecta |
| — | `contactName: ""` | el scraping no identifica decisor ⇒ `fit_decisor` rinde "no", honesto |
| `latitud` / `longitud` | `lat` / `lng` | **viajan** (mejora del port: la referencia los perdía en su envoltorio); ausentes ⇒ `""` como el form |
| — | `pipelineStage: "prospecto"` | |
| `id_externo`, `url_origen`, claves del runner | `placeId`, `urlOrigen`, `clavesIdentidad` | procedencia + idempotencia (§6) |
| término/ubicación/fecha del job, via | `descubiertoTermino`, `descubiertoEn`, `descubiertoAt`, `via` | procedencia (espíritu P1) |
| `web`, red detectada | `web`, `redSocial` | la URL siempre queda en `web`; `redSocial` etiqueta la plataforma (facebook/instagram/tiktok/linktree) o `""` |
| `categoria`, `email`, `rating`, `reviews_count`, `horarios_completos` | `categoria`, `email`, `rating`, `reviewsCount`, `horariosCompletos` | passthrough para calibración futura — **hoy NO alimentan señales** (rúbrica congelada) |

**Regla sobre `categoria` (aclaración del gate F1):** es un hecho INFORMATIVO.
La categorización de Maps es inconsistente (la corrida real trajo "Kiosco",
"Quiosco", "Heladería", "Comercio" y "Tienda de golosinas" para la misma
búsqueda), así que **ningún código filtra, matchea ni deduplica por categoría —
ni ahora ni en F2/F3**. La búsqueda se basa en el término que ingresa Diego; el
filtro de rubro es humano — desde la enmienda del §4, al analizar.

`id` y `createdAt` los pone el import de la app al confirmar Diego. La señales
del engine leen `zone`/`phone`/`source`/`calificacion` — un descubierto entra
con confianza baja, aviso ◍ y prioridad capada: comportamiento correcto y ya
testeado, no un defecto.

## 6. Dedup del import (F2, JS puro, sobre `identity.js`)

Contra `activeProspects` **y** `activeClients`. Claves, en orden de fuerza:

1. `placeId` / `clavesIdentidad` coincidentes ⇒ re-import del mismo
   descubrimiento (idempotencia).
2. Teléfono normalizado (solo dígitos, sin prefijo AR) ⇒ misma entidad.
3. Nombre+dirección vía `clavesDe` (mismo módulo que el runner — si dos partes
   calcularan claves distinto, el dedup se parte).

Duplicado ⇒ no se importa (con la enmienda del §4 tampoco se ofrece: la
ingesta lo saltea y lo deja contado en el resumen del `logAudit`).

## 7. Supresión y rehabilitación (aprobado 2026-07-30)

El equivalente IZN del ledger P5 de Atlas: **descartar recuerda**.

- Nueva key de `appData`: **`discoverySuppressed`** — entra a `DATA_KEYS` con
  su autosave (el test de paridad B1 lo exige solo). La escribe SOLO la app.
- Al descartar un descubierto se registra su identidad:
  `{ id, nombre, direccion, web, claves, motivo, at, by }`. Desde la enmienda
  del §4 el descarte ya no ocurre en un modal previo sino sobre el prospecto
  ya ingerido (`prospectActions.descartar`: suprime la identidad **y**
  soft-borra el prospecto).
- El worker la LEE (junto con las identidades de prospectos/clientes) y pasa
  las entradas a `discoverRun` como `suprimidos`: un descartado no vuelve a
  aparecer en ninguna búsqueda futura.
- **Rehabilitación explícita**: pantalla/lista de suprimidos con acción
  "rehabilitar" que elimina la entrada (con `logAudit`). Sin rehabilitar, el
  bloqueo es permanente.
- Regla heredada de la referencia: una supresión sin identidad suficiente
  (web, o nombre+dirección) no se guarda — un bloqueo que no puede matchear es
  un hueco silencioso.

## 8. Reglas Firestore (F2/F3)

- `discoveryJobs`: read/write solo Diego.
- `discoveryResults`: read solo Diego; escribe SOLO el worker vía Admin SDK
  (service account — precedente `api/send-daily-push.js`). **Precisión
  aprobada en el gate F2:** la app puede además BORRAR el doc ya consumido en
  la ingesta — es el ciclo de vida del staging, no una escritura de
  contenido. Rules: `create`/`update` denegados; `read`/`delete` owner.

## 9. Compromisos verificables

1. **Ningún archivo del Prospect Engine se toca**; los descubiertos entran por
   el camino del alta manual y el ranking existente los ordena solo.
2. **Ningún código de Atlas corre en producción de Imports**; la relación es
   solo fixtures + validación de equivalencia.
3. **El worker jamás escribe `appData`** (§4); la supresión la escribe solo la
   app (§7).
4. **Fail-loud punta a punta**: errores del proveedor llegan textuales al job;
   un raw sin nombre es excepción, no un registro pisado.

## 10. Prerequisito B1 — resuelto

3 autosaves espejo (`60b368b`) + test de paridad
`useFirebaseSync.autosave.test.js` (toda key de `DATA_KEYS` tiene su
`smartSave`). B2 (Papelera sin estas colecciones) sigue en backlog.

## 11. Decisiones cerradas

- **D-F0.1** ✅ alta `kiosco` en Atlas — aprobada con rol acotado (§2).
- **D-F0.2** — disuelta: no hay puente que ubicar; el mapping es parte del
  dominio propio (`mapProspect.js`).
- **Supresión** ✅ con memoria y rehabilitación explícita (§7).
