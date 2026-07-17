# IZN — Merge del Pivote Mayorista a producción · 2026-07-17

> Resumen autocontenido (regla permanente). Qué se mergeó, cómo se verificó,
> decisiones tomadas y pendientes. Journal narrativo de la sesión:
> `docs/SESSION_2026-07-17_merge_mayorista.md`.

---

## TL;DR

El pivote mayorista (fases 0–6 + tandas A–D) está **en producción**.
`claude/mayorista` (42 commits) se mergeó a `main` sin conflictos, Vercel
deployó automáticamente y se verificó que el bundle de prod contiene las 8
pantallas mayoristas y el fix de pantalla en blanco. PR #2 quedó cerrado como
merged. **1017 tests verdes.**

⚠️ **Alerta crítica descubierta en el camino:** los backups diarios a Drive
están rotos desde el **2026-07-09** (token de Drive expirado, falla
silenciosa). Acción de Diego requerida — ver "Pendientes".

---

## Qué entró a `main`

Merge commit `5d8193c` (--no-ff), 67 archivos, +6.356/−145:

- **Fases 0–6 del pivote** (`docs/PLAN_MAYORISTA.md`): eje `type:
  minorista|mayorista`, pricing por tier A/B/C, Kioscos, Pedido mayorista,
  Pipeline + Prospección, Rutas de reparto, Cuenta corriente B2B (default
  OFF), Inteligencia B2B + Panel mayorista, pulido F6 (⌘K, export CSV, bulk).
- **Tandas A–D de mejoras** (+71 tests de blindaje, cero bugs reales).
- **Agente Redactor IA** (`messageAgent.js`, `messageCopyBank.js`,
  `api/generate-daily-message.js`, cron): venía incluido porque
  `claude/mayorista` se creó encima de `claude/claude-md-docs-oNlms`.
- **Fix de pantalla en blanco** (`4c02968`): el `useMemo` de
  `visibleNavItems` (Fase 0.6) estaba declarado después de los early returns
  de loading/login → violación de Rules of Hooks → "Rendered more hooks than
  during the previous render" al resolver el auth → App no montaba. Movido al
  bloque de hooks.
- **Smoke test de App** (`src/App.test.jsx`): monta App con firebase mockeado
  y recorre loading → login → sesión. Verificado que falla sobre la versión
  rota. Cubre el gap de que las 1015 pruebas puras no renderizaban App.
- **Fix de flakiness del smoke** (`f4af5c9`): los `import()` lazy de
  Dashboard + FABs quedaban en vuelo al cerrar el test →
  `EnvironmentTeardownError` intermitente (~1 de 3 corridas).
  `drainLazyChunks()` los resuelve antes de cerrar. Verificado: 5 corridas
  del archivo + 3 de la suite, todas exit 0.

## Verificación del deploy

- Vercel deployment `dpl_6tGF8izyWjYGDztzRFv7Aeoj6DcP` · target
  **production** · state **READY** · commit `5d8193c` · disparado
  automáticamente por el push a `main`.
- https://imports-zona-norte.vercel.app responde HTTP 200 y sirve
  `assets/index-n3OEeBK_.js` — **mismo hash que el build local del merge**
  (Vite hashea por contenido ⇒ contenido idéntico).
- Verificado en ese bundle: "Panel mayorista", "Kioscos", "Pedido
  mayorista", "Cuentas corrientes", "Pipeline", el 🏪 del toggle y
  `businessMode`. El fix de hooks está incluido (mismo árbol que `5d8193c`).
- Límite honesto: el toggle y las pantallas viven detrás del login — la
  verificación visual final la hace Diego al abrir prod.

## PR #2

Cerrado como **merged** automáticamente por GitHub al pushear `main`
(merged_at = timestamp del push). No hizo falta cierre manual.

## Branch `claude/claude-md-docs-oNlms` (Agente Redactor)

**Recomendación: no mergear — ya está adentro.** `git merge-base
--is-ancestor` confirma que es ancestro estricto de `main` (0 commits
propios). Se puede borrar la branch remota cuando Diego quiera (solo
higiene; no urge y no se borró sin OK).

## Migración `migrateToWholesaleModel` sobre data real

- **Ya corrió** — no en este deploy, sino durante la prueba local de Diego
  (2026-07-16): el dev local usa el **Firestore de producción** (config con
  fallback a prod). Su prueba exitosa (precio por tier OK + cobro acreditado
  en la cuenta correcta de Caja) leyó y escribió campos migrados
  (`type`, `saleType`) — esa es la validación sobre data real.
- Idempotente por diseño y por test (corridas 2x/3x en
  `wholesaleMigration.edge.test.js`): cada dispositivo que abra la app la
  re-evalúa y no escribe nada si no hay cambios.
- No-regresión minorista: cubierta por el test de integración de Tanda D +
  la prueba manual. Chequeo final sugerido a Diego en prod: abrir Dashboard,
  Ventas y Caja en modo Minorista (30 segundos).
- **No se pudo verificar contra backup**: no existe backup posterior a la
  migración (ver alerta).

## ⚠️ Pendientes (acción de Diego)

1. **Backups rotos desde 2026-07-09** (reporte
   `IZN_Backup_2026-07-14_BLOQUEADO.json` en Drive, dejado por el agente de
   backup el 14/07): GitHub Actions `backup-diario.yml` marca "success" pero
   el upload a Drive falla silencioso — `GOOGLE_DRIVE_TOKEN` expirado.
   - Backup manual urgente en la Mac: `node scripts/backup.mjs --upload`
   - Renovar token: `node scripts/auth-oauth.mjs` y actualizar el GitHub
     Secret `GOOGLE_DRIVE_TOKEN`.
   - Deuda a codear: que el script haga `exit 1` si falla el upload (hoy
     el Action queda verde con upload roto).
2. Recorrer el flujo mayorista en prod (ya validado en local).
3. Decidir si borrar las branches `claude/mayorista` y
   `claude/claude-md-docs-oNlms` (ya mergeadas).

## Estado final

| | |
|---|---|
| `main` | `5d8193c` (merge) — deployado |
| Tests | 1017 verdes, suite estable (exit 0 × 3) |
| Build | OK (9.9s) |
| PR #2 | merged/cerrado |
| Pantallas mayoristas | 8, en producción |
