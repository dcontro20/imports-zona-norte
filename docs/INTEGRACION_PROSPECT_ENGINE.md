# Integrar el Prospect Engine al repositorio original — procedimiento

Runbook para llevar los **20 commits** de `feature/prospect-engine` a
`dcontro20/imports-zona-norte`. Cada paso trae su comando y su **punto de
control**: si el control no da lo esperado, no sigas al paso siguiente.

Datos verificados el **29/07/2026** sobre el clon `~/Desktop/imports-zona-norte`.
Complementa a `HANDOFF.md` (arquitectura y API) e `IMPLEMENTATION_SUMMARY.md`.

## Estado verificado

| | |
|---|---|
| Branch | `feature/prospect-engine` — 20 commits, árbol limpio |
| Último commit | `7884846` (fix del chevron) |
| `main` local | `1d67ee8` (base del port) |
| `main` remoto | `ed97c4b` — **avanzó 1 commit** |
| Tu permiso sobre el repo | **READ** → el push directo dará 403 |
| CI en PRs | sí: `vitest` + `build`, corre en **UTC** |

**Qué implica:** el commit que avanzó en `main` toca **solo**
`docs/ESTRUCTURA.md` (snapshot nocturno automático), archivo que tus 20 commits
nunca tocaron ⇒ **no hay conflictos esperables**. Y el test que falla en tu Mac
(`dailyPlan > weekKey`) **pasa con `TZ=UTC`**, la zona de los runners de GitHub
⇒ **el CI del PR debería salir verde**.

---

## 1 · Verificar que este clon sirve

### Paso 1 — chequeo previo

```bash
# 1. branch correcto y sin cambios sueltos
git -C ~/Desktop/imports-zona-norte status -sb
# 2. 20 commits sobre la base del port
git -C ~/Desktop/imports-zona-norte rev-list --count main..feature/prospect-engine
# 3. último commit esperado
git -C ~/Desktop/imports-zona-norte log -1 --format='%h %s' feature/prospect-engine
# 4. remoto apuntando al repo original
git -C ~/Desktop/imports-zona-norte remote -v
# 5. gh autenticado
gh auth status
```

**Punto de control:** `## feature/prospect-engine` sin líneas debajo · `20` ·
`7884846 fix(pipeline): el chevron…` ·
`https://github.com/dcontro20/imports-zona-norte.git` ·
`Logged in to github.com account gcontro99`.
Si `status` muestra archivos modificados o sin trackear, pará y revisá con
`git diff` antes de continuar.

### Paso 2 — confirmar que sigue verde

```bash
cd ~/Desktop/imports-zona-norte
npm ci                 # solo si cambiaste de Node o hace mucho no instalás
TZ=UTC npx vitest run
npm run build
```

**Punto de control:** con `TZ=UTC`, **1147 tests verdes** (así lo corre el CI).
Sin esa variable verás 1 rojo: `dailyPlan > weekKey`, el bug de timezone
pre-existente (B8). Cualquier otro rojo ⇒ no publiques, investigá.
`App.test.jsx` es flaky por timeout en la suite completa (B9): si falla,
corrélo solo (`npx vitest run src/App.test.jsx`), pasa 4/4.

---

## 2 · ¿Este clon o uno nuevo?

**Usá este mismo clon.** Es donde viven los 20 commits: no existen en GitHub, ni
en otro clon, ni en un backup. Un clon nuevo bajaría `main` y **no** tendría tu
trabajo — habría que transferirlo con parches, sumando pasos y riesgo a cambio de
nada. Este clon está sano: árbol limpio, un solo remoto correcto, `gh` autenticado.

Un clon nuevo tendría sentido **solo** si sospecharas que el working copy está
corrupto. En ese caso, respaldá primero:

```bash
git -C ~/Desktop/imports-zona-norte bundle create \
  ~/Desktop/prospect-engine.bundle main..feature/prospect-engine
```

> **Hacelo igual.** Mientras los 20 commits existan solo en tu disco, un borrado
> accidental de la carpeta los pierde. El bundle toma dos segundos y te cubre
> hasta que el branch esté publicado.

---

## 3 · Acceso de gcontro99 al repositorio

Tu permiso actual es **READ**: alcanza para leer y para abrir un PR desde un
fork, pero **no para pushear el branch al repo original**. Dos caminos, no
excluyentes.

### Camino A (recomendado) — que Diego te dé acceso

Diego, desde su cuenta, hace una de estas dos:

1. Web: *Settings → Collaborators and teams → Add people →* `gcontro99` → rol
   **Write**.
2. Terminal con su `gh`:

```bash
gh api -X PUT \
  repos/dcontro20/imports-zona-norte/collaborators/gcontro99 \
  -f permission=push
```

Te llega una invitación por mail o a github.com/notifications que tenés que
**aceptar**. Después verificá:

```bash
gh api repos/dcontro20/imports-zona-norte --jq .viewerPermission
```

**Punto de control:** debe decir `WRITE` (o `ADMIN`). Si sigue `READ`, la
invitación no está aceptada.

### Camino B — fork a tu cuenta (no depende de nadie)

Funciona hoy mismo. El repo es público y todavía no tenés fork.

```bash
cd ~/Desktop/imports-zona-norte
gh repo fork --remote --remote-name fork --default-branch-only
```

**Punto de control:** `git remote -v` muestra **dos** remotos: `origin` →
dcontro20 y `fork` → gcontro99. `origin` queda intacto.

> Pedile el acceso a Diego y, si no responde en el día, seguí por el fork. Para
> él el resultado es el mismo: un PR para revisar.

---

## 4 · Verificar el remoto

```bash
git -C ~/Desktop/imports-zona-norte remote -v
gh repo view dcontro20/imports-zona-norte \
  --json name,visibility,defaultBranchRef,viewerPermission
```

**Punto de control:** `origin` apunta a
`https://github.com/dcontro20/imports-zona-norte.git` en fetch y push · repo
`PUBLIC` · rama por defecto `main`. Si apuntara a otro lado:
`git remote set-url origin https://github.com/dcontro20/imports-zona-norte.git`.

**Credenciales:** el clon usa HTTPS con `osxkeychain`. Si el push pide usuario y
contraseña, no pongas tu contraseña de GitHub — corré `gh auth setup-git` una vez.

---

## 5 · Primer fetch

Nunca hiciste `fetch` en este clon: tu `main` local es la foto del día que
clonaste. Esto no modifica tu branch ni tu `main` local, solo actualiza
`origin/main`.

```bash
cd ~/Desktop/imports-zona-norte
git fetch origin --prune
git log --oneline main..origin/main
git diff --stat main..origin/main
```

**Punto de control:** hoy esperás **1 commit**
(`ed97c4b chore(docs): snapshot nocturno de estructura`) y **un archivo**:
`docs/ESTRUCTURA.md`. Más commits de ese tipo son normales (el snapshot corre
cada noche a las 03:30 ART). Lo que sí merece atención es cualquier cambio en
`src/` → ver paso 9.

---

## 6 · Subir el branch

### Paso 5 — rebasar antes de publicar

Conviene rebasar **ahora**, antes del primer push: el branch no está publicado,
así que reescribir SHAs no molesta a nadie y no requiere `--force`.

```bash
git switch feature/prospect-engine
git rebase origin/main
git rev-list --count origin/main..HEAD
TZ=UTC npx vitest run
```

**Punto de control:** `20` commits y suite verde. Los SHAs cambian (normal en un
rebase); el último mensaje sigue siendo el del chevron. Si hubiera conflicto —no
debería—, `git rebase --abort` te devuelve intacto.

Rebasar es opcional (GitHub mergea igual sin conflictos), pero deja el PR más
prolijo y hace que el CI corra contra el `main` más nuevo.

### Paso 6 — push

```bash
# Camino A — con permiso de escritura
git push -u origin feature/prospect-engine

# Camino B — vía fork
git push -u fork feature/prospect-engine
```

**Punto de control:** `* [new branch] feature/prospect-engine -> …` sin errores.
Confirmá con `git ls-remote origin refs/heads/feature/prospect-engine` (o `fork`):
debe devolver un SHA. Si sale `403 Permission denied`, estás en Camino A sin el
permiso activo: aceptá la invitación o pasate al fork.

---

## 7 · Abrir el Pull Request

```bash
gh pr create \
  --repo dcontro20/imports-zona-norte \
  --base main \
  --head gcontro99:feature/prospect-engine \
  --title "Prospect Engine: priorización de prospectos por valor comercial" \
  --body "$(cat <<'FIN'
Porta el núcleo del motor de evaluación de prospectos de Atlas a JS puro y lo
enchufa al Pipeline mayorista, que pasa de ordenar por recencia a ordenar por
valor comercial explicado.

## Qué entra
- Dominio en `src/lib/`: motor (`prospectScoring`), rúbrica izn-v1, adaptador de
  señales, diagnóstico y la fachada `prospectRanking` (único import de la UI).
- UI: Pipeline ordenado por ranking, chip de prioridad + aviso de baja confianza,
  ficha de diagnóstico con "¿Por qué?" y calificación rápida en la visita.
- +98 tests (1147 en total). Sin dependencias nuevas, sin migración de datos,
  sin cambios en reglas de Firestore.

## Compatibilidad
`prioritizeProspects` mantiene su comportamiento histórico si no recibe contexto:
los llamadores existentes no cambian.

## Para leer antes de mergear
- `HANDOFF.md` — arquitectura, API pública y guía de integración.
- `IMPLEMENTATION_SUMMARY.md` — alcance y validaciones.
- `docs/BACKLOG_TECNICO_2026-07-28_prospeccion_y_sync.md` — bugs detectados y NO
  corregidos acá. **B1 es importante**: los prospectos, visitas y calificaciones
  todavía no se persisten a Firestore (bug pre-existente), así que esos datos son
  efímeros hasta que se resuelva aparte.
FIN
)"
```

Alternativa web: `gh pr create --web`.

**Punto de control:** el comando devuelve la URL. Abrila y verificá **19
commits**, **27 archivos** y que GitHub diga *"Able to merge"* en verde. Si dice
*"Can't automatically merge"* → paso 9.

**CI:** arranca solo. Seguilo con `gh pr checks --watch`. Debería salir verde.

---

## 8 · Qué revisar antes del merge

- **CI verde** (`gh pr checks`). Si el rojo es `App.test.jsx` por timeout, es el
  flake conocido (B9): re-corré el workflow antes de dar algo por roto.
- **El diff sin sorpresas** (`gh pr diff --name-only`): 27 archivos bajo
  `src/lib/`, `src/components/`, `docs/`, más `src/prospecting.js`,
  `src/App.jsx` (una línea), `CLAUDE.md` y `.gitignore`. **Nada** en
  `useFirebaseSync.js`, `firestore.rules` ni `package.json`.
- **La regla de arquitectura se respeta** (ambos greps deben dar vacío / solo la
  fachada):

```bash
grep -rE "from .*(prospectScoring|prospectSignals|prospectRubric|prospectDiagnosis)" \
  src/components/ | grep -v prospectRanking
grep -rn "prioritizeProspects" src/components/
```

- **El lado minorista intacto:** el único cambio compartido es la firma de
  `prioritizeProspects`, retrocompatible.
- **Estrategia de merge → elegí "Create a merge commit", no "Squash".**
  Los 20 commits están organizados por fase (motor · rúbrica · enchufe ·
  diagnóstico · fachada · UI 5.1/5.2/5.3). Con merge commit, revertir una fase
  puntual (p. ej. la UI, dejando el dominio) es un `git revert`. Un squash
  colapsa todo y pierde esa granularidad para siempre.

---

## 9 · Si `main` avanzó

Ya avanzó: 1 commit, `docs/ESTRUCTURA.md`. Tu branch no toca ese archivo ⇒ **no
hay conflicto posible**. Regla general:

- **Antes del primer push → rebase** (paso 5). Gratis, sin `--force`, historia
  lineal.
- **Con el PR ya abierto → merge de `main` hacia tu branch.** Un rebase ahí
  obliga a `--force-with-lease`, que rompe los enlaces a comentarios de revisión:

```bash
git fetch origin
git merge origin/main        # o el botón "Update branch" del PR
git push
```

**Conflictos esperables, por probabilidad:**

1. `docs/ESTRUCTURA.md` — único candidato real, y solo si alguien regenera el
   snapshot dentro de tu branch. Es un archivo **generado**: no lo resuelvas a
   mano, quedate con la versión de `main`
   (`git checkout --theirs docs/ESTRUCTURA.md`) y dejá que el cron nocturno lo
   regenere con los archivos nuevos.
2. `CLAUDE.md` — si Diego agregó un bloque de estado en la misma zona superior
   donde el branch insertó el suyo. Resolución: conservar **ambos**, el más
   reciente arriba.
3. `src/prospecting.js`, `src/components/Pipeline.jsx`, `src/App.jsx` — solo si
   alguien trabajó sobre prospección en paralelo. Hoy no hay PRs abiertos ni
   branches activos tocando eso. Si pasa, resolvelo leyendo
   `docs/PROSPECT_ENGINE_ARQUITECTURA.md`: la UI consume únicamente
   `prospectRanking.js`.

**Después de cualquier resolución:** `TZ=UTC npx vitest run` y `npm run build`
*antes* de pushear. Un conflicto mal resuelto en `prospecting.js` lo cazan los
tests de `prospecting.test.js`.

---

## 10 · Verificar que el merge quedó bien

```bash
git fetch origin
git switch main
git pull --ff-only origin main

git log --oneline -23 | head -23
ls -1 src/lib/prospect*.js src/lib/prospectScoring.golden.json
ls -1 src/components/wholesale/ProspectDiagnosisModal.jsx

TZ=UTC npx vitest run
npm run build

gh run list --repo dcontro20/imports-zona-norte \
  --workflow ci.yml --branch main --limit 1
```

**Punto de control:** los 6 módulos del engine presentes · **1147 tests verdes**
con `TZ=UTC` · build OK · `git log --oneline main..feature/prospect-engine`
devuelve **vacío** (todo integrado) · CI de `main` verde.

---

## 11 · Inmediatamente después del merge

**El merge a `main` es el deploy.** Vercel publica en 1–2 minutos, sin staging.

1. Esperá el deploy y abrí https://imports-zona-norte.vercel.app con **hard
   reload** (⌘⇧R) para saltear el service worker de la PWA.
2. Pasá al modo **🏪 Mayorista** con el toggle del topbar → **Pipeline**.
3. Verificá: chip de prioridad en las tarjetas · aviso *"todavía con poca
   información"* donde falten señales · tocar el nombre abre la ficha con el
   *"¿Por qué?"* · **📋 Visita** sobre un prospecto ofrece la calificación rápida.
4. Confirmá que **nada del lado minorista** cambió (Dashboard, Ventas, Clientes).

> ### 🔴 Avisale esto a Diego antes de que use la pantalla en serio
> Por el bug **B1** (pre-existente, no introducido por este trabajo), los
> prospectos, las visitas y las calificaciones **no se guardan en Firestore**:
> viven en la sesión del navegador y se pierden al refrescar. La pantalla se ve y
> funciona completa, así que es fácil cargar veinte kioscos calificados y
> perderlos. Hasta que B1 se arregle, tratala como una demo. El arreglo son tres
> `useEffect` en `useFirebaseSync.js`, documentados en el backlog.

**Revisión de Firestore** — no hay nada que migrar; confirmalo en la consola:

- **Colecciones:** ninguna nueva. El score se deriva en memoria y no se persiste,
  por diseño.
- **Reglas:** sin cambios. No hace falta `firebase deploy --only firestore:rules`.
- **Documentos:** `prospect.calificacion` es aditivo y tolerado por los schemas;
  los prospectos viejos rinden `sin_datos`. Por B1 hoy ni llega al servidor.
- **Cuota:** sin lecturas ni escrituras nuevas — todo el cómputo es local.

> **Si validás en local:** el `npm run dev` de este proyecto apunta a **Firestore
> de producción** por el fallback de config. Lo que crees o borres toca datos
> reales. Para mirar la UI sin riesgo, usá la app deployada.

**Cierre:**

- Borrá el branch remoto cuando el PR esté mergeado:
  `git push origin --delete feature/prospect-engine`.
- Commiteá en el repo de **Atlas** los tres archivos de la Fase 0
  (`golden_cases.json`, `test_golden_cases.py`, `export_golden_cases.py`): son la
  mitad Python de la garantía de equivalencia y siguen sin versionar.
- El snapshot nocturno regenera `docs/ESTRUCTURA.md` con los archivos nuevos. No
  hagas nada.

---

## Riesgos específicos de estos 20 commits

| Sev. | Riesgo | Mitigación |
|---|---|---|
| 🔴 Crítico | **B1 — la calificación no persiste.** La UI invita a cargar y calificar prospectos y esos datos se pierden al refrescar. Si Diego no está avisado, pierde trabajo | Avisarle antes de usarla, o arreglar B1 primero (3 `useEffect`) |
| 🔴 Crítico | **Los 20 commits existen en un solo disco.** No están en GitHub ni en backup | El `git bundle` del paso 2 |
| 🟡 Medio | **El merge deploya a producción sin escala intermedia** (Vercel desde `main`, sin staging) | Mergear en momento tranquilo; tener a mano el *Rollback* de Vercel |
| 🟡 Medio | **Permiso READ: el push directo falla** | Los dos caminos del paso 3; el fork no depende de nadie |
| 🟢 Bajo | **Ruido de tests que parece regresión:** `dailyPlan > weekKey` (falla en ART, pasa en UTC) y `App.test.jsx` (flaky por timeout) | Documentados como B8 y B9; el cuerpo del PR lo aclara |
| 🟢 Bajo | **Squash accidental al mergear** — colapsa las 8 fases y se pierde el revert selectivo | Elegir *Create a merge commit* |
| 🟢 Bajo | **La fixture de oro puede quedar huérfana:** `prospectScoring.golden.json` es copia de la de Atlas, que sigue sin commitear allá | Versionarla en Atlas |
| 🟢 Bajo | **La rúbrica está sin calibrar:** pesos del borrador, congelados hasta tener datos reales (dependen de B1) | Al calibrar, ajustar **filas y pesos**, nunca el motor |
