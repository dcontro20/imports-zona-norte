# ✅ Checklist de arranque mayorista — primer día de venta real

> Para el día que arranque la venta mayorista en serio. En orden: cada paso
> habilita el siguiente. La guía completa con el porqué de cada cosa:
> `docs/GUIA_MAYORISTA.md`.

## Antes de salir a vender (una sola vez)

- [ ] **1. Modo mayorista activo** — topbar → **🏪 Mayorista** (el menú
      muestra solo las pantallas B2B + las compartidas abajo del divisor, y
      la app arranca en el Panel mayorista). Ya viene así por default.

- [ ] **2. Costos reales cargados** — 📦 Stock → revisá que los productos que
      vas a ofrecer tengan `costUSDT` cargado.
      *Sin costo no hay margen: el editor de tiers te va a mostrar "margen —"
      y vas a poner precios a ciegas.*

- [ ] **3. Decidir qué es Tier A, B y C** — en papel, antes de tocar la app:
      qué volumen de compra define cada tier (ej: A = 100u+/semana,
      B = 40u+, C = arranque). No hace falta cargarlo en ningún lado —
      es TU criterio para asignar tier a cada kiosco.

- [ ] **4. Precios por tier en los productos clave** — 📦 Stock → producto →
      **"🏪 Precios mayorista por tier (A/B/C, en USD)"**. Empezá por los
      15–20 productos que vas a ofrecer a kioscos, no por el catálogo entero.
      *Chequeá que el margen quede 🟢 (≥30%) o al menos 🟡 (≥20%) en cada tier.*

- [ ] **5. (Opcional) Cargar prospectos** — 🎯 Pipeline → **"+ Nuevo
      prospecto"** con los kioscos que tenés en la mira, con **zona**. El
      kanban te ordena la recorrida: Prospecto → Contactado → Visitado.

## El primer cliente real

- [ ] **6. Alta del kiosco** — 🏪 Kioscos → **"+ Nuevo mayorista"**. Los tres
      campos que no se negocian: **nombre**, **tier (A/B/C)** y **zona**
      (las rutas se arman por zona). Cuenta corriente: **apagada** (paga
      contra entrega; se activa por cliente el día que haga falta).
      *Si venía del Pipeline ("✓ Convertir"): quedó SIN tier — asignáselo acá.*

- [ ] **7. Primer pedido** — 🧾 Pedido mayorista → elegí el kiosco → agregá
      productos → verificá que el precio que muestra sea el del tier (si
      aparece "⚠️ sin tier asignado", volvé al paso 6) → **"Registrar
      pedido"**.
      *El stock se descuenta ya; la plata entra recién al cobrar. Es normal
      que la Caja no se mueva todavía.*

- [ ] **8. Primera ruta** — 🚚 Rutas → **"+ Nueva ruta"** → tildá el/los
      pedidos → **"Crear ruta"** → **"▶ Iniciar"** al salir →
      **"📋 Copiar hoja"** para llevar el detalle en el celu.

- [ ] **9. Primer cobro (el paso que valida todo)** — en la parada:
      **"💵 Cobrar"** → método y cuenta → **"Registrar cobro"**.
      *No confundir con "✓ Entregado", que no mueve plata.*

- [ ] **10. Verificar el circuito completo** — 60 segundos que confirman que
      todo cerró bien:
      - 💰 Caja: el cobro aparece en la cuenta elegida.
      - 💳 Cuentas corrientes: el kiosco NO figura (si cobraste todo).
      - 📊 Panel mayorista: facturación y P&L muestran el pedido.

## Rutina de las primeras semanas

- [ ] **Después de cada reparto:** cerrar la ruta (**"✓ Cerrar"**) y cobrar
      pendientes desde 💳 Cuentas corrientes cuando lleguen pagos tardíos.
- [ ] **1 vez por semana:** 📊 Panel mayorista → alertas ⏰ (kiosco que no
      recompra = llamalo) + margen del P&L (si baja de 🟡, revisar precios
      o costos).
- [ ] **Al sumar kioscos:** mantener las zonas prolijas — son la base de las
      rutas. Y recién cuando un kiosco grande pida fiado: activarle la cuenta
      corriente CON límite (guía, sección 7).

---

*Escrito 2026-07-17 (Tanda E).*
