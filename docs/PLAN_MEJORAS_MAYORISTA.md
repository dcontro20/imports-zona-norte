# Plan de mejoras continuas — Pivote Mayorista (mientras no hay prueba manual)

> **Contexto:** el pivote está COMPLETO (fases 0–6, 944 tests verdes) en la branch
> `claude/mayorista`, sin mergear. Diego todavía no pudo probarlo con las manos
> (no tiene la Mac personal ahora). Este documento es una batería de mejoras de
> ALTO VALOR que se pueden hacer **sin prueba manual y sin mergear**, para que el
> tiempo rinda y el pivote llegue más sólido al momento de la prueba.
>
> **Formato hermano de** `docs/PLAN_MAYORISTA.md`. Lo ejecuta Claude Code, por
> tandas priorizadas. Mismas reglas de siempre (abajo).
>
> **Escrito:** 2026-07-14 (sesión de chat, Opus). Diego revisa cada tanda con el MD.

---

## ⚠️ Reglas duras (iguales que todo el pivote)

- **Todo en `claude/mayorista`. NO mergear a `main`. Prod intacto.**
- **`npm run build` + `npm test` verdes antes de CADA commit.** No bajar de 944.
- **Grep antes de crear o "arreglar".** Confirmá con tus ojos que algo existe/no
  existe antes de tocarlo (este proyecto ya tuvo 3 falsos supuestos que casi meten
  bugs; ver historial).
- **UI 100% tokens `T` + componentes `UI.jsx`.** Cero hex hardcodeado en pantallas
  nuevas. Mobile-first 375px.
- **Un commit por bloque, mensaje `feat:`/`fix:`/`test:`/`refactor:` en español.**
- **Regla permanente vigente:** al cerrar cada TANDA, generar el MD de resumen
  autocontenido (formato de los `IZN_Pivote_Mayorista_FaseN_Resumen.md`) + correr
  `/persist-session`. Es lo que Diego carga en el chat de diseño para revisar.
- **NO se toca funcionalidad probada como buena.** Esto es endurecer y pulir, no
  rediseñar. Si algo parece que necesita rediseño, se levanta en el MD y se decide
  en el chat de diseño ANTES de tocarlo.

---

## 🎯 Filosofía de esta etapa

El pivote está funcionalmente completo pero **nadie lo usó todavía**. Lo más valioso
que se puede hacer sin prueba manual es **reducir el riesgo de que la prueba salga
mal**: cazar bugs con tests que hoy no existen, blindar los cálculos de plata contra
entradas raras, y verificar que no quedó basura de las idas y vueltas de ayer. Cuando
Diego finalmente pruebe, que sea una confirmación, no una cacería de bugs.

Orden de tandas por valor: **A (higiene/verificación) → B (blindaje de plata) →
C (robustez de datos) → D (tests de integración) → E (documentación de usuario) →
F (mejoras de producto low-risk)**. A y B son las que más bajan el riesgo; hacerlas
primero.

---

## TANDA A — Higiene del repo y verificación post-idas-y-vueltas 🔴

Ayer hubo mucho movimiento (previews, entorno de test descartado, 7 fases). Antes de
seguir, confirmar que no quedó nada suelto.

- **A.1 — Verificar el borrado del pricing viejo.** El resumen de Fase 1 dice que se
  borró `src/lib/wholesalePricing.js` + su test, pero PUEDE seguir en la branch.
  Grepealo: `git ls-files | grep wholesalePricing`. Si sigue existiendo en
  `claude/mayorista`, borralo de verdad (código muerto: su export `WHOLESALE_TIERS`
  colisiona con el enum A/B/C; nadie en código vivo lo importa salvo su test).
  Confirmá con `grep -rn "wholesalePricing" src/` que no haya imports vivos. Si ya
  no está, dejá constancia en el MD de que se verificó.
- **A.2 — Verificar que el entorno de test descartado no molesta.** `src/firebase.js`
  quedó leyendo env vars `VITE_FIREBASE_*` con fallback a prod. Confirmá que SIN esas
  env vars (caso normal de Diego) la app apunta a prod correctamente y que el
  `console.log` del proyecto activo no ensucia. No borres el mecanismo (puede servir),
  solo confirmá que es inerte por default.
- **A.3 — Barrido de imports muertos / código huérfano** en los módulos nuevos del
  pivote. `grep` de funciones exportadas que nadie importa. Reportá lo que encuentres;
  no borres nada dudoso sin listarlo en el MD primero.
- **A.4 — Consistencia de convención de signo.** Verificá que NINGÚN módulo mayorista
  nuevo use `client.balance` para deuda (la decisión de Fase 4 fue derivar de ventas).
  Grep `balance` en los archivos mayoristas. Si aparece, es una alarma — reportala.
- **A.5 — Lint/consistencia:** que los 8 componentes nuevos importen `T` y no tengan
  hex hardcodeados sueltos (`grep -nE "#[0-9A-Fa-f]{6}" src/components/{Kioscos,Pipeline,ProspectMap,Routes,WholesaleOrder,CuentasCorrientes,DashboardMayorista}.jsx` — deberían dar cero o casi cero, y lo que salga justificarlo).

**Entregable:** MD "Tanda A" listando qué se verificó, qué se encontró, qué se limpió.
Si A.1–A.5 salen todos limpios, es una gran señal para el merge futuro.

---

## TANDA B — Blindaje de los cálculos de plata 🔴

El núcleo del riesgo. Estos módulos manejan dinero y hoy sus tests cubren el camino
feliz. Hay que agregarles tests de **entradas raras / edge cases** para que ninguna
cuenta se rompa en producción. NO cambiar la lógica salvo que un test nuevo revele un
bug real (y si lo revela, se reporta en el MD antes de arreglar).

- **B.1 — `wholesale.js` (pricing por tier):** tests para producto sin lista de tier
  (fallback al precio base), tier null/inválido, precio 0 o negativo, cantidad 0,
  cantidad fraccionaria, producto sin costo (margen no debe explotar ni dar NaN),
  descuento por volumen con breakpoints límite exactos (justo 24u, 60u, 120u).
- **B.2 — `creditAccount.js` (cuenta corriente):** pago mayor que lo adeudado (no debe
  dejar saldo negativo raro), pago exacto que salda, pago de 0, cliente sin ventas,
  venta sin payments, `allocatePayment` con múltiples ventas y un pago que cubre 1.5
  ventas (que reparta bien y marque cobrada solo la saldada), mora en el límite exacto
  de 30 días, límite de crédito en el borde (pedido == disponible exacto).
- **B.3 — Puente con la caja:** test de que cobrar agrega el `payment` al sale con el
  método correcto y que NO hay doble conteo de revenue (el `sale.total` cuenta una vez,
  el payment solo mueve caja). Verificar que el `payMethodToAccountId` mapea cada
  método mayorista a la cuenta correcta.
- **B.4 — `wholesaleIntelligence.js` (P&L y ranking):** COGS con venta sin
  `costUSDTAtSale` (fallback), con rate histórico 0 o faltante (no debe dar Infinity/
  NaN), ranking con cliente de 1 sola venta, P&L de período sin ventas mayoristas,
  margen% con revenue 0 (división por cero controlada).
- **B.5 — `routes.js` (totales):** ruta sin paradas, parada con pedido borrado/
  inexistente (`resolveStop` no debe romper), totales con pedidos de distintas zonas.

**Entregable:** MD "Tanda B" con cuántos tests nuevos, qué edge cases cubren, y —
CRÍTICO — si alguno reveló un bug real (y si lo reveló, qué se hizo). El objetivo es
subir la cobertura de los módulos de plata sin tocar su lógica. Idealmente +30–50
tests acá.

---

## TANDA C — Robustez ante datos raros / defensivo en UI 🟠

Que las pantallas nuevas no se rompan con data incompleta o rara (que en un negocio
real pasa: clientes a medio cargar, pedidos viejos, campos vacíos).

- **C.1 — Empty & partial states:** cada pantalla mayorista con data vacía o parcial
  (mayorista sin tier, prospecto sin zona, pedido sin líneas, ruta sin paradas). Que
  muestre un empty state claro, no un error ni un cálculo roto. (El resumen dice que
  ya hay empty states; verificar que cubren los casos de data PARCIAL, no solo vacía.)
- **C.2 — Guards de null/undefined** en los componentes nuevos donde se accede a
  `client.zone`, `client.wholesaleTier`, `sale.items`, etc. Grep de accesos directos
  sin `?.` o fallback en los 8 componentes. Blindar los que falten.
- **C.3 — Números y moneda:** que ningún componente muestre `NaN`, `undefined`,
  `Infinity` o `$NaN` cuando falta un dato. Formateo defensivo (0 en vez de vacío
  donde corresponde).
- **C.4 — Migración idempotente, re-test:** confirmar con un test que correr
  `migrateToWholesaleModel` dos veces seguidas no cambia nada la segunda vez y no
  duplica campos. (Ya existe el test; agregar el caso "correr 2x" si no está.)
- **C.5 — Filtros y búsqueda:** que los filtros de Kioscos (tier/zona/businessType/
  pipeline) combinados no rompan con valores null, y que "sin resultados" muestre
  estado claro.

**Entregable:** MD "Tanda C" con los guards agregados y los casos de data parcial
cubiertos.

---

## TANDA D — Tests de integración de flujos completos 🟠

Hoy hay muchos tests unitarios (funciones puras) pero pocos que simulen un FLUJO
mayorista de punta a punta a nivel de datos. Estos dan la confianza real de que las
piezas encajan.

- **D.1 — Flujo "pedido → ruta → cobro" a nivel datos:** crear un producto con precio
  de tier, un cliente mayorista tier A, generar un pedido (verifica precio y stock
  descontado), meterlo en una ruta, cobrarlo, y verificar que: el stock quedó bien, el
  `fulfillmentStatus` recorrió armado→en_ruta→entregado→cobrado, el payment se registró,
  y la cuenta de caja subió el monto correcto. Todo en un test de integración.
- **D.2 — Flujo "prospecto → conversión → cliente mayorista":** crear prospecto,
  avanzarlo por el embudo, convertirlo, y verificar que nace como `type=mayorista`
  con `wholesaleTier=null`, que el prospecto queda soft-deleted con `convertedClientId`,
  y que aparece en Kioscos.
- **D.3 — Flujo "cuenta corriente":** cliente con `creditEnabled`, pedido a cuenta,
  verificar `owed`/`disponible`, pago parcial, verificar que `allocatePayment` saldó
  las viejas primero y que la caja reflejó el pago.
- **D.4 — Consistencia P&L:** generar N ventas mayoristas y M minoristas conocidas y
  verificar que `plByChannel` y `wholesaleKpis` dan los números exactos esperados
  (facturación mayorista vs minorista correcta, sin mezclar canales).
- **D.5 — No-regresión minorista:** un test que confirme que una venta MINORISTA
  normal sigue funcionando igual con todos los campos nuevos del schema (que el pivote
  no rompió el camino retail).

**Entregable:** MD "Tanda D" con los flujos cubiertos. Estos son los tests que más
tranquilidad dan para el merge.

---

## TANDA E — Documentación de usuario (para Diego y Gustavo) 🟡

Cuando el pivote se use, Diego y Gustavo necesitan saber cómo. Esto no toca código.

- **E.1 — `docs/GUIA_MAYORISTA.md`:** guía práctica en español, paso a paso, de cómo
  operar el modo mayorista: cargar precios de tier, dar de alta un kiosco, hacer un
  pedido, armar una ruta, cobrar, leer el panel. Con el "por qué" de cada cosa (ej:
  por qué el pedido no toca caja hasta que se cobra). Pensada para leer en el celu.
- **E.2 — `docs/CHECKLIST_PRIMER_USO.md`:** checklist de arranque para el día que
  empiecen a vender mayorista (qué configurar primero: tiers, precios, primer cliente).
- **E.3 — Sección "cómo activar lo que está apagado":** documentar cómo encender la
  cuenta corriente de un cliente, y qué pasaría si en el futuro se quiere activar
  Google Places o la optimización de rutas (qué falta para cada uno).
- **E.4 — FAQ de dudas previsibles:** "¿por qué marqué cobrado y no veo la plata?"
  (spoiler: en fase 3 era flag, ahora en fase 4 sí acredita), "¿cómo convierto un
  cliente minorista en mayorista?", etc.

**Entregable:** los MD de docs en el repo + MD "Tanda E" resumiendo qué se documentó.

---

## TANDA F — Mejoras de producto de bajo riesgo 🟢

Solo si A–E están cerradas. Mejoras que suman sin tocar lo delicado. **Cada una se
levanta en el MD para que Diego apruebe ANTES de construirla** (son decisiones de
producto, no de ingeniería).

Candidatas a proponer (que Code las liste con pro/contra, no que las haga de una):
- **F.1 — Duplicar pedido mayorista** (además de "repetir último"): elegir un pedido
  histórico cualquiera y clonarlo.
- **F.2 — Nota/observación por pedido mayorista** (ej: "entregar después de las 18h").
- **F.3 — Vista "próximas recompras":** lista de kioscos ordenada por cuándo se espera
  que recompren (ya existe `expectedRepurchase`, sería solo una vista que lo use).
- **F.4 — Totalizador de ruta por método de cobro esperado** (cuánto se espera cobrar
  en efectivo vs transferencia en una ruta).
- **F.5 — Badge de "cliente nuevo" vs "recurrente"** en la lista de Kioscos.
- **F.6 — Exportar una ruta a CSV** (además de la hoja de texto).

**Entregable:** MD "Tanda F" que primero PROPONE (con pro/contra y esfuerzo) y, para
lo que Diego apruebe, después ejecuta. No construir nada de F sin OK explícito.

---

## 📋 Orden recomendado y cómo trabajarlo

1. **Tanda A** (higiene) — rápida, y confirma que el terreno está limpio. Empezar acá.
2. **Tanda B** (blindaje de plata) — la de más valor. Dedicarle tiempo.
3. **Tanda C** (robustez UI) y **D** (integración) — se pueden hacer en cualquier orden;
   D da más tranquilidad para el merge.
4. **Tanda E** (docs) — cuando el código esté endurecido, documentarlo.
5. **Tanda F** (producto) — solo con A–E cerradas y con aprobación por ítem.

**Al cerrar cada tanda:** MD de resumen (formato de siempre) + `/persist-session`.
Diego lo revisa en el chat de diseño antes de la siguiente. Si una tanda revela algo
que necesita decisión de negocio, se levanta en el MD y se frena ahí — no se decide
solo.

**Todo esto NO se mergea.** Sigue acumulándose en `claude/mayorista` hasta que Diego
pruebe en la Mac y dé el OK final del merge. Estas tandas hacen que ese merge sea más
seguro, no lo reemplazan.

---

*Escrito 2026-07-14 (chat de diseño, Opus). Ejecuta Claude Code por tandas.
Fuente de verdad del pivote: `docs/PLAN_MAYORISTA.md`. Todo en `claude/mayorista`.*
