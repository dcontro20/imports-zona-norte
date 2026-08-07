# Impacto de la Lista v2026-08 sobre clientes existentes
### Insumo para la decisión abierta #1 del brief (tiers A/B/C → escalones por volumen) · 07/08/2026

## Pregunta que responde

Antes de aprobar el reemplazo de los tiers A/B/C por los escalones de volumen
20–49 / 50–99 / 100–199 / 200+, Diego necesita saber: ¿a qué kiosco activo le
cambia el precio, y cuánto? Si hay clientes pagando precios de tier hoy, el
cambio podría necesitar una transición con vencimiento (30 días manteniendo el
precio actual, comunicado como tal).

## Metodología

`scripts/impacto-lista-v2026-08.mjs` (solo lectura contra Firestore de prod):
por cada cliente `type="mayorista"` activo, toma su tier actual, la mediana de
unidades de sus pedidos (`saleType="mayorista"`), el escalón nuevo que le
corresponde a ese volumen, y compara el precio unitario promedio ponderado por
su mix histórico: precio de tier vigente (`priceByChannel.mayorista_a/b/c`)
contra la Lista v2026-08 en su escalón. Detalle en
`docs/impacto-lista-v2026-08.csv`.

## Resultado (corrido el 07/08/2026 contra prod)

**El sistema de tiers A/B/C nunca llegó a usarse operativamente. No hay ningún
cliente pagando precios de tier hoy.**

| Métrica | Valor |
|---|---|
| Clientes activos totales | 16 |
| Kioscos (`type="mayorista"`) | 2 — "Kiosco prueba" (tier C, es de prueba) y "KIOSCO El Tano 23" (sin tier asignado) |
| Pedidos mayoristas registrados (`saleType="mayorista"`) | **0** |
| Ventas por canal "Mayorista" | **0** |
| Productos con algún precio de tier cargado (de 242 activos) | **0** |

## Conclusión para la decisión

- **El reemplazo de tiers por escalones tiene impacto CERO sobre clientes
  reales**: nadie compró nunca a precio de tier, ningún producto tiene precios
  de tier cargados, y el único kiosco real ("El Tano 23") ni siquiera tiene
  tier asignado.
- **No hace falta transición con vencimiento**: no hay precio vigente que
  mantener. La Lista v2026-08 sería la primera lista mayorista efectivamente
  operativa del negocio.
- Lo único a decidir con Diego queda reducido a: (a) confirmar el reemplazo
  (sin costo de migración comercial), y (b) qué se hace con el campo
  `wholesaleTier` de la ficha de kiosco (propuesta: retirarlo del pricing;
  puede quedar como etiqueta informativa o eliminarse).

El script queda versionado: si entre hoy y el reemplazo se cargara un pedido
mayorista o un precio de tier, re-correrlo regenera la tabla real:

```
GOOGLE_APPLICATION_CREDENTIALS=<ruta SA json> node scripts/impacto-lista-v2026-08.mjs
```
