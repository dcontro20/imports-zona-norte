---
name: imports-zona-norte-conventions
description: Convenciones de desarrollo para Imports Zona Norte. React 18 + Vite + Firebase + CSS-in-JS inline.
---

# Imports Zona Norte — Convenciones de Desarrollo

## Stack
- **Frontend**: React 18 + Vite 5
- **Base de datos**: Firebase Cloud Firestore (real-time sync)
- **Testing**: Vitest
- **Estilo**: CSS-in-JS inline (objetos de estilo, sin framework CSS)
- **Deploy**: Vercel (auto desde push a main)

## Idioma
- Todo en español: labels, comentarios, variables de negocio
- Nombres de componentes y funciones en inglés (React convention)

## Colores del tema (claro)
- Fondo: `#e5e7eb`, Cards: `#fff`, Borde: `#e2e4e9`
- Texto: `#1a1a2e` (principal), `#4b5563` (secundario), `#6b7280` (terciario), `#9ca3af` (muted)
- Violeta: `#6366f1` (acento principal)
- Verde: `#059669` / `#10b981` (éxito, ingresos)
- Rojo: `#dc2626` / `#e74c3c` (error, egresos)
- Amarillo: `#fdcb6e` / `#f59e0b` (warning)
- Naranja: `#ea580c` / `#e17055` (vuelto, merma)

## Componentes UI (UI.jsx)
Siempre usar: `Card`, `Btn`, `Badge`, `StatCard`, `Modal`, `Input`, `Select`, `Table`, `SearchBar`
- No crear componentes UI nuevos — extender los existentes
- Modal se abre con prop `open={true}`, cierra con `onClose`
- Table soporta `mobileColumns` para elegir qué mostrar en mobile

## Patterns de código
- `useResponsive()` hook para mobile/tablet/desktop breakpoints
- `chipStyle(active, color)` para botones de selección tipo chip
- Cascading picker: Marca → Modelo → Sabor (chips, no selects)
- `formatMoney(amount, currency)` para moneda
- `formatDate(date)` para fechas (maneja date-only UTC fix)
- `uid()` para generar IDs
- Validación inline (no usar `alert()` nunca)

## State management
- `useFirebaseSync.js`: hook que maneja los 13 estados + sync Firebase
- `AppContext.js`: Context con `currentUser`, `exchangeRate`, `logAudit`, `logStock`
- Props para data, Context para utilidades compartidas
- `calcs.js`: funciones puras de cálculo (testeadas con vitest)
- `smartSave`: único punto de escritura a Firestore (anti-loop)

## Soft delete
- Todos los registros usan `isDeleted: true` + `deletedAt` + `deletedBy`
- Filtrar con `active*` memos en App.jsx antes de pasar como props
- Papelera (Trash.jsx) permite restaurar

## Commits
- Formato: `tipo: descripción en español`
- Tipos: `feat`, `fix`, `refactor`, `docs`, `perf`
- Co-Author: `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
- Post-commit hook pushea automáticamente a main
- Commitear cada cambio inmediatamente sin esperar instrucción

## Testing
- `npm test` (vitest) — 23 tests de cálculos financieros en calcs.test.js
- `npm run build` obligatorio antes de commitear
- No hay tests de componentes React (solo funciones puras)
