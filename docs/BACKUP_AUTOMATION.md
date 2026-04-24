# Backup automático — arquitectura de doble capa

## Problema que resuelve

El backup diario del sistema corre vía LaunchAgent de macOS
(`scripts/com.izn.backup.plist`) a las 3:03 AM. **Si la Mac de Diego está
apagada, dormida o sin WiFi a esa hora, el backup de ese día se salta.** Los
logs en `/tmp/izn-backup.err` tienen evidencia de varios días perdidos.

## Solución: 2 capas redundantes

| Capa | Dónde corre | Cuándo | Qué cubre |
|---|---|---|---|
| 1 | LaunchAgent local en la Mac | 3:03 AM ART si la Mac está despierta + con red | Día normal de trabajo |
| 2 | GitHub Actions (infra de GitHub) | 3:03 AM ART (6:03 UTC) siempre | Mac apagada / sin WiFi / de viaje |

Los dos upload el JSON al mismo Drive folder
(`1d57fOksNJePjSM1oC4c994z_UdAUnnuv`). Si ambos corren el mismo día, Drive
recibe 2 archivos con timestamps distintos — no hay sobrescritura ni
conflicto, solo redundancia extra.

## Setup inicial (acción manual de Diego — **una sola vez**)

### 1. Configurar secretos en GitHub

El workflow necesita acceder a:
- **FIREBASE_PASSWORD** — password de `dcontro20@gmail.com` en Firebase Auth
- **GOOGLE_DRIVE_TOKEN** — JSON completo del OAuth token de Drive

**Opción A — desde la terminal (más rápido):**

```bash
cd /Users/Diego/Desktop/imports-zona-norte
gh auth login  # solo si no lo hiciste
gh secret set FIREBASE_PASSWORD
# pegás el password cuando pregunta + Enter + Ctrl+D

gh secret set GOOGLE_DRIVE_TOKEN < .credentials/drive-oauth-token.json
```

**Opción B — desde la UI web:**

1. Ir a https://github.com/dcontro20/imports-zona-norte/settings/secrets/actions
2. Click **New repository secret**
3. Name: `FIREBASE_PASSWORD`, Value: el password, **Add secret**
4. Click **New repository secret** de nuevo
5. Name: `GOOGLE_DRIVE_TOKEN`, Value: **contenido completo** (copiar-pegar
   todo el JSON) de `/Users/Diego/Desktop/imports-zona-norte/.credentials/drive-oauth-token.json`
6. **Add secret**

### 2. Verificar que el workflow corra

1. Ir a https://github.com/dcontro20/imports-zona-norte/actions
2. Click **Backup diario a Drive** en el sidebar izquierdo
3. Click **Run workflow** (botón arriba a la derecha) → **Run workflow**
4. Esperá 30-60 segundos, refresh
5. Debería aparecer un run con ✅ verde
6. Verificá el Drive folder:
   https://drive.google.com/drive/folders/1d57fOksNJePjSM1oC4c994z_UdAUnnuv
   — debería haber un archivo `IZN · Backup del ... · N registros.json` nuevo
7. Si el run tiene ❌ rojo: click en el run → step "Correr backup" → leer el
   error. Los logs también se guardan como artifact para descargar.

### 3. Verificar que el cron esté agendado

Después del primer run manual exitoso:
- En la tab Actions, el workflow debería mostrar **Scheduled** en el listado
- Va a disparar solo cada día a las 6:03 UTC (3:03 AM ART)

## Arquitectura técnica

### Cambios en `scripts/backup.mjs`

El script ahora resuelve credenciales con precedencia:

```
1. env var (FIREBASE_PASSWORD / GOOGLE_DRIVE_TOKEN)
2. fallback local (hardcoded password / .credentials/drive-oauth-token.json)
```

En CI (detectado por `process.env.GITHUB_ACTIONS === "true"`), exige que las
env vars existan y crashea claramente si faltan. Esto evita que en CI caiga
silenciosamente al fallback local inseguro.

En local (LaunchAgent), las env vars no están, así que usa los fallbacks —
**cero cambio en el LaunchAgent existente**, sigue funcionando como antes.

### Refresh del OAuth token

googleapis rota el `access_token` cada hora usando el `refresh_token`. En
local, el script persiste el token refrescado al archivo. En CI no hace
falta persistir: el `refresh_token` no cambia, y cada run del workflow
empieza con el secret fresco.

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| Workflow falla "FIREBASE_PASSWORD no seteada" | No configuraste el secret | Setup paso 1 |
| Workflow falla "GOOGLE_DRIVE_TOKEN no es JSON válido" | Copiaste mal el JSON (faltó comilla/coma) | Re-abrí `.credentials/drive-oauth-token.json` y pegá todo de nuevo sin modificar |
| Workflow falla "invalid_grant" | El refresh token expiró | Local: `node scripts/auth-oauth.mjs` → copiar JSON actualizado al secret |
| LaunchAgent falla con "auth/network-request-failed" | Red no disponible al despertar la Mac | Ya tiene retry con backoff (10s/30s/60s) — debería auto-recuperarse |
| Drive tiene 2 backups el mismo día | Correcto — uno del LaunchAgent, otro de GitHub Actions | No hacer nada, es redundancia |

## Deshabilitar una capa

Si querés usar **solo GitHub Actions** y desactivar el LaunchAgent:

```bash
launchctl unload ~/Library/LaunchAgents/com.izn.backup.plist
```

Para reactivarlo:

```bash
launchctl load ~/Library/LaunchAgents/com.izn.backup.plist
```

Si querés desactivar **solo GitHub Actions**: comentá el bloque `schedule:`
en `.github/workflows/backup-diario.yml`, o deshabilitá el workflow desde la
UI de GitHub Actions.

Recomendación: **mantener ambas**. La redundancia cuesta 0 y te da tranquilidad.
