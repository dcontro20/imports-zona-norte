# IZN · Flujo de contacto por WhatsApp — Resumen autocontenido

**Fecha:** 2026-08-10 · **Branch:** `feature/mensaje-primer-contacto`
**Commits del bloque:** `c88e1da` (F1) · `be3aa56` (F2) · `444895a` (F3) · `1acc341` (F4) · F5 (docs)
**Handoff de origen:** "Flujo de contacto por WhatsApp" (10 ago 2026), ejecutado por fases con gate.

---

## Qué se construyó

El botón **💬 Mandar por WhatsApp** del modal de Presentación (Prospectos)
estaba roto dos veces: mandaba el teléfono en formato local crudo
(`01123631422` → landing muerta de WhatsApp) y registraba el contacto con
solo ABRIR WhatsApp, sin saber si el mensaje salió. El bloque arregla ambas
cosas y agrega el dato `tieneWhatsApp` que se construye con el uso.

### El contrato (cerrado en el gate F3 — no reabrir)

> **Abrir WhatsApp NO registra contacto.** El flujo es:
> Mandar por WhatsApp → se abre el chat con el mensaje cargado, a un Enter →
> Gustavo lo manda (o no) → vuelve al CRM → el modal pregunta **"¿Enviaste el
> mensaje?"**:
> - 🟢 **Sí, mensaje enviado** → registra `mensajeEnviadoAt` (la etapa deriva
>   sola a ⏳ Esperando respuesta) + marca `tieneWhatsApp: true`.
> - 🔴 **No, no lo envié** → no registra NADA; queda en 💬 Para contactar.
> - 🚫 **El número no está en WhatsApp** → `tieneWhatsApp: false`, sin
>   registrar contacto.
> Cerrar el modal en la pregunta = "No". El sistema jamás infiere.

Límite no negociable: WhatsApp no permite disparar el envío desde una URL —
el Enter final siempre lo da una persona. Cloud API descartada para
prospección en frío (quema el número); queda para clientes con opt-in.

## Las piezas

- **`src/lib/whatsappPhone.js`** — `normalizarWhatsApp(raw)` → `"549..."` o
  `null`, y `buildWaUrl(tel, texto, {isMobile})` → **wa.me en mobile**
  (deep-link a la app) / **web.whatsapp.com en desktop** (WhatsApp Web sin
  landing). Puras, cero imports del proyecto.
- **Regla estructural del 15** (decisión del gate F2, reemplaza la regex
  posicional del handoff): el 15 se elimina **solo** cuando el número tiene
  12 dígitos (área + 15 + abonado — el único caso donde el 15 es prefijo);
  dentro de los 12, el área manda dónde puede estar (área `11` → posición 2;
  áreas `2xx/3xx` de 3–4 dígitos → posición 3 o 4). Validación final: 10
  dígitos con forma de área AR (`11` | `2xx/3xx`). Lo indeterminable → null,
  nunca un link a otro número. **Motivo:** la regex del handoff marcaba
  inválido un número real de la base (`011 4415-8435`, Kiosco Pocho — el 15
  interno del abonado). La matriz de 28 formatos reales es el contrato en
  tests.
- **`src/lib/whatsappMigration.js`** — `migrarTelefonosWa` estampa
  `telefonoWa` / `telefonoInvalido` en los prospectos: idempotente,
  **re-derivante** (phone editado se corrige en la próxima carga), corre al
  arranque (patrón `wholesaleMigration`) y los descubiertos de la
  auto-ingesta entran ya estampados (nivel App.jsx — dominio discovery
  intacto). **Sin teléfono ≠ inválido**: es otra cola (🚶 visitar).
  `derivarTelefonoWa` se exporta para que el modal derive EN VIVO (el link
  no miente si el phone se editó en la sesión; el persistido manda en
  listas/filtros).
- **`PresentationMessageModal.jsx`** — el flujo del contrato. Teléfono
  inválido o ausente ⇒ sin botón de WhatsApp (quedan copiar + confirmación
  manual). "Ya lo mandé" tras copiar registra el hecho pero NO toca
  `tieneWhatsApp` (pudo ir por IG). Kioscos usa el mismo modal sin
  `onEnviado`: sin cambios de comportamiento.
- **`prospectActions.marcarWhatsApp(p, bool)`** — `tieneWhatsApp` es un
  **dato** del prospecto, no un hecho de etapa: no mueve colas, vive en
  las acciones y no en `prospectHechos.js`. La derivación de etapas quedó
  intacta al byte.
- **Filtro en la cola 💬** (`ColasProspectos.jsx`) — los 🚫 confirmados se
  **ocultan por defecto** (siguen existiendo: Embudo, Ficha, llamar,
  visitar); una línea discreta los recupera con badge. Chips **Todos /
  ✓ Con WhatsApp / Por verificar**, que solo se renderizan cuando
  distinguen algo — mientras toda la cola es "por verificar" no hay chips
  (criterio: el sistema nunca se vuelve ruidoso). El conteo de la barra
  sigue siendo el de la ETAPA: el filtro es de vista.

## La base real (dry-run read-only del 10/08)

45 prospectos → **24 válidos · 0 inválidos · 21 sin teléfono**. El único
"inválido" de la primera corrida era el falso positivo de Pocho, resuelto
por la regla estructural. Los 21 sin teléfono son fichas de Maps sin número
publicado (consistente con el ~45% de cobertura conocido).

## Tests y build

**1497 verdes / 1498** (+59 del bloque: 36 whatsappPhone + 10 migración +
8 modal + 2 acciones + 3 filtro; 1 test de Prospectos actualizado al
contrato nuevo — blindaba el viejo "abrir = registrar"). La única falla es
la conocida y AJENA de `dailyPlan.test.js > weekKey` (pre-existente al
bloque). Build OK.

## Fuera de alcance (decidido — no reabrir)

- Envío automático sin intervención humana (imposible por URL).
- Cloud API / plantillas para prospección en frío (riesgo de bloqueo).
- Coexistence / QR de "Plataforma para empresas".
- Consulta previa de "¿tiene WhatsApp?" (no existe forma legítima sin la
  API; el dato se construye con el uso).

## Pendientes anotados (no resueltos a propósito)

- **Higiene iCloud (nuevo, 10/08):** `node_modules` vive bajo Desktop
  (iCloud Drive con "Optimizar almacenamiento") y macOS desalojó el binario
  nativo de rolldown a mitad de sesión (placeholder `.icloud`). Se
  reinstaló el paquete puntual y la suite volvió. Puede repetirse con
  cualquier binario: excluir `node_modules` de iCloud o mover el repo.
  Además `~/.npm` sigue root-owned (pendiente ya conocido — obligó a cache
  alternativo).
- Heredados sin cambios: LaunchAgent del worker de discovery (credencial
  aún en `~/Downloads`), validación operativa B3.
