# IZN — Parte 2: textos cortados en mobile · 2026-07-24

> Resumen autocontenido. Auditoría + fix de textos truncados/pisados en las
> 8 pantallas mayoristas a 375px. Criterio de Diego: "mejor que envuelva en
> dos líneas a que se corte". Deployado en `67f69c3`.

## TL;DR del diagnóstico

**Los cortes reales de negocio eran 3 líneas, no 30** — dos en primitivos
compartidos que se propagaban a las 7 pantallas:

1. **`StatCard` value** (UI.jsx): `nowrap+ellipsis` en ~107px útiles →
   cualquier monto de 7 dígitos se cortaba en silencio. Peor caso: **"Por
   cobrar"** de Cuentas corrientes (el total adeudado). También "A cobrar"
   de Rutas y los tickets B2B.
2. **Título del `Modal`** (UI.jsx): cortaba a ~34 caracteres → *"Registrar
   pago — Autoservicio La E…"* — **se confirmaban cobros sin ver a qué
   kiosco**. Afectaba los 4 modales con nombre (cobro, pago, duplicar,
   visita).
3. **Nombre de comercio en cards de Kioscos**: nowrap a ~30 chars.

El resto: desbordes de layout (facturación por canal con los dos montos
tocándose, ranking ilegible como párrafo, resultados de búsqueda del Pedido
con el nombre aplastado por el metadato de precio) y "frases de 3+ datos"
apretadas.

**Hallazgo clave**: el nowrap NO era copy-paste sistemático — era
inconsistencia (el mismo autor escribió el patrón correcto en 4 archivos y
el incorrecto en 2). Y solo el fontSize 22 de los h2 era copy-paste real.

## Qué se arregló (pantalla por pantalla)

| Pantalla | Fix |
|---|---|
| **UI.jsx** (raíz) | StatCard envuelve (fontSize 17 mobile) · título de Modal a 2 líneas · Table mobile prioriza el dato sobre el label |
| **Kioscos** | nombre de comercio envuelve · línea de recompras a máx 2 datos (el atraso ya está en el badge) |
| **Cuentas corrientes** | hereda StatCard/Modal · chip de fiado partido en 2 (la píldora se rompía con 7 dígitos) |
| **Panel mayorista** | facturación por canal en columna (se tocaban) · ranking a 2 líneas con monto protegido · alertas con icono arriba |
| **Pedido mayorista** | resultados de búsqueda apilados (el nombre manda) · subtotales sin ellipsis (inputs a ancho fijo 72/90px) · totales envuelven · cuenta corriente como chips |
| **Rutas** | hereda Modal (cobro) · header de card con gap (nombre y badge se pegaban) · h2 responsive · columna de flechas protegida |
| **Prospección** | nombre de producto del top por zona envuelve |
| **Pipeline** | ya estaba limpia (solo heredaba el título de Modal) |

## Regla que queda (para futuros Claudes)

En toda fila `[texto variable | dato fijo]`: el texto lleva
`flex:1 + minWidth:0` (y envuelve), el dato lleva `flexShrink:0`. Nada de
`whiteSpace:nowrap` en datos de negocio (nombres, montos, direcciones).
`space-between` siempre con `gap`. Máximo 2 datos concatenados con "·" por
línea en mobile.

| | |
|---|---|
| Commit | `67f69c3` — deployado |
| Tests | 1033 verdes · build OK |
