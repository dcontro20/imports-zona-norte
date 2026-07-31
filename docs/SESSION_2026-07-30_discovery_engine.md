# SESSION 2026-07-30 — Discovery Engine: de puente a capacidad propia (F0–F3)

Sesión dirigida por Gustavo con gates por fase (continuación del Prospect
Engine, ya mergeado y en producción como `15392c4`). Branch:
`feature/discovery-engine` sobre `main`. Contrato congelado:
`docs/DISCOVERY_ENGINE_CONTRATO.md` (v2). Setup del worker:
`scripts/DISCOVERY_SETUP.md`.

## El pivote de arquitectura (la decisión que define la sesión)

El plan original (v1 del contrato) era un **puente**: worker en la Mac
invocando el `descubrir()` de Atlas en runtime. Gustavo lo corrigió con una
frase que reordenó todo: *"El objetivo no es integrar Atlas con Imports...
quiero portar el Prospect Intelligence a Imports como una capacidad propia,
igual que hicimos con el Prospect Engine."*

Consecuencias:
- **Atlas pasó de dependencia de runtime a implementación de REFERENCIA**:
  genera fixtures y valida equivalencia; ningún código suyo corre en
  producción de Imports.
- El insight que lo habilitó: la única dependencia irreducible del discovery
  es el **binario gosom**, que no es código de Atlas — es un tercero que
  Atlas también se limita a invocar. Todo lo demás (~400 líneas) es lógica
  portable.
- **D-F0.2 (dónde vive el puente) se disolvió**: no hay puente. El mapping es
  dominio propio (`mapProspect.js`), y el envoltorio Prospect/Encargo/Source
  de Atlas no se porta (era SU dominio; el nuestro es el doc de Pipeline).
- **Fork asumido a conciencia**: tras la validación, la copia es soberana —
  el mismo trato que el engine.
- Bonus concreto del mapping directo: **lat/lng viajan** (Atlas los perdía en
  `_a_prospect`; contra B4 eso era costo cero, pero recuperarlos fue gratis).

Lo que NO cambió: topología Opción B (cola de jobs en Firestore + worker en
la Mac de Gustavo + staging + revisión de Diego).

## F0 — Prerequisitos (`60b368b`, `23079cd`)

- **B1 RESUELTO** (aprobación explícita — era bloqueante: sin persistencia,
  todo descubierto se evaporaba): 3 autosaves espejo en `useFirebaseSync.js`.
  El test nuevo `useFirebaseSync.autosave.test.js` verifica el INVARIANTE
  sobre el fuente (toda key de DATA_KEYS tiene su smartSave) — cubre la
  clase del bug ("colección registrada a medias"), no la instancia. Pagó
  solo en F2: al agregar `discoverySuppressed` exigió su autosave.
- Verificación en Atlas: `descubrir(encargo, discoverer, root=, termino=)` ya
  tenía los parámetros necesarios; el único cambio fue el **alta de catálogo
  `kiosco`** (2 líneas de datos), aprobada con rol acotado: SOLO
  fixtures/de-risk, no producción.

## F1 — Port del dominio puro + equivalencia golden (`032c387`, `c04b3d3`, `3b7505b`)

`src/lib/discovery/`: `gosomParse.js` (con las mañas replicadas a propósito:
rating 0⇒null, count 0 se conserva, typo `longtitude`, P6 en origen),
`identity.js` (slug/claves/red — **única fuente de identidad** del discovery,
incluida la semántica netloc de urlparse: web sin esquema no es red),
`discoverRun.js` (runner puro por inyección — en Atlas el estado sale del
filesystem, acá lo inyecta el llamador) y `mapProspect.js`.

**Método golden, mismo estándar que el engine**: corrida REAL de gosom
("kiosco" / Palermo) exportada por
`atlas/prospect/tests/export_izn_discovery_fixtures.py` con un
`ReplayDiscoverer` determinístico (el Protocol lo permite — una sola corrida
de red, tres corridas de runner: limpia / idempotencia / supresión P5).
Fixture byte-idéntica entre repos, se regenera SOLO en Atlas. **Equivalencia
sin tolerancias verde al primer intento**: 26 registros de parse (20 reales +
6 sintéticos), identidad y decisiones del runner idénticos.

Dos hallazgos de la corrida:
- **P6 también en la fixture**: la primera versión pesaba 444KB porque los
  registros crudos traían user_reviews/fotos/owner — lo que P6 manda
  descartar iba a entrar al repo. El script ahora proyecta los inputs a los
  campos que el parser lee (84KB) y un test golden custodia esa sanidad.
- **De-risk de calidad gosom-kioscos**: 100% dirección/rating/place_id/
  horarios, 45% teléfono, 45% web. Identidad y dedup sólidos. La `categoria`
  de Maps es inconsistente ("Kiosco", "Quiosco", "Heladería", "Comercio") —
  quedó como REGLA en el §5 del contrato: categoría es informativa, ningún
  código filtra/matchea/deduplica por ella; el término manda y el filtro de
  rubro es humano.

Contrato v2 CONGELADO en el gate F1.

## F2 — Ingesta en la app (`a9514e1`)

- `discoveryImport.js` sobre `identity.js`: dedup en orden de fuerza
  (placeId/claves → teléfono AR normalizado → nombre+dirección), contra
  prospectos Y clientes vivos, con motivo nominal. Distinción deliberada:
  **borrar en Papelera no bloquea el re-descubrimiento; descartar sí** — esa
  es la diferencia entre borrar y suprimir.
- **Supresión con memoria** (decisión de Gustavo): descartar registra la
  identidad en `discoverySuppressed` (appData, autosave); rehabilitar es
  explícito con logAudit. Regla heredada P5: sin identidad suficiente (web o
  nombre+dirección) el descarte es sin memoria, y la UI lo avisa.
- UI en Pipeline: banner por búsqueda terminada → modal de revisión con
  toggle importar/descartar por ítem → los importados nacen por el camino
  del alta manual (uid + fechas) y **el ranking del engine los ordena solo**
  (cero cambios en `src/lib/prospect*`).
- Infra: suscripción read-only a `discoveryResults` (patrón backupStatus),
  `"descubrimiento"` en PROSPECT_SOURCES, reglas Firestore.
- **Precisión al §8 aprobada en el gate**: la app puede BORRAR el doc de
  staging consumido (ciclo de vida, no escritura de contenido). Rules:
  `create/update: false`, `read/delete` owner.

## F3 — Búsqueda desde la app + worker propio (`779c5e8`, `35d652e`)

- **UI**: 🔎 Descubrir (form validado por `validarBusqueda`; ubicación se
  compone desde la zona si falta), filas de estado de jobs en vivo (en cola /
  buscando / error TEXTUAL — fail-loud hasta la pantalla) con cancelación.
- **Worker** (`scripts/discovery/`): `gosomAdapter.mjs` fiel a la referencia
  (depth por tope, `-c 1`, exit-on-inactivity 3m, telemetría off, tolera
  exit≠0 si el archivo de resultados existe) + `worker.mjs` con Admin SDK y
  **claim transaccional** (el LaunchAgent corre cada 5 min y un scrape tarda
  más — el solapamiento es inofensivo por diseño). Lee appData SOLO para
  identidades; jamás lo escribe.
- **Binario propio**: gosom v1.17.2 copiado a `scripts/discovery/bin/`
  (gitignoreado). Nada del runtime apunta a Atlas.
- **Smoke real del adapter**: 5 kioscos de Núñez scrapeados y parseados OK.
- El worker necesita Admin SDK (no el patrón Web-SDK de backup.mjs) porque
  las rules niegan `create` en staging incluso al owner — esa asimetría es
  la garantía de "solo el worker escribe staging".

## Estado al cierre de la sesión

- **8 commits** en `feature/discovery-engine`, SIN pushear. **1229 tests**
  (1150 → 1229 en la sesión; el único rojo intermitente es B9).
- **B9 amplificado y documentado** (backlog actualizado): decisión de
  Gustavo — no corregirlo mezclado con la validación del Discovery.
- **Repo de Atlas**: alta kiosco + script de fixtures + fixture, TODO sin
  commitear allá (junto con los entregables F0 del engine — pendiente de
  orden desde la sesión anterior).
- **Pendiente para F4** (pasos manuales de Gustavo, en curso):
  1. Service account → `.credentials/firebase-admin-sa.json`
  2. `firebase deploy --only firestore:rules`
- **F4 planificada**: búsqueda real chica desde la app → worker → staging →
  revisión (un import + un descarte) → verificar ranking con confianza baja
  + aviso ◍ → resumen MD autocontenido (regla permanente) + actualización de
  CLAUDE.md.

## F4 (2026-07-31) — validación con producción real (mitad worker COMPLETA)

Gustavo generó la service account (la única credencial que solo él podía
crear). El entorno de permisos me bloqueó moverla a `.credentials/` (dos
denegaciones — correcto: capa de seguridad sobre archivos sensibles), así que
quedó en `~/Downloads` y se usa vía `GOOGLE_APPLICATION_CREDENTIALS`
(convención ADC agregada al worker como precedencia; la mudanza es de Gustavo).

**El deploy de rules NO salió**: la SA `firebase-adminsdk` autentica bien pero
no tiene rol de administración del proyecto (403 en serviceusage al verificar
la API). Sirve para datos (el worker — su propósito), no para deployar rules.
En el camino: dos roturas de ownership de la Mac (npm cache y `~/.config` de
root) esquivadas con cache/XDG temporales — los `sudo chown` quedaron para
Gustavo. Resolución elegida: `firebase login` de Gustavo + deploy mío después.

**La mitad worker de F4 no dependía de rules (Admin SDK las bypasea) y se
corrió ENTERA contra producción:**
- Job real `ms895vdlv27kx5s` ("kiosco" — Martínez, tope 10) creado con
  `crearJob.mjs` (herramienta ops nueva que espeja el shape exacto del form).
- Worker: claim transaccional → scrape → **39 segundos** → 10 descubiertos,
  job `listo` con counts.
- Verificación read-only (script temporal, borrado tras la corrida): contrato
  §5 OK 10/10 (zona estampada, source, contactName vacío, P6 limpio,
  **lat/lng 10/10** — la mejora del port, con data real), revisión contra la
  data viva (16 clientes, 0 prospectos — la secuela histórica de B1): 9
  importables + 1 duplicado + 0 suprimidos, ranking del engine 9/9 con chip
  "Baja" y aviso ◍, gate de confianza capando — el comportamiento diseñado.

**Dos hallazgos de data real → backlog M-D1/M-D2 (decisión: documentar, no
cambiar comportamiento en esta versión):**
- M-D1: "lo del PELA" y "lo del PELA II" son sucursales con TELÉFONO
  compartido — la clave fuerte `tel:` de la capa de import las une (el runner
  no: nombre+dirección difieren; el layering funcionó como se diseñó). Diego
  podría querer ambas ubicaciones.
- M-D2: la búsqueda de Martínez trajo un kiosco de Benavídez con
  `zone: "Martínez"` — la aproximación de zona documentada; mitigación
  vigente: zona editable en la revisión.

**El staging quedó en producción SIN consumir a propósito**: al deployar las
rules, es el banner "🔎 10 descubiertos" con el que Gustavo cierra la mitad
app a ojo (local dev — el branch no está mergeado). B1 quedó anotado como
RESUELTO en el backlog; B9 amplificado quedó con su mitigación recomendada.

## F4 mitad app + CIERRE DEL BLOQUE (2026-07-31)

Gustavo destrabó el deploy con `firebase login` (workaround sin sudo: cache
npm y XDG_CONFIG_HOME en /tmp — las dos carpetas root-owned de la Mac siguen
pendientes de chown). **Rules deployadas** (compilaron y se liberaron OK) con
su login; la service account quedó solo para datos (worker), como
corresponde.

**Revisión visual en local dev (contra prod), aprobada por Gustavo:**
- Banner de Martínez → modal de revisión → importación + descarte → chips
  "Baja" + aviso ◍ → F5 con persistencia (B1 en acción) → ⛔ Descartados.
- **Segundo ciclo COMPLETO desde la UI**: Gustavo creó "Kiosko" — Palermo
  (tope 10) desde 🔎 Descubrir (rules nuevas permitiendo el write del job;
  ubicación autocompuesta por el form) → worker 49 s → 9 descubiertos + 1
  dup filtrado por el runner → banner en vivo → revisión en la app. El único
  tramo que faltaba validar en producción (job desde el form) quedó cubierto.

**Pregunta de Gustavo sobre teléfonos**: no es pérdida nuestra — Maps solo
publica teléfono en ~45% de las fichas de kioscos (medido en ambas corridas);
cuando está, viaja entero (modal, ficha, clave de dedup).

**Próximo bloque candidato (a proponer ANTES de construir, como siempre):**
"dashboard de captación" — reorganizar Panel mayorista / Pipeline /
Prospección con un dashboard madre y el kanban/revisión como vistas.
Rediseño de navegación; el engine y el discovery no se tocan.

**El bloque Discovery Engine queda CERRADO.** Pendientes operativos (Gustavo):
mover la credencial a `.credentials/firebase-admin-sa.json`, instalar el
LaunchAgent, los dos `sudo chown` de higiene de la Mac, commitear el lado
Atlas, y decidir el merge a main (protocolo PR como el engine).
