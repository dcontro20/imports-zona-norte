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
- **Embudo**: tablero por las 7 etapas operativas (vista panorámica).
- **Ficha**: centro del sistema — acción primaria de la etapa como botón
  principal arriba + hechos de un tap + Actividad (los hechos nuevos entran
  como builders: `analizado`, `mensaje_enviado`, `respuesta` — la pantalla no
  cambia, por diseño de F3 del ciclo anterior).
- Sin duplicación Hoy↔Embudo: mismas etapas, dos proyecciones (colas vs tablero).

## 7. Fases

F1 dominio de etapas (esta) → F2 auto-ingesta + enmienda contrato → F3 Hoy
como colas + captura de hechos → F4 Embudo operativo + Ficha con acción
primaria → F5 pulido + docs de cierre. Gates entre todas.
