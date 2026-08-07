# Documento de Diseño Estratégico Comercial
## Distribuidora Mayorista de Vapes — Pricing Engine v1.0

**Versión:** 1.0 · **Fecha:** 07/08/2026 · **Estado:** Aprobado para operación
**Documento de referencia:** `Pricing_Engine_Vapes_v1.xlsx` (Lista v2026-08)
**Audiencia:** arquitectos y desarrolladores que implementarán el sistema sin haber participado del proceso de diseño comercial.

> Este documento describe **el negocio**, no la implementación. Define qué debe hacer el sistema y por qué, con la justificación de cada decisión. Las decisiones de arquitectura, lenguaje, framework y modelo de datos quedan fuera de su alcance y son responsabilidad de quien lo implemente, con la única condición de respetar las reglas de negocio y los principios enunciados aquí.

---

# 1. Contexto

## 1.1 Cómo nació la iniciativa

La empresa opera una distribuidora mayorista de vapes descartables en Argentina, vendiendo principalmente a kioscos y comercios minoristas del área metropolitana de Buenos Aires. El catálogo inicial es de 19 SKUs de cuatro marcas (Elfbar, Ignite, Lost Mary, Nikbar), con costos de compra al proveedor entre USD 6,50 y USD 11,50 por unidad.

La iniciativa nace de una constatación operativa: la empresa ya tiene clientes esperando y no tiene una política de precios formal. Los precios existentes surgieron de la operación, no de un cálculo, y no hay forma sistemática de responder a las tres preguntas que aparecen todos los días: cuánto cobrar por un pedido mixto, qué pasa con los precios cuando cambia un costo, y qué precio corresponde a un producto nuevo.

## 1.2 El problema a resolver

El objetivo declarado no es tener una lista de precios. Es tener un **Pricing Engine**: un motor que constituya el núcleo comercial del negocio y que permita generar automáticamente listas mayoristas, cotizar pedidos en segundos, recalcular precios cuando cambian los costos e incorporar marcas y modelos nuevos sin rehacer nada.

## 1.3 Por qué se abandonan las listas manuales

Una lista manual (un Excel con precios escritos a mano, o una imagen que circula por WhatsApp) falla en cuatro dimensiones que este negocio no puede tolerar:

- **No sobrevive al cambio de costos.** El proveedor ajusta precios y toda la lista queda desactualizada. Reconstruirla es un trabajo manual que se posterga, y mientras tanto se vende con precios viejos.
- **No sobrevive al crecimiento del catálogo.** Cada producto nuevo obliga a inventar un precio "a ojo", sin garantía de coherencia con el resto.
- **No garantiza rentabilidad.** Un precio escrito a mano puede quedar debajo del margen mínimo sin que nadie lo note hasta el cierre del mes.
- **No es consistente.** Distintos vendedores, distintos días y distintos clientes terminan con distintos precios para el mismo producto, lo que destruye precisamente la confianza que el negocio quiere vender como diferencial.

## 1.4 Limitaciones del punto de partida

El diseño se hizo con estas limitaciones explícitas, que condicionan varias decisiones:

- **No se dispone de listas mayoristas de la competencia.** Se decidió avanzar sin ellas y validar competitividad contra una referencia alternativa: los precios de venta al público observados en kioscos.
- **Los precios minoristas propios no surgen de una fórmula.** Son resultado de la operación histórica y contienen inconsistencias.
- **El negocio compra en dólares y vende en pesos**, en un contexto de tipo de cambio volátil.
- **La demanda por SKU no está medida.** No hay historial de rotación que permita segmentar por elasticidad.

---

# 2. Filosofía comercial

La visión comercial, enunciada explícitamente para que ninguna decisión futura de producto o de sistema la contradiga:

**No competir únicamente por precio.** La empresa no busca ser el proveedor más barato del mercado. Busca que el kiosquero, al comparar distribuidores, concluya "me conviene comprarles" por la combinación de precio competitivo, facilidad y confiabilidad — no por el precio aislado. Esta decisión tiene una consecuencia directa sobre el sistema: el precio debe ser **defendible**, no mínimo.

**Facilitar la compra por encima de todo.** La fricción es el verdadero competidor. Cotización en segundos, presupuesto listo para WhatsApp, proceso sin idas y vueltas.

**Mezcla libre de productos.** El cliente combina marcas, modelos y sabores como quiera. No se vende por cajas cerradas ni se exige cantidad mínima por modelo. Este es el diferencial central del negocio y la razón de ser de la estructura de precios adoptada.

**Generar confianza mediante consistencia.** El mismo cliente, en la misma situación, recibe siempre el mismo precio. No hay precios negociados caso por caso. La previsibilidad es parte del producto.

**Mantener rentabilidad por diseño, no por control posterior.** El sistema debe hacer estructuralmente imposible vender debajo del margen mínimo, en vez de detectarlo cuando ya ocurrió.

**Incentivar volumen sin obligar a él.** El cliente puede empezar con un pedido chico y crecer. El sistema debe premiar el crecimiento de forma visible y hacerlo fácil de percibir.

---

# 3. Objetivos del sistema

| Objetivo | Qué significa concretamente |
|---|---|
| **Rapidez para cotizar** | Un pedido mixto de cualquier tamaño se convierte en presupuesto enviable en segundos, sin cálculo manual. |
| **Consistencia de precios** | Dos cotizaciones del mismo pedido, hechas por personas distintas en momentos distintos bajo la misma lista vigente, dan el mismo resultado. |
| **Simplicidad para el usuario** | El operador comercial administra parámetros y costos. Nunca escribe un precio. |
| **Mantenibilidad** | Un cambio de costo del proveedor se refleja en toda la lista modificando un solo dato. |
| **Escalabilidad de catálogo** | Incorporar un producto, una marca o un proveedor nuevo requiere cargar su costo, nada más. |
| **Rentabilidad garantizada** | Ningún precio publicado puede violar el piso de margen. Es una restricción del sistema, no una recomendación. |

---

# 4. Investigación realizada

Esta sección documenta el razonamiento del proceso de diseño, para que decisiones futuras no vuelvan a recorrer caminos ya descartados.

## 4.1 Primera decisión: cómo se determina el precio mayorista base

Se evaluaron cuatro modelos para calcular el precio del primer escalón, del que dependen todos los demás.

**Modelo evaluado A — Margen objetivo sobre costo real.** El precio nace del costo: `costo real ÷ (1 − margen objetivo)`. Ventaja: rentabilidad predecible por diseño, cobertura del 100% del catálogo, autonomía total del sistema. Desventaja: ignora la disposición a pagar, dejando margen sobre la mesa en los productos de mayor demanda.

**Modelo evaluado B — Porcentaje del precio minorista propio (85%).** Se descartó por tres razones concretas: (1) siete de los diecinueve SKUs no tenían precio minorista cargado al momento del análisis, de modo que la fórmula no podía preciar un tercio del catálogo; (2) hereda la arbitrariedad de precios que no surgieron de una fórmula, produciendo márgenes que saltaban del 30% al 46% sin lógica de negocio — el caso más grave fue Lost Mary MO, que quedaba a USD 13,60 cuando la estructura de costos soporta USD 10,50, es decir un 30% caro justo en el producto de entrada con el que un kiosco compara distribuidores; (3) acopla el canal minorista al mayorista, de modo que una promoción en la venta directa movería toda la lista mayorista sin que hubiera cambiado ningún costo.

**Modelo evaluado C — Híbrido: minorista como base con validaciones de piso.** Simulado sobre los cuatro productos de referencia, dio **precios idénticos al modelo B**: con la estructura de costos real, el piso de margen del 15% queda tan por debajo del precio resultante que ninguna validación llega a activarse nunca. C es B con el doble de complejidad de mantenimiento y las mismas tres heridas. Lo valioso de C no era la fórmula sino la idea de validar; esa idea se rescató y se reubicó como capa de control independiente.

**Modelo adoptado D — Motor por costo, con validaciones de mercado como capa de control.** El precio se fija desde el costo (modelo A) y tres validaciones automáticas lo controlan sin fijarlo: piso de margen propio, margen del kiosco contra precio de calle, y techo de conflicto de canal contra el minorista propio.

## 4.2 Hallazgo clave: existe una referencia de mercado utilizable

Aunque no se dispone de listas mayoristas de competidores, sí se dispone de precios de venta al público observados en kioscos. Convertidos a dólares al tipo de cambio de referencia, revelan que **el precio de calle está entre USD 25 y USD 31 por unidad**, muy por encima del precio minorista propio (USD 16 a 23). La consecuencia estratégica es importante: hay espacio amplio para que el kiosco gane bien comprando a precios derivados del costo. No hace falta la lista del competidor para validar competitividad; basta verificar que el kiosco conserve un margen saludable contra su propio precio de venta real.

## 4.3 Segunda decisión: calibración de los márgenes por escalón

Se corrieron tres juegos de márgenes sobre los 19 SKUs completos, con cuatro validaciones automáticas cada uno.

| | **Adoptado (28/24/21/18)** | Evaluado (30/26/22/19) | Evaluado (26/23/20/17) |
|---|---|---|---|
| Margen real promedio del tier 1 | 29,1% | 31,2% | 27,2% |
| Piso de margen | Pasa | Pasa | Pasa |
| Techo de canal | Pasa | **Falla: V250** | Pasa |
| Escalones decrecientes | 1 colapso (corregido por regla) | 1 colapso | **4 colapsos** |
| Margen del kiosco vs. calle | 35,6% – 47,4% | 33,6% – 45,8% | 37,6% – 49,0% |
| Pedido de referencia (60u surtidas) | USD 807,50 · utilidad 204 | USD 825,00 · utilidad 222 | USD 797,50 · utilidad 194 |

**Se descartó el juego más agresivo (30/26/22/19)** porque rompe el techo de conflicto de canal en el Ignite V250: el precio mayorista (16,50) supera el 85% del precio minorista propio (16,15), lo que significaría vender al kiosco a un precio que casi iguala la venta directa. Corregirlo exigiría primero subir el minorista propio, que es una decisión de otro canal y de otro momento. Los ~1,6 puntos de margen adicional no justifican salir al mercado con un conflicto de canal abierto.

**Se descartó el juego más conservador (26/23/20/17)** por asimetría de valor: reduce el pedido de referencia en apenas USD 10 (un 1,2% del ticket, imperceptible como argumento comercial para el kiosquero) pero resigna el 5% de la utilidad del pedido. Es rentabilidad regalada sin comprar competitividad, en un negocio cuyo diferencial declarado explícitamente no es el precio. Adicionalmente, el redondeo colapsa escalones en cuatro SKUs, incluido el producto gancho del catálogo, anulando el incentivo de volumen justo donde más se percibe.

## 4.4 Hallazgo del análisis: el problema del colapso de escalones

Al aplicar redondeo hacia arriba sobre márgenes cercanos entre sí, dos escalones consecutivos pueden resolver al mismo precio. El efecto comercial es grave: el cliente que compra 100 unidades paga lo mismo por unidad que el que compra 50, y el incentivo de volumen desaparece silenciosamente en ese SKU. Se incorporó una regla estructural para impedirlo (ver 5.9).

---

# 5. Política comercial final

Cada decisión, con su justificación.

**5.1 Pedido mínimo: 20 unidades y ticket mínimo de USD 220.**
El mínimo bajo en unidades es un diferencial deliberado: permite al kiosco probar sin inmovilizar capital. El mínimo en dólares corrige un problema del mínimo puramente unitario: veinte unidades del producto más barato y veinte del más caro tienen tickets muy distintos pero idéntico costo de atención y logística.

**5.2 Mezcla libre.**
El precio no depende de la composición del pedido. Un pedido de 40 unidades repartidas entre cuatro modelos recibe exactamente el mismo precio unitario que 40 unidades de un solo modelo. Es el diferencial central del negocio: elimina la principal fricción del kiosquero, que es verse obligado a comprar cajas cerradas de sabores que no rotan.

**5.3 El escalón se determina por el total de unidades del pedido.**
No por monto, no por marca, no por línea de producto. Es la regla más simple de comunicar y la que hace posible la mezcla libre.

**5.4 Escalones: 20–49 / 50–99 / 100–199 / 200+.**
Cuatro niveles con saltos amplios y fáciles de recordar. Cuatro es suficiente para incentivar crecimiento sin volver la lista ilegible.

**5.5 Los precios se calculan desde el costo real, nunca desde el precio minorista.**
El precio mayorista se deriva del costo; el precio minorista se deriva del mercado. Invertir esa causalidad acopla dos canales que deben permanecer independientes y hereda inconsistencias históricas (ver 4.1).

**5.6 El costo de envío del proveedor (13%) integra el costo del producto.**
El proveedor cobra un 13% sobre el valor total del pedido en concepto de envío. Es costo de mercadería, no gasto general: cada unidad lo carga proporcionalmente. `costo real = costo proveedor × 1,13`. Tratarlo como gasto fijo llevaría a subestimar sistemáticamente el costo de cada unidad vendida.

**5.7 Márgenes objetivo por escalón: 28% / 24% / 21% / 18%.**
Margen sobre precio de venta, no markup sobre costo, porque el margen se conecta directamente con la rentabilidad del negocio y con las métricas de gestión. La progresión entre escalones (3 a 4 puntos) es perceptible para el cliente sin ser tan agresiva como para incentivar que dos clientes chicos se agrupen y canibalicen el escalón alto.

**5.8 Redondeo hacia arriba al múltiplo de USD 0,50.**
Siempre hacia arriba: protege el piso de margen y produce precios limpios, fáciles de comunicar y de recordar.

**5.9 Regla anti-colapso.**
Cada escalón debe quedar como mínimo USD 0,50 por debajo del escalón anterior. Cuando el redondeo los iguala, el escalón inferior se ajusta automáticamente hacia abajo. Garantiza que el incentivo de volumen exista en todos los SKUs sin excepción (ver 4.4).

**5.10 Piso de margen del 15%: restricción dura.**
Ningún SKU puede quedar debajo del 15% de margen en ningún escalón. Si un cambio de costo lo rompe, el sistema no publica: bloquea y exige una decisión humana (subir el precio o discontinuar el producto). Es la garantía estructural de rentabilidad.

**5.11 El precio minorista propio se usa solo como validación, nunca como fórmula.**
Función única: detectar conflicto de canal. Si el precio mayorista del primer escalón supera el 85% del precio minorista propio, el sistema alerta, porque la empresa estaría compitiendo contra sus propios clientes.

**5.12 El precio de mercado (venta al público en kioscos) se usa como validación de competitividad.**
Donde hay dato de precio de calle, el sistema calcula el margen que le queda al kiosco y alerta si cae por debajo del 30%. La lógica comercial es directa: si el kiosco no gana lo suficiente, no compra, por más que el margen propio sea correcto. Es la validación que reemplaza a las listas de competencia mientras no se dispongan.

**5.13 Condiciones de pago: el precio de lista es contado.**
Efectivo o transferencia contra entrega. Plazo a 7 días: recargo del 3%. No hay cuenta corriente en la versión inicial. La financiación se cobra explícitamente y nunca se regala dentro del precio.

**5.14 Moneda y vigencia.**
La lista vive en dólares. La conversión a pesos usa el tipo de cambio de referencia del día más un buffer del 3% que absorbe el movimiento entre la cotización y el cobro. Todo presupuesto en pesos vence a las 48 horas y lo declara explícitamente.

**5.15 Política de fallas.**
Reposición de unidades falladas hasta el 3% del pedido, con evidencia, reclamadas dentro de los 7 días de la entrega. Definirla por adelantado evita que cada vendedor la improvise por WhatsApp.

**5.16 Sin excepciones en la versión inicial.**
Ningún vendedor modifica un precio. Toda excepción se convierte en la expectativa del cliente para la próxima compra y destruye la consistencia que el negocio vende como diferencial.

**5.17 Estabilidad y versionado de listas.**
Un precio se recalcula solo cuando su costo real se mueve más del 3%; los movimientos menores los absorbe el margen. Cada lista publicada es un snapshot inmutable con versión y fecha de vigencia, y toda cotización queda referida a una versión concreta.

---

# 6. Pricing Policy v1.0 — Cómo funciona

La política se aplica en tres capas conceptuales.

**Capa 1 — El motor fija el precio.** Para cada producto se toma el costo de compra al proveedor, se le incorpora el 13% de envío y se obtiene el costo real. A partir de ese costo real, y del margen objetivo de cada escalón, se obtiene el precio de venta de ese producto en ese escalón, redondeado hacia arriba a medio dólar. Se aplica luego la regla anti-colapso para garantizar que cada escalón sea efectivamente más barato que el anterior.

**Capa 2 — Las validaciones controlan.** Antes de publicar, cada producto atraviesa tres controles: que el margen propio no caiga debajo del 15% en ningún escalón (bloqueante: impide publicar); que el precio del primer escalón no supere el 85% del precio minorista propio (alerta de conflicto de canal); y que, donde exista precio de calle observado, el margen resultante para el kiosco no sea inferior al 30% (alerta de competitividad).

**Capa 3 — El cotizador aplica.** Ante un pedido, se suman todas las unidades sin importar su composición, se determina el escalón, y cada línea toma el precio de su producto en ese escalón según la lista vigente. Si el pedido está cerca del siguiente escalón, el sistema lo señala explícitamente al cliente con el ahorro concreto que obtendría. El total se convierte a pesos con el tipo de cambio del día más buffer, y se emite un presupuesto con vigencia declarada.

**Lista mayorista v2026-08 (USD), aprobada y vigente:**

| Marca | Modelo | 20–49 | 50–99 | 100–199 | 200+ |
|---|---|---|---|---|---|
| Lost Mary | MO 20K | 10,50 | 10,00 | 9,50 | 9,00 |
| Ignite | V150 Black | 12,00 | 11,50 | 11,00 | 10,50 |
| Ignite | V150 Pro | 13,00 | 12,00 | 11,50 | 11,00 |
| Elfbar | TE 30K | 13,50 | 13,00 | 12,50 | 12,00 |
| Lost Mary | Mixer 30K | 13,50 | 13,00 | 12,50 | 12,00 |
| Elfbar | GH 23K | 14,00 | 13,50 | 13,00 | 12,50 |
| Lost Mary | Dura 35K | 14,50 | 13,50 | 13,00 | 12,50 |
| Lost Mary | MT 35K | 14,50 | 13,50 | 13,00 | 12,50 |
| Nikbar | 40K Ice Nic / Triple Chill | 14,50 | 13,50 | 13,00 | 12,50 |
| Elfbar | 40K Trio | 15,00 | 14,50 | 14,00 | 13,50 |
| Elfbar | 40K Sour King | 15,00 | 14,50 | 14,00 | 13,50 |
| Elfbar | 40K Ice King | 15,50 | 14,50 | 14,00 | 13,50 |
| Elfbar | 40K Sweet King | 15,50 | 14,50 | 14,00 | 13,50 |
| Ignite | V250 | 16,00 | 15,00 | 14,50 | 14,00 |
| Ignite | V300 | 16,50 | 16,00 | 15,50 | 14,50 |
| Ignite | V400 Ice | 16,50 | 16,00 | 15,50 | 14,50 |
| Ignite | V400 Sweet | 16,50 | 16,00 | 15,50 | 14,50 |
| Ignite | V300 Ultra Slim | 17,50 | 16,50 | 16,00 | 15,50 |
| Ignite | V400 V-Mix | 18,50 | 17,50 | 16,50 | 16,00 |

Margen resultante en el primer escalón: entre 28,1% y 30,5% según el producto. En el escalón más profundo: entre 17,8% y 20,5%. Margen del kiosco contra precio de calle observado: entre 35,6% y 47,4%.

---

# 7. Reglas de negocio

Toda implementación futura debe respetar estas reglas. Están numeradas para poder referenciarlas.

| # | Regla | Tipo |
|---|---|---|
| RN-01 | El costo real de un producto es su costo de compra multiplicado por (1 + porcentaje de envío). | Cálculo |
| RN-02 | El precio de un producto en un escalón se deriva de su costo real y del margen objetivo de ese escalón. | Cálculo |
| RN-03 | Todo precio se redondea hacia arriba al múltiplo de redondeo configurado. | Cálculo |
| RN-04 | Cada escalón debe ser estrictamente menor que el anterior, con una diferencia mínima igual al múltiplo de redondeo. | Cálculo |
| RN-05 | Ningún producto puede publicarse si su margen en algún escalón queda debajo del margen mínimo. | Bloqueante |
| RN-06 | El escalón aplicable se determina exclusivamente por la cantidad total de unidades del pedido. | Cotización |
| RN-07 | Todas las unidades de un pedido toman el precio del escalón alcanzado, sin importar su distribución entre productos. | Cotización |
| RN-08 | Un pedido debe alcanzar simultáneamente el mínimo de unidades y el mínimo de ticket para ser válido. | Bloqueante |
| RN-09 | Si un pedido está a menos del 10% del siguiente escalón, el sistema debe informar el beneficio de alcanzarlo. | Cotización |
| RN-10 | La conversión a moneda local aplica el tipo de cambio de referencia más el buffer configurado. | Cotización |
| RN-11 | Todo presupuesto declara su vigencia y la versión de lista que aplicó. | Cotización |
| RN-12 | Una lista publicada es inmutable; los cambios generan una versión nueva. | Integridad |
| RN-13 | Un precio se recalcula solo si su costo real varió más que el umbral configurado. | Estabilidad |
| RN-14 | El precio minorista propio no participa del cálculo; solo alimenta la validación de conflicto de canal. | Validación |
| RN-15 | El precio de calle observado no participa del cálculo; solo alimenta la validación de margen del cliente. | Validación |
| RN-16 | Ningún precio puede ser editado manualmente en la versión inicial. | Integridad |
| RN-17 | El precio de lista corresponde a pago contado; cualquier plazo aplica el recargo configurado. | Comercial |
| RN-18 | Un producto sin costo cargado no puede publicarse ni cotizarse. | Bloqueante |
| RN-19 | Todo parámetro de la política es configurable sin intervención de código. | Arquitectura |

---

# 8. Decisiones descartadas

Documentadas para que no se reabran sin evidencia nueva.

**Listas de precios manuales.** Descartadas por no sobrevivir a cambios de costo ni al crecimiento del catálogo, no garantizar rentabilidad y producir inconsistencias entre vendedores (ver 1.3).

**Precio mayorista como porcentaje del precio minorista propio.** Descartado por no poder preciar productos sin minorista cargado, heredar inconsistencias históricas produciendo márgenes erráticos, y acoplar dos canales que deben ser independientes (ver 4.1).

**Modelo híbrido con el minorista como base y validaciones de piso.** Descartado por producir precios idénticos al anterior con mayor complejidad: las validaciones nunca se activan con la estructura de costos real (ver 4.1).

**Márgenes 30/26/22/19.** Descartado por romper el techo de conflicto de canal en un SKU con referencia de mercado (ver 4.3).

**Márgenes 26/23/20/17.** Descartado por resignar el 5% de la utilidad a cambio de una reducción de precio del 1,2%, imperceptible como argumento comercial, y por colapsar escalones en cuatro productos (ver 4.3).

**Definir los escalones superiores como descuentos progresivos sobre el precio del primero.** Descartado por invertir la lógica de control: un descuento aplicado sobre un precio puede acumularse hasta perforar el piso de margen sin que ninguna regla lo advierta. Cada escalón se calcula desde su propio margen objetivo; el descuento resultante es una consecuencia observable, no un parámetro de entrada.

**Bandas de precio agrupando SKUs por costo.** Se evaluó agrupar los productos en seis o siete bandas, cada una con un precio único, para simplificar la lista y capturar valor adicional en los productos de mayor demanda. Se descartó **para la versión inicial** por dos razones: introduce una decisión de agrupamiento que hoy no tiene base empírica (no hay datos de rotación ni de elasticidad por SKU), y agrega un concepto intermedio entre costo y precio que complica el modelo sin beneficio inmediato demostrable. La idea permanece disponible como evolución futura cuando existan datos de demanda; no está rechazada, está diferida.

**Descuentos por marca, por línea de producto o por cliente.** Descartados por contradecir la mezcla libre y la consistencia. La única variable de descuento es el volumen total del pedido.

**Excepciones y precios negociados por vendedor.** Descartados en la versión inicial: toda excepción se convierte en la expectativa del cliente para la compra siguiente. Cuando existan, deberán llevar vencimiento obligatorio y autorización registrada.

**Cuenta corriente y financiación incluida en el precio.** Descartadas: la financiación se cobra por separado y de forma explícita.

---

# 9. Riesgos conocidos e hipótesis en validación

**Hipótesis central en validación: el nivel de márgenes es competitivo.** La calibración se validó contra precios de venta al público observados, no contra listas mayoristas de competidores, que no se pudieron obtener. Es la hipótesis más importante del modelo y la primera a confirmar con datos reales de operación.

**Palanca de corrección definida por adelantado.** Si a los 30 días de operación la tasa de cierre de presupuestos resulta baja y la objeción registrada es precio, la política migra al juego de márgenes 26/23/20/17 modificando cuatro parámetros. La migración es de la política completa, nunca de productos o clientes individuales.

**SKU bajo vigilancia: Ignite V250.** Es el único producto ajustado simultáneamente en dos validaciones: su precio mayorista alcanza el 84% del minorista propio (techo: 85%) y presenta el menor margen de kiosco contra precio de calle (35,6%). Hoy cumple ambas, pero es el primer candidato a ajuste si el mercado se tensiona o si se modifica su precio minorista.

**Riesgo de costo desactualizado.** Todo el modelo asume que el costo cargado refleja el costo de reposición actual. Si el proveedor cambia precios y nadie lo registra, el motor calcula correctamente sobre un dato viejo. Es el único punto donde el sistema depende de disciplina humana.

**Riesgo cambiario.** El negocio compra en dólares y cobra en pesos. El buffer del 3% y la vigencia de 48 horas mitigan el riesgo entre cotización y cobro, pero no cubren un salto cambiario abrupto ni el desfase entre venta y reposición.

**Riesgo de ciclo de vida corto del producto.** Los modelos y sabores de esta categoría rotan cada pocos meses. El catálogo tendrá altas y bajas frecuentes, y hará falta un mecanismo formal de liquidación de productos discontinuados.

**Métricas a observar en las primeras semanas:** tasa de cierre de presupuestos y motivo de no-cierre; distribución de pedidos por escalón (si la gran mayoría se concentra en el primero, los escalones superiores están mal calibrados); ticket promedio; margen real cobrado contra margen teórico de lista; y rotación por SKU, que es el insumo que habilitará la evolución hacia bandas.

---

# 10. Roadmap conceptual

```
Pricing Engine        ← estado actual: política aprobada, lista vigente
      ↓
Cotizador             ← pedidos mixtos a presupuesto en segundos, salida a WhatsApp
      ↓
Dashboard comercial   ← administración de costos y parámetros, publicación de listas
      ↓
Pedidos               ← registro de lo cotizado y lo cerrado, con motivo de no-cierre
      ↓
CRM comercial         ← clientes, seguimiento, excepciones con vencimiento
      ↓
Historial de compras  ← rotación, recompra, margen real por cliente
```

La secuencia no es arbitraria: cada etapa produce el dato que habilita la siguiente. El cotizador genera presupuestos; el registro de pedidos convierte esos presupuestos en tasa de cierre, que es lo que permite validar la hipótesis de márgenes; el historial produce rotación por SKU, que es lo que habilita evolucionar hacia bandas de precio y hacia una política diferenciada por demanda. Ninguna etapa debería adelantarse a la que le da sustento.

---

# 11. Principios

Todo desarrollo futuro debe respetar estos principios.

**El negocio define la tecnología.** La arquitectura se subordina a la política comercial, nunca al revés. Si una decisión técnica exige alterar una regla de negocio, se revisa la decisión técnica.

**La política comercial vive fuera del código.** Márgenes, escalones, mínimos, umbrales y porcentajes son datos configurables, no constantes escritas en el programa.

**Todo debe ser parametrizable.** Cualquier número que aparezca en este documento es un parámetro. Ninguno debe estar fijado en la implementación.

**Un cambio de costos nunca debe requerir cambios de código.** Cargar un costo nuevo, un producto nuevo, una marca nueva o un proveedor nuevo es una operación de datos.

**El motor calcula; el usuario configura.** Nadie escribe precios. El operador administra costos y parámetros; el sistema deriva todo lo demás.

**La rentabilidad es una restricción, no un objetivo.** El piso de margen no es una alerta que se pueda ignorar: es una condición que el sistema hace cumplir.

**La consistencia vale más que la optimización puntual.** Un precio ligeramente subóptimo pero consistente es preferible a un precio óptimo que rompe la previsibilidad. La confianza del cliente es un activo del negocio.

**La experiencia comercial es tan importante como el precio.** La velocidad de cotización, la claridad del presupuesto y la facilidad de compra son parte del producto que se vende, no accesorios del sistema.

**Toda decisión de precio debe ser explicable.** Cualquier precio debe poder justificarse ante un cliente o ante la dirección remontándose a su costo y a la política. Un precio sin explicación es un error esperando ocurrir.
