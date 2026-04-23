#!/usr/bin/env node
// Auditoría de integridad del módulo Mermas (Withdrawals).
// Corre contra el último backup local. Si falta backup, usar:
//   node scripts/backup.mjs && node scripts/audit-withdrawals.mjs
//
// Detecta:
//   1. Withdrawals con productId inexistente (producto borrado del catálogo)
//   2. Withdrawals con linkedSaleId apuntando a venta inexistente o eliminada
//   3. Withdrawals con linkedClientId apuntando a cliente inexistente
//   4. Posibles duplicados en últimos 30 días (mismo productId+qty+person+type en 5min)
//   5. Withdrawals sin costRealUSD (datos viejos pre-migración)
//   6. Total de stock perdido por mes (qty + USD)
//   7. Reparto de consumo personal por socio

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BACKUP_DIR = join(PROJECT_ROOT, "backups");

function loadLatestBackup() {
  const files = readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith("IZN_Backup_") && f.endsWith(".json"))
    .sort()
    .reverse();
  if (!files.length) {
    console.error("❌ No hay backups en backups/. Corré: node scripts/backup.mjs");
    process.exit(1);
  }
  const path = join(BACKUP_DIR, files[0]);
  console.log(`📂 Usando backup: ${files[0]}\n`);
  return JSON.parse(readFileSync(path, "utf8"));
}

const wCost = (w) => Number(w.costRealUSD || w.costEstimateUSD) || 0;
const monthKey = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
};

function audit() {
  const data = loadLatestBackup();
  const allW = data.withdrawals?.data || [];
  const activeW = allW.filter(w => !w.isDeleted);
  const sales = data.sales?.data || [];
  const clients = data.clients?.data || [];
  const products = data.products?.data || [];

  const productIds = new Set(products.map(p => p.id));
  const activeSaleIds = new Set(sales.filter(s => !s.isDeleted).map(s => s.id));
  const allSaleIds = new Set(sales.map(s => s.id));
  const activeClientIds = new Set(clients.map(c => c.id));

  let issues = 0;
  const report = (severity, msg, detail) => {
    issues++;
    const icon = severity === "ERROR" ? "❌" : severity === "WARN" ? "⚠️ " : "ℹ️ ";
    console.log(`${icon} [${severity}] ${msg}`);
    if (detail) console.log(`         ${detail}`);
  };

  console.log(`Total withdrawals: ${allW.length} (${activeW.length} activos, ${allW.length - activeW.length} eliminados)\n`);

  // ============================================
  // 1. productId inexistente
  // ============================================
  console.log("=== 1. PRODUCTOS INEXISTENTES (producto borrado del catálogo) ===");
  let missingProducts = 0;
  activeW.forEach(w => {
    if (!productIds.has(w.productId)) {
      missingProducts++;
      report("WARN", `Withdrawal ${w.id}: productId "${w.productId}" no existe`, `${w.qty}x ${w.withdrawType} · ${w.person}`);
    }
  });
  if (missingProducts === 0) console.log("✅ Todos los withdrawals referencian productos existentes\n");
  else console.log(`Total: ${missingProducts}\n`);

  // ============================================
  // 2. linkedSaleId apuntando a venta inexistente o eliminada
  // ============================================
  console.log("=== 2. VINCULOS A VENTAS rotos (Garantías huérfanas) ===");
  let missingSales = 0, deletedSales = 0;
  activeW.forEach(w => {
    if (!w.linkedSaleId) return;
    if (!allSaleIds.has(w.linkedSaleId)) {
      missingSales++;
      report("WARN", `Withdrawal ${w.id} (Garantía): venta ${w.linkedSaleId} no existe`, `Cliente: ${w.linkedSaleClient || "?"}`);
    } else if (!activeSaleIds.has(w.linkedSaleId)) {
      deletedSales++;
      report("WARN", `Withdrawal ${w.id} (Garantía): venta ${w.linkedSaleId} fue eliminada`, `Cliente: ${w.linkedSaleClient || "?"}`);
    }
  });
  if (missingSales + deletedSales === 0) console.log("✅ Todas las garantías vinculan ventas activas\n");

  // ============================================
  // 3. linkedClientId apuntando a cliente inexistente
  // ============================================
  console.log("=== 3. VINCULOS A CLIENTES rotos ===");
  let missingClients = 0;
  activeW.forEach(w => {
    if (!w.linkedClientId) return;
    if (!activeClientIds.has(w.linkedClientId)) {
      missingClients++;
      report("WARN", `Withdrawal ${w.id}: cliente ${w.linkedClientId} no existe`, `Tipo: ${w.withdrawType} · ${w.linkedClientName || "?"}`);
    }
  });
  if (missingClients === 0) console.log("✅ Todos los vínculos a clientes son válidos\n");

  // ============================================
  // 4. Duplicados en 30 días
  // ============================================
  console.log("=== 4. POSIBLES DUPLICADOS en últimos 30 días (mismo product+qty+person+type en 5min) ===");
  const thirtyAgo = Date.now() - 30 * 86400000;
  const recentW = activeW.filter(w => {
    const t = new Date(w.createdAtMs || w.date).getTime();
    return t >= thirtyAgo;
  });
  let dupCount = 0;
  for (let i = 0; i < recentW.length; i++) {
    for (let j = i + 1; j < recentW.length; j++) {
      const a = recentW[i], b = recentW[j];
      if (a.productId !== b.productId) continue;
      if (Number(a.qty) !== Number(b.qty)) continue;
      if (a.person !== b.person) continue;
      if (a.withdrawType !== b.withdrawType) continue;
      const ta = new Date(a.createdAtMs || a.date).getTime();
      const tb = new Date(b.createdAtMs || b.date).getTime();
      if (Math.abs(ta - tb) <= 5 * 60 * 1000) {
        dupCount++;
        const prod = products.find(p => p.id === a.productId);
        const pname = prod ? `${prod.brand} ${prod.model}` : a.productId;
        report("ERROR", `Duplicado posible: ${a.id} ↔ ${b.id}`, `${a.qty}x ${pname} · ${a.withdrawType} · ${a.person}`);
      }
    }
  }
  if (dupCount === 0) console.log("✅ Sin duplicados detectados en últimos 30 días\n");

  // ============================================
  // 5. Sin costRealUSD (datos pre-migración)
  // ============================================
  console.log("=== 5. WITHDRAWALS sin costRealUSD (datos viejos, OK por compat pero noto) ===");
  const noCostReal = activeW.filter(w => !w.costRealUSD && w.costEstimateUSD);
  if (noCostReal.length === 0) console.log("✅ Todos los withdrawals tienen costRealUSD\n");
  else {
    console.log(`ℹ️  ${noCostReal.length} withdrawals usando costEstimateUSD (legacy). El sistema los lee con fallback graceful.\n`);
  }

  // ============================================
  // 6. Stock perdido por mes
  // ============================================
  console.log("=== 6. STOCK PERDIDO POR MES (últimos 6 meses) ===");
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const target = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const k = monthKey(target);
    const wMes = activeW.filter(w => monthKey(w.date) === k);
    const qty = wMes.reduce((s, w) => s + (w.qty || 0), 0);
    const usd = wMes.reduce((s, w) => s + wCost(w), 0);
    const label = target.toLocaleDateString("es-AR", { month: "short", year: "numeric" });
    if (qty > 0) console.log(`  ${label.padEnd(16)} ${String(qty).padStart(4)} uds  $${usd.toFixed(2).padStart(8)} USD`);
    else         console.log(`  ${label.padEnd(16)}    0 uds`);
  }
  console.log();

  // ============================================
  // 7. Reparto consumo personal por socio
  // ============================================
  console.log("=== 7. CONSUMO PERSONAL ACUMULADO por socio ===");
  ["Diego", "Gustavo"].forEach(person => {
    const wPers = activeW.filter(w => w.person === person && w.withdrawType === "Consumo propio");
    const qty = wPers.reduce((s, w) => s + (w.qty || 0), 0);
    const usd = wPers.reduce((s, w) => s + wCost(w), 0);
    console.log(`  ${person.padEnd(8)} ${String(qty).padStart(4)} uds consumidas  · $${usd.toFixed(2)} USD`);
  });
  console.log();

  // ============================================
  // CIERRE
  // ============================================
  console.log("══════════════════════════════════════════");
  if (issues === 0) {
    console.log("✅ AUDITORÍA LIMPIA: sin problemas detectados");
  } else {
    console.log(`⚠️  ${issues} problema${issues > 1 ? "s" : ""} detectado${issues > 1 ? "s" : ""}`);
  }
  console.log("══════════════════════════════════════════");
}

audit();
