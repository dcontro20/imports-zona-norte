# IZN · Pricing Engine — Resumen del ciclo completo (F0–F6)
### 07–08/08/2026 · branch `feature/mensaje-primer-contacto` · dirigido por Gustavo con gate por fase

## Qué se construyó

El reemplazo completo de la carga manual de precios por tier por un **motor de
pricing derivado de costos**, según `docs/brief-implementacion-claude-code.md`
(encargo), `docs/documento-estrategico-comercial-v1.md` (negocio, RN-01..19) y
`docs/addendum-portabilidad-modulo.md` (el motor como producto trasplantable).
Principio rector: **el motor calcula; el usuario configura. Nadie escribe
precios.**

## Arquitectura (3 capas del addendum)

**Núcleo portable** (se copia tal cual a otro proyecto):
- `src/lib/pricingEngine.js` — costo real (RN-01), precios por escalón con
  redondeo epsilon-safe y anti-colapso (RN-02/03/04), validaciones como capa
  separada: piso de margen bloqueante (RN-05) + margenAlerta (aviso temprano)
  + conflicto de canal + margen del cliente, opcionales y desactivables
  (RN-14/15). Escalones = `[{desde, hasta, margen}]`, cantidad libre. Sin
  moneda, sin rubro, sin imports del proyecto (criterio verificado por test:
  2 y 6 escalones, redondeo en pesos).
- `src/lib/cotizador.js` — cotización contra lista publicada (RN-06/07),
  mínimos (RN-08), nudge de frontera con ahorro concreto (RN-09), FX por
  fuentes con banda de sanidad, presupuesto congelado (RN-10/11), recargo por
  plazo (RN-17), motivo de no-cierre; parse de carga rápida (spec g).

**Contrato de datos**: `src/lib/pricingAdapter.js` — sabores (~240) →
modelos (19) para el precio; `productIds` viajan porque el cotizador cuenta
unidades a nivel sabor (RN-07, mezcla libre incluye sabores). Costos mezclados
en un modelo: usa el MÁXIMO y lo reporta (visible en Stock).

**Integración IZN**: `pricingPolicy` + `priceLists` + `quotes` en appData
(sync + backup + export + restore, exigidos por los invariantes B1/B3),
pantallas 🎛️ Política comercial · 🏷️ Lista de precios · 🧮 Cotizador ·
🧾 Pedido mayorista, banda de sanidad del FX automático en useFirebaseSync.

## Reglas de negocio con implementación notable

- **RN-12 inmutabilidad**: lista publicada = snapshot append-only con política
  congelada (copia profunda), versionado `v<año-mes>[.n]`, `fxAlPublicar`.
- **§5.17 estabilidad**: al republicar, costo movido ≤3% conserva sus precios;
  el umbral se mide contra el **costo de REFERENCIA que originó los precios**
  (viaja de snapshot en snapshot), no contra la republicación anterior —
  anti erosión: +2,5% cinco veces dispara recálculo al acumular. El piso
  manda: conservar jamás deja un precio debajo del 15% (RN-05 > §5.17).
- **RN-16 sin puertas traseras**: no existe campo de precio mayorista editable
  en ningún lado; el FX manual queda REGISTRADO (valor/fuente/quién) y la
  banda de sanidad lo bloquea fuera del 10% — un FX libre es un descuento sin
  registrar.
- **Números inventados eliminados**: seed 1415 de exchangeRate y `|| 1` del
  rate en WholesaleOrder. Sin FX válido el sistema muestra USD y avisa.
- **Fixture golden**: `docs/pricing_fixture_v2026-08.csv` (19 SKUs × 4
  escalones) reproducido **byte a byte**; el generador
  (`scripts/generar-fixture-pricing.mjs`) ABORTA si el motor no reproduce la
  grilla aprobada del doc §6 — el ancla es el documento, no el motor.

## Decisiones cerradas en gates (con el porqué)

1. **Tiers A/B/C → escalones, reemplazo directo sin transición**: la tabla de
   impacto (`docs/impacto-lista-v2026-08.md`, script solo-lectura contra prod)
   probó que el sistema de tiers nunca se usó — 0 pedidos, 0 precios de tier
   cargados. `wholesaleTier` RETIRADO del todo (ni etiqueta informativa: un
   campo que parece hacer algo y no hace nada termina usado para "precio
   especial", justo lo que la política descarta).
2. **Cuentas corrientes**: módulo queda, inactivo por default; la deuda
   puntual NO altera el precio (se cotiza contado, la deuda aparte).
3. **Costo**: la FICHA es la fuente (reposición, `costUSDT`); Compras es
   referencia visible con warning de drift (`src/lib/costoCompras.js`) —
   compras en pedido/en_camino no cuentan: el costo de una promesa no es
   referencia. Edición masiva por modelo en Stock.
4. **FX**: dolarapi blue venta + buffer 3%; fuentes configurables al cotizar
   (blue/MEP/manual registrado); congelado 48hs al emitir; banda de sanidad
   10% también para el fetch automático (toast con confirmación); divergencia
   contra el FX de la lista compartida ("el cliente vio la lista a $X").
5. **Ticket mínimo 220→200**: 20× del producto de entrada (MO 20K = 210)
   tiene que pasar — "comprás desde 20 unidades" sin asteriscos.
6. **Lista de WhatsApp con TODOS los escalones** + mezcla libre ESCRITA +
   misma promesa de vigencia que el presupuesto (48hs, nunca la versión vaga).
7. **Flujo real**: el presupuesto lo armamos nosotros (no hay autoservicio).
   Carga rápida spec (g): 5 líneas <30s sin mouse, un input, "10 ice king",
   Enter, mismo modelo SUMA, sabores como nota. Parseo de texto pegado:
   v1.1, y si se hace produce borrador — nunca commitea solo.
8. **Tasa de cierre sin fugas (§9)**: motivo de no-cierre obligatorio
   (precio/stock/no respondió) · "Armar pedido" pre-carga el Pedido mayorista
   y linkea el saleId solo (sin doble carga) · red inversa al registrar un
   pedido con presupuesto abierto parecido · vencidos piden desenlace ·
   etiqueta obligatoria si no hay cliente (a quién seguir).

## Ajustes post-prueba real (08/08, tras el primer uso de la Lista)

- **La alerta de margen pasó a ser RELATIVA** (`margenAlertaPuntos`, 2 puntos
  debajo del objetivo de cada escalón) en vez de un umbral absoluto. El
  absoluto al 20% hacía saltar "margen bajo" en TODO el catálogo, porque el
  escalón 200+ apunta a 18% por diseño — una alerta que salta siempre entrena
  a ignorarla. El 17% absoluto tampoco alcanzaba: Geek Bar Pulse X cierra en
  **16,7%** por cascada de anti-colapso. Además el relativo sobrevive a la
  migración a 26/23/20/17 que el doc §9 ya planea (con absoluto volvería a
  inundar). Hoy no alerta ningún producto; alerta cuando anti-colapso y
  erosión de costo se suman (verificado con V150 Pro).
- **Las alertas son una LENTE, no parte del snapshot**: los precios publicados
  son inmutables (RN-12), pero las alertas se evalúan con la política y los
  datos de hoy — si no, una alerta desafinada sobreviviría hasta la próxima
  publicación.
- **Mensaje de WhatsApp en dos monedas** con selector: ARS (al dólar del día +
  buffer, válido 48 hs) y **USD** (precios en dólares, la conversión se explica
  y se hace al cotizar). La versión USD no necesita cotización cargada.
- **El ticket mínimo en pesos salió del mensaje**: asusta y casi nunca aplica
  (20 unidades del producto más barato ya lo superan). El mínimo se comunica en
  positivo — *"Comprás desde 20 unidades — mezclá modelos y sabores como
  quieras"* — y sigue siendo validación bloqueante en el cotizador (RN-08).
- **Publicar dejó de ser a ciegas**: muestra qué cambia contra la vigente
  (modelos que cambian de precio con delta, los que entran, los que salen, si
  cambió la política) y **si no cambia nada no genera versión** — una lista
  idéntica con número nuevo ensucia el historial y hace dudar de cuál mandó el
  cliente. En prod había 12 versiones publicadas, casi todas idénticas.
- **Atajo 💲 Editar costos** desde la Lista, con vuelta automática; y los
  modelos sin costo (RN-18) y con costos mezclados ahora se nombran, no se
  cuentan.

## Pendiente de decisión (no aplicado)

- **V250 Black / Gold / Pink son el mismo equipo en 3 colores** (verificado en
  prod: misma marca, mismo costo USD 10, listas de sabores casi idénticas, 55
  registros) y hoy ocupan 3 renglones idénticos de la lista.
  `scripts/migrate-v250-colores.mjs` los unifica en un modelo `V250` plegando
  el color al sabor (`Banana Ice · Black`), sin tocar ids, stock ni costos —
  el historial de ventas queda intacto y la granularidad de stock por color se
  conserva. **Dry-run corrido y limpio (55 registros, cero colisiones); falta
  correrlo con `--apply`** (con la app cerrada) y republicar la lista.

## Anotado, NO implementado (v1.1 / métricas)

- Buffer del 3% reportado SEPARADO del margen (colchón cambiario, no
  rentabilidad).
- Parser de pedidos pegados (borrador revisable, nunca directo).
- Bandas de precio: siguen diferidas hasta tener rotación por SKU (§8/§10).
- Fuentes de FX adicionales se agregan como config, no como código.

## Estado final

- **Suite ~1480 tests** (la única falla es `dailyPlan > weekKey`, pre-existente
  y ajena al ciclo). Build verde. Commits del ciclo: `e4302ff` (F0+F1),
  `23851a4` (F2), `e578995` (F3), `c07f217` (F4), `c145b8f` (cierres),
  `94ea830` (F5), F6 en el commit de cierre.
- **Retirados**: editor de precios por tier en Stock, selector de tier en la
  Lista, `wholesaleTier` entero (form/filtros/bulk/cards de Kioscos, CSV,
  schema, búsqueda global, Embudo, conversión de prospectos),
  `WHOLESALE_TIERS`, `resolveTierPrice`/`hasTierPrice`/mínimos por
  tier/`volumeDiscount`/`applyPct`, generadores de lista por tier, aliases
  `mayorista_*` de pricing.js. `wholesale.js` quedó = `orderMargin`.
- **Para operar** (Diego) — EN ESTE ORDEN, la secuencia importa:
  1. Cargar costos por modelo (📦 Stock → 💲 Costos por modelo).
  2. Dejar el banner de inconsistencias EN CERO. Mientras haya sabores del
     mismo modelo con costos distintos, la lista publica el MÁS ALTO:
     precios inflados en esos modelos. Corregirlo ANTES de la primera
     publicación, no después.
  3. Verificar que el FX esté cargado (0 = sin cotización: no convierte ni
     deja copiar — que no sorprenda en la primera publicación).
  4. Revisar la 🎛️ Política (ticket 200, márgenes 28/24/21/18).
  5. Publicar la Lista v2026-08 (🏷️ Lista de precios).
  6. Cotizar (🧮).
