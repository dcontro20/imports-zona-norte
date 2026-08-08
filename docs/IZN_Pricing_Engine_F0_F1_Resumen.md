# IZN · Pricing Engine — F0 (motor) + F1 (política como datos) · Resumen
### 07/08/2026 · branch `feature/mensaje-primer-contacto` · gate APROBADO por Gustavo

## Qué es este bloque

Primeras dos fases del reemplazo de la carga manual de precios por tier por un
**motor de pricing derivado de costos** (encargo:
`docs/brief-implementacion-claude-code.md`; negocio:
`docs/documento-estrategico-comercial-v1.md`; portabilidad:
`docs/addendum-portabilidad-modulo.md`). El motor calcula; el usuario configura.

## Decisiones cerradas en el arranque (con OK de Gustavo)

- **#2 Cuentas corrientes**: el módulo queda, inactivo por default. Condición
  explícita: la deuda puntual NO altera el precio — se cotiza contado y la
  deuda se registra aparte. Sin descuentos adosados al "excepcional".
- **#3 Origen del costo**: se carga en la ficha (costo de reposición); Compras
  es referencia con warning de drift, nunca fuente.
- **#4 Tipo de cambio**: dolarapi blue venta (lo que ya usa la app) + buffer;
  ahora con banda de sanidad y (en F5) congelamiento por presupuesto.
- **#1 Tiers → escalones: CONFIRMADA al cerrar el gate** (no había nada que
  consultar: con 0 pedidos, 0 productos con precio de tier y un solo kiosco
  real, no existe cliente al que le cambie el precio). **Reemplazo directo,
  sin transición.** Además: `wholesaleTier` se RETIRA del todo — no queda ni
  como etiqueta informativa ("un campo que parece hacer algo y no hace nada
  es el que en seis meses alguien usa para hacerle un precio especial a un
  cliente, exactamente lo que la política descarta"). Sale junto con el
  desacople del cotizador (F5) y la limpieza (F6).
- Correcciones de Gustavo incorporadas: el cotizador cuenta unidades a NIVEL
  SABOR hacia el total (mezcla libre incluye sabores, RN-07) · FX congelado al
  emitir presupuesto (F5) · escalones como ARREGLO, jamás campos fijos.

## F0 — Núcleo portable + fixture golden

- **`src/lib/pricingEngine.js`** — funciones puras, cero imports del proyecto
  (criterio de aceptación del addendum verificado por test): `costoReal`
  (RN-01), `redondear` epsilon-safe con múltiplo y dirección (RN-03),
  `preciosProducto` con anti-colapso encadenado (RN-02/04), `validarProducto`
  como capa separada (RN-05 bloqueante + 2 alertas opcionales desactivables,
  RN-14/15), `generarLista` (RN-18), `escalonParaTotal` (RN-06),
  `nudgeProximoEscalon` (RN-09). Escalones = `[{desde, hasta, margen}]`,
  cantidad libre (probado con 2 y 6). Motor agnóstico de moneda y rubro.
- **`docs/pricing_fixture_v2026-08.csv`** — 76 filas (19 SKUs × 4 escalones),
  formato largo. Generado por `scripts/generar-fixture-pricing.mjs`, que
  ABORTA si el motor no reproduce la grilla aprobada del doc §6 (el ancla es el
  documento, no el motor).
- **Golden test** (`pricingEngine.golden.test.js`): reproduce el CSV **byte a
  byte**, verifica el único anti-colapso real (Ignite V150 Pro @200+), los
  rangos de margen del doc §6 (28,1–30,5% / 17,8–20,5%) y las 3 validaciones
  de mercado del xlsx (35,6–47,4% margen kiosco).
- Detalle numérico que ya mordió: `toFixed` de JS vs formateo de Python
  difieren en half-even (0.29375) — por eso el fixture lo genera Node con el
  mismo formateador del test.

## F1 — Política como datos

- **`src/lib/pricingPolicy.js`** — `DEFAULT_PRICING_POLICY` con TODOS los
  números de la política v2026-08 (RN-19: nada queda en el código del motor):
  envío 13%, márgenes 28/24/21/18, redondeo 0,50 arriba, piso 15%, mínimos
  20u/USD 220, nudge 10%, buffer FX 3%, vigencia 48h, recargo 3%/7d, umbral
  recálculo 3%, banda sanidad FX 10%. + `normalizarPolitica` (esquemas viejos
  salen completos), `validarPolitica` (escalones contiguos, márgenes
  decrecientes), `fxDentroDeBanda`.
- **Sync**: key `pricingPolicy` en `appData` (objeto → full-overwrite, como
  exchangeRate). El invariante B1 (paridad DATA_KEYS↔smartSave) y el B3
  (backup Drive + export + restore) la exigieron solos — cubierta en
  `scripts/backup.mjs`, `Export.jsx` (restore con `normalizarPolitica`) y el
  test B3 aprendió a validar keys-OBJETO.
- **Pantalla** `components/wholesale/PricingPolicyScreen.jsx` ("🎛️ Política
  comercial", nav mayorista): edición de todos los parámetros, escalones
  agregables/quitables, validación bloqueante del guardado, "ejemplo en vivo"
  (el motor corriendo sobre el borrador con un costo de muestra), volver a
  v2026-08. Cambiar la política NO toca listas publicadas (snapshots = F2).
- **Banda de sanidad FX**: `useFirebaseSync` ya no aplica a ciegas lo que
  devuelve dolarapi — un salto mayor a la banda dispara
  `izn:fx-fuera-de-banda` y App muestra toast persistente con botón "Aplicar"
  (mismo valor rechazado no re-avisa en loop). Un glitch de la API no puede
  repreciar la lista.

## Tabla de impacto (decisión #1, para Diego)

`scripts/impacto-lista-v2026-08.mjs` (solo lectura) corrido contra prod:
**el sistema de tiers nunca se usó** — 0 pedidos mayoristas, 0 productos con
precio de tier cargado, 2 kioscos (uno es "Kiosco prueba", el otro sin tier).
**Impacto cero sobre clientes reales; no hace falta transición.** Detalle:
`docs/impacto-lista-v2026-08.md` + `.csv`.

## Estado

- Suite completa verde (single failure conocida y ajena: `dailyPlan > weekKey`,
  pre-existente). Build OK. +51 tests nuevos del bloque.
- Brief corregido (React+Vite, no Next.js) y los 3 docs + xlsx-fixture
  versionados en `docs/`.

## Cierres del gate F4 (2026-08-07, aplicados)

- **FX sin fallback inventado**: el seed hardcodeado 1415 de `exchangeRate` se
  eliminó (ahora 0 = "sin cotización"). Sin FX válido el sistema muestra USD y
  avisa — no convierte ni deja copiar la lista.
- **Ticket mínimo 220→200 USD**: con 220, 20× del producto de entrada (MO 20K
  = USD 210) quedaba rechazado. "Comprás desde 20 unidades" sin asteriscos.
  Sigue bloqueante (cambió el valor, no RN-08).
- **Disclaimers alineados**: lista y presupuesto prometen lo MISMO — "válidos
  por 48 hs" (de `vigenciaHoras`), no la versión vaga.

## Diseño de moneda para F5 (definido por Gustavo en gate F4)

Todo en USD interno (ya es así); al convertir se ELIGE la cotización:
(a) default = dolarapi blue venta + buffer, como hoy · (b) fuentes
CONFIGURADAS en la política (blue/MEP/...), no número libre — un FX editable a
mano es la puerta trasera para editar precios (RN-16): bajar la cotización
"para ayudar" a un cliente es un descuento no registrado · (c) si se habilita
valor manual: queda REGISTRADO en el presupuesto (valor, fuente, quién) y
aplica la banda de sanidad del 10% · (d) aviso de divergencia si el FX del
presupuesto difiere del FX con que se compartió la lista vigente más que el
umbral ("el cliente vio la lista a $X") · (e) el FX del presupuesto emitido se
CONGELA por las 48 hs, sea cual sea la fuente.

**Flujo real de F5**: el presupuesto lo armamos NOSOTROS (no hay
autoservicio): lista completa → cliente responde texto libre por WhatsApp →
se carga en el sistema → presupuesto de vuelta. Consecuencia (f): el nudge de
frontera es PARA EL VENDEDOR, visible en pantalla mientras carga ("estás a 3
unidades del 50-99, el cliente ahorra $X") — como argumento en la
conversación; en el texto final además, pero nunca solo ahí.

## Anotado para métricas v1.1 (NO implementar ahora)

- El buffer del 3% se reporta SEPARADO del margen: es colchón de riesgo
  cambiario, no rentabilidad — si el dólar no se mueve queda como utilidad
  extra; si salta, se consume.

## Próximos pasos (esperan gate)

- **F2** listas versionadas e inmutables (`priceLists`, RN-12/13).
- **F3** ficha de producto (sacar editor de tiers, costo de reposición +
  referencia de Compras) — esperaba la tabla de impacto: ya está.
- **F4** Lista de precios sobre snapshot · **F5** cotizador (conteo por sabor
  — RN-07 incluye sabores, FX congelado 48h por presupuesto, nudge con ahorro
  concreto, **+ registro del MOTIVO DE NO-CIERRE al marcar un presupuesto como
  perdido**: desplegable precio / stock / no respondió — sin ese dato hay tasa
  de cierre pero no el porqué, y la palanca hacia el juego 26/23/20/17 del §9
  queda sin fundamento) · **F6** limpieza de `resolveTierPrice`/tiers,
  **retiro total de `wholesaleTier`** + destino de CuentasCorrientes.
