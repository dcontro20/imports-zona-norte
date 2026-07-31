# DISCOVERY — Setup del worker (Mac de Gustavo)

El Discovery Engine es capacidad propia de Imports (contrato:
`docs/DISCOVERY_ENGINE_CONTRATO.md`). Esta guía deja el worker corriendo:
Diego busca "quioscos en Palermo" desde la app → el worker lo scrapea con
gosom → los resultados llegan al Pipeline para revisar.

## 1. Binario gosom (una vez)

El scraper es un tercero: `github.com/gosom/google-maps-scraper` **v1.17.2**,
release **darwin-amd64** (verificado en macOS Monterey 12.7). Copia propia de
Imports, gitignoreada:

```bash
mkdir -p scripts/discovery/bin
# Opción A — copiar el que ya funciona en Atlas (misma Mac):
cp /Users/Gustavo/Desktop/atlas/.data/tools/gosom/google-maps-scraper scripts/discovery/bin/
# Opción B — descargar el release darwin-amd64 v1.17.2 de GitHub y:
chmod +x scripts/discovery/bin/google-maps-scraper
xattr -d com.apple.quarantine scripts/discovery/bin/google-maps-scraper 2>/dev/null || true
```

Ruta alternativa por env: `GOSOM_BINARY=/otra/ruta`.

## 2. Service account de Firebase (una vez)

El worker escribe `discoveryResults` con **Admin SDK** (las rules le niegan
`create` incluso al owner — solo el worker puede escribir staging).

1. [Firebase Console](https://console.firebase.google.com) → proyecto
   `imports-zona-norte` → ⚙️ Configuración → **Cuentas de servicio**.
2. **Generar nueva clave privada** → se descarga un JSON.
3. Guardarlo como `.credentials/firebase-admin-sa.json` (gitignoreado — ¡jamás
   commitear!).

Alternativa por env: `FIREBASE_SERVICE_ACCOUNT='<JSON completo>'` (es la misma
credencial que usa `api/send-daily-push.js` en Vercel).

## 3. Reglas Firestore (una vez, cuando corresponda)

```bash
firebase deploy --only firestore:rules
```

Agrega `discoveryJobs` (Diego rw) y `discoveryResults` (Diego read+delete;
create/update denegados — escribe solo el worker).

## 4. Probar a mano

```bash
node scripts/discovery/worker.mjs
# "sin jobs pendientes" = todo OK, esperando búsquedas.
# Crear una búsqueda desde la app (Pipeline → 🔎 Descubrir) y re-correr.
```

## 5. LaunchAgent (cada 5 minutos)

```bash
cp scripts/discovery/com.izn.discovery.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.izn.discovery.plist
launchctl start com.izn.discovery        # probar ya
tail -f /tmp/izn-discovery.log
```

El claim transaccional hace inofensivo el solapamiento (un scrape de 60
resultados tarda ~3-8 min, más que el intervalo). Si la Mac está apagada, los
jobs quedan "en cola" y se procesan al volver — visible en la app.

## Troubleshooting

- **"binario de gosom no encontrado"** → paso 1.
- **"Sin credenciales Admin SDK"** → paso 2.
- **Job en error "gosom no produjo resultados"** → el error del binario queda
  textual en el job (visible en la app, fila ⚠️). Suele ser red o cambio de
  Google Maps; reintentarlo es crear la búsqueda de nuevo.
- **Job clavado "en curso"** (worker muerto a mitad de scrape) → borrarlo
  desde Firestore console o re-crear la búsqueda; el claim no re-toma
  jobs en_curso a propósito (evita doble scrape).
- macOS puede pedir **Full Disk Access** para node la primera vez (igual que
  el backup): System Settings → Privacy & Security → Full Disk Access.
