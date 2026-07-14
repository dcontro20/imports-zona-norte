# Sesión 2026-07-14 — Pivote mayorista: FASE 4 (Cuenta corriente B2B)

Branch: `claude/mayorista`. Continúa `docs/PLAN_MAYORISTA.md`. Fase 4 completa:
cuenta corriente COMPLETA pero apagada por default (creditEnabled OFF — los
mayoristas pagan contra entrega). Y se cierra el **puente con la caja**: cobrar
registra el movimiento real en las cuentas.

## Decisión de modelo clave (evita un bug de signo)

El `client.balance` existente usa convención retail: **negativo = el cliente debe,
positivo = le debemos a favor** (verificado en Sales.jsx: *"positive = store owes
them"*). El plan decía "positivo = nos debe" — al revés.

Para no chocar con esa convención, **la cuenta corriente B2B NO usa `client.balance`**:
el adeudado se **deriva de las ventas mayoristas** (`total − Σ payments`). Ventajas:
una sola fuente de verdad, y el puente con la caja es uniforme con el retail —
cobrar = agregar un `payment` al sale, que el ledger de CashBox ya convierte en
saldo de cuenta vía `payMethodToAccountId`. Sin doble conteo de revenue (sale.total
cuenta una sola vez; el payment sólo mueve caja).

## Fase 4 — qué se hizo (5 bloques)

| Bloque | Cambio | Archivos |
|---|---|---|
| 4.1 | `lib/creditAccount.js` (14 tests): saleOutstanding, clientOutstanding, creditStatus (owed/limit/available/overLimit), canChargeOnAccount, oldestUnpaidDays, isOverdue, allocatePayment (reparte más viejas primero). Todo derivado de ventas | `src/lib/creditAccount.js` (+test) |
| 4.2 | Kioscos ficha: toggle `creditEnabled` (default OFF) + `creditLimitARS` | `src/components/Kioscos.jsx` |
| 4.3 | WholesaleOrder: indicador de cuenta corriente (debe/límite/disponible) + aviso si el pedido supera el disponible; nota "paga contra entrega" si no tiene crédito | `src/components/WholesaleOrder.jsx` |
| 4.4 | `CuentasCorrientes.jsx`: mayoristas que deben (owed>0), límite/disponible/mora, "Registrar pago" (allocatePayment → payments en ventas → caja) + copiar mensaje de cobranza | `src/components/CuentasCorrientes.jsx`, `App.jsx` |
| 4.5 | `lib/wholesaleMessage.js` (2 tests): `cobranzaMessage` (detalle + total + días del más viejo) | `src/lib/wholesaleMessage.js` (+test) |
| Puente caja | Routes "💵 Cobrar": modal (método/cuenta + monto) → payment real en el sale + fulfillmentStatus cobrado/entregado. Cobro contra entrega que impacta la cuenta de caja | `src/components/Routes.jsx` |

## Decisiones de implementación (el porqué)

- **Adeudado derivado de ventas, no de client.balance** (ver arriba) — evita el
  conflicto de signo con la deuda retail.
- **Cobrar = payment en el sale** (mismo camino que retail). El ledger de CashBox
  acredita `mpDiego/mpGustavo/lemonPesos/lemonUSDT/usdCash/pesosCash` según el método.
  Es el "movimiento real en las cuentas" que pidió Diego, sin inventar un tipo nuevo
  ni arriesgar doble conteo.
- **Cobro parcial:** `allocatePayment` reparte el pago entre los pedidos impagos del
  cliente, más viejos primero; cada uno recibe su payment y se marca cobrado si se
  saldó por completo.
- **creditEnabled default OFF:** sin crédito, el cliente paga contra entrega (se cobra
  en la ruta). Con crédito, puede dejar saldo hasta el límite; `canChargeOnAccount` y
  el aviso en el pedido lo gatean. Mora = pedido impago más viejo supera 30d (default).
- **Cuentas corrientes muestra TODO mayorista que deba** (no sólo creditEnabled):
  también un contra-entrega entregado sin cobrar aparece para cobrarlo. Los
  creditEnabled muestran límite/disponible; ligera desviación del plan (que decía
  "solo creditEnabled") por ser más útil como pantalla de cobranzas.
- **UI 100% tokens `T` + componentes UI.jsx.** Mobile-first. Sin componentes nuevos.

## Estado

- **928 tests verdes** (912 + 14 creditAccount + 2 wholesaleMessage). Build OK. Cero regresiones.
- Pantalla nueva: **Cuentas corrientes** (6 pantallas mayoristas en total).

## Siguiente: FASE 5 — Inteligencia B2B + Dashboard mayorista

`wholesaleIntelligence.js` (recompra esperada por kiosco, ranking por rentabilidad,
productos por zona, churn B2B) + Dashboard modo mayorista + reservar stock + P&L
mayorista vs minorista.
