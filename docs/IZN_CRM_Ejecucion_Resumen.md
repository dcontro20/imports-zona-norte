# IZN · Prospectos v2 — Sistema de ejecución comercial (resumen autocontenido)

**Fecha:** 2026-08-06 · **Branch:** `feature/crm-ejecucion` · **Estado:** ciclo
CERRADO (F1–F5, gate por fase aprobado por Gustavo) · **Tests:** 1337 (1336
verdes; la falla restante es ajena y pre-existente) · **Build:** verde.

---

## 1. Qué cambió, en una frase

Prospectos dejó de ser un CRM tradicional con un discovery pegado al costado y
pasó a ser un **sistema de ejecución comercial**: el sistema organiza el
trabajo y propone la siguiente acción; el usuario ejecuta o descarta.

La gramática del módulo, tal como quedó:

| Vista | Responde |
|---|---|
| ☀️ **Hoy** | qué tengo que hacer ahora |
| 🎯 **Embudo** | dónde está parado todo |
| 📇 **Ficha** | dónde ejecuto el trabajo |

---

## 2. La idea de fondo: la etapa se DERIVA, jamás se setea

Un prospecto está en **una** etapa operativa, y esa etapa es una **consecuencia
de hechos registrados**, no un campo que alguien elige. No existe "mover a la
columna X": existe "esto pasó".

**Las 7 etapas (tabla CONGELADA en F1):** 🔍 Por analizar · 💬 Para contactar ·
🚶 Para visitar · ⏳ Esperando respuesta · 📋 Visitado · 🤝 Negociación · 🏪
Cliente. Más el descarte, que puede ocurrir desde cualquiera.

**Los hechos que las producen:** `ingresoAutomatico` (auto-ingesta) ·
`analizadoAt/Por` (✓ Trabajar) · `phone` · `mensajeEnviadoAt/Por` (presentar) ·
`respondioAt` (🟢) · `noRespondeAt` (🔴) · visita (colección `visits`) ·
`negociacionAt` (🤝) · `convertedClientId` (convertir).

**Precedencia:** convertido ⇒ cliente · negociación/respondió ⇒ negociación ·
entre visita y mensaje decide **el más reciente** (visitó → no estaba → le
escribió = esperando) · analizado ⇒ el teléfono decide la cola · resto ⇒ por
analizar. **Cero migración**: todo prospecto anterior al ciclo cuenta como
analizado (su alta ya fue un acto humano).

Consecuencia práctica: se retiró la acción `avanzar`, que escribía la etapa a
mano. Mover una etapa sin que hubiera pasado nada era la mentira que este ciclo
eliminó.

---

## 3. Los descubiertos entran solos (y la enmienda del contrato)

El modal de revisión desapareció. La app ingiere el staging del worker **al
llegar** (a nivel app, no de pantalla: entran aunque estés en otro módulo) y
los descubiertos nacen en 🔍 Por analizar.

**El compromiso cambió, y quedó escrito en el contrato del Discovery Engine
(§4, bloque ENMIENDA):**

> Antes: *"nada entra al Pipeline sin confirmación humana"*.
> Ahora: **"nada se CONTACTA sin análisis humano"**.

Lo hace cumplir el código, no el documento: un prospecto en `por_analizar` no
se propone para trabajar ni admite acción de contacto.

**Ids determinísticos** — `dsc_<placeId>`, o `dsc_nd_<hash djb2 de nombre+
dirección>` sin placeId. Sin humano que confirme, el id no puede ser aleatorio:
dos clientes abiertos ingiriendo el mismo staging tienen que producir el mismo
prospecto para que el merge transaccional lo absorba en vez de duplicarlo.

**Lo que NO cambió:** el worker (idéntico, sigue sin tocar `appData`), el shape
del staging, el dedup (las mismas funciones puras, ahora dentro de
`ingestarDescubiertos`), la supresión con memoria y las reglas de Firestore.

---

## 4. Las pantallas

**☀️ Hoy — colas de acción.** Barra de colas (las vacías no se muestran; 🔍
queda siempre porque hospeda el descubrimiento) y **una sola cola activa**. Por
defecto, la primera con trabajo: la pantalla ya propone la siguiente acción sin
que se le pida.

- **La cola 🔍 es un DECK**, no una lista: un negocio por vez con su expediente
  (rating y reseñas, rubro, horarios, teléfono sí/no **con su consecuencia**,
  de qué búsqueda salió, link a Maps) y la pregunta explícita *¿Vale la pena
  trabajarlo?* → ✓ Trabajar · ✗ Descartar · Saltear. **Saltear no registra
  nada**: postergar no es decidir. Es el único momento del flujo en que se toma
  una decisión comercial, y por eso se siente distinto a propósito.
- **Las colas de ejecución** comparten una sola gramática: card compacta,
  acción primaria de la etapa, Ficha a un tap.

**🎯 Embudo — panorámico de verdad.** Tablero por las 7 etapas derivadas,
ordenado por el ranking del engine dentro de cada columna. Las cards **no
tienen botones**: tocarlas abre la Ficha. Hoy y Embudo son dos proyecciones de
las mismas etapas; con acciones en los dos serían dos escritorios para el mismo
trabajo. La columna 🏪 Cliente muestra los mayoristas (el resultado del embudo)
y no se gestionan ahí: al cerrarse salen del CRM hacia Kioscos.

**📇 Ficha — el expediente permanente.** Se abre desde cualquier vista y
encabeza con la **acción primaria de la etapa**; abajo las secundarias y,
separadas, las administrativas (editar / descartar / borrar), que no son
trabajo comercial. Ficha y cola leen la **misma fuente** (`accionesDeEtapa`):
no pueden proponer cosas distintas para el mismo prospecto.

---

## 5. Decisiones que vale la pena recordar

- **Copiar no es enviar.** Presentar manda por WhatsApp (con el texto ya
  cargado) y eso registra el hecho; sin teléfono, copiás y confirmás con "✅ Ya
  lo mandé". No se asume que se mandó porque se copió — la casa deriva de
  hechos, no de intenciones.
- **Un mensaje nuevo limpia el 🔴.** Si no, el prospecto quedaba en
  "reintentar" para siempre aunque le acabaras de escribir.
- **6 colas, no 5.** Se sumó 📋 Visitado a la lista original: un visitado sin
  cerrar necesita su decisión. El ruido lo controla el auto-ocultado, no la
  cantidad de etapas.
- **Descartar ≠ borrar.** El descarte RECUERDA (supresión con memoria: no
  vuelve a aparecer en búsquedas futuras); borrar es Papelera. Rehabilitar
  deshace el descarte entero y devuelve el negocio a 🔍.
- **Ordenar es asistir; descartar es decidir.** Ningún pre-filtro automático:
  la rúbrica del engine está congelada hasta calibrarla con data real, y un
  auto-descarte silencioso contaminaría la memoria de supresión con juicios que
  nadie tomó.
- **Salió de Hoy lo que competía**: Top 5, funnel de StatCards (se mudó al
  Embudo) y últimas visitas (vive en la Actividad de la Ficha).

---

## 6. Fricciones encontradas en la revisión final (F5) y corregidas

1. **El sistema movía cosas en silencio** — cada hecho ahora avisa qué pasó y a
   dónde fue (toast transitorio, compartido en UI.jsx). Una sola corrección
   cierra las seis acciones.
2. **"Rehabilitar" no rehabilitaba** (defecto introducido en F2): quitaba el
   bloqueo pero dejaba el prospecto soft-borrado. Ahora vuelve a 🔍.
3. **La cola 🔍 vacía dejaba colgado al usuario** — el estado vacío señala
   dónde siguió el trabajo, sin sacarlo de 🔍.
4. **La barra comía la pantalla en mobile** — solo la cola activa se nombra; el
   resto va ícono + número.

---

## 7. Archivos

**Dominio (JS puro, testeado):**
`src/lib/prospectEtapas.js` (derivación, sub-estado, mapping al engine,
conteos, adapter legacy) · `src/lib/prospectHechos.js` (los hechos; ninguno
escribe una etapa) · `src/lib/discovery/discoveryImport.js` (+ ids
determinísticos, `ingestarDescubiertos`, `ingestarLote`) ·
`src/lib/prospectActividad.js` (+ builders de los hechos nuevos).

**Pantallas:** `src/components/Prospectos.jsx` (orquesta) ·
`src/components/wholesale/ColasProspectos.jsx` (barra, deck, colas,
`accionesDeEtapa`) · `src/components/wholesale/EmbudoOperativo.jsx` ·
`src/components/wholesale/ProspectFicha.jsx` ·
`src/components/wholesale/prospectActions.js` (única fuente de acciones) ·
`src/components/UI.jsx` (`Toast` / `useToast` compartidos).

**Retirados:** `src/components/Pipeline.jsx` (su kanban ordenaba por las 3
etapas del engine, que dejaron de ser la verdad) · el wrapper
`ProspectDiagnosisModal` (sin consumidores; `DiagnosisContent` sigue) · la
acción `avanzar`. **Toda la cobertura de tests se conservó** montando
directamente los componentes que Pipeline hospedaba.

**Docs:** `docs/PROSPECT_CRM_EJECUCION_SPEC.md` (spec del ciclo, con las
decisiones de cada gate) · `docs/DISCOVERY_ENGINE_CONTRATO.md` (§4 enmendado).

**Commits:** `e023418` F1 · `28d34ae` F2 · `f069c92` F3 · `36595e5` F4 · F5.

---

## 8. Lo que queda anotado y NO se implementó

**Escala de la cola 🔍 con cientos de prospectos** (pregunta de Gustavo en el
gate F3). El deck no se rompe por ergonomía: se rompe porque analizar de a uno
es la unidad equivocada cuando el input llega por lotes. La evolución, en orden
de valor, con las tres primeras encendiéndose solo por volumen:

- **A ·** sesión de análisis acotada ("Analizá 10 ahora — quedan 290").
- **B ·** lotes por búsqueda/zona antes de entrar al deck.
- **C ·** descarte masivo con memoria dentro de un lote.
- **D ·** lo que NO hay que hacer: pre-filtro automático.

Detalle completo en `docs/PROSPECT_CRM_EJECUCION_SPEC.md` §6.

**Pendientes operativos heredados** (sin bloqueo, no son de este ciclo):
LaunchAgent del worker de discovery (sin eso las búsquedas quedan en cola salvo
corrida manual) y la validación operativa de los backups B3.
