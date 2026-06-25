# 🤖 Agente Redactor — mensaje de stock diario (cero costo extra)

Primer agente autónomo del sistema. Cada día, antes de cada slot (mediodía y
tarde), **arma el mensaje de stock** y lo deja listo en Firestore para
copiar/pegar al grupo de WhatsApp.

El objetivo: que el mensaje diario **no sea siempre idéntico**. Hoy el mensaje de
presencia es el mismo texto fijo dos veces por día — construye hábito pero cansa.
El redactor le pone variedad humana arriba (gancho + urgencia + cierre) que cambia
según el día de la semana, el horario y lo que hay en stock.

## 💸 Decisión de costos (importante)

**No usa ninguna API paga.** Llamar a la API de Anthropic por token cuesta plata
aparte del plan MAX que Diego ya paga. En vez de eso:

- La **creatividad** la escribe Claude **en la sesión de Diego** (plan MAX, sin
  gasto extra) y la deja en un **banco de copys** (`src/lib/messageCopyBank.js`).
- El **sistema en vivo** sólo SELECCIONA del banco de forma contextual y rotada
  — cero red, cero costo, cero infra frágil.
- Para refrescar el material: **`/regenerar-banco-mensajes`** en Claude Code.
  Eso reescribe el banco usando el plan MAX. Sin gasto.

Resultado: variedad real por día/horario/situación, sin pagar un centavo de más.

## Qué hace exactamente (y qué NO)

- **Escribe SÓLO el marco humano**: un gancho de apertura, una línea opcional de
  urgencia/novedad, y un cierre con llamada a la acción.
- **NUNCA inventa stock ni precios.** El catálogo (marcas, modelos, sabores,
  precios) lo genera `generateFullMessage()` — la misma función determinista de
  la sección WhatsApp. El banco recibe sólo *señales* (cuántos sabores hay, qué
  llegó nuevo, qué se agota, qué se vende más) para elegir el tono y rellenar
  los placeholders con datos reales.

## Arquitectura

```
GitHub Actions cron (2×/día)
   └─ POST /api/generate-daily-message   (Vercel Serverless, SIN API paga)
        ├─ lee products + sales + exchangeRate de Firestore (appData)
        ├─ buildCatalogContext()  → señales + daySeed (rotación)   [PURO]
        ├─ pickDailyCopy()        → elige copy del banco           [PURO]
        ├─ generateFullMessage()  → catálogo determinista
        ├─ composeDailyMessage()  → mensaje final                  [PURO]
        └─ guarda en Firestore  dailyMessage/{fecha}_{slot}

Refresco creativo (cuando Diego quiera, en su sesión, plan MAX):
   /regenerar-banco-mensajes  → Claude reescribe messageCopyBank.js
```

| Archivo | Rol |
|---------|-----|
| `src/lib/messageCopyBank.js` | El material creativo (pools de gancho/urgencia/cierre) + selector `pickDailyCopy`. **15 tests.** |
| `src/lib/messageAgent.js` | Plumbing puro: contexto, ensamblado. **18 tests.** |
| `api/generate-daily-message.js` | Endpoint serverless: Firestore + selección del banco. Sin API paga. |
| `.github/workflows/message-agent-cron.yml` | Cron 2×/día (~30 min antes de cada slot). |
| `.claude/commands/regenerar-banco-mensajes.md` | Comando para refrescar el banco con el plan MAX. |

## Output en Firestore

Documento `dailyMessage/{YYYY-MM-DD}_{noon|evening}`:

```json
{
  "date": "2026-06-25",
  "slot": "noon",
  "message": "<mensaje completo listo para copiar/pegar>",
  "copy": { "hook": "...", "urgency": "... | null", "cta": "...", "source": "bank", "situation": "novedad" },
  "source": "bank",
  "situation": "novedad",        // novedad | agotando | top | normal
  "stats": { "flavors": 87, "models": 14, "brands": 5, "units": 320 },
  "generatedAt": "2026-06-25T14:31:02.000Z"
}
```

## Setup (una sola vez, lo hace Diego)

**No hay env vars nuevas.** Todo lo que necesita ya existe para la push:

1. `FIREBASE_SERVICE_ACCOUNT` — ya está en Vercel.
2. `PUSH_CRON_SECRET` — ya está en Vercel y en GitHub Actions.
3. **Deploy**: push a `main` → Vercel deploya el endpoint en 1-2 min.

Eso es todo. El cron empieza a generar el mensaje 2×/día automáticamente.

## Probarlo a mano

Sin esperar al cron:

```bash
curl -X POST "https://imports-zona-norte.vercel.app/api/generate-daily-message?test=1&slot=noon" \
  -H "Authorization: Bearer $PUSH_CRON_SECRET"
```

O desde GitHub → Actions → "Agente Redactor (mensaje diario)" → Run workflow
(con el toggle `test`). La respuesta trae un `preview` de los primeros 280
caracteres del mensaje generado.

## Refrescar los textos

Cuando los mensajes empiecen a sonar repetidos, en Claude Code:

```
/regenerar-banco-mensajes
```

Claude reescribe el banco con variantes nuevas (usando el plan MAX, sin costo),
corre los tests y te muestra ejemplos para aprobar.

## Próximo paso: mostrarlo en la app (pendiente, fuera de este PoC)

El mensaje ya queda en `dailyMessage/{fecha}_{slot}`. Para que Diego lo vea en la
app sin abrir Firestore, falta cablear la lectura en el front:

1. Suscribir `dailyMessage` en `useFirebaseSync.js` (un `onSnapshot` más).
2. En `WhatsApp.jsx` agregar un modo **"✨ Mensaje de hoy"** que muestre
   `dailyMessage[hoy_slot].message` con el botón de copiar que ya existe.
3. Opcional: que la push (`send-daily-push.js`) use `copy.hook` como cuerpo de la
   notificación, para que el preview en el lock screen también cambie cada día.

Eso es UI; el agente (backend autónomo) ya está completo y testeado.
