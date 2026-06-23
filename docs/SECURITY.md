# 🛡️ Seguridad — Imports Zona Norte

Estado y checklist de hardening. Auditoría completa: 2026-06-23.

## Modelo de seguridad (entender esto primero)

La app es un frontend React que habla **directo** con Firebase desde el
navegador. El código JS es **público por diseño** (se descarga al browser).
Por eso "esconder el código" NO da seguridad. La seguridad real vive en:

1. **Reglas de Firestore** — quién puede leer/escribir cada cosa.
2. **Seguridad de las cuentas** — passwords fuertes + 2FA.
3. **Firebase App Check** — que solo TU app pueda hablar con Firebase.
4. **No filtrar la llave admin** (service account) — saltea todas las reglas.

Cosas que NO son vulnerabilidades (no perder tiempo): la `apiKey` de Firebase
en el cliente (es pública y normal), la VAPID key pública, la ausencia de
sourcemaps (ya está bien).

---

## ✅ Arreglado en código (commits de la sesión 2026-06-23)

- **Passwords fuera del repo**: `create-users.mjs` y `backup.mjs` leen las
  contraseñas de variables de entorno; ya no hay credenciales en el código.
- **Endpoint timing-safe**: `api/send-daily-push.js` compara el secreto con
  `crypto.timingSafeEqual` y no devuelve detalles de error internos.
- **Logout seguro**: al cerrar sesión se borra todo el cache del negocio del
  dispositivo (localStorage `vapestock_*`/`izn:*` + IndexedDB de Firestore) y
  se recarga limpio. Tras un logout no queda nada legible en el navegador.
- **Security headers** (`vercel.json`): HSTS, X-Frame-Options DENY (anti
  clickjacking), nosniff, Referrer-Policy, Permissions-Policy, y CSP con
  `frame-ancestors 'none'` + `object-src 'none'` + `base-uri 'self'` +
  `upgrade-insecure-requests`.
- **Reglas de Firestore con validación**: `appData` valida que `data` sea
  string < 900KB y `updatedAt` string — bloquea writes malformados/gigantes.
- **`.gitignore`** ampliado: `.env*`, `*-service-account*.json`, `*-adminsdk-*.json`.
- **App Check scaffolding**: `firebase.js` queda listo para activar App Check
  pegando la site key en `APP_CHECK_SITE_KEY` (ver abajo).

---

## ⚠️ TENÉS QUE HACER VOS (consolas) — por orden de urgencia

Esto es lo único que neutraliza lo crítico de verdad. El código ya está; falta
la parte de cuentas que solo vos podés tocar.

### 1. 🔴 URGENTE — Rotar las 2 contraseñas de Firebase Auth
Las viejas (`Poncharelo20!` y `Chapu2299`) estuvieron en el repo público y
quedan en el historial de git para siempre. **Asumilas comprometidas.**
- Firebase Console → **Authentication → Users**
- Por cada usuario (Diego + Gustavo): ⋯ → **Reset password** (te manda mail) o
  borrá y recreá con una password nueva, larga y única.
- Usá contraseñas distintas a cualquier otra que uses en otro lado.

### 2. 🔴 URGENTE — Rotar la llave admin (service account)
La que compartiste en el chat. Saltea TODAS las reglas = acceso total.
- Firebase Console → ⚙️ Project settings → **Service accounts** →
  "Manage service account permissions" (abre Google Cloud Console)
- En la cuenta `firebase-adminsdk-…` → tab **Keys** → borrá la key vieja
  (ID empieza en `22a82f8610…`) → **Generate new private key**.
- Pegá el JSON nuevo en Vercel → proyecto `imports-zona-norte` → Settings →
  Environment Variables → `FIREBASE_SERVICE_ACCOUNT` → Save → **Redeploy**.

### 3. 🟠 Hacer el repo privado
No hay razón para que un sistema interno sea público.
- GitHub → repo → **Settings** → General → abajo "Danger Zone" →
  **Change visibility → Make private**.

### 4. 🟠 Activar Firebase App Check (anti-clonado/anti-bot)
La defensa que apunta a "que no nos puedan clonar".
- Firebase Console → **App Check** → registrá la web app con **reCAPTCHA v3**
  → te da una **site key**.
- Pegala en `src/lib`/`firebase.js` → `APP_CHECK_SITE_KEY = "..."` → commit
  (pasámela y lo hago yo, es pública).
- En App Check → **Enforcement**: activá enforce para **Cloud Firestore** y
  **Authentication** (empezá en modo monitoreo unos días para confirmar que
  no bloquea tráfico legítimo, después enforce).

### 5. 🟡 Activar 2FA en las cuentas madre
La cadena de seguridad es tan fuerte como la cuenta de Google de Diego.
- Cuenta de Google (Firebase + Drive del backup): activá verificación en 2 pasos.
- GitHub: Settings → Password and authentication → 2FA.
- Vercel: Settings → 2FA.

---

## 📌 Recomendaciones adicionales (menor prioridad)

- **`xlsx` tiene vulnerabilidades sin fix en npm** (prototype pollution / ReDoS,
  afectan al PARSEAR archivos maliciosos). Si en algún momento la app importa
  planillas subidas por terceros, migrar a la versión del CDN oficial de SheetJS:
  `npm i https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz`. Hoy se usa sobre
  todo para EXPORTAR (escribir), donde el riesgo es bajo — por eso no se cambió
  automático (podría romper el export). Evaluar.
- **Backup cifrado**: el backup en Drive es un JSON en claro con toda la data.
  Si la cuenta de Drive tiene 2FA, el riesgo es bajo. Considerar cifrarlo si la
  sensibilidad lo amerita. Verificar que la carpeta de Drive NO esté compartida.
- **CSP completa**: hoy se aplica la versión segura (frame-ancestors/object-src/
  base-uri). Una CSP completa con `script-src`/`connect-src` restringidos daría
  más defensa anti-XSS, pero requiere listar todos los dominios de Firebase/
  fonts/APIs y testear que no rompa. Pendiente como mejora con testing.

---

## Revisión periódica

- `npm audit` cada tanto; aplicar `npm audit fix` cuando haya fixes no-breaking.
- Revisar usuarios en Firebase Auth (que no haya cuentas de más).
- Confirmar que el repo siga privado y que ningún secreto nuevo se commitee.
