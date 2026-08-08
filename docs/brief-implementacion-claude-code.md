# Brief de implementación — Módulo Pricing Engine
### Para Claude Code · Proyecto IMPORTS ZONA NORTE · 07/08/2026

---

## Qué es esto

Acompaña al documento `documento-estrategico-comercial-v1.md`, que es la **fuente de verdad del negocio**. Este brief define el encargo concreto: qué construir, dónde, y qué parte del sistema actual se reemplaza.

Orden de lectura sugerido: este brief primero (para saber qué se pide), después las secciones 6, 7 y 11 del documento estratégico (política, reglas de negocio numeradas y principios). El resto del documento explica el porqué de cada decisión y sirve para resolver dudas de criterio sin preguntar.

---

## Estado actual del sistema

App existente en React 18 + Vite desplegada en Vercel (`imports-zona-norte.vercel.app`). Módulos ya presentes en la navegación: Panel mayorista, Kioscos, Pedido mayorista, **Lista de precios**, Prospectos, Rutas, Cuentas corrientes, Análisis, Compras, Stock, Caja, Gastos, Mermas, Precios.

La sección **Lista de precios** funciona hoy con tres tiers (A / B / C) cuyos precios se cargan **a mano, producto por producto**, desde Stock → producto → "Precios mayorista por tier". Se diseñó así provisoriamente, solo para tener algo funcionando.

Ya existe en el sistema: cotización del dólar blue en el header, toggle Mayorista/Minorista, y un botón "Copiar para WhatsApp" en la lista de precios.

---

## El encargo

**Reemplazar la carga manual de precios por tier por un motor de pricing derivado de costos.**

Concretamente:

1. **Eliminar** los campos de precio mayorista por tier cargados a mano en la ficha de producto. Los precios dejan de ser un dato de entrada y pasan a ser un dato calculado (principio: *el motor calcula; el usuario configura* — ver sección 11 del documento estratégico).

2. **Incorporar** en la ficha de producto los datos que sí son de entrada: costo de compra al proveedor (USD), y opcionalmente precio minorista propio y precio de calle observado, que no participan del cálculo pero alimentan validaciones (RN-14, RN-15).

3. **Crear** una pantalla de configuración de la política comercial, con todos los parámetros editables: porcentaje de envío, márgenes por escalón, límites de cada escalón, múltiplo de redondeo, margen mínimo, mínimo de unidades, mínimo de ticket, buffer de tipo de cambio, umbral de recálculo, vigencia de presupuesto, recargo por plazo. Ninguno de estos números puede quedar fijo en el código (RN-19).

4. **Implementar el motor** según las reglas RN-01 a RN-05: costo real, precio por escalón, redondeo hacia arriba, regla anti-colapso, piso de margen bloqueante.

5. **Implementar las validaciones** como capa separada del cálculo: una bloqueante (piso de margen) y dos de alerta visible (conflicto de canal, margen del kiosco).

6. **Adaptar Lista de precios** para mostrar la grilla calculada y mantener el "Copiar para WhatsApp" con versión de lista y fecha.

7. **Conectar el cotizador** (módulo *Pedido mayorista*) al motor: suma de unidades → escalón → precios de la lista vigente → nudge de frontera (RN-09) → conversión a pesos → presupuesto con vigencia (RN-10, RN-11).

---

## Decisiones abiertas — resolver antes de implementar

Estas requieren confirmación del dueño del negocio, no criterio técnico:

**1. Tiers A/B/C vs. escalones 20–49 / 50–99 / 100–199 / 200+.** La política aprobada define **cuatro** escalones por volumen total del pedido. El sistema actual tiene **tres** tiers. Hay que confirmar si los tiers A/B/C actuales son escalones de volumen (en cuyo caso se reemplazan por los cuatro nuevos) o son categorías de cliente (en cuyo caso son otro concepto y hay que decidir si sobreviven). La política aprobada **no contempla precios diferenciados por cliente** — la única variable de descuento es el volumen del pedido.

**2. Cuentas corrientes.** El módulo existe en la app, pero la política v1 establece pago contado con recargo del 3% a 7 días y **sin cuenta corriente** (regla 5.13 y RN-17). Confirmar si el módulo queda inactivo, si se usa solo para registro de deuda puntual, o si la política cambia.

**3. Origen del costo.** Confirmar si el costo de compra se carga a mano en la ficha de producto o si debe tomarse del módulo *Compras*. Si viene de Compras, definir cuál costo manda: el último, o un promedio. La política exige **costo de reposición**, o sea el último conocido (ver sección 9, riesgo de costo desactualizado).

**4. Fuente del tipo de cambio.** El header ya muestra el blue. Confirmar de dónde sale y si el motor lo consume automáticamente o si se carga a mano.

---

## Restricciones no negociables

- Los precios **nunca** se editan a mano. No debe existir un campo de precio mayorista editable (RN-16).
- Una lista publicada es **inmutable**; los cambios generan versión nueva, y toda cotización guarda a qué versión respondió (RN-12).
- El precio minorista y el precio de calle **no participan del cálculo**. Solo validan.
- Un producto sin costo cargado **no se cotiza ni se publica** (RN-18).
- El piso de margen es **bloqueante**, no una advertencia que se pueda ignorar (RN-05).

---

## Fuera de alcance de esta entrega

Overrides de precio por cliente, bandas de precio, métricas de margen real vs. teórico, modo liquidación, y CRM. Están en el roadmap (sección 10 del documento estratégico) y dependen de datos que hoy no existen. No adelantarlos.
