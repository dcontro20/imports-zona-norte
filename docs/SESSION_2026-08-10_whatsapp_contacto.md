# Sesión 2026-08-10 — Flujo de contacto por WhatsApp (F1–F5)

**Branch:** `feature/mensaje-primer-contacto` · dirigida por Gustavo con gate
por fase sobre un handoff cerrado ("Flujo de contacto por WhatsApp", 10 ago).
Resumen autocontenido: `docs/IZN_WhatsApp_Contacto_Resumen.md`.

## El problema

El 💬 Mandar por WhatsApp del modal de Presentación pasaba el teléfono en
formato local crudo (`01123631422`) → landing intermedia de WhatsApp sin
chat. Y peor: registraba `mensajeEnviadoAt` con solo ABRIR WhatsApp — el
sistema anotaba un contacto que quizás nunca ocurrió, en una casa donde la
etapa se deriva de hechos.

## Las fases y sus decisiones

- **F1 (`c88e1da`)** — `normalizarWhatsApp` + `buildWaUrl` puras. Decisión
  de Gustavo en el gate: **wa.me en mobile / web.whatsapp.com en desktop**
  (el handoff pedía siempre web; en mobile web.whatsapp.com no deep-linkea
  y Diego opera desde el celu).
- **F2 (`be3aa56`)** — el dry-run read-only contra la base real (credencial
  del worker de discovery, Admin SDK) encontró un **falso inválido**:
  `011 4415-8435` (Kiosco Pocho) — la regex posicional del 15 del handoff
  le comía el 15 interno del abonado. Gustavo eligió la opción B ampliada:
  **regla estructural** (15 solo en números de 12 dígitos, posición según
  el área; final = 10 dígitos con forma de área AR; lo indeterminable →
  null). Matriz de 28 formatos reales como contrato. Migración
  `migrarTelefonosWa` idempotente y re-derivante; **sin teléfono ≠
  inválido**. Resultado real: 45 prospectos → 24 válidos / 0 inválidos /
  21 sin teléfono.
- **F3 (`444895a`)** — el contrato: **abrir WhatsApp no registra contacto**.
  El modal abre el chat y pregunta al volver: 🟢 Sí (hecho + tieneWhatsApp
  true) · 🔴 No (nada) · 🚫 no está en WhatsApp (tieneWhatsApp false, sin
  contacto). Cerrar el modal en la pregunta = No. `marcarWhatsApp` es
  acción de DATO (prospectActions), no hecho de etapa (prospectHechos
  intacto). Un test viejo de Prospectos blindaba el contrato anterior
  (abrir = registrar): se actualizó al nuevo.
- **F4 (`1acc341`)** — filtro en la cola 💬: los 🚫 se pliegan por defecto
  (con línea de recuperación + badge), chips Todos / Con WhatsApp / Por
  verificar **solo cuando distinguen algo**. El conteo de la barra sigue
  siendo el de la etapa: el filtro es de vista.
- **F5** — este cierre (resumen + journal + CLAUDE.md + memoria).

## Gotchas para el futuro

- **iCloud desalojó un binario de node_modules a mitad de sesión** (Desktop
  está en iCloud Drive con "Optimizar almacenamiento"): la suite murió con
  `Cannot find module rolldown-binding.darwin-x64.node` y un placeholder
  `.icloud` en su lugar. Fix: reinstalar el paquete puntual (`npm install
  @rolldown/binding-darwin-x64@<ver> --no-save`). `brctl download` no anda
  sandboxeado y tampoco rematerializó. **Anotado como higiene, sin tocar**
  (decisión de Gustavo: no mezclar alcance). `~/.npm` root-owned obligó a
  `--cache "$TMPDIR/npm-cache"`.
- `vi.spyOn(window, "open")` devuelve el MISMO spy entre tests si no se
  restaura: `calls[0]` puede ser del test anterior. `afterEach(() => {
  cleanup(); vi.restoreAllMocks(); })`.
- Mockear `../../App.jsx` entero (solo `useResponsive`) hace los tests de
  componentes livianos: sin mock de firebase (UI.jsx también toma
  useResponsive de ahí y queda cubierto).
- La base se movió ENTRE dos lecturas del dry-run (36→31 activos):
  Diego/Gustavo trabajan los prospectos en vivo — cualquier corrida real
  debe ser idempotente y tolerar eso (la migración lo es).

## Estado final

1497/1498 tests verdes (falla conocida ajena de dailyPlan). Build OK.
Etapas, hechos y discovery intactos al byte.
