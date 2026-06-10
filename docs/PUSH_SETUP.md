# 📡 Push remotas (FCM) — Guía de setup

Las notificaciones diarias tienen 2 modos:

| Modo | Cuándo llega | Estado |
|------|-------------|--------|
| **Local** | Solo si abriste la app ese día | ✅ Funciona ya, sin setup |
| **Remota (FCM)** | **SIEMPRE** — app cerrada, teléfono en el bolsillo | ⚙️ Requiere este setup (una sola vez, ~10 min) |

La app usa remotas si están configuradas y cae a locales automáticamente si no.

## Arquitectura

```
GitHub Actions (cron cada 10 min)
   → POST https://imports-zona-norte.vercel.app/api/send-daily-push
      (Vercel Serverless Function con firebase-admin)
      → lee push/config (horarios) + pushTokens (dispositivos) de Firestore
      → ¿algún slot en ventana? ¿ya se mandó hoy? (dedupe atómico)
      → FCM manda la push → iPhone la muestra (app cerrada OK)
```

- Ventana de tolerancia: 45 min (los crons de GH Actions se atrasan a veces).
- Dedupe: doc `push/sent_{fecha}_{slot}` con `.create()` — imposible mandar 2 veces.
- Tokens muertos se limpian solos en cada envío.

---

## Setup — 3 pasos manuales (solo Diego puede hacerlos)

### Paso 1 — VAPID key (Firebase Console)

1. https://console.firebase.google.com → proyecto **imports-zona-norte**
2. ⚙️ **Project settings** → pestaña **Cloud Messaging**
3. Sección **Web configuration** → **Web Push certificates** → **Generate key pair**
4. Copiá la key (empieza con `B...`, ~88 caracteres)
5. Pegala en **`src/lib/pushConfig.js`**:
   ```js
   export const VAPID_PUBLIC_KEY = "BNxx...laKeyCompleta...";
   ```
6. Commit + push (es una clave pública, es seguro comitearla)

### Paso 2 — Service Account + env vars en Vercel

1. Firebase Console → ⚙️ **Project settings** → pestaña **Service accounts**
2. **Generate new private key** → descarga un `.json`
3. https://vercel.com → proyecto **imports-zona-norte** → **Settings → Environment Variables**:

   | Nombre | Valor |
   |--------|-------|
   | `FIREBASE_SERVICE_ACCOUNT` | Todo el contenido del `.json` pegado tal cual (una sola variable) |
   | `PUSH_CRON_SECRET` | Un string random largo. Generalo con: `openssl rand -hex 24` |

4. **Redeploy** (Deployments → ⋯ → Redeploy) para que las env vars tomen efecto
5. ⚠️ Borrá el `.json` descargado después de pegarlo (es la llave maestra del proyecto)

### Paso 3 — Secret en GitHub

1. https://github.com/dcontro20/imports-zona-norte → **Settings → Secrets and variables → Actions**
2. **New repository secret**:
   - Nombre: `PUSH_CRON_SECRET`
   - Valor: **el mismo** string del paso 2

### Paso 4 — Deployar reglas de Firestore

Las rules nuevas permiten al cliente escribir `pushTokens` y `push/config`:

```bash
firebase deploy --only firestore:rules
```

---

## Activación en el iPhone

1. La PWA tiene que estar **instalada en la pantalla de inicio** (requisito de iOS para push; iOS 16.4+)
2. Abrir la app → ⚙️ Ajustes → **🔔 Recordatorios diarios** → activar
3. Conceder permiso cuando iOS lo pida
4. Debería aparecer el chip verde **"📡 Push remoto activo"**
   - Si dice "listo para activar" → tocá **"Activar en este dispositivo"**
5. Guardar

## Probar que funciona

**Opción A (GitHub):** repo → **Actions** → workflow **Push diario** → **Run workflow** → tildá `test` → Run. En ~30 segundos llega "🔔 Push de prueba" al iPhone (cerrá la app antes para validar el caso real).

**Opción B (terminal):**
```bash
curl -X POST "https://imports-zona-norte.vercel.app/api/send-daily-push?test=1" \
  -H "Authorization: Bearer TU_PUSH_CRON_SECRET"
```

## Troubleshooting

| Síntoma | Causa probable |
|---------|---------------|
| Chip ámbar "falta setup" en Ajustes | `VAPID_PUBLIC_KEY` vacía en `src/lib/pushConfig.js` (paso 1) |
| Endpoint devuelve 401 | `PUSH_CRON_SECRET` distinto entre Vercel y GitHub |
| Endpoint devuelve `admin_init_failed` | `FIREBASE_SERVICE_ACCOUNT` mal pegado (tiene que ser el JSON completo) |
| `skipped: no_tokens` | Ningún dispositivo registrado — repetir "Activación en el iPhone" |
| `skipped: disabled_or_no_config` | El toggle de Ajustes está apagado, o nunca se guardó con push activo |
| Push de prueba llega pero las diarias no | Revisar que el workflow esté corriendo (Actions → Push diario) y que los horarios en `push/config` sean los esperados |
| No llega nada al iPhone | ¿PWA instalada en home screen? ¿Permiso concedido en iOS Ajustes → Notificaciones? |

## Costos

Todo gratis: FCM no se cobra, GitHub Actions es gratis en repos públicos,
y ~144 invocaciones/día del endpoint están holgadísimas dentro del free
tier de Vercel.
