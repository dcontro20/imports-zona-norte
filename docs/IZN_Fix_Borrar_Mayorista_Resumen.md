# IZN — Parte 1: borrar/editar mayoristas (bug) · 2026-07-24

> Resumen autocontenido. Bug reportado por Diego: cargó un kiosco de prueba
> y no había forma de borrarlo.

## TL;DR

Kioscos quedó **sin borrar** desde Fase 1 (cero soft-deletes en el archivo) y
el editar existía pero escondido (tap en la card, sin affordance visible).
Arreglado con el patrón estándar del sistema. Deployado en `f0e2039`.

## Qué se agregó

- **Kioscos**: botón **🗑 Borrar** en el modal de edición (con confirm),
  soft-delete estándar (`isDeleted` + `deletedAt` + `deletedBy`) →
  **recuperable desde la Papelera** (los mayoristas son clients; la Papelera
  ya los listaba). MiniBtn **"✏️ Editar / borrar"** visible en cada card
  (el tap en la card también sigue abriendo la ficha).
- **Rutas**: le faltaba EDITAR — botón **✏️ Editar** (nombre/fecha) en el
  detalle. Borrar ya existía y libera los pedidos.
- **Pipeline**: verificado — los prospectos ya tenían ✏️/🗑 con el patrón
  correcto. (Los clientes del kanban se editan desde Kioscos, su ficha real.)

## Cómo borrás el kiosco de prueba

1. 🏪 Kioscos → botón **"✏️ Editar / borrar"** en la card (o tocá la card).
2. Abajo a la izquierda: **🗑 Borrar** → confirmar.
3. Si te arrepentís: 🗑️ Papelera → restaurar (30 días).

| | |
|---|---|
| Commit | `f0e2039` — deployado |
| Tests | 1030 verdes (sin cambios de lógica pura) |
