---
description: Persiste el contexto de la sesión actual (journal + CLAUDE.md + memorias + commit)
---

# /persist-session — Persistir contexto antes de cerrar/comprimir

**Objetivo:** capturar TODO lo trabajado y decidido en la sesión actual para
que ningún detalle se pierda cuando la conversación se comprima o termine.
Ejecutá este protocolo de 4 pasos en orden, sin preguntar confirmación
(Diego ya dio consent al invocar el comando).

---

## Paso 0 — Decidir si vale la pena

Corré `git log --oneline --since="$(date -v-7d +%Y-%m-%d 2>/dev/null || date -d '7 days ago' +%Y-%m-%d)"` y contá commits nuevos desde el último `docs/SESSION_*.md`.

**Criterios:**
- **Crear journal** si hubo ≥3 commits nuevos **O** pasó alguna de estas:
  - Rediseño completo de un componente / sección nueva
  - Decisión arquitectónica (nueva dependencia, cambio de stack, nuevo sistema)
  - Cambio de preferencia explícito de Diego ("de ahora en más hacé X")
  - Fix de bug importante con un patrón aplicable a futuro
  - Nuevo módulo / página / feature significativa
- **Saltear journal** si fueron 1-2 commits triviales (typos, bump de versión,
  fix chiquito aislado). En ese caso reportá "sesión menor — no creo journal,
  los commits hablan solos" y terminá.

Si saltás, igual ejecutá el Paso 3 (memorias) por si salió algo nuevo, y
terminá sin commit extra.

---

## Paso 1 — Crear `docs/SESSION_YYYY-MM-DD_{slug}.md`

**Nombre del archivo:**
- Fecha de hoy en formato ISO
- `{slug}` = 2-4 palabras kebab-case que resuman el tema (ej: `big_push`,
  `fix_auth_rules`, `rediseño_clients`). Si la sesión abarcó varios días,
  usá `_to_YYYY-MM-DD_` en el medio: `SESSION_2026-04-23_to_24_big_push.md`.

**Template a seguir** (basado en `docs/SESSION_2026-04-23_to_24_big_push.md`):

```markdown
# SESSION YYYY-MM-DD — {título humano corto}

## TL;DR

2-4 líneas con lo más importante de la sesión + métricas clave si aplica
(items cerrados, tests agregados, líneas removidas, etc).

## Cómo llegamos acá

Narrativa corta: qué pidió Diego al arrancar, qué bloque(s) ejecutamos,
y en qué orden. 1-2 párrafos.

## Items cerrados / commits

Lista agrupada por bloque o por feature:
- **[ID o feat name]**: qué hace + por qué + archivo(s) tocados

## Decisiones clave (para Claudes futuros)

Las que NO se ven en el diff. Ejemplos:
- Por qué elegimos X sobre Y
- Qué descartamos y por qué
- Trade-offs conscientes
- Cosas que un refactor futuro NO debería revertir sin leer esto

## Patrón de trabajo (si hubo uno nuevo)

Si Diego expresó una nueva preferencia de colaboración, documentala acá
Y en una memoria auto (ver Paso 3).

## Estado final

Map de módulos si cambió. Líneas por archivo. Tests pasando. Build OK.

---

*Escrito YYYY-MM-DD al cerrar la sesión de {tema}.*
```

Usá `git log` para reconstruir qué commits hubo. Usá el contexto de la
conversación actual para el POR QUÉ de cada uno.

---

## Paso 2 — Actualizar `CLAUDE.md`

Abrí `CLAUDE.md` y buscá la sección "## Estado del proyecto al ...".

**Si la sesión introdujo cambios significativos** (feature nueva grande,
refactor arquitectónico, nueva convención):
- Actualizá la fecha en el header de la sección
- Agregá un sub-bloque arriba del existente con los highlights de hoy
- Apuntá al nuevo journal con el link relativo

**Si no** (sesión importante pero sin cambios arquitectónicos):
- Solo agregá una línea al final mencionando el nuevo journal

Ejemplo:

```markdown
## Estado del proyecto al 2026-04-24

### 🏁 Big push 23-24 abril (docs/SESSION_2026-04-23_to_24_big_push.md)

42 items cerrados, 33 commits, 75 tests, CashBox -45%, PWA offline.
...
```

---

## Paso 3 — Actualizar memorias

Path: `~/.claude/projects/-Users-Diego-Desktop-imports-zona-norte/memory/`

**Crear memoria nueva** si apareció en la sesión:
- Una preferencia explícita de Diego que antes no estaba documentada
- Un patrón de decisión que un Claude futuro debería conocer
- Un path / recurso externo que vale la pena recordar
- Un "gotcha" que costó descubrir

**Actualizar memoria existente** si:
- Cambió algo que ya estaba documentado (ej: nueva memoria sobre arquitectura
  porque refactorizamos)
- La memoria está parcialmente desactualizada

**Formato de archivo** (ver memorias existentes como referencia):

```markdown
---
name: {título corto}
description: {1 línea — usado para matchear relevancia en sesiones futuras}
type: {user | feedback | project | reference}
---

{contenido de la memoria con Why: y How to apply: si es feedback/project}
```

**Actualizar MEMORY.md** con el pointer a cada memoria nueva/cambiada.
Formato: `- [Título](archivo.md) — one-liner hook`. El archivo tiene
<200 líneas — mantenelo conciso.

**NO crear memorias de:**
- Patrones derivables del código actual (lo lee el Claude directo)
- Historia de git / quién cambió qué (usa `git log` / `git blame`)
- Solución de un bug puntual (está en el commit)

---

## Paso 4 — Commit + push

```bash
git add docs/SESSION_*.md CLAUDE.md
# Las memorias viven fuera del repo (~/.claude/...) — NO van al commit.

git commit -m "docs: persistir sesión YYYY-MM-DD — {tema corto}

{2-3 líneas de resumen}
{mencionar highlights del journal}

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push
```

El hook post-commit maneja el push automático si está configurado; si no,
push explícito.

---

## Al terminar

Reportá a Diego con una tabla corta:

| Qué | Estado |
|---|---|
| Journal creado | `docs/SESSION_YYYY-MM-DD_slug.md` (N líneas) |
| CLAUDE.md | actualizado / sin cambios |
| Memorias nuevas | N creadas + N actualizadas |
| Commit + push | hash corto ✓ |

Y una frase de cierre: "Contexto de esta sesión persistido. Cualquier Claude
futuro puede leer el journal o las memorias y ponerse al día rápido."
