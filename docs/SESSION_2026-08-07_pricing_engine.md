# Sesión 2026-08-07/08 — Pricing Engine, ciclo completo F0–F6

Gustavo trajo el encargo (brief + doc estratégico + xlsx de referencia +
addendum de portabilidad) y dirigió con gate por fase. Este journal registra
el PORQUÉ de lo que el git log no cuenta.

## Cronología y decisiones

- **Plan + 4 decisiones abiertas**: los docs no estaban en el repo (carpeta
  Desktop); el fixture CSV no existía — se generó desde el xlsx tras verificar
  que RN-01..04 reproducen la grilla aprobada 19/19 (único anti-colapso:
  V150 Pro @200+). Hallazgo propio: el brief no veía que el catálogo real
  vive a nivel SABOR (~240) y la lista a nivel MODELO (19) — de ahí el
  adaptador y la regla "se cuenta por sabor, se precia por modelo".
- **Decisión #1 (tiers→escalones)** esperó la tabla de impacto que pidió
  Gustavo: `scripts/impacto-lista-v2026-08.mjs` (solo lectura, Admin SDK)
  contra prod demostró que el sistema de tiers NUNCA se usó (0 pedidos, 0
  precios de tier, un solo kiosco real sin tier). Reemplazo directo sin
  transición; `wholesaleTier` retirado del todo — "un campo que parece hacer
  algo y no hace nada es el que en seis meses alguien usa para un precio
  especial".
- **#2 CC**: queda inactiva; la deuda puntual NO altera el precio. **#3
  costo**: la ficha es reposición; Compras es referencia con drift (compras
  pedido/en_camino no cuentan: "el costo de una promesa no es referencia").
  **#4 FX**: dolarapi blue venta + buffer.
- **Gate F2** sumó dos anti-erosión: el umbral §5.17 se mide contra el costo
  de REFERENCIA (el que originó los precios, viaja de snapshot en snapshot)
  — contra la republicación anterior, +2,5% × 5 jamás recalcularía; y
  `margenAlerta` 20% (el piso 15% es bloqueante y por eso tardío).
- **Gate F4**: lista de WhatsApp con TODOS los escalones (un escalón suelto
  esconde el incentivo de volumen) + mezcla libre ESCRITA + vigencia 48hs
  igual al presupuesto ("la promesa vaga es la que el cliente guarda").
  Cierres: seed 1415 del FX eliminado (número inventado), ticket 220→200
  (20× MO 20K = 210 tiene que pasar). Diseño de moneda a-e (fuentes
  configuradas — FX libre = puerta trasera de RN-16; manual registrado +
  banda; congelado 48hs; divergencia vs lista).
- **F5, flujo real**: el presupuesto lo armamos NOSOTROS. Spec (g) de carga
  rápida con criterio medible (5 líneas <30s sin mouse); nudge PARA EL
  VENDEDOR (si solo va en el texto, se entera del upsell cuando ya cerró);
  margen interno (k) jamás viaja. Parser de texto pegado descartado v1
  (si acierta a medias, el error pasa inadvertido) — v1.1 con "nunca
  commitea solo". Otro número inventado muerto: `|| 1` del rate.
- **Gate F5 → ajustes**: "Armar pedido" pre-carga el Pedido mayorista y
  linkea saleId solo (sin doble carga no hay tasa de cierre); red inversa al
  registrar pedido con presupuesto abierto parecido; etiqueta obligatoria
  sin cliente; vencidos piden desenlace (ensucian el denominador de §9).
- **F6**: retiro total de tiers (Kioscos/CSV/schema/búsqueda/Embudo/
  conversión/enums/wholesale.js/aliases pricing.js) con tests recortados y
  la integración D.1 reescrita al camino del motor.

## Gotchas técnicos que valen para el futuro

- `toFixed` JS vs formateo Python difieren en half-even (0.29375) — el
  fixture lo genera Node con el MISMO formateador del test.
- Redondeo hacia arriba necesita epsilon (11.5/0.5 = 23.000000000000004).
- El snapshot estabilizado guarda `costoRealReferencia` aparte de
  `costoReal` — sin eso, el drift se mediría contra la republicación
  anterior y la erosión sería invisible.
- Flake B9 reapareció una vez (timeouts 18–55s corriendo encadenado tras
  otro vitest); verde en aislamiento y en corrida limpia.
- El detector B3 de cobertura de backup aprendió a validar keys-OBJETO
  (pricingPolicy restaura con `typeof`, no `Array.isArray`).

## Estado

~1480 tests (única falla: `dailyPlan > weekKey`, pre-existente y ajena).
Commits: e4302ff · 23851a4 · e578995 · c07f217 · c145b8f · 94ea830 + cierre
F6. Pendiente de Diego: cargar costos por modelo, revisar política, publicar
la primera lista y probar el ciclo entero en prod.
