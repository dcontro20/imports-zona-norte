# IZN — Parte 3: Front de ventas B2B completo · 2026-07-24

> Resumen autocontenido. Cierra el Bloque 2 acordado: las herramientas para
> el momento ANTERIOR a que el kiosco compre — contactarlo y mostrarle
> precios. Ambas pensadas para el celu, parado en el mostrador.

## TL;DR

**3.1 — Mensaje de presentación** (`9d8e9c0` + `67f69c3`) y **3.2 — Lista de
precios compartible** (`3c6ca3a`, opción C con tus 3 ajustes) deployados.
**1036 tests verdes (+6 del bloque)**. Guía actualizada con la sección
"El front de ventas".

## 3.1 — 💬 Presentar (primer contacto)

- Botón **"💬 Presentar"** en las cards de prospecto (🎯 Pipeline) y de
  kiosco (🏪 Kioscos) — el primer contacto pasa ahí.
- Modal: elegís el **tier a ofrecer** (A/B/C; en Kioscos arranca en el tier
  del kiosco) → genera el mensaje con 2-3 **precios de gancho reales** de
  ese tier (solo productos con lista cargada Y stock; sin eso, sale sin
  precios e invita a pedir la lista) → **preview editable** → copiar.
- `presentationMessage` en `wholesaleMessage.js` — reusa la infra de
  mensajes existente, mismo tono (natural, cálido, editable).

## 3.2 — 🏷️ Lista de precios (opción C + tus 3 ajustes)

**Dónde vive** (decisión delegada): **ítem propio del menú mayorista**,
entre Pedido mayorista y Pipeline. Es herramienta de venta: un tap desde
cualquier pantalla en modo 🏪, nada de submenús.

**La pantalla (para MOSTRAR en mano):**
- Selector de tier grande (se acuerda del último usado). El tier se ve
  **solo acá** — es info tuya: qué le estás mostrando.
- Lista agrupada por marca, tipografía grande (16-18px), precio en verde a
  la derecha — legible a un brazo de distancia en el mostrador.
- Al pie: cantidad de productos + dólar usado.

**El texto copiable (ajustes 1-3):**
1. ✅ Encabezado con **fecha + "sujetos a variación del dólar"** — te cubre
   cuando alguien muestre una lista vieja.
2. ✅ **NO menciona el tier** — dice "Lista de precios" a secas. Las listas
   se reenvían entre comercios; "Tier B" abre la pregunta equivocada.
3. ✅ **Completa**: todos los productos con stock y lista de tier cargada,
   agrupados por marca. (La versión corta ya la hace el mensaje de
   presentación con sus precios de gancho.)

Botón **"📋 Copiar para WhatsApp"** arriba de todo, en la misma pantalla.

**Regla de datos**: solo aparecen productos con stock > 0 Y lista del tier
cargada — la lista nunca ofrece lo que no podés entregar ni inventa precios
con el fallback minorista.

## Estado

| | |
|---|---|
| Commits | `9d8e9c0` · `67f69c3` · `3c6ca3a` — deployados |
| Tests | **1036 verdes** (+6: presentación 3, lista 3) · build OK |
| Guía | sección "El front de ventas" agregada |
| Bloque 2 | ✅ COMPLETO |

## Para estrenarlo mañana mismo

1. Cargá precios de tier en los 15-20 productos que ofrecés (📦 Stock) —
   sin eso las dos herramientas salen vacías.
2. Probá "🏷️ Lista de precios" → tier C → "📋 Copiar" → pegalo en un chat
   con vos mismo y mirá cómo lo ve un kiosquero.
3. Cargá 2-3 kioscos reales como prospectos en 🎯 Pipeline y mandales la
   presentación con 💬 Presentar.
