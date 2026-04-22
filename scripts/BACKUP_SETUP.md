# Backup automático a Google Drive

## Estado actual (22/04/2026)

El sistema de backup a Drive **estaba funcionando hasta el 21/04** porque un agente
Claude (vía MCP de Google Drive) subía los backups a mano cada día. Esas sesiones
de Claude viven poco tiempo, y el cron que las disparaba se expiró → los backups
del 22/04 en adelante no subieron.

**Último backup en Drive:** `IZN_Backup_2026-04-21_03-03.json`
**Carpeta Drive:** https://drive.google.com/drive/folders/1d57fOksNJePjSM1oC4c994z_UdAUnnuv

## Solución pragmática HOY mismo (cero setup)

En la app, sección **Exportar**, hay dos botones:

- **☁️ Subir a Drive** — descarga el JSON y abre la carpeta de Drive. Arrastrás el
  archivo a la carpeta y listo. Funciona desde celular también (iOS: compartir el
  archivo descargado a Drive).
- **🛡️ Sólo descargar** — descarga el JSON local.

Este flujo requiere 1 click + 1 arrastre cada vez. Ideal para hacerlo 1 vez por
semana.

## Solución durable: backup automático diario desde tu Mac

### Paso 1 — Service Account en Google Cloud

1. Ir a https://console.cloud.google.com/iam-admin/serviceaccounts?project=imports-zona-norte
2. Crear Service Account (SA) — nombre: `drive-backup-bot`
3. En la SA, ir a "Keys" → "Add Key" → "Create new key" → JSON
4. Guardar el JSON descargado en `.credentials/drive-sa.json` del proyecto
   (la carpeta `.credentials/` ya está en .gitignore)
5. Copiar el `client_email` del JSON (algo como `drive-backup-bot@imports-zona-norte.iam.gserviceaccount.com`)

### Paso 2 — Compartir la carpeta de Drive con el SA

1. Abrir la carpeta de backups en Drive:
   https://drive.google.com/drive/folders/1d57fOksNJePjSM1oC4c994z_UdAUnnuv
2. Click derecho → Compartir
3. Pegar el `client_email` del SA
4. Rol: **Editor**
5. Enviar

### Paso 3 — Habilitar la Drive API

1. Ir a https://console.cloud.google.com/apis/library/drive.googleapis.com?project=imports-zona-norte
2. Click "Habilitar"

### Paso 4 — Instalar la dependencia

```bash
npm install googleapis
```

### Paso 5 — Probar el backup con upload

```bash
node scripts/backup.mjs --upload
```

Debería imprimir:
```
✅ Backup local: backups/backup-2026-04-22-XXXX.json
☁️  Subiendo a Drive...
✅ Drive: IZN_Backup_2026-04-22_XXXX.json
```

### Paso 6 — LaunchAgent de macOS (corre cada día 3am)

Copiar el plist al directorio de agents:

```bash
cp scripts/com.izn.backup.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.izn.backup.plist
```

Para verificar que esté programado:
```bash
launchctl list | grep com.izn.backup
```

Para deshabilitar:
```bash
launchctl unload ~/Library/LaunchAgents/com.izn.backup.plist
```

Los logs van a `/tmp/izn-backup.log` y `/tmp/izn-backup.err`.

### Verificación

Al día siguiente a las 3:05am debería aparecer un nuevo archivo en la carpeta de
Drive con nombre `IZN_Backup_YYYY-MM-DD_HH-MM.json`.

Si no aparece:
```bash
tail /tmp/izn-backup.log
tail /tmp/izn-backup.err
```

## Alternativas (si no querés setup)

- **Backup manual semanal**: botón "Subir a Drive" en la app. 10 segundos.
- **GitHub Actions**: correr el script en un workflow scheduled. Requiere agregar
  el SA como secret en el repo.
- **Vercel Cron**: endpoint serverless + cron job. Requiere mover la lógica a
  una función serverless.
