# 🏪 Guía del modo mayorista — Imports Zona Norte

> Para Diego y Gustavo. Paso a paso, pensada para leer desde el celu.
> Cada sección tiene el **cómo** (botones tal como aparecen en la app) y el
> **por qué** (para entender qué hace el sistema por atrás).
>
> Checklist para el primer día: `docs/CHECKLIST_PRIMER_USO.md`.

---

## El mapa completo en 30 segundos

```
Precios por tier  →  Kiosco con tier  →  Pedido  →  Ruta  →  💵 Cobro  →  Panel
   (Stock)            (Kioscos)          (🧾)       (🚚)     (la plata      (📊)
                                                     entra ACÁ)
```

La regla de oro del sistema: **el pedido mueve stock, el cobro mueve plata.**
Son dos momentos distintos, porque los kioscos pagan contra entrega. Todo lo
demás de esta guía es el detalle de ese flujo.

### El toggle 🏪 / 🛒 (arriba de todo)

En el topbar hay dos botones: **🏪 Mayorista** y **🛒 Minorista**. Son **dos
mundos separados en el menú, conectados en los datos**:

- En modo **Mayorista** el menú muestra SOLO las pantallas mayoristas (Panel
  mayorista, Kioscos, Pedido mayorista, Pipeline, Prospección, Rutas,
  Cuentas corrientes). En modo **Minorista**, solo las minoristas (Dashboard,
  Ventas, Clientes, Mensajes).
- Las **compartidas** (Stock, Caja, Compras, Análisis, Gastos, Mermas,
  Precios, Historial, Cotizaciones, Exportar, Auditoría, Papelera) están
  siempre, en un grupo aparte abajo del divisor — porque el stock, la plata
  y la importación son UNO solo para los dos canales.
- **Cada modo arranca en su panel**: Mayorista → Panel mayorista, Minorista
  → Dashboard. Al cambiar de modo, si estabas en una pantalla del otro mundo
  te lleva al panel del modo nuevo; si estabas en una compartida (Stock,
  Caja), te quedás donde estás.
- **Los datos no se separan nunca**: el P&L muestra ambos canales, la Caja
  recibe de ambos, el stock es uno. Si una alerta o una búsqueda te lleva a
  una pantalla del otro modo, abre igual (solo que no figura en el menú).

**Default: minorista** (decisión del 17/07/2026 — el minorista sigue siendo
el canal más usado mientras los kioscos arrancan; cuando el mayorista crezca
se da vuelta con un click). El toggle siempre está visible para saber dónde
estás; en el celu el resto del topbar (usuario, Ajustes, presencia del socio)
vive dentro del menú ☰.

---

## 1. Cargar precios por tier (una vez por producto)

**Dónde:** 📦 Stock → tocá un producto → abrí el bloque plegable
**"🏪 Precios mayorista por tier (A/B/C, en USD)"**.

1. Cargá el precio USD para **Tier A**, **Tier B** y **Tier C**.
2. Mirá el **"margen N%"** que aparece abajo de cada precio:
   🟢 verde ≥30% · 🟡 ámbar ≥20% · 🔴 rojo <20%.
3. Si dejás un tier vacío, ese tier paga el **precio base** del producto.

**¿Por qué tiers y no "% de descuento"?** Cada tier es su **propia lista de
precios**, no un porcentaje sobre el minorista. Así podés afinar producto por
producto (en algunos conviene ser agresivo, en otros no) sin que un cambio del
precio minorista te mueva toda la estructura mayorista.

**¿Quién es tier A/B/C?** Lo decidís vos por volumen de compra: A = los que
más compran (mejor precio), C = los chicos. Se le asigna al kiosco (sección 2)
y el pedido usa la lista automáticamente.

⚠️ **El margen se calcula con el costo real (`costUSDT`)**. Si un producto no
tiene costo cargado, el margen muestra "—" y volás a ciegas. Cargá costos
primero.

---

## 2. Dar de alta un mayorista

**Dónde:** 🏪 Kioscos → **"+ Nuevo mayorista"**.

Campos que importan (el resto es contacto):
- **"Nombre / responsable"** — obligatorio.
- **"Tier mayorista"** — obligatorio (A/B/C). Sin esto no hay precio mayorista.
- **"Zona / barrio"** — importa mucho: las **rutas se arman por zona**.
- **"Tipo de comercio"** — kiosco, maxikiosco, druguería, distribuidor, etc.
- **"💳 Habilitar cuenta corriente (fiado)"** — dejalo **apagado** salvo
  decisión puntual (ver "Activar lo apagado").

**¿Ya era cliente minorista?** Hay dos caminos:
- Si en su momento le pusiste tier "mayorista" (el viejo), Kioscos te muestra
  arriba una card ámbar: **"⭐ candidatos a pasar a mayorista"** → botón
  **"→ convertir"** → elegís tier A/B/C y listo.
- Si no, editá el cliente desde Kioscos y asignale tier (ver FAQ).

**¿Viene del Pipeline?** (🎯 Pipeline: Prospecto → Contactado → Visitado)
El botón **"✓ Convertir"** aparece cuando llega a "Visitado". OJO: el cliente
convertido queda **sin tier asignado** — entrá a Kioscos y asignáselo antes
del primer pedido, si no paga precio minorista.

**¿Por qué el mayorista es "un cliente más"?** Porque reusa toda la
inteligencia que ya existe (historial, recompra, segmentos). El sistema lo
distingue por tipo, no por estar en otra base.

---

## 3. Armar un pedido

**Dónde:** 🧾 Pedido mayorista.

1. Elegí el kiosco en **"Cliente mayorista"** (muestra su tier al lado).
2. Buscá productos en **"Buscar producto para agregar..."** — solo lista
   productos **con stock**, y te muestra el precio del tier de ese cliente.
3. Ajustá cantidades. El precio unitario es **editable** por si negociaste
   algo puntual. Cada línea muestra su margen con el mismo semáforo de colores.
4. (Opcional) **"Aplicar descuento por volumen"**: escalera 24u+ −3% ·
   60u+ −6% · 120u+ −10%, encima del precio de tier. Viene apagado; usalo
   solo si lo negociaste.
5. Mirá los totales (Unidades / Total / Margen / Ganancia) y tocá
   **"Registrar pedido"**.

**Qué hace el sistema al registrar:**
- ✅ **Descuenta el stock ya mismo** (queda "comprometido" — así no vendés
  dos veces lo mismo mientras el pedido espera reparto).
- ❌ **NO toca la caja.** El pedido nace "pendiente" y sin pagos. La plata
  entra recién cuando cobrás (sección 5). Esto es a propósito: refleja la
  realidad de "pagan al recibir".

**Atajo:** si el kiosco ya compró antes, aparece **"🔁 Repetir último
pedido"** — precarga las mismas cantidades pero con los **precios de tier de
hoy** (no copia precios viejos).

---

## 4. Crear y usar una ruta de reparto

**Dónde:** 🚚 Rutas → **"+ Nueva ruta"**.

1. Poné nombre (ej: "Martes zona norte") y fecha.
2. Tildá los pedidos a repartir — vienen **agrupados por zona** para que armes
   rutas geográficamente lógicas.
3. **"Crear ruta"**. Los pedidos elegidos pasan a "armado".
4. Al salir a repartir: **"▶ Iniciar"** (los pedidos pasan a "en ruta").
5. Ordená las paradas con **↑ / ↓** (el orden es manual, vos conocés la calle).
6. **"📋 Copiar hoja"** te copia la hoja de ruta en texto: paradas, dirección,
   qué dejar y cuánto cobrar en cada una. Pegala en WhatsApp o Notas.

En cada parada, según lo que pase:
- **"✓ Entregado"** — dejaste la mercadería (todavía no cobraste).
- **"💵 Cobrar"** — cobraste (ver sección 5, es EL botón importante).
- **"🚫 No estaba"** / **"↻ Reprogramar"** — para reintentarlo.

Al terminar el día: **"✓ Cerrar"** la ruta.

**Si borrás una ruta** no se pierde nada: los pedidos no entregados vuelven a
"pendiente" y podés meterlos en otra ruta.

---

## 5. Cobrar (acá entra la plata)

Hay **dos únicos botones en toda la app que meten plata en la caja** por
ventas mayoristas:

### A. Contra entrega (el caso normal): 🚚 Rutas → **"💵 Cobrar"**
1. En la parada, tocá **"💵 Cobrar"**. Muestra el pendiente del pedido.
2. Elegí **"Método / cuenta"** (Mercado Pago → elegí la cuenta MP, Lemon,
   USD Cash, USDT, Pesos Cash) y confirmá el monto (viene precargado).
3. **"Registrar cobro"**.

Eso registra un **pago real en el pedido** → la cuenta de caja elegida se
acredita sola (lo ves en 💰 Caja). Si cobraste todo, el pedido queda
"💵 Cobrado"; si fue parcial, queda "entregado" con saldo pendiente.

### B. Pagos posteriores / fiado: 💳 Cuentas corrientes → **"💵 Registrar pago"**
Para cuando un kiosco te paga días después o te junta varios pedidos. El
monto se reparte solo entre sus pedidos impagos, **de los más viejos a los
más nuevos**, y acredita la cuenta de caja que elijas. El botón **💬** te
copia un mensaje de cobranza armado para mandarle.

**¿Por qué "Entregado" no cobra?** Porque entregar y cobrar son dos hechos
distintos (a veces dejás mercadería y te pagan después). El estado logístico
nunca mueve plata; solo el cobro explícito con método y cuenta. Así la caja
siempre refleja plata que de verdad entró, y a qué cuenta.

---

## 6. Leer el Panel mayorista

**Dónde:** 📊 Panel mayorista. Selector **30d / 90d** arriba.

- **KPIs:** mayoristas activos, prospectos en pipeline, cuántos compraron en
  el período, ticket B2B promedio.
- **Facturación por canal:** cuánto es mayorista vs minorista (la foto del
  pivote: esta barra debería inclinarse hacia 🏪 con los meses).
- **P&L por canal:** facturación, costo, ganancia y margen de cada canal por
  separado. Acá ves si el precio mayorista deja margen sano (🟢 ≥30%).
- **"Unidades comprometidas":** stock que ya está descontado por pedidos aún
  no entregados — por eso puede no coincidir "lo que hay en el depósito" con
  el stock de la app.
- **🔔 Alertas:** kioscos que deberían haber recomprado (⏰), zonas con
  prospectos sin cerrar (⚡), prospectos estancados +14 días (🎯).
- **🏆 Top kioscos por ganancia (90d):** a quiénes cuidar.

**El hábito sugerido:** entrar una vez por semana, mirar las alertas ⏰ (kiosco
que no recompra = llamalo antes de que compre a otro) y el margen del P&L.

---

## 6bis. El front de ventas: conseguir kioscos nuevos

Dos herramientas para el momento ANTERIOR a que el kiosco compre — pensadas
para usar desde el celu, parado en el mostrador:

- **💬 Presentar** (en las cards de 🎯 Pipeline y de 🏪 Kioscos): arma el
  mensaje de primer contacto con 2-3 precios de gancho del tier que elijas.
  Editás el texto ahí mismo y lo copiás para WhatsApp.
- **🏷️ Lista de precios** (ítem propio del menú mayorista): la lista completa
  del tier elegido, agrupada por marca, con letra grande para MOSTRAR en
  mano. El botón "📋 Copiar para WhatsApp" genera la versión texto para
  mandar. **Ojo**: el tier se ve solo en TU pantalla — el texto copiado dice
  "Lista de precios" a secas (las listas se reenvían entre comercios) y
  lleva fecha + "sujetos a variación del dólar".

## 7. Cómo activar lo que está apagado

El pivote se construyó con el principio "estructura completa, activar lo
mínimo". Estas cosas existen y están listas, apagadas a propósito:

### Cuenta corriente (fiado) para un kiosco puntual
1. 🏪 Kioscos → tocá el kiosco → tildá **"💳 Habilitar cuenta corriente (fiado)"**.
2. Poné el **"Límite de crédito (ARS)"** → **"Guardar"**.
3. Desde ahí: el Pedido mayorista te muestra "debe / límite / disponible" al
   armar pedidos (avisa si se pasa, no bloquea), y 💳 Cuentas corrientes le
   sigue la deuda, la mora (+30 días) y el límite.

Todo lo demás (deuda, pagos parciales, mensaje de cobranza) ya funciona hoy
incluso sin activar esto — "contra entrega con saldo pendiente" también
aparece en Cuentas corrientes hasta que lo cobres.

### Mínimo de pedido por tier
El validador existe (bloquea el botón "Registrar pedido" si no se llega),
pero los mínimos están **en 0** — hoy no exige nada. Activarlo es un cambio
chico de configuración en el código: pedírselo a Claude ("activá mínimo de
X unidades / $X para tier C").

### Google Places (buscar kioscos automáticamente en el mapa)
Diferido a propósito. La prospección hoy es **manual** (🎯 Pipeline +
🗺️ Prospección por zona), que es gratis. Para activar Places haría falta una
**API key de Google (se paga por uso)** y cablear la búsqueda en la pantalla
de Prospección. Tiene sentido solo si la carga manual se vuelve un cuello de
botella.

### Optimización automática de rutas
Hoy el orden de paradas es manual (↑/↓), y está bien así con pocos kioscos.
El modelo de datos ya está preparado: el día que haya volumen, hace falta
cargar **lat/lng en los clientes** (el campo ya existe) y que Claude
implemente el ordenamiento por cercanía (la función ya existe como stub
documentado).

---

## 8. FAQ — dudas previsibles

### "Marqué cobrado y no veo la plata en Caja"
Casi seguro marcaste **"✓ Entregado"** (o el estado de la parada), que es
solo logístico. La plata entra únicamente con **"💵 Cobrar"** (en Rutas) o
**"💵 Registrar pago"** (en Cuentas corrientes), que te piden **método y
cuenta** — sin eso el sistema no sabe a qué cuenta acreditar. Fix: andá a
💳 Cuentas corrientes (el pedido va a figurar como pendiente) → "💵 Registrar
pago". La chequeada rápida: 💰 Caja → el movimiento tiene que aparecer en la
cuenta que elegiste.

### "¿Cómo convierto un cliente minorista en mayorista?"
- Si Kioscos te muestra la card ámbar **"⭐ candidatos"** → botón
  **"→ convertir"**, elegís tier, listo. Su historial se conserva.
- Si no aparece como candidato: es un cliente minorista común. Decile a
  Claude que lo pase a mayorista, o cargalo de nuevo desde **"+ Nuevo
  mayorista"** (perdés el historial unificado, así que mejor lo primero).
- Ojo con los convertidos desde el **Pipeline**: quedan sin tier — asignáselo
  en Kioscos.

### "¿Qué pasa si un mayorista no tiene tier asignado?"
No se rompe nada, pero **paga precio minorista** (el sistema cae al precio
base como resguardo — prefiere cobrarte de más antes que regalar margen).
El Pedido mayorista te lo avisa en rojo: *"⚠️ Este cliente no tiene tier
asignado"*. Fix: Kioscos → editar → "Tier mayorista" → Guardar.

### "La pantalla queda en blanco"
Ya pasó una vez (17/07/2026) y quedó un test que lo previene, pero si vuelve:
1. Probá recargar (en el iPhone: cerrá la pestaña/app y abrila de nuevo).
2. Si sigue, abrila en una computadora con Chrome → `Cmd+Option+J` (Mac) abre
   la **consola** → buscá el primer error en rojo.
3. Pasale a Claude el texto exacto. Si dice **"Rendered more hooks than
   during the previous render"** es el bug de hooks conocido (un hook
   declarado después de los returns de carga/login en App.jsx) — Claude sabe
   exactamente dónde mirar.
4. Dato: si ves "Algo salió mal" con botón "Reintentar" NO es este bug — eso
   es el ErrorBoundary atrapando el error de una pantalla puntual (mandá
   igual el error de consola).

### "¿El pedido descontó stock pero el kiosco canceló"
Borrá el pedido (o sacalo de la ruta y borralo desde Ventas): el stock
vuelve solo, con el mismo mecanismo simétrico de cualquier venta.

### "¿Puedo seguir vendiendo minorista?"
Sí, todo el circuito minorista quedó intacto (Ventas, venta rápida, deudas,
todo). El modo 🏪/🛒 solo cambia qué pantallas ves en el menú y dónde
arrancás — pasá a 🛒 y está todo como siempre. Los botones de venta rápida
(➕ flotante) están en ambos modos. El P&L del Panel te muestra los dos
canales por separado.

---

*Escrita 2026-07-17 (Tanda E). Si algo de esta guía no coincide con lo que ves
en pantalla, avisale a Claude — la guía se corrige junto con el código.*
