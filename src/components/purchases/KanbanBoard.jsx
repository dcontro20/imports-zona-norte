import { useMemo } from "react";
import { useResponsive } from "../../App.jsx";
import { PURCHASE_STATUSES, groupByStatus } from "./purchaseHelpers.js";
import { PurchaseCard } from "./PurchaseCard.jsx";

// Vista Kanban: 4 columnas verticales, una por status.
// Cada columna scrollea independientemente si tiene muchas cards.
// Cards en variant="compact" para que entren más.
export function KanbanBoard({
  purchases,
  supplierProfiles,
  products,
  exchangeRate,
  onOpenEdit,
  onAdvance,
  onVerify,
  onOpenCosts,
  onDelete,
  confirmDeleteId,
}) {
  const { isMobile } = useResponsive();
  const groups = useMemo(() => groupByStatus(purchases), [purchases]);

  // En mobile no tiene sentido kanban (columnas muy chicas) — el componente
  // padre debería forzar lista. Por seguridad, lo respetamos acá también.
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${isMobile ? 1 : 4}, 1fr)`,
      gap: 12,
    }}>
      {PURCHASE_STATUSES.map(stage => {
        const items = groups[stage.value] || [];
        return (
          <div key={stage.value} style={{
            background: "#F8F2E7",
            border: `1px solid ${stage.color}40`,
            borderRadius: 14,
            padding: 12,
            display: "flex", flexDirection: "column",
            minHeight: 240,
          }}>
            {/* Column header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 6, marginBottom: 10, paddingBottom: 8,
              borderBottom: `2px solid ${stage.color}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14 }}>{stage.emoji}</span>
                <span style={{
                  fontSize: 12, fontWeight: 800, color: stage.color,
                  textTransform: "uppercase", letterSpacing: 0.5,
                }}>{stage.label}</span>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 800, color: "#FFFFFF",
                background: stage.color,
                padding: "2px 8px", borderRadius: 999, minWidth: 22, textAlign: "center",
              }}>{items.length}</span>
            </div>

            {/* Cards */}
            {items.length === 0 ? (
              <div style={{
                color: "#9AA2B3", fontSize: 11, textAlign: "center",
                padding: 20, fontStyle: "italic",
              }}>Sin pedidos</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.map(p => (
                  <PurchaseCard
                    key={p.id}
                    purchase={p}
                    supplierProfiles={supplierProfiles}
                    products={products}
                    exchangeRate={exchangeRate}
                    variant="compact"
                    onOpenEdit={onOpenEdit}
                    onAdvance={onAdvance}
                    onVerify={onVerify}
                    onOpenCosts={onOpenCosts}
                    onDelete={onDelete}
                    confirmDeleteId={confirmDeleteId}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
