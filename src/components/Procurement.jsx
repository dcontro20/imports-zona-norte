import { useState, useCallback } from "react";
import { uid } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Purchases } from "./Purchases.jsx";
import { SupplierMonitor } from "./SupplierMonitor.jsx";
import { ProcurementSummary } from "./purchases/ProcurementSummary.jsx";
import { PurchaseAnalytics } from "./purchases/PurchaseAnalytics.jsx";

// Hub unificado de Abastecimiento — un solo punto de entrada para todo el ciclo
// de compra: Resumen (centro de comando) + Pedidos + Proveedores.
//
// Reúne los módulos Purchases y SupplierMonitor (ya modularizados) bajo tabs,
// pasándoles embedded=true para que no rendericen su propio header.
export const Procurement = (props) => {
  const {
    products, setProducts, purchases, setPurchases, sales = [],
    exchangeRate, logStock, currentUser, logAudit, monthlyClosures = [],
    supplierProfiles = [], setSupplierProfiles,
    supplierAliases = [], setSupplierAliases,
    supplierLists = [], setSupplierLists,
  } = props;

  const { isMobile } = useResponsive();
  const [tab, setTab] = useState("summary");

  // Crear pedido desde una recomendación (usado por el tab Resumen)
  const handleCreatePurchaseFromReco = useCallback((purchaseData) => {
    const newId = uid();
    const newPurchase = {
      ...purchaseData,
      id: newId,
      createdBy: currentUser?.name || "",
      statusHistory: [{
        status: "pedido",
        timestamp: new Date().toISOString(),
        note: "Pedido recomendado por análisis automático",
        user: currentUser?.name || "?",
      }],
    };
    setPurchases(prev => [newPurchase, ...prev]);
    if (logAudit) logAudit("create", "purchase", newId, `Pedido recomendado: ${purchaseData.supplier} · ${purchaseData.totalItems}u`);
  }, [currentUser, setPurchases, logAudit]);

  const TABS = [
    { key: "summary", label: "📊 Resumen", desc: "Centro de comando" },
    { key: "orders", label: "🚚 Pedidos", desc: "Gestión de compras" },
    { key: "suppliers", label: "🏭 Proveedores", desc: "Listas + perfiles" },
    { key: "analytics", label: "📈 Analytics", desc: "Inteligencia" },
  ];

  return (
    <div style={{ padding: isMobile ? "12px" : "20px", maxWidth: 1280, margin: "0 auto" }}>
      {/* Header del hub */}
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, color: "#1E2B4A", margin: 0, letterSpacing: "-0.5px" }}>
          🚚 Compras
        </h1>
        <p style={{ color: "#6B7794", fontSize: 13, margin: "6px 0 0" }}>
          Todo el ciclo de abastecimiento en un lugar: qué pedir, a quién, y seguimiento de pedidos.
        </p>
      </div>

      {/* Tabs nivel 1 */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 18,
        borderBottom: "1px solid #E5DAC2",
        overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none",
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: isMobile ? "10px 14px" : "12px 20px",
              background: "transparent",
              color: tab === t.key ? "#1E2B4A" : "#6B7794",
              border: "none",
              borderBottom: `3px solid ${tab === t.key ? "#1E2B4A" : "transparent"}`,
              borderRadius: 0,
              fontSize: isMobile ? 13 : 15, fontWeight: 800,
              cursor: "pointer", fontFamily: "inherit",
              transition: "all 0.15s", marginBottom: -1,
              whiteSpace: "nowrap", flexShrink: 0,
              letterSpacing: "-0.2px",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "summary" && (
        <ProcurementSummary
          products={products}
          sales={sales}
          purchases={purchases}
          exchangeRate={exchangeRate}
          supplierProfiles={supplierProfiles}
          supplierLists={supplierLists}
          onCreatePurchaseFromReco={handleCreatePurchaseFromReco}
          onGoToTab={setTab}
        />
      )}

      {tab === "orders" && (
        <Purchases
          purchases={purchases}
          setPurchases={setPurchases}
          products={products}
          setProducts={setProducts}
          exchangeRate={exchangeRate}
          logStock={logStock}
          currentUser={currentUser}
          logAudit={logAudit}
          monthlyClosures={monthlyClosures}
          sales={sales}
          supplierProfiles={supplierProfiles}
          setSupplierProfiles={setSupplierProfiles}
          supplierAliases={supplierAliases}
          supplierLists={supplierLists}
          embedded
        />
      )}

      {tab === "suppliers" && (
        <SupplierMonitor
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
          embedded
        />
      )}

      {tab === "analytics" && (
        <PurchaseAnalytics
          purchases={purchases}
          products={products}
          sales={sales}
          supplierProfiles={supplierProfiles}
          supplierLists={supplierLists}
          exchangeRate={exchangeRate}
        />
      )}
    </div>
  );
};
