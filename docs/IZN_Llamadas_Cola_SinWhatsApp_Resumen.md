# IZN · Llamadas con desenlace + cola 🚫 Sin WhatsApp — Resumen autocontenido

**Fecha:** 2026-08-10/11 · **Branch:** `feature/llamadas-y-cola-sin-whatsapp`
**Commits:** `29b80d0` (G1 libs) · `2c7692c` (G2 cola) · `a4b3e03` (G3 modal) · G4 (docs)
**Origen:** fricción real de uso tras el flujo WhatsApp (F1–F5, PR #11 en prod):
llamar no dejaba rastro y los prospectos sin WhatsApp ensuciaban la cola de escribir.

---

## Qué se construyó

### La matriz aprobada (gate G1 — no reabrir)

| Hecho / dato | Efecto |
|---|---|
| Llamada — 🤝 quedó interesado | deriva **Negociación** |
| Llamada — 🚶 quiere visita | deriva **Para visitar** (aun con teléfono) |
| Llamada — ⏳ pidió seguimiento | deriva **Esperando respuesta**; el timer de reintento cuenta desde la llamada |
| Llamada — 📵 no atendió (`""`) | registra el **intento** (Actividad + audit) sin mover de cola ni resetear el timer |
| ✗ No le interesa | **descartar con memoria** — no es un hecho de llamada |
| Teléfono inválido (`telefonoInvalido`) | = sin teléfono ⇒ **Para visitar** |
| `tieneWhatsApp: false` en Para contactar | cola **🚫 Sin WhatsApp** (proyección, jamás etapa) |

**Precedencia** (`etapaOperativa`): cliente → negociación (`negociacionAt` ∨
`respondioAt` ∨ llamada-interesado) → **recencia a tres bandas** entre visita
/ mensaje / llamada-con-desenlace (gana el hecho más reciente; desempate
visita > mensaje > llamada) → analizado + teléfono utilizable → por analizar.
La última llamada pisa a la anterior; respondió/🤝 explícito fijan Negociación.

### El contrato de captura (G3 — el gemelo del de WhatsApp)

**Abrir el discador no registra nada.** 📞 Llamar abre `tel:` y, al volver,
`CallOutcomeModal` pregunta *¿Cómo salió la llamada?* con los 5 desenlaces.
Cerrar sin elegir no registra la llamada. El sistema jamás infiere — igual
que "abrir WhatsApp no registra contacto".

### La cola 🚫 Sin WhatsApp (G2 — proyección de vista)

- `colaOperativa(p)` = `etapaOperativa(p)` salvo un caso: `para_contactar` +
  `tieneWhatsApp === false` → `"sin_whatsapp"`. **La tabla de 7 etapas quedó
  congelada e intacta** — para el Embudo, el engine y las métricas esos
  prospectos siguen en `para_contactar` (fase Contactando).
- En ☀️ Hoy la cola aparece entre 💬 y 🚶 (chip "Llamar"), oculta si está
  vacía. Acción primaria: 📞 Llamar.
- **Una sola fuente**: la normalización de la proyección vive dentro de
  `accionesDeEtapa` — la cola llama con `sin_whatsapp`, Embudo y Ficha con
  la etapa, y los tres convergen (llamar, no presentar). La Ficha muestra el
  chip 🚫 (la cola donde vive en Hoy).
- El plegado F4 dentro de 💬 se **retiró** (era la misma idea a medio
  camino); los chips ✓ Con WhatsApp / Por verificar quedan y solo aparecen
  cuando distinguen algo.

## Piezas

- `src/lib/prospectHechos.js` — `marcarLlamada(p, {at, por, resultado})`
  (único hecho nuevo; con contacto real limpia `noRespondeAt`, el intento
  fallido no).
- `src/lib/prospectEtapas.js` — derivación extendida + `colaOperativa` +
  `conteoPorCola` + `COLA_SIN_WHATSAPP`; `subEstadoEspera` cuenta desde el
  último toque (mensaje o llamada-seguimiento).
- `src/lib/prospectActividad.js` — builder 📞 con título por desenlace.
- `src/components/wholesale/CallOutcomeModal.jsx` — la pregunta (nuevo).
- `prospectActions.llamada` · `ColasProspectos` (COLAS + normalización +
  contexto de cards) · `Prospectos` (porCola por proyección, toasts,
  cableado `onLlamar` a cola/Embudo/Ficha) · `ProspectFicha` (chip 🚫 +
  📞 secundario también pregunta).

## Qué NO cambió

Tabla de 7 etapas (congelada) · hechos existentes · Embudo (cero código,
solo un test de convergencia) · engine y ranking (`etapaEngine` intacto) ·
contrato WhatsApp F1–F5 · discovery · **cero migración de datos** (hechos
nuevos sobre data vieja intacta).

## Tests y build

**1527 verdes / 1528** (+33 del ciclo: 20 en libs G1 + 6 G2 + 7 G3; la
única falla es la conocida y ajena de `dailyPlan > weekKey`, que en CI pasa
— es dependiente de timezone local). Build OK.

## Notas operativas

- La base real ya tiene el dato para que la cola nazca poblada: al cierre,
  6 prospectos con `tieneWhatsApp: false` (más 1 confirmado true y la
  migración de teléfonos corrida en prod).
- Los **previews de Vercel están detrás de Vercel Authentication** (Standard
  Protection, default del proyecto): G2 no se pudo probar visualmente por
  eso. Para abrir previews por URL: Settings → Deployment Protection →
  Vercel Authentication → Disabled (cuenta con acceso al proyecto; no afecta
  el dominio de producción). El ciclo se validó por lógica + tests + datos
  reales, decisión de Gustavo; **la prueba de uso real en prod es el input
  del próximo ciclo**.
