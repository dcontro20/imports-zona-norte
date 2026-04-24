#!/usr/bin/env node
// Auditoría de integridad GLOBAL del sistema.
// Corre contra el último backup local. Si falta backup, usar:
//   node scripts/backup.mjs && node scripts/audit-integrity.mjs
//
// Detecta referencias cruzadas rotas y huérfanos en TODAS las colecciones:
//   1. Ventas con items apuntando a producto inexistente
//   2. Ventas con clientId apuntando a cliente inexistente
//   3. Withdrawals con productId / linkedSaleId / linkedClientId / failedProductId huérfanos
//   4. CashMovements con saleId / linkedEntityId huérfanos (si aplica)
//   5. Clientes con balance que no concilia con su histórico de ventas

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
    console.error("❌ No hay backups. Corré: node scripts/backup.mjs");
    process.exit(1);
  }
  const path = join(BACKUP_DIR, files[0]);
  console.log(`📂 Usando backup: ${files[0]}\n`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function audit() {
  const data = loadLatestBackup();
  const products = data.products?.data || [];
  const clients = data.clients?.data || [];
  const sales = data.sales?.data || [];
  const withdrawals = data.withdrawals?.data || [];
  const cashMovements = data.cashMovements?.data || [];

  const productIds = new Set(products.map(p => p.id));
  const clientIds = new Set(clients.map(c => c.id));
  const saleIds = new Set(sales.map(s => s.id));
  const activeSaleIds = new Set(sales.filter(s => !s.isDeleted).map(s => s.id));

  let issues = 0;
  const report = (sev, msg, detail) => {
    issues++;
    const icon = sev === "ERROR" ? "❌" : sev === "WARN" ? "⚠️ " : "ℹ️ ";
    console.log(`${icon} [${sev}] ${msg}`);
    if (detail) console.log(`         ${detail}`);
  };

  console.log(`Totales: ${sales.length} ventas · ${withdrawals.length} mermas · ${clients.length} clientes · ${products.length} productos · ${cashMovements.length} movimientos\n`);

  // ============================================
  // 1. Ventas con items.productId huérfano
  // ============================================
  console.log("=== 1. VENTAS con productId inexistente ===");
  let orphanSaleItems = 0;
  sales.filter(s => !s.isDeleted).forEach(s => {
    (s.items || []).forEach(it => {
      if (it.productId && !productIds.has(it.productId)) {
        orphanSaleItems++;
        report("WARN", `Venta ${s.id}: item productId "${it.productId}" no existe`, `Cliente: ${s.clientName || "?"} · ${formatDate(s.date)}`);
      }
    });
  });
  if (orphanSaleItems === 0) console.log("✅ Todos los items de venta referencian productos existentes\n");
  else console.log(`Total: ${orphanSaleItems}\n`);

  // ============================================
  // 2. Ventas con clientId huérfano
  // ============================================
  console.log("=== 2. VENTAS con clientId inexistente ===");
  let orphanSaleClients = 0;
  sales.filter(s => !s.isDeleted && s.clientId).forEach(s => {
    if (!clientIds.has(s.clientId)) {
      orphanSaleClients++;
      report("WARN", `Venta ${s.id}: clientId "${s.clientId}" no existe`, `Cliente name: ${s.clientName || "?"}`);
    }
  });
  if (orphanSaleClients === 0) console.log("✅ Todas las ventas con clientId son válidas\n");

  // ============================================
  // 3. Withdrawals con refs rotas
  // ============================================
  console.log("=== 3. WITHDRAWALS con referencias rotas ===");
  let wOrphans = 0;
  withdrawals.filter(w => !w.isDeleted).forEach(w => {
    if (w.productId && !productIds.has(w.productId)) {
      wOrphans++;
      report("WARN", `Withdrawal ${w.id}: productId "${w.productId}" (reemplazo) no existe`, `${w.qty}x ${w.withdrawType}`);
    }
    if (w.failedProductId && !productIds.has(w.failedProductId)) {
      wOrphans++;
      report("ERROR", `Withdrawal ${w.id}: failedProductId "${w.failedProductId}" (fallido) no existe`, `${w.failureReason || "?"}`);
    }
    if (w.linkedSaleId && !saleIds.has(w.linkedSaleId)) {
      wOrphans++;
      report("WARN", `Withdrawal ${w.id}: linkedSaleId "${w.linkedSaleId}" no existe`, `Cliente: ${w.linkedSaleClient || "?"}`);
    } else if (w.linkedSaleId && !activeSaleIds.has(w.linkedSaleId)) {
      wOrphans++;
      report("WARN", `Withdrawal ${w.id}: linkedSaleId "${w.linkedSaleId}" apunta a venta eliminada`, `Cliente: ${w.linkedSaleClient || "?"}`);
    }
    if (w.linkedClientId && !clientIds.has(w.linkedClientId)) {
      wOrphans++;
      report("WARN", `Withdrawal ${w.id}: linkedClientId "${w.linkedClientId}" no existe`, `Name cached: ${w.linkedClientName || "?"}`);
    }
  });
  if (wOrphans === 0) console.log("✅ Todas las referencias de withdrawals son válidas\n");

  // ============================================
  // 4. CashMovements con saleId huérfano
  // ============================================
  console.log("=== 4. CASH MOVEMENTS con referencias rotas ===");
  let cmOrphans = 0;
  cashMovements.filter(m => !m.isDeleted).forEach(m => {
    if (m.saleId && !saleIds.has(m.saleId)) {
      cmOrphans++;
      report("WARN", `Movimiento ${m.id}: saleId "${m.saleId}" no existe`, `${m.type} · ${m.amount} ${m.currency}`);
    }
    if (m.linkedPurchaseId && !data.purchases?.data?.some(p => p.id === m.linkedPurchaseId)) {
      cmOrphans++;
      report("WARN", `Movimiento ${m.id}: linkedPurchaseId "${m.linkedPurchaseId}" no existe`, `${m.type}`);
    }
  });
  if (cmOrphans === 0) console.log("✅ Todos los movimientos de caja son válidos\n");

  // ============================================
  // 5. Clientes con balance incoherente
  //
  // Dos niveles de chequeo:
  //   5a. Balance != 0 sin ventas asociadas → balance manual puro, revisar
  //   5b. Balance actual no matchea el que se calcularía del histórico:
  //       expected = Σ (creditUsed + debtAmount*(clientOwes?-1:0) + changeAsCredit) de sus ventas
  //       + Σ (balanceHistory.type === "adjustment"/"payment"/"credit" montos explícitos)
  //
  // Tolerancia de $1 ARS para evitar falsos positivos por redondeo.
  // ============================================
  console.log("=== 5. CLIENTES con balance que no concilia ===");
  let balanceMismatches = 0;

  // Calcula el balance esperado desde balanceHistory (la fuente canónica de cambios
  // en balance del cliente: tanto ventas como ajustes manuales registran entries ahí)
  const calcExpectedFromHistory = (client) => {
    const history = client.balanceHistory || [];
    if (history.length === 0) return null; // no hay historial → no podemos verificar
    // La última entrada tiene balanceAfter, que debería matchear client.balance actual
    const last = history[history.length - 1];
    return typeof last.balanceAfter === "number" ? last.balanceAfter : null;
  };

  clients.forEach(c => {
    if (c.isDeleted) return;
    const balance = Number(c.balance || 0);
    if (balance === 0) return;
    // 5a: balance no-cero sin ventas asociadas (probablemente carga manual)
    const clientSales = sales.filter(s => !s.isDeleted && s.clientId === c.id);
    if (clientSales.length === 0) {
      balanceMismatches++;
      report("INFO", `Cliente ${c.name}: balance $${balance} pero sin ventas asociadas`, `Balance manual sin ventas`);
    }
    // 5b: si tiene balanceHistory, el balance actual debería matchear el último balanceAfter
    const expected = calcExpectedFromHistory(c);
    if (expected !== null && Math.abs(expected - balance) > 1) {
      balanceMismatches++;
      report("WARN", `Cliente ${c.name}: balance actual $${balance} vs esperado $${expected} (último balanceAfter del histórico)`,
        `Diferencia $${(balance - expected).toFixed(2)} — posible edición directa del balance saltando balanceHistory`);
    }
  });
  if (balanceMismatches === 0) console.log("✅ Balances de clientes coherentes con histórico\n");

  // ============================================
  // CIERRE
  // ============================================
  console.log("══════════════════════════════════════════");
  if (issues === 0) {
    console.log("✅ AUDITORÍA LIMPIA: sin inconsistencias detectadas");
  } else {
    console.log(`⚠️  ${issues} inconsistencia${issues > 1 ? "s" : ""} detectada${issues > 1 ? "s" : ""}`);
    console.log("\nSugerencias de cleanup:");
    console.log("  - Orphan productIds en sales: los items quedan como 'Producto eliminado' en UI, no crashean pero distorsionan COGS");
    console.log("  - Orphan linkedSaleId en withdrawals: rompe trazabilidad de garantías");
    console.log("  - Balances sin histórico: revisar manualmente si son cargas iniciales válidas");
  }
  console.log("══════════════════════════════════════════");
}

function formatDate(d) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("es-AR"); } catch { return String(d); }
}

audit();
