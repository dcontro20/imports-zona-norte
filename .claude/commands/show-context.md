---
description: Resumen rápido del contexto actual del proyecto — útil al iniciar una sesión
---

# /show-context — Orientación rápida

Cuando Diego (o vos) abrís una sesión nueva en este repo, corré este
comando para ponerte al día en <1 minuto. Ejecutá los checks en paralelo
y reportá en una sola tabla.

---

## Checks a ejecutar

Corré estos comandos en paralelo y reportá los resultados:

1. **Último journal**:
   ```bash
   ls -t docs/SESSION_*.md 2>/dev/null | head -1
   ```
   Si hay uno, abrí y leé el TL;DR y Decisiones clave.

2. **Commits recientes** (últimos 10):
   ```bash
   git log --oneline -10
   ```

3. **Estado de tests**:
   ```bash
   npm test -- --run 2>&1 | tail -3
   ```
   Reportá pass/fail + tiempo.

4. **Estado del build**:
   ```bash
   npm run build 2>&1 | tail -3
   ```
   Reportá OK + tiempo + bundle size.

5. **Git status**:
   ```bash
   git status --short && git log --oneline origin/main..HEAD 2>/dev/null
   ```
   Si hay cosas sin commitear o commits sin push, flag.

6. **Firestore backup reciente** (si existe dir):
   ```bash
   ls -t backups/ 2>/dev/null | head -3
   ```
   Reportá cuán reciente es el último backup.

7. **Memorias activas**:
   ```bash
   ls ~/.claude/projects/-Users-Diego-Desktop-imports-zona-norte/memory/ 2>/dev/null | wc -l
   ```
   Reportá count. Si Diego pregunta por alguna en particular, leés ese archivo.

---

## Formato de reporte

```
📋 CONTEXTO DE IZN ({fecha-hora})

📅 Último journal:  docs/SESSION_YYYY-MM-DD_slug.md (hace N días)
📝 Último commit:   {hash} {mensaje corto} (hace N horas)
✅ Tests:           N/N pasando (Xms)
🛠  Build:           OK en X s
🔄 Sync git:        {limpio / N sin commitear / N sin push}
💾 Último backup:   YYYY-MM-DD HHhMM (hace N días)
🧠 Memorias:        N archivos activos

Highlights del último journal:
- ...
- ...
- ...

Todo listo para trabajar.
```

---

## Si algo está "no OK"

- Tests fallando → sugerí correr el specifico que falla antes de hacer nada nuevo
- Build fallando → sugerí inspeccionar el error antes de cambiar código
- Commits sin push → sugerí `git push` si el usuario no aclaró por qué
- Backup desactualizado (>3 días) → flag + sugerí `launchctl kickstart -k gui/$(id -u)/com.izn.backup` o disparar workflow manual de GitHub Actions
