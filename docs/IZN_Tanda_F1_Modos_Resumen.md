# IZN — Tanda F.1: Modos como mundos separados · 2026-07-17

> Resumen autocontenido (regla permanente). Rediseño de UX pedido por Diego
> tras usar el sistema en producción: "reordenar no es separar".
> Journal: `docs/SESSION_2026-07-17_tanda_F1_modos.md`.

---

## TL;DR

El toggle 🏪/🛒 ahora **filtra** el menú en vez de reordenarlo: cada modo ve
solo sus pantallas + las compartidas (grupo aparte bajo un divisor), cada
modo arranca en su propio panel, y al cambiar de modo te redirige si estabas
en una pantalla del otro mundo. **Los datos siguen 100% conectados** — es
solo navegación. Deployado en `1967729`. **1023 tests verdes (+1).**

## Clasificación final (validada por Diego ítem por ítem)

| Grupo | Pantallas |
|---|---|
| 🏪 Mayorista (7) | Panel mayorista · Kioscos · Pedido mayorista · Pipeline · Prospección · Rutas · Cuentas corrientes |
| 🛒 Minorista (4) | Dashboard · Ventas · Clientes · Mensajes |
| 🔗 Compartidas (12) | Stock · Caja · Compras · Análisis · Gastos · Mermas · Precios · Historial · Cotizaciones · Exportar · Auditoría · Papelera |

Decisiones con porqué (Diego las aprobó explícitamente):
- **Dashboard → minorista-only**: su par B2B es el Panel mayorista; cada modo
  arranca en el suyo y no se unifican.
- **Compras → compartida** (Diego la había listado minorista y se corrigió):
  la importación abastece un stock único; repartiendo en modo mayorista no
  deberías cambiar de modo para reponer.
- **Mermas → compartida**: garantías/canjes vienen de ambos canales.
- **Precios → compartida**: el precio base es el fallback de los tiers.

## Comportamiento

- **Home por modo**: 🏪 → Panel mayorista · 🛒 → Dashboard. También al abrir
  la app (el estado inicial lee `businessMode` de settings).
- **Cambio de modo**: pantalla exclusiva del otro modo → redirect al home
  nuevo; compartida → te quedás; pantallas fuera del nav (legacy/deep-link)
  no se tocan.
- **Sin lockout**: `renderPage` renderiza cualquier pantalla — ⌘K, botones
  de alertas y deep-links del otro modo abren igual. La separación es del
  MENÚ, no de los datos.
- **FABs (venta/merma rápida) en ambos modos** (aprobado): la venta minorista
  residual pasa mientras repartís.
- **Mismo look**: cero acentos por modo; divisor con `#EFE5CE` (borderSoft).
  El nav mobile (mismo `<nav>`, off-canvas) hereda todo.

## Implementación (App.jsx)

- `orderNavByMode` → `navItemsForMode` (filtra Y agrupa: modo arriba,
  compartidas abajo — necesario porque en `NAV_ITEMS` estaban intercaladas).
- `MODE_HOME` + `pageAfterModeSwitch` (helper puro) + `useEffect` de
  redirect con `setPage` funcional.
- **Regla post-`4c02968` respetada**: todos los hooks nuevos están ANTES de
  los early returns de loading/login (verificado: últimos hooks en ~617/621,
  primer early return en ~664).

## Tests (1022 → 1023)

- Aserciones del smoke **scoped al `<nav>`** (`within`) para no chocar con
  textos del contenido.
- **Aserción inversa** (pedida por Diego): en modo mayorista, "Ventas" /
  "Dashboard" / "Mensajes" NO están en el menú — caza cualquier rotura del
  filtro.
- **Test nuevo de cambio de modo**: click en el toggle → nav minorista +
  desaparecen las mayoristas + siguen las compartidas + redirect al
  Dashboard (h1 presente).
- **Fix de infraestructura**: con `globals: false` vitest no auto-registra el
  cleanup de testing-library → los renders se acumulaban entre tests
  (queries duplicadas). `afterEach(cleanup)` explícito.

## Docs actualizadas en el mismo commit

`GUIA_MAYORISTA.md` (sección del toggle reescrita — decía "solo reordena, no
oculta nada" — y FAQ de venta minorista) + `CHECKLIST_PRIMER_USO.md` (paso 1).

## Estado

| | |
|---|---|
| Commit | `1967729` en `main`, deploy automático Vercel |
| Tests | **1023 verdes** (+1) · build OK · smoke 3× estable |
| Lógica de negocio | intacta (solo nav + página inicial) |
| Tanda F | F.1 ✅ · restantes F.2–F.6 esperan OK por ítem |
