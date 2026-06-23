# SESSION 2026-06-22 — Notificaciones diarias: locales → push remotas (FCM)

## TL;DR

Diego pidió notificaciones a su iPhone para tomar el hábito de mandar los 2
mensajes de stock diarios al grupo. Implementamos primero **notificaciones
locales** configurables, y después —a pedido explícito de "que me lleguen
siempre, app abierta o no"— una capa completa de **push remotas vía FCM**
(Firebase Cloud Messaging) con backend serverless en Vercel + cron de GitHub
Actions. Sistema **probado end-to-end y funcionando en producción**: la push
de prueba llegó al lock screen con la app cerrada. **+11 tests (762 → 773).**
3 commits: `aa35c6f` (locales) → `3a5d645` (remotas) → `dddb6fc` (VAPID key).

## Cómo llegamos acá

Arrancó como continuación de las notificaciones locales (commit `aa35c6f` ya
estaba). Diego pidió subir de nivel: "Hagamos que las notificaciones sean
remotas, quiero que me lleguen siempre en cualquier contexto". Construimos
toda la infra de push remotas (`3a5d645`), documentamos el setup manual que
solo él podía hacer (Firebase Console + Vercel + GitHub), y lo acompañamos
paso a paso hasta que funcionó. Diego pegó la VAPID key (`dddb6fc`), configuró
los 3 secretos externos, y tras debuggear 2 errores reales (ver Decisiones)
la push de prueba llegó. Cerramos con `/persist-session`.

## Items cerrados / commits

- **`aa35c6f` — Notificaciones locales** (`src/lib/notifications.js`, 127 líneas,
  7 tests): wrapper sobre Notification API + scheduler con `setTimeout`. Helpers
  puros `parseTime` / `msUntilTodayTime` testeados (clamp 0-23/0-59, null si la
  hora ya pasó). 2 slots configurables (☀️ mediodía 12:00, 🌆 tarde 18:30) en
  `settings.js`. Sección "🔔 Recordatorios diarios" en SettingsModal con toggle,
  inputs time, estado del permiso con color. App.jsx programa al cargar + re-arma
  a medianoche. SW v29 con `notificationclick` → abre app en `?page=offers`.

- **`3a5d645` — Push remotas FCM** (607 líneas nuevas, +11 tests):
  - `src/lib/pushWindow.js` (lógica PURA compartida cliente/server, 11 tests):
    `nowInTZ` (hora ART vía Intl, maneja medianoche y hora "24"), `dueSlots`
    (ventana `[slot, slot+45min)`).
  - `src/lib/push.js` (cliente FCM, imports dinámicos): `enablePush` (getToken
    VAPID + guarda en Firestore `pushTokens/{token}`, maneja rotación),
    `disablePush`, `syncPushConfig`, `isPushConfigured`, `getStoredPushToken`.
  - `src/lib/pushConfig.js`: placeholder VAPID public key.
  - `api/send-daily-push.js` (Vercel Serverless, firebase-admin): auth Bearer
    `PUSH_CRON_SECRET`, lee config+tokens, dedupe atómico con `.create()`,
    limpia tokens muertos, `?test=1` para probar.
  - `.github/workflows/push-cron.yml`: cron `*/10 * * * *` + `workflow_dispatch`
    con input `test`.
  - SW v30: handler `push` renderiza data-messages de FCM.
  - `firestore.rules`: `pushTokens/{token}` + `push/{docId}` para owner.
  - App.jsx: estrategia en capas — intenta remoto, cae a local si no configurado.
  - `docs/PUSH_SETUP.md`: guía de setup manual paso a paso.

- **`dddb6fc` — VAPID public key**: Diego la generó en Firebase Console y la
  pegó. Activa `isPushConfigured() === true` en producción.

## Decisiones clave (para Claudes futuros)

- **Estrategia en capas local → remoto, no remoto puro.** App.jsx intenta push
  remoto primero; si `isPushConfigured()` es false (VAPID key vacía) o falla el
  registro, cae automáticamente a timers locales. Esto permitió shippear las
  locales primero y que el sistema nunca quede "roto" durante el setup remoto.
  Cuando el remoto registra OK, se cancelan los timers locales para no duplicar.

- **Cron externo (GitHub Actions) en vez de Vercel Cron.** GitHub Actions es
  gratis ilimitado en repos públicos. El endpoint es idempotente (dedupe en
  Firestore), así que pings de más son inofensivos. Pinguea cada 10 min.

- **Ventana de tolerancia de 45 min.** Los crons de GitHub Actions se atrasan
  5-20 min en horas pico. Sin ventana, un slot a las 12:00 se perdería si el
  cron llega 12:06. La notif puede caer unos minutos tarde pero llega.

- **Dedupe atómico con Firestore `.create()`.** El doc `push/sent_{fecha}_{slot}`
  se crea con `.create()` que falla con ALREADY_EXISTS (code 6) si ya existe.
  Sin locks ni race conditions — el primer ping del cron en la ventana gana,
  los siguientes saltan. Robusto ante los múltiples pings de la ventana de 45min.

- **`SW.registration.showNotification` en vez de `new Notification()`.** Mejor
  soporte en iOS PWA. iOS solo permite push si la PWA está instalada en home
  screen (iOS 16.4+).

- **firebase-admin como dependency (no devDep).** El endpoint serverless corre
  en producción y la necesita en runtime.

## Gotchas descubiertos en el setup (documentados en PUSH_SETUP.md troubleshooting)

Costó 2 rondas de debug con Diego — ambos son errores de configuración del
usuario, no de código, pero conviene recordarlos:

1. **401 por mismatch de `PUSH_CRON_SECRET`.** El secret tiene que ser
   IDÉNTICO en Vercel y en GitHub Secrets. Diego tenía 2 claves candidatas
   dando vueltas (una que le pasé yo, otra de su terminal) y las mezcló.
   Fix: usar UNA sola en ambos lados.

2. **Vars cargadas en el proyecto Vercel equivocado.** Diego tiene DOS
   proyectos Vercel: `imports-zona-norte` (la app de gestión interna, donde
   vive el endpoint) y `importszn-shop` (el catálogo público, branch
   `claude/website...`). Cargó las env vars en `importszn-shop` por error →
   el endpoint en `imports-zona-norte` no las tenía → 401. **Dato importante
   para futuro: hay 2 proyectos Vercel separados.**

3. **`firebase deploy` falla con "Not in a Firebase app directory"** si no
   estás parado en la carpeta del proyecto. `cd ~/Desktop/imports-zona-norte`
   primero.

4. **Diego decidió NO rotar la service account key** aunque la compartió en el
   chat (le advertí del riesgo, decisión informada suya). Si en el futuro hay
   sospecha de compromiso, rotarla desde Google Cloud Console → Service accounts
   → Keys.

## Estado final

Archivos nuevos del sistema de notificaciones:
```
src/lib/notifications.js       127   (locales + 7 tests en .test.js)
src/lib/push.js                128   (cliente FCM)
src/lib/pushWindow.js           56   (lógica pura + 11 tests en .test.js)
src/lib/pushConfig.js           14   (VAPID key — ya pegada)
api/send-daily-push.js         131   (Vercel Serverless Function)
.github/workflows/push-cron.yml 42   (cron cada 10 min)
docs/PUSH_SETUP.md             109   (guía de setup)
```

- **773 tests pasando** (45 archivos). Era 762 antes del push remoto.
- Build OK. SW en v30.
- Setup de producción COMPLETO: VAPID key pegada, env vars en Vercel
  (proyecto correcto), secret en GitHub, reglas Firestore deployadas,
  iPhone de Diego registrado. **Push de prueba confirmada llegando al
  lock screen con app cerrada.**
- Colecciones Firestore nuevas: `pushTokens` (1 doc por dispositivo) +
  `push` (doc `config` con horarios + docs `sent_{fecha}_{slot}` de dedupe).

---

*Escrito 2026-06-22 al cerrar la sesión de notificaciones remotas.*
