import { useMemo } from "react";
import { PurchaseCard } from "./PurchaseCard.jsx";

// Vista lista: cards full-width, una debajo de la otra, ordenadas por fecha desc.
// Es la vista por default en mobile y opcional en desktop.
export function ListView({
  purchases,
  supplierProfiles,
  products,
  exchangeRate,
  onOpenEdit,
  onAdvance,
  onVerify,
  onOpenCosts,
  onDelete,
  onReorder,
  confirmDeleteId,
}) {
  const sorted = useMemo(
    () => (purchases || []).filter(p => !p.isDeleted).slice().sort((a, b) => new Date(b.date) - new Date(a.date)),
    [purchases]
  );

  if (sorted.length === 0) {
    return (
      <div style={{
        padding: 48, textAlign: "center", color: "#9AA2B3",
        background: "#FFFFFF", border: "1px solid #E5DAC2",
        borderRadius: 14,
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🚚</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#1E2B4A", marginBottom: 6 }}>
          No hay pedidos registrados
        </div>
        <div style={{ fontSize: 13, maxWidth: 480, margin: "0 auto" }}>
          Creá uno con "+ Nuevo Pedido" o procesá una lista en
          el módulo de Proveedores para crear pedidos automáticamente.
        </div>
      </div>
    );
  }

  return (
    <div>
      {sorted.map(p => (
        <PurchaseCard
          key={p.id}
          purchase={p}
          supplierProfiles={supplierProfiles}
          products={products}
          exchangeRate={exchangeRate}
          variant="full"
          onOpenEdit={onOpenEdit}
          onAdvance={onAdvance}
          onVerify={onVerify}
          onOpenCosts={onOpenCosts}
          onDelete={onDelete}
          onReorder={onReorder}
          confirmDeleteId={confirmDeleteId}
        />
      ))}
    </div>
  );
}
