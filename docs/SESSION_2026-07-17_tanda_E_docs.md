# SESSION 2026-07-17 — Tanda E: documentación de usuario del modo mayorista

## TL;DR

Cerrada la **Tanda E** (docs de usuario, no toca código): `docs/GUIA_MAYORISTA.md`
(guía operativa completa, formato celu, con secciones "activar lo apagado" y
FAQ) + `docs/CHECKLIST_PRIMER_USO.md` (10 pasos del primer día de venta real).
1022 tests verdes (sin cambios de código). Resumen: `docs/IZN_Tanda_E_Docs_Resumen.md`.

## Cómo llegamos acá

Post-merge del pivote y con Diego ya habiendo operado el sistema en local y
prod, pidió arrancar la Tanda E del plan de mejoras. El backup (secret del
Action) quedó explícitamente para más tarde — el manual del 17/07 lo cubre.

## Decisiones clave (para Claudes futuros)

- **Exactitud por extracción, no por memoria:** todos los labels de
  botones/campos citados en la guía se extrajeron del código real con un
  agente de exploración (Kioscos/WholesaleOrder/Routes/CuentasCorrientes/
  DashboardMayorista/Products/Pipeline/App + libs puras). Si se renombra un
  botón en el código, hay que tocar la guía en el mismo commit — la guía
  tiene nota al pie que invita a reportar cualquier drift.
- **La "regla de oro" como eje didáctico:** *el pedido mueve stock, el cobro
  mueve plata*. Toda la confusión previsible del modo mayorista (FAQ "marqué
  cobrado y no veo la plata") se explica desde ahí.
- **E.3 y E.4 van DENTRO de la guía** (secciones 7 y 8), no como archivos
  sueltos — un solo documento para leer del celu.
- **Facts clave verificados en código** (por si la doc se re-escribe):
  - Sin tier asignado → `resolveTierPrice` cae al precio BASE minorista
    (fallback seguro) y WholesaleOrder avisa en rojo.
  - Mínimos por tier: `DEFAULT_TIER_MINIMUMS` todo en 0 (opt-in, sin UI de
    config — activar = cambio en código).
  - Convertir prospecto desde Pipeline deja `wholesaleTier: null` — gotcha
    documentado en guía y checklist.
  - "✓ Entregado" y estados de parada NO mueven plata; solo "💵 Cobrar"
    (Rutas) y "💵 Registrar pago" (CuentasCorrientes) crean `payment` en el
    sale → ledger de caja.
  - Borrar una ruta libera los pedidos (vuelven a "pendiente").

## Estado final

- 2 docs nuevos + resumen. Cero cambios en `src/`.
- 1022 tests verdes · build OK (sanidad).
- Tandas A–E ✅. Siguiente: **Tanda F** — propuestas de producto de bajo
  riesgo que requieren aprobación de Diego ítem por ítem ANTES de construir
  (F.1 duplicar pedido, F.2 nota por pedido, F.3 vista próximas recompras,
  F.4 totalizador de ruta por método, F.5 badge nuevo/recurrente, F.6 export
  CSV de ruta).

---

*Escrito 2026-07-17 al cerrar la Tanda E.*
