# IZN · Discovery Engine — Resumen autocontenido

**Fecha:** 2026-07-31 · **Branch:** `feature/discovery-engine` (sobre `main @ 15392c4`) · **Sin mergear**
**Contrato (congelado):** `docs/DISCOVERY_ENGINE_CONTRATO.md` · **Journal:** `docs/SESSION_2026-07-30_discovery_engine.md` · **Setup:** `scripts/DISCOVERY_SETUP.md`

---

## Qué es

Diego escribe **"quioscos en Palermo"** en la app → un worker en la Mac de
Gustavo scrapea Google Maps → los negocios encontrados llegan al Pipeline
**para revisar** (nada entra solo) → los que Diego importa quedan como
prospectos y **el Prospect Engine los rankea automáticamente** (con confianza
baja y aviso ◍ hasta que los visite y califique — comportamiento diseñado).

Es el port del Prospect Intelligence de Atlas como **capacidad propia de
Imports**: Atlas quedó solo como implementación de referencia (fixtures +
validación de equivalencia); ningún código de Atlas corre en producción. La
única pieza no-portable era el binario scraper — que no es código de Atlas
sino un tercero (gosom/google-maps-scraper v1.17.2), del que Imports ahora
gestiona copia propia.

## Arquitectura (3 piezas)

1. **Dominio puro** — `src/lib/discovery/` (en la suite de Vitest):
   `gosomParse` (NDJSON→RawBusiness, P6: descarta reviews/fotos/owner en
   origen), `identity` (slug/claves/red — única fuente de identidad),
   `discoverRun` (runner puro por inyección: tope, supresión, idempotencia,
   fail-loud), `mapProspect` (RawBusiness→prospecto IZN directo; lat/lng
   viajan), `discoveryImport` (dedup del import + supresión con memoria).
2. **App** — Pipeline: botón 🔎 Descubrir (form validado), filas de estado de
   jobs en vivo, banner de resultados, modal de revisión
   (importar/descartar por ítem), ⛔ Descartados con rehabilitación.
   Colecciones: `discoveryJobs` (app crea/cancela), `discoveryResults`
   (staging: escribe SOLO el worker; la app lee y borra al consumir),
   `discoverySuppressed` (appData: descartar recuerda).
3. **Worker** — `scripts/discovery/` (Node, LaunchAgent cada 5 min): claim
   transaccional del job → identidades desde la data viva → gosom → runner →
   staging. Jamás escribe appData. Errores textuales al job (fail-loud).

## Validaciones

- **Equivalencia golden con Atlas, sin tolerancias**: corrida real (kiosco/
  Palermo) + replays determinísticos → parser idéntico en 26 registros,
  identidad idéntica, decisiones del runner idénticas (limpio/idempotencia/
  supresión). Fixture byte-idéntica, se regenera SOLO en Atlas.
- **De-risk de calidad** (20 kioscos reales CABA): 100% dirección/rating/
  place_id/horarios, 45% teléfono, 45% web. `categoria` de Maps es
  inconsistente ⇒ regla fijada: es informativa, nunca filtra.
- **F4 punta a punta con producción real** (kiosco/Martínez, tope 10): job →
  worker (39 s) → 10 en staging con contrato §5 OK 10/10 (lat/lng 10/10) →
  revisión contra data viva: 9 importables + 1 duplicado real (sucursales
  con teléfono compartido — capa import) → ranking 9/9 "Baja" + ◍ con el
  gate de confianza capando. **El staging quedó en producción sin consumir**:
  es la revisión visual pendiente de la mitad app.
- **Suite: 1229 tests** (1147 → 1229 en el bloque; +82). Build verde.
  Únicos rojos intermitentes: B8/B9 pre-existentes (backlog).

## Decisiones clave (todas con gate)

- **Capacidad propia, no puente** (pivote de Gustavo que definió el bloque);
  fork asumido: tras la validación, la copia es soberana.
- **B1 resuelto como prerequisito** (3 autosaves + test de paridad que cubre
  la clase del bug). Sin esto, todo descubierto era efímero.
- **Supresión con memoria**: descartar registra identidad; rehabilitar es
  explícito. Borrar en Papelera NO bloquea; descartar SÍ.
- **Staging + confirmación humana**: nada entra al Pipeline sin que Diego lo
  apruebe; la app puede borrar el doc consumido (ciclo de vida, §8).
- **Alta "kiosco" en Atlas**: solo para fixtures/de-risk, no producción.
- **Mejoras futuras documentadas sin cambiar comportamiento** (backlog
  M-D1/M-D2): importar duplicados-por-teléfono con confirmación; aviso de
  discrepancia dirección↔zona.

## Commits del bloque (branch `feature/discovery-engine`)

`60b368b` fix B1 + test de paridad · `23079cd` contrato F0 (v1 puente) ·
`032c387` port dominio puro + golden · `c04b3d3` contrato v2 capacidad propia ·
`3b7505b` contrato CONGELADO + regla categoria · `a9514e1` F2 ingesta ·
`779c5e8` F3 UI búsqueda · `35d652e` F3 worker + binario · `6c531d4` journal +
B9 · `d08a6db` crearJob.mjs + ADC.

## F4 CERRADA (2026-07-31) — bloque completo

- **Rules deployadas** (login de Gustavo; la service account quedó solo para
  datos, como corresponde).
- **Revisión visual aprobada**: banner de Martínez → importación + descarte →
  chips "Baja" + ◍ → **F5 con persistencia (B1 en acción)** → ⛔ Descartados.
- **Segundo ciclo entero desde la UI**: búsqueda "Kiosko" — Palermo creada
  por Gustavo en 🔎 Descubrir → worker 49 s → 9 descubiertos + 1 dup del
  runner → banner en vivo → revisión. Todo el circuito validado en
  producción, ida y vuelta.
- Dato: Maps publica teléfono solo en ~45% de fichas de kioscos — cuando
  está, viaja entero (modal, ficha, clave de dedup). No es pérdida nuestra.

## Pendientes operativos (Gustavo, sin bloqueo técnico)

1. Mover la credencial: `mkdir -p .credentials && mv
   ~/Downloads/imports-zona-norte-firebase-adminsdk-*.json
   .credentials/firebase-admin-sa.json && chmod 600
   .credentials/firebase-admin-sa.json` (hoy vía
   `GOOGLE_APPLICATION_CREDENTIALS`; el LaunchAgent espera esa ruta).
2. Instalar el LaunchAgent (`scripts/DISCOVERY_SETUP.md` paso 5).
3. Higiene de la Mac: `sudo chown -R $USER:$(id -gn $USER) ~/.config` y
   `sudo chown -R 501:20 ~/.npm` (root-owned; molestan a todo npm/npx).
4. Repo de Atlas: commitear allá alta kiosco + script + fixture (junto con
   los entregables F0 del engine, pendientes de antes).
5. Merge a `main` cuando Gustavo/Diego decidan (protocolo PR como el engine).

## Próximo bloque candidato (aprobado como idea, SIN construir)

**Dashboard de captación**: reorganizar Panel mayorista / Pipeline /
Prospección con un dashboard madre (búsquedas en curso, descubiertos
esperando, funnel, zonas) y el kanban/revisión como vistas. Rediseño de
navegación — el engine y el discovery no se tocan. Requiere propuesta de
pantallas aprobada ANTES de construir.
