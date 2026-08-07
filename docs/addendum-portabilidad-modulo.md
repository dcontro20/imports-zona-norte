# Addendum al brief — Portabilidad del módulo
### Pricing Engine como producto reutilizable · 07/08/2026

El objetivo no es solo resolver el pricing de esta distribuidora: es que el módulo pueda trasplantarse a cualquier negocio que venda mayorista, cambiando datos y no código. Mismo criterio que se usó con el Prospect Engine. Esto no cambia el alcance de la entrega, pero sí dónde se traza cada límite.

---

## El principio

**El motor no sabe qué se vende, en qué país, ni con qué moneda.** Recibe productos con costos y una política; devuelve una lista de precios y un conjunto de validaciones. Todo lo demás —de dónde salieron esos costos, dónde se guarda la política, cómo se muestra la lista, qué API da el tipo de cambio— vive fuera.

Si el motor necesita saber que existen vapes, Firestore, kioscos o el dólar blue, la frontera está mal trazada.

---

## Las tres capas

**1. Núcleo portable (`pricingEngine.js`).** Funciones puras, sin dependencias del proyecto. Entrada: lista de productos con costo y una política completa. Salida: precios por escalón y validaciones. Cero acceso a red, cero acceso a base de datos, cero React. Esta capa se copia tal cual a otro proyecto.

**2. Contrato de datos.** Dos formas definidas explícitamente: la del producto que entra (identificador, costo, y opcionalmente precio propio de referencia y precio de mercado observado) y la de la política. Un adaptador traduce entre el modelo del sistema anfitrión y estas formas. Al portar el módulo se reescribe el adaptador, no el motor.

**3. Integración específica.** Persistencia, pantallas, fuente del tipo de cambio, formato del mensaje de WhatsApp, reglas de presentación. Todo esto es de este proyecto y se reescribe en cada implementación. No debe filtrarse hacia adentro.

---

## Qué debe ser configurable desde el arranque

Estas son las dimensiones donde otro negocio mayorista difiere de este. Las marcadas como **ahora** cuestan poco y evitan reescribir el núcleo después; las marcadas como **después** no deben construirse todavía.

| Dimensión | Cuándo | Motivo |
|---|---|---|
| **Cantidad de escalones** | **Ahora** | Los escalones deben ser un arreglo (`[{desde, hasta, margen}]`), no cuatro campos fijos. Otro negocio puede tener dos o seis. Es la diferencia más barata de resolver hoy y la más cara de arreglar después: si el motor devuelve `p1..p4`, no es portable. |
| **Múltiplo y dirección de redondeo** | **Ahora** | Ya es parámetro. Un negocio que factura en pesos redondea a 100 o 1.000, no a 0,50. |
| **Métrica del escalón** | **Ahora** (solo el nombre) | Acá el escalón se determina por unidades totales. Otro negocio podría usar monto total o peso. No hace falta implementar las alternativas, pero el campo debe llamarse por lo que es (`metricaEscalon: "unidades"`) y no asumirse implícito en el código. |
| **Validaciones opcionales** | **Ahora** | Solo el piso de margen es universal. Las otras dos (conflicto de canal, margen del cliente) dependen de datos que otro negocio puede no tener. Deben poder desactivarse por configuración y no romper nada si el dato falta. |
| **Fórmula del costo adicional** | **Después** | Acá el envío es un porcentaje sobre el pedido. Otro proveedor cobra monto fijo por unidad, o por bulto. Hoy alcanza con que el porcentaje sea parámetro; la fórmula alternativa se construye cuando exista un caso real. |
| **Conversión de moneda** | **Después** | Debe ser un paso externo al motor, no una capacidad suya. Un negocio que compra y vende en la misma moneda simplemente no lo usa. |
| **Bandas de precio** | **Después** | Ya está diferida por falta de datos de rotación. No adelantarla. |

---

## Advertencia sobre generalizar de más

Con un solo caso real, toda abstracción es una hipótesis. La regla: **hacer la frontera limpia ahora, la configurabilidad después.** Un núcleo puro con contratos explícitos se generaliza en un día cuando aparezca el segundo cliente; un núcleo con seis estrategias intercambiables construidas para clientes imaginarios es deuda técnica desde el primer commit y ninguna de las seis va a ser la que el segundo cliente necesita.

Las cuatro filas marcadas **ahora** son excepciones justificadas porque son estructurales: cambiarlas después obliga a tocar el motor, las firmas de las funciones y los tests a la vez.

---

## Qué se lleva y qué se deja al portar

**Se lleva:** el módulo del motor, el contrato de datos, la batería de tests unitarios por regla de negocio, el documento estratégico como plantilla (la estructura de once secciones sirve para cualquier distribuidora; el contenido se reescribe), y la lista numerada de reglas RN-01 a RN-19, que es el invariante del producto.

**Se deja:** el fixture de precios (es de esta lista), las validaciones específicas, la fuente del tipo de cambio, las pantallas, y todo el vocabulario del rubro.

---

## Criterio de aceptación

El módulo del motor se considera portable si puede ejecutarse en un archivo de test aislado, sin el resto del proyecto presente, alimentado únicamente por un objeto de productos y un objeto de política escritos a mano en el propio test. Si para correr esa prueba hace falta importar algo del sistema anfitrión, la frontera todavía tiene una fuga.
