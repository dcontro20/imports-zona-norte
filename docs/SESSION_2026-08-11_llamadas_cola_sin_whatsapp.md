# Sesión 2026-08-10/11 — Llamadas con desenlace + cola 🚫 Sin WhatsApp (G1–G4)

**Branch:** `feature/llamadas-y-cola-sin-whatsapp` · gates por fase con
Gustavo. Resumen autocontenido: `docs/IZN_Llamadas_Cola_SinWhatsApp_Resumen.md`.

## El origen: fricción real, no diseño en abstracto

Gustavo probó el flujo WhatsApp (F1–F5) en producción y volvió con tres
fricciones: (1) los sin-WhatsApp confirmados ensuciaban 💬; (2) llamar no
dejaba rastro y la única forma de reflejar una llamada buena era tocar 🤝 a
mano ("llamar no es negociar"); (3) quería que el resultado de la llamada
derivara la siguiente etapa. Pidió análisis ANTES de código y modificaciones
mínimas sin arquitectura paralela.

## Decisiones de los gates (el porqué)

- **"Sin número → visitar" ya existía** (regla automática del spec). Lo que
  se agregó fue el caso gris: teléfono INVÁLIDO (dato `telefonoInvalido` de
  la migración F2) = sin teléfono. La derivación lee el dato estampado, no
  re-normaliza.
- **🚫 Sin WhatsApp como PROYECCIÓN** (`colaOperativa`), no octava etapa: la
  tabla de 7 está congelada y el Embudo/engine/métricas no debían moverse.
  Gustavo lo pidió explícitamente así ("revisá si puede ser una
  cola/proyección de acción derivada") — el modelo lo permitía limpio.
- **`marcarLlamada` = un hecho con su desenlace.** "Interesado" deriva
  Negociación vía precedencia (patrón `marcarRespondio`: un hecho, un campo
  — no se estampa `negociacionAt` además). La última llamada pisa a la
  anterior (la realidad más nueva manda); respondió/🤝 fijan.
- **Recencia a tres bandas** en `etapaOperativa`: generalización del paso
  visita-vs-mensaje existente, mismo espíritu. Desempate estable
  visita > mensaje > llamada conserva el comportamiento previo.
- **"No atendió" registra el intento** pero no limpia `noRespondeAt` ni
  resetea el timer (nada pasó del otro lado); hablar de verdad sí.
- **El plegado F4 se retiró en G2**: la cola nueva es la versión terminada
  de esa idea — dos maneras de ver lo mismo violaban el criterio de ruido.
- **Normalización en `accionesDeEtapa`**: la cola llama con la cola, Embudo
  y Ficha con la etapa; convergen en un solo lugar. La Ficha muestra la COLA
  (chip 🚫) para contar la misma historia que Hoy; el Embudo sigue por
  etapas/fases a propósito (es la panorámica).
- **G3 = gemelo del contrato WhatsApp**: abrir `tel:` no registra;
  `CallOutcomeModal` pregunta al volver; cerrar sin elegir no registra.
  "No le interesa" NO es un hecho de llamada: es `descartar()` con memoria.

## Lo que pasó con el preview (para el próximo que lo sufra)

G2 no se pudo probar visualmente: los previews del proyecto están detrás de
**Vercel Authentication (Standard Protection)** — 302 a `vercel.com/sso-api`,
pantalla "Request Access" para cuentas fuera del equipo `dcontro20s-projects`.
El dominio de producción no está cubierto por esa protección (es público).
Fix disponible: Settings → Deployment Protection → Vercel Authentication →
Disabled (requiere cuenta con acceso; el token del CLI de Vercel en esta Mac
está EXPIRADO — `invalidToken` — así que no se pudo tocar desde acá).
Gustavo decidió no frenar el ciclo: lógica + tests + datos reales alcanzaban,
y la prueba real en prod será el input del próximo ciclo.

## Gotchas técnicos

- Tras borrar una branch mergeada quedás parado en `main`: el commit de G1
  cayó ahí por descuido. Fix sin destrucción: `git branch <feature>` +
  `checkout` + `git branch -f main origin/main` (jamás `reset --hard` con
  cambios sin commitear en el árbol — pisaba el `.plist` ajeno).
- El full SHA no se adivina desde el short: un `?sha=` inventado en la API
  de GitHub devuelve vacío silencioso. Listar deployments sin filtro y
  matchear.
- En los tests de integración, click en 📞 asigna `window.location.href`
  (jsdom loguea "Not implemented: navigation" sin romper).

## Estado final

1527/1528 verdes (la falla de `dailyPlan` es la conocida, ajena, y en CI
pasa — timezone local). Build OK. Cero migración de datos. La base real ya
tiene 6 `tieneWhatsApp: false` → la cola 🚫 nace poblada al deployar.
