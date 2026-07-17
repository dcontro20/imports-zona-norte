---
description: Reescribe el banco de copys del Agente Redactor con material fresco (usa el plan MAX, cero costo extra)
---

# /regenerar-banco-mensajes — Refrescar el material del Agente Redactor

El Agente Redactor arma el mensaje de stock diario eligiendo copys de un BANCO
(`src/lib/messageCopyBank.js`). El sistema en vivo SÓLO selecciona del banco
(determinista, sin costo). La creatividad la escribís VOS (Claude) acá, en la
sesión de Diego — que ya paga el plan MAX, así que esto **no cuesta plata extra**.

Usá este comando cuando Diego diga "los mensajes ya suenan repetidos",
"refrescá los textos", "metele variedad nueva" o similar.

---

## Qué hacer

1. **Leé el banco actual** `src/lib/messageCopyBank.js` para ver el estilo, la
   estructura de pools y los placeholders (`{flavors}`, `{names}`, `{name}`,
   `{stock}`, `{models}`).

2. **Reescribí los pools** con variantes NUEVAS y de buena calidad. Reglas:
   - Español rioplatense, informal, con onda, voseo. Como le habla un pibe de
     zona norte a sus clientes jóvenes. Nada acartonado.
   - Cada línea cortita (1 renglón). Emojis con moderación (1-3).
   - **NUNCA inventes productos, sabores ni precios.** Las urgencias usan SÓLO
     los placeholders (`{names}`, `{name}`, `{stock}`) que se rellenan con data
     real en runtime. No escribas nombres de productos hardcodeados.
   - Mantené la MISMA estructura de exports y los mismos placeholders (el código
     y los tests dependen de ellos).
   - Apuntá a **~14+ variantes por pool de gancho** (weekday y weekend) para que
     no se repita en ~2 semanas. Variá energía, apertura, tono.
   - Para `URGENCY_NORMAL`, dejá la mayoría en `null` (no toda línea necesita
     urgencia).

3. **No toques** `pickDailyCopy`, `detectSituation`, ni la firma de `bankSize`
   salvo que cambies la cantidad de pools. La lógica de selección queda igual.

4. **Corré los tests**: `npm test -- messageCopyBank` y confirmá que pasan.
   Si agregaste/sacaste pools, ajustá `bankSize()` y su test.

5. **Mostrale a Diego** 4-5 ejemplos de mensajes finales generados (gancho +
   urgencia + cierre) para distintos días/slots/situaciones, así aprueba el tono.

6. **Commit + push** a la branch de trabajo con un mensaje tipo
   `chore(redactor): refresco del banco de copys`.

---

## Contexto útil

- El selector rota por `daySeed` (día epoch) + slot, así que más variantes =
  más días sin repetir. La situación (novedad / agotando / top / normal) la
  detecta el código desde el stock real.
- Doc completa del agente: `docs/AGENTE_REDACTOR.md`.
