# Firebase Auth + reglas de Firestore — configuración

Este proyecto ya tenía **Firebase Auth Email/Password** implementado en el código, pero:
- **No había roles** — todos los logins eran equivalentes
- **Las reglas de Firestore estaban abiertas** (`allow read, write: if true`) — cualquiera con la URL podía escribir datos aunque no estuviera logueado

Este doc describe qué se agregó y cómo desplegar las reglas.

---

## Qué cambió en el código (ya está mergeado)

### 1. Roles en `src/firebase.js`
```js
const USER_PROFILES = {
  "dcontro20@gmail.com":   { name: "Diego",   role: "owner",   ... },
  "dcontro20@hotmail.com": { name: "Gustavo", role: "manager", ... },
};

export const isOwner = (user) => user?.role === "owner";
export const canDelete = (user) => user?.role === "owner";
export const canViewFinances = (user) => user?.role === "owner";
```

### 2. Nav items con flag `ownerOnly` en `src/App.jsx`
Gustavo **no ve** estas secciones en el sidebar:
- **Socios** (finanzas personales de división 50/50)
- **Cierres** (cierres mensuales)
- **Exportar** (descarga CSV completa)
- **Auditoría** (log de acciones de todos)
- **Papelera** (restaurar datos borrados)

Si Gustavo ingresa la ruta directamente, hay un fallback automático a Dashboard.

### 3. Reglas de Firestore en `firestore.rules`
Creado el archivo. Bloquea:
- **Acceso anónimo** — solo usuarios autenticados leen/escriben
- **Keys owner-only** — `partnerWithdrawals` y `monthlyClosures` solo las puede modificar Diego
- **Cualquier otra colección** — cerrada por default

---

## Pasos para desplegar las reglas (hacé vos)

### Opción A — Desde Firebase CLI (recomendado)

```bash
# Instalar Firebase CLI si no la tenés
npm install -g firebase-tools

# Login con tu cuenta dcontro20@gmail.com
firebase login

# Desde la raíz del proyecto
cd /Users/Diego/Desktop/imports-zona-norte

# Enlazar al proyecto (solo primera vez)
firebase use imports-zona-norte

# Deploy SOLO de las reglas (no toca código ni hosting)
firebase deploy --only firestore:rules
```

Deberías ver algo como:
```
✔  cloud.firestore: rules file firestore.rules compiled successfully
✔  firestore: released rules firestore.rules to cloud.firestore
```

### Opción B — Desde Firebase Console (si no querés CLI)

1. Ir a https://console.firebase.google.com/project/imports-zona-norte/firestore/rules
2. Copiar todo el contenido de `firestore.rules`
3. Pegarlo en el editor de rules de la consola
4. Click en **Publish**

---

## Verificación post-deploy

1. **Login con Diego** (dcontro20@gmail.com) → debería ver TODO el sidebar
2. **Login con Gustavo** (dcontro20@hotmail.com) → debería ver sidebar sin Socios/Cierres/Exportar/Auditoría/Papelera
3. **Logout y refrescar sin login** → debería aparecer la pantalla de login (la app no debería cargar datos)

Si algo se rompe:
- **App carga pero no muestra datos**: los usuarios de Firebase Auth probablemente no existen todavía. Crealos desde Firebase Console → Authentication → Users → Add user.
- **Diego no puede escribir**: verificá que su email sea exactamente `dcontro20@gmail.com` en Firebase Auth.
- **Para rollback rápido**: en Firebase Console, reemplazá las reglas por `allow read, write: if true;` (pero eso re-abre la DB).

---

## Lo que NO hace esta configuración

Esta implementación es **pragmática, no perfecta**:

1. **Los writes son full-doc replace** — cuando la app guarda "sales", manda todo el array. Las reglas no pueden distinguir "agregó 1 item" de "borró los 500". La única granularidad real es "qué keys puede tocar cada rol".

2. **El UI esconde deletes pero no bloquea**. Gustavo podría, en teoría, hackear devtools para disparar un delete en la UI. Pero igual no podría escribir a Firestore en `partnerWithdrawals`/`monthlyClosures` — las rules lo frenan.

3. **AuditLog es legible por Gustavo**. Él no ve el botón de Auditoría en el sidebar pero puede escribir al audit log (para registrar sus propias acciones). Si algún día querés que sea ownerOnly también, agregalo a `isOwnerOnlyKey` en `firestore.rules`.

4. **No hay refresh de sesión forzado**. Si Diego cambia el rol de alguien (cambiando el email en USER_PROFILES), el usuario tiene que hacer logout+login para que tome efecto.
