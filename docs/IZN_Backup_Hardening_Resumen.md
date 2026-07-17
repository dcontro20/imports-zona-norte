# IZN — Hardening del sistema de backups · 2026-07-17

> Resumen autocontenido (regla permanente). Respuesta al incidente de los
> 8 días sin backup (09–17/07) con el Action verde. Journal:
> `docs/SESSION_2026-07-17_backup_hardening.md`.

---

## TL;DR

El backup ya no puede mentir: si el upload a Drive falla, el script sale con
`exit 1` (Action rojo + mail de GitHub) y el Dashboard alerta cuando el
último backup exitoso tiene ≥2 días. **1022 tests verdes** (+5). Las branches
mergeadas quedaron verificadas como seguras de borrar, pero el borrado lo
tiene que hacer Diego (la sesión remota no tiene permiso para borrar refs).

---

## Qué se hizo

### 1. `exit 1` si el upload falla (`9922749`)

`scripts/backup.mjs --upload` ahora devuelve **exit 1** si el archivo no
llegó a Drive, en los 3 caminos de falla: sin token, sin `googleapis`,
error de la API (incl. `invalid_grant`). Antes `uploadToDrive()` tragaba
todo y `main()` terminaba en `exit 0` → `backup-diario.yml` quedaba VERDE
con el respaldo roto. El backup local se escribe igual (eso no cambia);
lo que cambia es que la run lo declara incompleto.

Bonus del mismo commit: tras cada upload exitoso se sella
`appData/backupStatus` en Firestore (`{lastDriveBackupAt, records, source}`).
Si el sello falla pero el upload anduvo → warn sin `exit 1` (un backup bueno
no es una run fallida).

### 2. Alerta de backup viejo en el Dashboard (`eb3fa35`)

- `useFirebaseSync` se suscribe a `backupStatus` **read-only** (la app nunca
  lo escribe — no necesita smartSave ni flags anti-loop).
- `generateDashboardAlerts` (lib pura, testeada) agrega la alerta 🛟:

| Estado | Alerta |
|---|---|
| Último backup < 2 días | nada |
| ≥ 2 días | 🟡 "esta semana" |
| ≥ 4 días (2× umbral) | 🔴 URGENTE |
| Sin registro de backup | 🟡 "Sin registro de backup en Drive" |

- **Umbral propuesto y por qué**: hay 2 mecanismos diarios (LaunchAgent +
  Action), así que 1 día sin backup puede ser un hiccup normal (Mac apagada
  + hiccup del Action); 2 días ya es problema real. Configurable en
  ⚙️ Ajustes → Backups (`driveBackupStaleDays`, default 2).
- Decisión deliberada: **la falta de registro también alerta** — el
  silencio fue exactamente lo que ocultó el incidente. Esta alerta va a
  estar visible hasta el primer backup sellado (ver "Qué te queda a vos").
- Doble red: mail de GitHub por Action rojo (inmediato) + alerta en la app.

### 3. Secret `GOOGLE_DRIVE_TOKEN` — qué va ahí

El secret lleva **el JSON completo** de `.credentials/drive-oauth-token.json`
(el script hace `JSON.parse` de la env var y usa `client_id`,
`client_secret`, `refresh_token`). Pasos exactos en "Qué te queda a vos".

## Qué te queda a vos (Diego)

1. **Actualizar el secret** (el token local ya lo renovaste):
   ```bash
   # Opción A (con gh CLI, un comando):
   cd ~/Desktop/imports-zona-norte
   gh secret set GOOGLE_DRIVE_TOKEN < .credentials/drive-oauth-token.json

   # Opción B (a mano):
   cat .credentials/drive-oauth-token.json | pbcopy
   # GitHub → repo → Settings → Secrets and variables → Actions
   # → GOOGLE_DRIVE_TOKEN → Update secret → pegar → Save
   ```
2. **Probar el Action ya mismo**: GitHub → Actions → "Backup diario a
   Drive" → Run workflow. Si queda verde, el backup está en Drive Y el
   sello quedó escrito (la alerta del Dashboard se apaga sola).
   Si queda rojo → ahora es un rojo honesto: los logs dicen exactamente qué
   falló.
3. **Borrar las branches mergeadas** (verifiqué con `merge-base` que ambas
   están 100% contenidas en `main`; esta sesión no tiene permiso para
   borrar refs remotas — 403):
   ```bash
   git push origin --delete claude/mayorista claude/claude-md-docs-oNlms
   ```

## Estado final

| | |
|---|---|
| Tests | **1022 verdes** (+5 de dashboardAlerts) |
| Build | OK |
| Commits | `9922749` (script) + `eb3fa35` (alerta app) en `main`, deployados |
| Docs | `docs/BACKUP_AUTOMATION.md` actualizado con el comportamiento nuevo |
| Branches | verificadas seguras de borrar — comando arriba |
