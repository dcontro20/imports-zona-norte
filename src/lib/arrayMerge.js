// Diff + merge para arrays de items con `id`.
//
// CONTEXTO: el sync con Firestore guarda cada "tabla" (sales, products, etc.)
// como UN solo doc con un array JSON. Cuando el caller pasa "esta es mi nueva
// versión del array", necesitamos calcular el diff respecto a la versión local
// anterior y aplicarlo de forma atómica sobre la versión que tiene el server
// (que puede ser distinta si otra sesión escribió en paralelo).
//
// Esto resuelve concurrent edits: el merge respeta lo que escribió el otro y
// solo aplica TUS cambios encima.
//
// Trade-off conocido: si dos sesiones editan el MISMO item simultáneamente
// (mismo id), el último write gana (last-write-wins a nivel item).

/**
 * Calcula el diff entre `prev` y `next` (ambos arrays de items con `id`).
 * Devuelve { adds, updates, removeIds } describiendo cambios al pasar de prev a next.
 *
 * - adds:       items en `next` que no estaban en `prev` (por id)
 * - updates:    items con mismo id en ambos pero contenido distinto
 * - removeIds:  ids que estaban en `prev` y ya no están en `next`
 *
 * Comparación de contenido por JSON.stringify (estricto, suficiente para
 * objetos de datos planos sin funciones).
 */
export function diffArraysById(prev, next) {
  const prevArr = Array.isArray(prev) ? prev : [];
  const nextArr = Array.isArray(next) ? next : [];

  const prevById = new Map();
  for (const it of prevArr) {
    if (it && it.id != null) prevById.set(it.id, it);
  }
  const nextById = new Map();
  for (const it of nextArr) {
    if (it && it.id != null) nextById.set(it.id, it);
  }

  const adds = [];
  const updates = [];
  for (const [id, item] of nextById) {
    if (!prevById.has(id)) {
      adds.push(item);
    } else if (JSON.stringify(prevById.get(id)) !== JSON.stringify(item)) {
      updates.push(item);
    }
  }
  const removeIds = [];
  for (const id of prevById.keys()) {
    if (!nextById.has(id)) removeIds.push(id);
  }
  return { adds, updates, removeIds };
}

/**
 * Aplica un diff sobre `serverArr`. Devuelve el array resultante.
 * Preserva el orden de los items existentes en serverArr, agrega los nuevos
 * al final (donde estaban en next no es relevante para correctitud — el orden
 * se vuelve a calcular en cada render de los componentes).
 */
export function applyDiff(serverArr, diff) {
  const base = Array.isArray(serverArr) ? serverArr.slice() : [];
  const { adds = [], updates = [], removeIds = [] } = diff || {};
  const removeSet = new Set(removeIds);
  const updateById = new Map(updates.map(it => [it.id, it]));

  // 1) Construir el resultado base reemplazando updates y filtrando removes.
  const out = [];
  const seenIds = new Set();
  for (const it of base) {
    if (!it || it.id == null) { out.push(it); continue; }
    if (removeSet.has(it.id)) continue;
    if (updateById.has(it.id)) {
      out.push(updateById.get(it.id));
    } else {
      out.push(it);
    }
    seenIds.add(it.id);
  }
  // 2) Agregar adds que no estuvieran ya en server (puede ser que otra sesión
  //    los haya agregado primero — en ese caso, el del server gana al de adds
  //    para no duplicar; updates aplicará la versión más nueva del otro).
  for (const it of adds) {
    if (it && it.id != null && !seenIds.has(it.id)) out.push(it);
  }
  // 3) Updates de items que NO están en server (el otro los eliminó). Los
  //    re-agregamos para no perder el cambio del usuario actual.
  for (const it of updates) {
    if (!seenIds.has(it.id) && !removeSet.has(it.id)) out.push(it);
  }
  return out;
}

/** Helper de conveniencia: diff + apply en un paso. */
export function mergeIntoServer(prevLocal, nextLocal, serverArr) {
  return applyDiff(serverArr, diffArraysById(prevLocal, nextLocal));
}
