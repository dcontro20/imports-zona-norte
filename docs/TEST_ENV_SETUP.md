# Entorno de prueba aislado (Firebase de test separado de prod)

Objetivo: una copia de la app conectada a un **proyecto Firebase de PRUEBA**
(datos separados de producción), con URL accesible desde celu/iPad, donde se
pueden crear pedidos y clientes de prueba sin tocar la base real.

## Cómo funciona (ya cableado en el código)

`src/firebase.js` ahora lee la config de **env vars de Vite** con fallback a
producción. Si se setean las `VITE_FIREBASE_*`, la app apunta al proyecto de test;
si no, usa prod. El mismo código sirve para ambos, sin forkear. Al arrancar loguea
`[firebase] proyecto activo: <projectId>` en la consola (para confirmar que NO pega
a prod).

Env vars:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=<proj>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<proj>
VITE_FIREBASE_STORAGE_BUCKET=<proj>.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=1:...:web:...
```

## Parte de Diego (consola de Firebase — ~10 min, solo lo podés hacer vos)

Es tu cuenta de Google; Claude no puede crear el proyecto ni autenticarse a tu
consola. Pasos (todo desde el navegador, sirve en iPad):

1. **Firebase Console → Agregar proyecto** → nombre ej. `izn-test`. (Analytics: opcional/no.)
2. **Authentication → Comenzar → Sign-in method → Email/Password → Habilitar.**
3. **Authentication → Users → Add user:** email **`dcontro20@gmail.com`** + una
   contraseña de prueba (puede ser distinta de la de prod — es otro proyecto).
   → Usamos el mismo email para que las reglas y el perfil calcen sin tocar código.
4. **Firestore Database → Crear base → modo producción → región `southamerica-east1`.**
5. **Firestore → Rules:** pegá las MISMAS reglas de `firestore.rules` del repo
   (se cierran a `dcontro20@gmail.com`, que es tu test user) → Publicar.
6. **Project settings (⚙️) → General → Tus apps → Web (`</>`) → registrar app** →
   copiá el objeto `firebaseConfig` que te muestra → **pegámelo a Claude.**
   (Esa config web NO es secreta — se embebe en el browser de todas formas.)

## Parte de Claude (cuando pegues la config)

1. Genero un **deploy de test aislado** (branch dedicada con las `VITE_FIREBASE_*`
   apuntando a tu proyecto de test) → Vercel le da una **URL pública** (celu/iPad).
2. Verifico que el **login entra** y que la consola diga `proyecto activo: izn-test`
   (no prod).
3. Te paso el link. Ahí podés crear clientes/pedidos de prueba libremente: viven en
   la base de test, tu prod queda intacta.

## Nota sobre la pantalla en blanco del preview anterior

El fallback de `getUserProfile` acepta cualquier email como owner, así que el
perfil NO era la causa. Para login email/password, el "authorized domain" de
Firebase tampoco aplica (eso es para OAuth/redirect). Lo más probable: un chunk
viejo cacheado por el service worker en ese dominio de preview. Un deploy nuevo en
dominio limpio suele resolverlo. Si igual quedara en blanco, abrí la consola del
navegador (F12 → Console) y pasame el error en rojo.
