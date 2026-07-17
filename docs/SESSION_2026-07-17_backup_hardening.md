# SESSION 2026-07-17 — Hardening de backups: fail-loud + alerta en Dashboard

## TL;DR

Respuesta al incidente de los 8 días sin backup (09–17/07) con el Action
verde: `backup.mjs --upload` ahora hace **exit 1** si el archivo no llega a
Drive, sella `appData/backupStatus` en Firestore tras cada upload exitoso, y
el Dashboard alerta 🛟 cuando el último backup tiene ≥2 días (urgente a ≥4).
**1022 tests verdes (+5).** 2 commits + docs. Las branches mergeadas quedan
para borrar por Diego (la sesión remota no puede borrar refs — 403).

## Cómo llegamos acá

Diego hizo el backup manual (382 registros) y renovó el token OAuth local.
Pidió tres cosas: (1) que el backup falle ruidosamente cuando el upload no
anda — "un verde mentiroso es peor que un rojo honesto"; (2) alerta visible
si el último backup quedó viejo, proponiéndole yo el umbral; (3) el paso a
paso exacto para renovar el secret `GOOGLE_DRIVE_TOKEN` del Action. Además,
borrar las branches ya mergeadas.

## Items cerrados / commits

- **`9922749` fix(backup) exit 1 + sello**: `uploadToDrive()` devuelve
  boolean en sus 3 caminos de falla (sin token / sin googleapis / error de
  API); `main()` corta con exit 1 si `--upload` no logró subir. Tras upload
  OK sella `appData/backupStatus` (`{lastDriveBackupAt, records, source}`)
  con el mismo shape `{data, updatedAt}` del resto de appData.
- **`eb3fa35` feat(backup) alerta Dashboard**: suscripción read-only a
  `backupStatus` en `useFirebaseSync` (patrón exchangeRate, sin smartSave),
  alerta 🛟 en `dashboardAlerts.js` (lib pura), setting
  `driveBackupStaleDays: 2` + fila en SettingsModal, prop en Dashboard/App.
  +5 tests (1022).
- **Docs**: sección "Fail-loud + alerta de backup viejo" en
  `docs/BACKUP_AUTOMATION.md` + resumen `docs/IZN_Backup_Hardening_Resumen.md`.

## Decisiones clave (para Claudes futuros)

- **Umbral 2 días / urgente 4**: hay 2 mecanismos diarios redundantes
  (LaunchAgent + Action) — 1 día sin backup puede ser hiccup normal, 2 ya
  es problema real. Urgente = 2× el umbral (derivado, no un segundo setting).
- **Sin registro también alerta** (cambio de contrato deliberado en
  `generateDashboardAlerts({})` → 1 week alert; test de inputs vacíos
  actualizado con comentario). El silencio fue lo que ocultó el incidente:
  ante la duda, avisar.
- **Sello ≠ criterio de éxito**: si el upload anduvo pero el sello a
  Firestore falla, warn sin exit 1 — un backup bueno no es una run fallida.
  Trade-off: la alerta puede quedar desactualizada, pero no convertimos
  falsos negativos en falsos positivos.
- **`backupStatus` es read-only para la app**: nunca pasa por smartSave ni
  necesita flags anti-loop. Si alguna vez la app tiene que escribirlo,
  repensar (hoy solo lo escribe `scripts/backup.mjs`).
- **El recordatorio viejo (`backupReminderDays`) se mantiene**: mira el
  export manual en localStorage del dispositivo (otra cosa distinta). La
  alerta nueva mira los backups reales de Drive.
- **La sesión remota no puede borrar branches remotas**: el proxy git de
  Claude Code web devuelve 403 en push --delete y el MCP de GitHub no tiene
  delete-branch. Verificado con `merge-base --is-ancestor` que ambas están
  contenidas en main; el borrado quedó como comando para Diego.
- **Secret `GOOGLE_DRIVE_TOKEN` = JSON COMPLETO del token file** (el script
  parsea la env var y usa client_id/client_secret/refresh_token). One-liner:
  `gh secret set GOOGLE_DRIVE_TOKEN < .credentials/drive-oauth-token.json`.

## Estado final

- 1022 tests verdes · build OK · commits en `main` deployados por Vercel.
- Pendiente Diego: actualizar el secret + Run workflow de prueba + borrar
  branches. La alerta "Sin registro de backup" se apaga sola con el primer
  backup sellado.

---

*Escrito 2026-07-17 al cerrar la sesión de hardening de backups.*
