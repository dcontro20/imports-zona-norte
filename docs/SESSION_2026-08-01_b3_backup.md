# SESSION 2026-08-01 — Ciclo B3: red de seguridad de datos del CRM

Ciclo acotado aprobado por Gustavo tras cerrar los bloques Discovery Engine y
mini CRM (ambos en main y en producción): **cerrar completamente la estrategia
de respaldo del CRM** ahora que hay data de negocio real. B2 (Papelera)
explícitamente FUERA (recuperación operativa ≠ recuperación ante incidente —
ciclo propio después). Restricción: cero cambios funcionales al CRM/Discovery.
Branch: `feature/b3-backup`.

## F1 — Cobertura (backup Drive + export manual + restore)

`prospects`, `visits`, `routes` y `discoverySuppressed` entraron a:
- `COLLECTIONS` de `scripts/backup.mjs` (backup nocturno a Drive),
- `backupJSON` de `Export.jsx` (**crudas**, con soft-deleted: el backup es
  recuperación ante incidente, no una vista),
- `applyRestore` (con sus setters, pasados desde App).

**El invariante nuevo** (`src/lib/backupCoverage.test.js`, mismo patrón
fuente-contra-fuente que el test de B1): toda key de `DATA_KEYS` debe estar en
backup + export + restore, salvo exclusión explícita. **Cazó dos gaps al
primer disparo:**
1. **auditLog fuera del export/restore** (estaba solo en Drive). Se cubrió en
   este ciclo con fundamento: la Actividad de la Ficha del CRM se compone de
   auditLog — un restore sin él deja las Fichas sin historial.
2. **B3-H1**: `coupons`, `bundles`, `supplierProfiles/Aliases/Lists` fuera de
   TODO el respaldo desde que nacieron (era S16/proveedores — gap
   PRE-existente, fuera del alcance aprobado). Quedaron como exclusión
   EXPLÍCITA en el test: sacarlas de esa lista = cerrar el hueco. Decisión de
   Gustavo pendiente.

## F2 — Schemas

`ProspectSchema` / `VisitSchema` / `RouteSchema` / `DiscoverySuppressedSchema`
en `lib/schemas.js` (filosofía de la casa: soft + passthrough — los
descubiertos traen placeId/rating/clavesIdentidad y los schemas no los pelean)
+ cableados al `strictSchemas` de `backupValidator`.

## F3 — Simulacro con producción real (read-only, Admin SDK)

Script temporal (borrado tras la corrida) que parsea la lista REAL de
COLLECTIONS del cron, baja prod, empaqueta con packBackup, valida con
strictSchemas y hace round-trip de restauración:

- 17 colecciones · **13 prospectos reales 13/13 válidos** · **5 descartados
  5/5 válidos** · products 242/242 · sales 28/28 · clients 16/16.
- Checksum OK · round-trip idéntico en las 4 del CRM · visits/routes aún ∅
  en prod (coherente: nunca se usaron).

**Verificación operativa restante** (no bloquea): el próximo backup nocturno
real (LaunchAgent en la Mac de Diego) tiene que listar las colecciones nuevas
en su log (`/tmp/izn-backup.log`) y subir el conteo de registros del nombre
del archivo en Drive.

## Estado

1254 → **1268 tests** (+14). Suite completa verde entera. Build OK. Sin
cambios funcionales a CRM/Discovery (solo props nuevos hacia Export).
