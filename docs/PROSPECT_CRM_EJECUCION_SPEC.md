# PROSPECTOS v2 — Sistema de ejecución comercial · Spec

**Fecha:** 2026-08-06 · **Branch:** `feature/crm-ejecucion` · **Estado:** tabla de
etapas ✅ **CONGELADA en el gate F1**; el resto se implementa por fases con gates.
Supersede la experiencia de `docs/PROSPECT_CRM_SPEC.md` (v1, shipped) — la
estructura del módulo (una puerta, pestañas, Ficha) se conserva; cambia el flujo.

## Tesis (fijada por Gustavo)

Dejar de sentirse como un CRM tradicional con Discovery agregado: **el sistema
propone la siguiente acción y el usuario solo ejecuta o descarta**. Cada
prospecto está en **UNA única etapa operativa**; la pantalla principal muestra
solo acciones pendientes (colas), el embudo representa el flujo real, y la
Ficha es el centro accesible desde cualquier vista. Descubrir → trabajar (sin
importación manual). **Toda la inteligencia existente se mantiene: este ciclo
rediseña la experiencia, no el motor.**

## 1. Tabla de etapas operativas (CONGELADA)

| # | Key | Etiqueta | Entra cuando… | Acción primaria |
|---|---|---|---|---|
| 1 | `por_analizar` | 🔍 Por analizar | ingreso automático del discovery, sin análisis humano | ✓ Trabajar / ✗ Descartar |
| 2 | `para_contactar` | 💬 Para contactar | analizado y CON teléfono | Enviar presentación (WhatsApp) |
| 3 | `para_visitar` | 🚶 Para visitar | analizado y SIN teléfono (regla automática de Gustavo) | Planificar/registrar visita |
| 4 | `esperando_respuesta` | ⏳ Esperando respuesta | mensaje enviado (hecho registrado) | 🟢 Respondió / 🔴 No responde |
| 5 | `visitado` | 📋 Visitado | hay visita registrada (con calificación → engine) | avanzar según resultado |
| 6 | `negociacion` | 🤝 Negociación | respondió interesado / movimiento explícito | pedido, precios, seguimiento |
| 7 | `cliente` | 🏪 Cliente | convertido (`convertedClientId`) | sale del CRM → Kioscos |
| ✗ | — | Descartado | desde cualquier etapa | supresión CON MEMORIA (mecanismo actual intacto) |

**Fusiones respecto de la lista original de Gustavo** (aprobadas con el
rediseño): Descubierto+Pendiente de análisis → `por_analizar`; Mensaje
enviado+Esperando respuesta → `esperando_respuesta` con **sub-estado derivado**
`reintentar` (sin respuesta hace > `DIAS_REINTENTO` = 3, o 🔴 marcado).

## 2. Hechos (la etapa se DERIVA, jamás se setea)

Filosofía de la casa: derivar, no almacenar. Campos nuevos en el prospecto
(passthrough, cero migración) + los que ya existen:

| Hecho | Campo | Lo registra |
|---|---|---|
| Ingreso automático | `ingresoAutomatico: true` + id determinístico | la auto-ingesta (F2) |
| Análisis humano ✓ | `analizadoAt` / `analizadoPor` | tap "✓ Trabajar" (F3); el alta manual nace analizada |
| Tiene teléfono | `phone` (existente) | discovery / edición |
| Mensaje enviado | `mensajeEnviadoAt` / `mensajeEnviadoPor` | Presentar (F3 — hoy no deja rastro: gap que se cierra) |
| Respondió | `respondioAt` | tap 🟢 (→ negociación) |
| No responde | `noRespondeAt` | tap 🔴 (queda esperando, sub-estado reintentar) |
| Visita | colección `visits` (existente) | modal de visita actual |
| Negociación | `negociacionAt` | tap 🤝 o 🟢 |
| Cliente | `convertedClientId` (existente) | convertir actual |

## 3. Derivación (precedencia)

1. `convertedClientId` ⇒ **cliente**
2. `negociacionAt || respondioAt` ⇒ **negociación**
3. entre visita y mensaje, **el hecho MÁS RECIENTE decide**: última visita ≥
   último mensaje ⇒ **visitado**; mensaje más nuevo ⇒ **esperando_respuesta**
   (refleja el trabajo real: visitó→no estaba→le escribió = esperando)
4. solo mensaje ⇒ **esperando_respuesta** · solo visita ⇒ **visitado**
5. analizado ⇒ `phone` ? **para_contactar** : **para_visitar**
6. resto ⇒ **por_analizar**

**Tolerancia legacy (cero migración):** `por_analizar` exige
`ingresoAutomatico && !analizadoAt`. Todo prospecto anterior al ciclo (alta
manual, o importado por el flujo viejo de revisión) cuenta como analizado —
su ingreso YA fue un acto humano. Los "contactado" viejos sin
`mensajeEnviadoAt` degradan honestamente a para_contactar/para_visitar (nunca
se registró mensaje — no se inventa).

## 4. Mapping al engine (el motor NO se toca)

`etapaEngine(etapa)`: por_analizar/para_contactar/para_visitar → `"prospecto"` ·
esperando_respuesta → `"contactado"` · visitado/negociacion → `"visitado"` ·
cliente → fuera del ranking (ya excluido por conversión). Señales, rúbrica,
gate de confianza, diagnóstico y próximo paso: intactos. Funnel y zonas
consumen el mismo mapping vía adapter en la UI (F3/F4).

## 5. Auto-ingesta (F2) — enmienda aprobada del contrato Discovery §4

El worker NO cambia (staging vía Admin SDK, jamás escribe appData). La APP
ingiere el staging al llegar: dedup actual (identity.js) → altas automáticas
en `por_analizar` → consume el doc. El modal de revisión desaparece; el
descarte (con memoria, supresión intacta) vive en la card y la Ficha.
**Compromiso que reemplaza al §4 viejo: nada se CONTACTA sin análisis humano.**
**Ids determinísticos** (dos clientes abiertos no duplican): `dsc_<placeId>`;
sin placeId ⇒ `dsc_nd_<hash djb2 de la clave nd>`. La doble ingesta es
idempotente por id (el merge S14.3 la absorbe).

## 6. Pantallas (F3/F4)

- **Hoy = colas de acción**: barra con contadores (🔍 N · 💬 N · 🚶 N · ⏳ N
  (K vencidos) · 🤝 N) → lista de la cola elegida, ordenada por el ranking del
  engine, cada card con SU acción primaria + renglón Maps + Ficha. El
  discovery (🔎, búsquedas en curso, descartados) vive en la cola 🔍.

> ### Decisiones del gate F3 (2026-08-06)
>
> Dos criterios que fijó Gustavo al aprobar F2 rigen estas pantallas: **(1)
> "Por analizar" es una etapa de ANÁLISIS —el único momento en que se toma una
> decisión comercial—, no una revisión de datos; (2) el sistema nunca debe
> volverse ruidoso: pocas colas muy claras, y siempre saber cuál es la
> siguiente acción.** De ahí:
>
> - **La cola 🔍 es un DECK**, no una lista: un negocio por vez con su
>   expediente (rating/reseñas, rubro, horarios, teléfono sí/no con su
>   consecuencia, procedencia de la búsqueda, Maps) y la pregunta explícita
>   *¿Vale la pena trabajarlo?* → ✓ Trabajar · ✗ Descartar · Saltear (postergar
>   NO es un hecho: no registra nada). Las otras colas comparten una sola
>   gramática de lista.
> - **6 colas, no 5**: se sumó 📋 Visitado (la lista original del §6 lo
>   omitía). Un visitado sin cerrar necesita su decisión —negociar o
>   convertir—; sin cola quedaba invisible en Hoy. El ruido lo controla el
>   auto-ocultado, no la cantidad de etapas.
> - **Las colas sin trabajo NO se muestran** (🔍 es la excepción: hospeda el
>   descubrimiento, que es la puerta de entrada). La cola activa por defecto es
>   la primera con trabajo en el orden del flujo: la pantalla propone la
>   siguiente acción sin que se le pida.
> - **Salió de Hoy lo que competía**: "Para hoy" Top 5 (las colas lo
>   reemplazan), el funnel de 4 StatCards (se muda al Embudo, F4) y "últimas
>   visitas" (histórico → vive en la Actividad de la Ficha). El aviso de F2
>   "N descubiertos entraron solos" lo absorbió la cola 🔍.
> - **La cola no lleva título propio**: el chip activo de la barra ya lo dice.

### Escala de la cola 🔍 — evolución ANOTADA (pregunta de Gustavo en el gate F3; NO se implementa en este ciclo)

Con cientos de prospectos el deck no se rompe por ergonomía: se rompe porque
**analizar de a uno es la unidad de trabajo equivocada cuando el input llega
por lotes**. Tres síntomas concretos:

1. *Pila infinita*: "300 negocios sin decidir" es lo contrario de una cola que
   se vacía — desalienta empezar.
2. *El orden pierde sentido*: al ingresar, todos los descubiertos tienen
   confianza baja y prioridad capada (comportamiento correcto del engine), así
   que entre 300 el ranking casi no discrimina. Son 300 juicios uniformes en
   orden arbitrario.
3. *Se pierde el contexto del lote*: esos 300 salieron de un puñado de
   búsquedas ("kiosco en Palermo", tope 60). Dentro de un lote las decisiones
   están correlacionadas — lo que el usuario piensa es *"de esta búsqueda me
   sirven estos, el resto no"*, no 60 juicios independientes.

**La evolución, en orden de valor** (las tres primeras se encienden solo por
volumen — p. ej. > 30 pendientes — para que el caso simple siga simple):

- **A · Sesión de análisis acotada.** El deck deja de decir "300 sin decidir" y
  propone una tanda: *"Analizá 10 ahora — quedan 290"*, con progreso (3 de 10) y
  un cierre explícito al terminarla. Convierte una pila infinita en una sesión
  terminable. No cambia el modelo, solo el encuadre — es lo más barato y lo que
  más cambia la sensación.
- **B · Lotes antes del deck.** Con volumen, la cola 🔍 muestra primero *de
  dónde viene el trabajo*: `kiosco · Palermo — 47 sin analizar`, `maxikiosco ·
  Munro — 22`. Elegís un lote y recién ahí entrás al deck. Restaura el contexto
  (estás analizando una zona y un rubro, las decisiones se vuelven coherentes)
  y da una unidad que se puede terminar.
- **C · Descarte masivo CON MEMORIA, dentro de un lote.** El caso real es *"de
  esta búsqueda no me sirve ninguno sin teléfono ni reseñas"*: filtro rápido
  sobre el lote + descartar los N restantes, con la misma supresión de siempre.
  No viola el criterio de que analizar es una decisión humana: sigue siéndolo,
  solo que sobre un conjunto que el usuario definió explícitamente.
- **D · Lo que NO hay que hacer: pre-filtro automático.** Tentador: que el
  engine descarte solo lo que no vale. No — la rúbrica está CONGELADA hasta
  calibrarla con data real, y un auto-descarte silencioso rompe la regla de que
  nada se descarta sin decisión humana, además de contaminar la memoria de
  supresión con juicios que nadie tomó. Lo que sí se puede, cuando haya data
  para calibrar: **ordenar** el deck por probabilidad de que valga la pena, para
  que las primeras 10 decisiones sean las más rentables. **Ordenar es asistir;
  descartar es decidir.**
- **Embudo**: tablero por las 7 etapas operativas (vista panorámica).
- **Ficha**: centro del sistema — acción primaria de la etapa como botón
  principal arriba + hechos de un tap + Actividad (los hechos nuevos entran
  como builders: `analizado`, `mensaje_enviado`, `respuesta` — la pantalla no
  cambia, por diseño de F3 del ciclo anterior).
- Sin duplicación Hoy↔Embudo: mismas etapas, dos proyecciones (colas vs tablero).

## 7. Fases

F1 dominio de etapas ✅ → F2 auto-ingesta + enmienda contrato ✅ → F3 Hoy como
colas + captura de hechos ✅ → F4 Embudo operativo + Ficha con acción primaria
→ F5 pulido + docs de cierre. Gates entre todas.

**Capturado en F3** (`prospectHechos.js`, funciones puras prospecto→prospecto;
ninguna escribe una etapa): `analizadoAt/Por` (✓ Trabajar) · `mensajeEnviadoAt/
Por` (Presentar — el modal ahora manda por WhatsApp o pide confirmación
explícita: copiar NO es enviar) · `respondioAt` (🟢) · `noRespondeAt` (🔴, y un
mensaje nuevo lo limpia: reabre la espera) · `negociacionAt` (🤝).
