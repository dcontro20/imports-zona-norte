import { useState, useMemo, useCallback } from "react";
import { uid } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { ProcessTab } from "./supplier/ProcessTab.jsx";
import { CompareTab } from "./supplier/CompareTab.jsx";
import { ProfilesTab } from "./supplier/ProfilesTab.jsx";
import { activeProfiles } from "../lib/supplierProfiles.js";

// SupplierMonitor — módulo principal de gestión de proveedores.
//
// 3 tabs:
//   📋 Procesar — cargar lista, matchear, decidir, exportar (con APRENDIZAJE)
//   🔀 Comparar — pegar 2+ listas, ver matriz comparativa + split óptimo
//   🏭 Proveedores — gestión de perfiles (CRUD)
//
// Memoria en Firestore:
//   - supplierProfiles: perfiles con defaults
//   - supplierAliases: diccionario aprendido raw→productId
//   - supplierLists: historial de listas procesadas
export const SupplierMonitor = ({
  products, setProducts,
  purchases, setPurchases,
  sales = [],
  exchangeRate,
  currentUser,
  logAudit,
  supplierProfiles = [],
  setSupplierProfiles,
  supplierAliases = [],
  setSupplierAliases,
  supplierLists = [],
  setSupplierLists,
}) => {
  const { isMobile } = useResponsive();
  const [tab, setTab] = useState("process");
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, color = "#0F7B6C") => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 4500);
  }, []);

  const profileCount = useMemo(() => activeProfiles(supplierProfiles).length, [supplierProfiles]);

  // ----- Acción común: crear N pedidos desde el split óptimo de la tab Comparar -----
  const createPurchasesFromSplit = useCallback((split, loadedLists) => {
    const supplierIds = Object.entries(split.bySupplier)
      .filter(([, v]) => v.itemCount > 0)
      .map(([id]) => id);
    if (supplierIds.length === 0) return;

    const proceed = confirm(
      `Crear ${supplierIds.length} pedidos en estado "Pedido"?\n\n` +
      `Costo total óptimo: USD ${split.totalCost.toFixed(2)}\n` +
      `Ahorro vs peor: USD ${split.savingsVsWorst.toFixed(2)}`
    );
    if (!proceed) return;

    const created = [];
    supplierIds.forEach(supId => {
      const supplier = supplierProfiles.find(p => p.id === supId);
      const allocations = split.allocations[supId] || [];
      if (allocations.length === 0) return;

      const groupsMap = {};
      const items = [];
      allocations.forEach(a => {
        const prod = products.find(p => p.id === a.productId);
        if (!prod) return;
        const key = `${prod.brand}|||${prod.model}|||${prod.puffs}`;
        if (!groupsMap[key]) {
          groupsMap[key] = {
            brand: prod.brand, model: prod.model, puffs: prod.puffs,
            modelKey: key, unitCostUSDT: a.priceUSD,
            flavors: [],
          };
        }
        groupsMap[key].flavors.push({
          name: prod.flavor, qty: a.qty, productId: prod.id, isNew: false,
        });
        items.push({ productId: prod.id, qty: a.qty, unitCostUSDT: a.priceUSD });
      });
      const productsUSDT = items.reduce((s, i) => s + i.qty * Number(i.unitCostUSDT || 0), 0);
      const commPct = supplier?.defaultSupplierCommPercent || 0;
      const paseroPct = supplier?.defaultPaseroPercent || 0;
      const envioARS = supplier?.defaultEnvioCostARS || 0;
      const supplierCommUSDT = Math.round(productsUSDT * (commPct / 100) * 100) / 100;
      const totalUSDTwithComm = productsUSDT + supplierCommUSDT;
      const paseroARS = Math.round(totalUSDTwithComm * (exchangeRate || 1) * (paseroPct / 100));
      const totalCostARS = Math.round(totalUSDTwithComm * (exchangeRate || 1)) + paseroARS + envioARS;

      const totalItems = allocations.reduce((s, a) => s + a.qty, 0);
      const purchaseId = uid();
      created.push({
        id: purchaseId,
        supplier: supplier?.name || "?",
        loteNumber: "",
        date: new Date().toISOString().slice(0, 10),
        status: "pedido",
        groups: Object.values(groupsMap),
        items,
        totalItems,
        totalUSDT: productsUSDT,
        supplierCommPercent: commPct,
        supplierCommUSDT,
        totalUSDTpaid: totalUSDTwithComm,
        paseroPercent: paseroPct,
        paseroCostARS: paseroARS,
        envioCostARS: envioARS,
        totalCostARS,
        notes: "Generado desde Monitor — Split óptimo multi-proveedor",
        statusHistory: [{
          status: "pedido",
          timestamp: new Date().toISOString(),
          note: `Pedido óptimo (split entre ${supplierIds.length} proveedores)`,
          user: currentUser?.name || "?",
        }],
        createdBy: currentUser?.name || "",
      });
    });

    setPurchases(prev => [...created, ...prev]);
    if (logAudit) logAudit("create", "purchase", null, `${created.length} pedidos creados desde Comparar — ahorro USD ${split.savingsVsWorst.toFixed(0)}`);
    showToast(`✅ ${created.length} pedidos creados — Mirá en Compras`);
  }, [supplierProfiles, products, exchangeRate, currentUser, setPurchases, logAudit, showToast]);

  return (
    <div style={{ padding: isMobile ? "12px" : "20px", maxWidth: 1280, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, color: "#37352F", margin: 0, letterSpacing: "-0.5px" }}>
          📋 Monitor de Proveedores
        </h1>
        <p style={{ color: "#8C8A82", fontSize: 13, margin: "6px 0 0" }}>
          Gestión inteligente: aprende de cada lista, compara entre proveedores y arma pedidos en segundos.
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 70, right: 16, zIndex: 200,
          padding: "10px 16px", borderRadius: 10,
          background: "#FFFFFF", border: `1px solid ${toast.color}`,
          color: toast.color, fontSize: 13, fontWeight: 600,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          maxWidth: isMobile ? "calc(100vw - 32px)" : 400,
        }}>{toast.msg}</div>
      )}

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 6, marginBottom: 16,
        borderBottom: "1px solid #E8E7E3",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "none",
      }}>
        {[
          { key: "process", label: "📋 Procesar lista", desc: "Cargar + decidir" },
          { key: "compare", label: "🔀 Comparar", desc: "Multi-proveedor" },
          { key: "profiles", label: `🏭 Proveedores${profileCount > 0 ? ` (${profileCount})` : ""}`, desc: "Gestión" },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "10px 16px",
              background: "transparent",
              color: tab === t.key ? "#37352F" : "#8C8A82",
              border: "none",
              borderBottom: `2px solid ${tab === t.key ? "#5E6AD2" : "transparent"}`,
              borderRadius: 0,
              fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
              transition: "all 0.15s",
              marginBottom: -1,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "process" && (
        <ProcessTab
          products={products}
          setProducts={setProducts}
          purchases={purchases}
          setPurchases={setPurchases}
          sales={sales}
          exchangeRate={exchangeRate}
          currentUser={currentUser}
          logAudit={logAudit}
          supplierProfiles={supplierProfiles}
          setSupplierProfiles={setSupplierProfiles}
          supplierAliases={supplierAliases}
          setSupplierAliases={setSupplierAliases}
          supplierLists={supplierLists}
          setSupplierLists={setSupplierLists}
          showToast={showToast}
        />
      )}
      {tab === "compare" && (
        <CompareTab
          products={products}
          supplierProfiles={supplierProfiles}
          supplierAliases={supplierAliases}
          exchangeRate={exchangeRate}
          onCreatePurchasesFromSplit={createPurchasesFromSplit}
          showToast={showToast}
        />
      )}
      {tab === "profiles" && (
        <ProfilesTab
          supplierProfiles={supplierProfiles}
          setSupplierProfiles={setSupplierProfiles}
          supplierLists={supplierLists}
          purchases={purchases}
          showToast={showToast}
        />
      )}
    </div>
  );
};
