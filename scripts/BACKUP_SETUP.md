# Backup automático a Google Drive — Setup

**Estado (22/04/2026): funcionando, LaunchAgent instalado y andando.**

Cada día a las **3:03 AM** se dispara `com.izn.backup` (macOS LaunchAgent) que:
1. Descarga todo Firestore a un JSON local en `backups/` (últimos 30, resto rota)
2. Sube una copia a la carpeta de Drive con nombre legible

Los backups en Drive aparecen como:
```
IZN · Backup del Martes 22 Abr 2026 · 07h30 · 312 registros.json
```

Los locales (para cleanup y orden) como:
```
IZN_Backup_2026-04-22_07h30.json
```

---

## Arquitectura

- **Autenticación**: OAuth 2.0 con la cuenta personal (`dcontro20@gmail.com`).
  No usamos Service Account porque Google no les da storage en My Drive.
  Refresh token guardado en `.credentials/drive-oauth-token.json` (gitignoreado).
- **Scope**: `drive.file` — solo ve/edita los archivos que la app creó.
  No puede listar o tocar el resto de tu Drive.
- **Fallback**: si el token caduca (no debería si la app está "Published"),
  correr `node scripts/auth-oauth.mjs` para re-autorizar.

---

## Archivos del sistema

| Path | Qué hace |
|---|---|
| `scripts/backup.mjs` | Script principal. `--upload` sube a Drive, `--quiet` silencia logs |
| `scripts/auth-oauth.mjs` | Flow de autorización OAuth (abre browser, capta refresh token) |
| `scripts/com.izn.backup.plist` | LaunchAgent que corre el backup cada día |
| `.credentials/drive-oauth-client.json` | OAuth Client ID (del Google Cloud Console) |
| `.credentials/drive-oauth-token.json` | Refresh + access token (generado por auth-oauth) |
| `.credentials/` está en `.gitignore` | Nunca se commitean las credenciales |

---

## Comandos útiles

### Backup manual
```bash
node scripts/backup.mjs           # solo local
node scripts/backup.mjs --upload  # local + Drive
```

### Ver status del agent
```bash
launchctl list com.izn.backup
# LastExitStatus = 0 → último run OK
# PID presente → corriendo ahora mismo
```

### Forzar un run ahora (sin esperar a las 3 AM)
```bash
launchctl kickstart -k gui/$(id -u)/com.izn.backup
```

### Ver logs
```bash
tail /tmp/izn-backup.log   # stdout (vacío si --quiet)
tail /tmp/izn-backup.err   # stderr (si falló, aparece acá)
```

### Deshabilitar el agent
```bash
launchctl unload ~/Library/LaunchAgents/com.izn.backup.plist
```

### Rehabilitar
```bash
launchctl load ~/Library/LaunchAgents/com.izn.backup.plist
```

### Actualizar el plist si el proyecto se mueve de lugar
Editar `scripts/com.izn.backup.plist` (cambiar los paths absolutos), después:
```bash
launchctl unload ~/Library/LaunchAgents/com.izn.backup.plist
cp scripts/com.izn.backup.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.izn.backup.plist
```

---

## Troubleshooting

### El script se cuelga bajo launchd
Pasó una vez en el setup inicial. Si `launchctl list com.izn.backup` muestra un
PID que nunca cambia, matalo:
```bash
kill -9 <PID>
```
y reintentá con kickstart.

### Token expirado (error "invalid_grant")
```bash
node scripts/auth-oauth.mjs
```
Re-autorizá en el browser. Actualiza el refresh_token.

### Cambié la cuenta de Google o quiero revocar acceso
1. Entrar a https://myaccount.google.com/permissions
2. Buscar "IZN Backup" → Revocar
3. Borrar `.credentials/drive-oauth-token.json`
4. Correr `node scripts/auth-oauth.mjs` de nuevo

---

## Si algún día el Mac no está prendido a las 3 AM

`launchd` tiene memoria: si el trigger de la hora no se disparó porque la máquina
estaba dormida o apagada, lo corre cuando se despierta (salvo que el plist diga
`StartCalendarInterval` sin `StartOnMount`, que es nuestro caso — se pierde ese
día).

Si querés forzar que siempre corra, hay 2 opciones:
1. Agregar `<key>StartOnMount</key><true/>` al plist (arriesgado, muchos triggers)
2. Al abrir la Mac, correr manualmente `launchctl kickstart -k gui/$(id -u)/com.izn.backup`

Por ahora dejamos lo simple: si la Mac está despierta a las 3 AM, hay backup;
si no, el del día siguiente.

---

## Cómo se armó todo (referencia histórica)

1. Se creó un OAuth 2.0 Client (tipo Desktop) en Google Cloud Console:
   https://console.cloud.google.com/apis/credentials?project=imports-zona-norte
2. Consent screen en modo External, publicada (sin esto los refresh tokens
   caducan cada 7 días).
3. `npm install googleapis`
4. `scripts/auth-oauth.mjs` levantó un server local, abrió Chrome con la URL
   de auth, capturó el code y lo cambió por refresh_token.
5. `cp scripts/com.izn.backup.plist ~/Library/LaunchAgents/`
6. `launchctl load ~/Library/LaunchAgents/com.izn.backup.plist`
