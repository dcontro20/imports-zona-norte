# IZN — Tanda E: Documentación de usuario · 2026-07-17

> Resumen autocontenido (regla permanente). Cierra la Tanda E de
> `docs/PLAN_MEJORAS_MAYORISTA.md`. No toca código: **cero cambios en src/**.

---

## TL;DR

Dos documentos nuevos escritos para Diego y Gustavo (no para devs), con los
botones y textos **exactos** de la app (extraídos del código real, no de
memoria): la **guía operativa completa del modo mayorista** y el **checklist
del primer día de venta real**. Incluyen las secciones pedidas: "cómo activar
lo apagado" y FAQ. **1022 tests verdes, build OK** (sanidad — no se tocó código).

## Qué se entregó

### E.1 — `docs/GUIA_MAYORISTA.md`
Guía paso a paso, formato celu (secciones cortas, listas, emojis del nav
real). Arranca con el mapa mental del flujo y la regla de oro (**el pedido
mueve stock, el cobro mueve plata**) y cubre:
1. Cargar precios por tier (Stock → bloque 🏪, semáforo de margen, por qué
   son listas propias y no "% sobre minorista")
2. Alta de mayorista (Kioscos, conversión de candidatos, conversión desde
   Pipeline y su gotcha: queda sin tier)
3. Pedido mayorista (tier automático, precio editable, descuento por volumen
   opcional, por qué descuenta stock ya pero NO toca caja)
4. Rutas (armado por zona, orden manual, hoja de ruta, borrar libera pedidos)
5. Cobro — los DOS únicos botones que mueven plata ("💵 Cobrar" en Rutas,
   "💵 Registrar pago" en Cuentas corrientes) y por qué "Entregado" no cobra
6. Cómo leer el Panel mayorista (KPIs, P&L por canal, comprometidas, alertas)

### E.3 — Sección "Cómo activar lo que está apagado" (en la guía)
- **Cuenta corriente por kiosco**: checkbox + límite en la ficha, paso a paso.
- **Mínimos de pedido por tier**: el validador existe, defaults en 0 —
  activarlo es un cambio chico de config en código (pedirlo a Claude).
- **Google Places**: qué falta (API key de Google, pago por uso, cablear la
  búsqueda) y cuándo tiene sentido (si la carga manual es cuello de botella).
- **Optimización de rutas**: qué falta (lat/lng en clientes + implementar el
  stub de ordenamiento por cercanía).

### E.4 — FAQ (en la guía)
- "Marqué cobrado y no veo la plata" → Entregado es logístico; solo el cobro
  explícito con método+cuenta acredita la caja. Incluye el fix.
- "¿Cómo convierto un minorista en mayorista?" → card ⭐ candidatos / pedirle
  a Claude / gotcha del Pipeline.
- "¿Mayorista sin tier?" → paga precio minorista (fallback seguro), la app
  avisa en rojo, fix en Kioscos.
- "Pantalla en blanco" → recargar, consola de Chrome, qué texto buscar
  ("Rendered more hooks…"), y cómo distinguirla del ErrorBoundary.
- Extras: pedido cancelado (stock vuelve solo), el minorista sigue intacto.

### E.2 — `docs/CHECKLIST_PRIMER_USO.md`
10 pasos en orden de dependencia: modo 🏪 → costos (sin costo no hay margen)
→ definir criterio de tiers → precios en los 15–20 productos clave (no todo
el catálogo) → prospectos opcionales → alta del primer kiosco → primer pedido
→ primera ruta → primer cobro → verificación del circuito completo en 60s
(Caja + Cuentas corrientes + Panel). Cierra con la rutina de las primeras
semanas.

## Cómo se garantizó la exactitud

Los flujos, labels de botones y validaciones se extrajeron del código real
(Kioscos, WholesaleOrder, Routes, CuentasCorrientes, DashboardMayorista,
Products, Pipeline, App + libs wholesale/creditAccount/routes) — cada botón
citado en la doc existe con ese texto exacto. Si el código cambia, la guía
tiene nota al pie de avisarle a Claude para corregirla en el mismo commit.

## Estado

| | |
|---|---|
| Código | sin cambios (docs-only) |
| Tests | 1022 verdes (sanidad) · build OK |
| Tandas | A–E ✅ · Siguiente: **F** (propuestas de producto, requieren tu OK ítem por ítem) |
