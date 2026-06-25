# 🤖 Agente Redactor — mensaje de stock diario con IA

Primer agente autónomo "que trabaja solo" del sistema. Cada día, antes de cada
slot de mensaje (mediodía y tarde), **escribe el copy del mensaje de stock** y lo
deja listo en Firestore para copiar/pegar al grupo de WhatsApp.

El objetivo: que el mensaje diario **no sea siempre idéntico**. Hoy el mensaje de
presencia es el mismo texto fijo dos veces por día — construye hábito pero cansa.
El redactor le pone variedad humana arriba (gancho + urgencia + cierre) que cambia
según el día de la semana, el horario y lo que hay en stock.

## Qué hace exactamente (y qué NO)

- **La IA escribe SÓLO el marco humano**: una línea de gancho, una línea opcional
  de urgencia/novedad, y un cierre con llamada a la acción.
- **La IA NUNCA inventa stock ni precios.** El catálogo (marcas, modelos, sabores,
  precios) lo sigue generando `generateFullMessage()` — la misma función
  determinista de la sección WhatsApp. La IA recibe sólo *señales* (cuántos
  sabores hay, qué llegó nuevo, qué se está por agotar, qué se vende más) para
  elegir el tono.
- **Funciona aunque no haya IA configurada.** Si falta `ANTHROPIC_API_KEY`, cae a
  un copy de *template* que igual rota por día×horario. Nunca queda sin generar.

## Arquitectura

```
GitHub Actions cron (2×/día)
   └─ POST /api/generate-daily-message   (Vercel Serverless)
        ├─ lee products + sales + exchangeRate de Firestore (appData)
        ├─ buildCatalogContext()  → señales para el LLM           [PURO]
        ├─ Claude (claude-opus-4-8) escribe el copy {hook,urgency,cta}
        │     └─ si no hay API key o falla → templateCopy()       [PURO]
        ├─ generateFullMessage()  → catálogo determinista
        ├─ composeDailyMessage()  → mensaje final                  [PURO]
        └─ guarda en Firestore  dailyMessage/{fecha}_{slot}
```

| Archivo | Rol |
|---------|-----|
| `src/lib/messageAgent.js` | Funciones PURAS: contexto, template, prompts, ensamblado. **23 tests.** |
| `src/lib/messageAgent.test.js` | Tests de las funciones puras. |
| `api/generate-daily-message.js` | Endpoint serverless: Firestore + Claude + fallback. |
| `.github/workflows/message-agent-cron.yml` | Cron 2×/día (~30 min antes de cada slot). |

## Output en Firestore

Documento `dailyMessage/{YYYY-MM-DD}_{noon|evening}`:

```json
{
  "date": "2026-06-25",
  "slot": "noon",
  "message": "<mensaje completo listo para copiar/pegar>",
  "copy": { "hook": "...", "urgency": "... | null", "cta": "...", "source": "ai" },
  "source": "ai",            // "ai" o "template"
  "stats": { "flavors": 87, "models": 14, "brands": 5, "units": 320 },
  "generatedAt": "2026-06-25T14:31:02.000Z"
}
```

## Setup (una sola vez, lo hace Diego)

1. **Secret de GitHub Actions** — ya existe: usa el mismo `PUSH_CRON_SECRET` de la
   push. No hay que crear nada nuevo.
2. **Env vars en Vercel** (proyecto `imports-zona-norte`):
   - `FIREBASE_SERVICE_ACCOUNT` — ya existe (lo usa la push).
   - `PUSH_CRON_SECRET` — ya existe.
   - `ANTHROPIC_API_KEY` — **nueva, opcional.** Sin ella el agente usa el template.
     Crear en https://console.anthropic.com → API Keys, pegarla en Vercel.
   - `MESSAGE_AGENT_MODEL` — opcional, default `claude-opus-4-8`.
3. **Deploy**: push a `main` → Vercel deploya el endpoint en 1-2 min.

## Probarlo a mano

Sin esperar al cron:

```bash
curl -X POST "https://imports-zona-norte.vercel.app/api/generate-daily-message?test=1&slot=noon" \
  -H "Authorization: Bearer $PUSH_CRON_SECRET"
```

O desde GitHub → Actions → "Agente Redactor (mensaje diario)" → Run workflow
(con el toggle `test`). La respuesta trae un `preview` de los primeros 280
caracteres del mensaje generado.

## Costo

Un mensaje son ~1-2k tokens de entrada + ~300 de salida. A 2 mensajes/día con
`claude-opus-4-8` es del orden de **centavos de dólar por día**. El dedupe evita
regenerar: aunque el cron pinguee varias veces, sólo genera 1 vez por slot.

## Próximo paso: mostrarlo en la app (pendiente, fuera de este PoC)

El mensaje ya queda en `dailyMessage/{fecha}_{slot}`. Para que Diego lo vea en la
app sin abrir Firestore, falta cablear la lectura en el front:

1. Suscribir `dailyMessage` en `useFirebaseSync.js` (un `onSnapshot` más).
2. En `WhatsApp.jsx` agregar un modo **"✨ Mensaje de hoy (IA)"** que muestre
   `dailyMessage[hoy_slot].message` con el botón de copiar que ya existe.
3. Opcional: que la push (`send-daily-push.js`) use `copy.hook` como cuerpo de la
   notificación, para que el preview en el lock screen también sea distinto cada día.

Eso es UI; el agente (backend autónomo) ya está completo y testeado.
