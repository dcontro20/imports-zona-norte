import { useState, useMemo } from "react";
import { useResponsive } from "../../App.jsx";
import { Card, Btn, StatCard } from "../UI.jsx";
import { formatMoney } from "../../helpers.js";
import { SupplierProfileCard } from "./SupplierProfileCard.jsx";
import { SupplierProfileModal } from "./SupplierProfileModal.jsx";
import { activeProfiles, computeSupplierStats } from "../../lib/supplierProfiles.js";

// Tab 3: Gestión de proveedores
//
// Muestra:
//  - KPIs globales (cantidad de proveedores, total comprado este mes, etc)
//  - Grid de cards por proveedor (con sus stats)
//  - Botón "+ Nuevo"
//  - Click → modal de edición
export function ProfilesTab({
  supplierProfiles = [],
  setSupplierProfiles,
  supplierLists = [],
  purchases = [],
  showToast,
}) {
  const { isMobile } = useResponsive();
  const profiles = useMemo(() => activeProfiles(supplierProfiles), [supplierProfiles]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);

  // Stats globales
  const globalStats = useMemo(() => {
    let totalUSDT = 0;
    let totalARS = 0;
    let totalOrders = 0;
    let pending = 0;
    profiles.forEach(p => {
      const s = computeSupplierStats(p, purchases, supplierLists);
      totalUSDT += s.totalUSDT;
      totalARS += s.totalARS;
      totalOrders += s.orderCount;
      pending += s.pendingCount;
    });
    return { totalUSDT, totalARS, totalOrders, pending, profileCount: profiles.length };
  }, [profiles, purchases, supplierLists]);

  const openNew = () => { setEditingProfile(null); setModalOpen(true); };
  const openEdit = (profile) => { setEditingProfile(profile); setModalOpen(true); };

  const saveProfile = (profile) => {
    setSupplierProfiles(prev => {
      const existing = prev.find(p => p.id === profile.id);
      if (existing) {
        return prev.map(p => p.id === profile.id ? { ...p, ...profile } : p);
      }
      return [profile, ...prev];
    });
    setModalOpen(false);
    showToast?.(`✅ Proveedor ${profile.name} guardado`);
  };

  const deleteProfile = (profileId) => {
    setSupplierProfiles(prev => prev.map(p =>
      p.id === profileId
        ? { ...p, isDeleted: true, deletedAt: new Date().toISOString() }
        : p
    ));
    setModalOpen(false);
    showToast?.("Proveedor eliminado");
  };

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <StatCard label="Proveedores activos" value={globalStats.profileCount} color="#5E6AD2" icon="🏭" />
        <StatCard
          label="Total comprado"
          value={`USDT ${globalStats.totalUSDT.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
          sub={formatMoney(globalStats.totalARS)}
          color="#0F7B6C"
          icon="💰"
        />
        <StatCard label="Pedidos totales" value={globalStats.totalOrders} color="#555247" icon="📦" />
        {globalStats.pending > 0 && (
          <StatCard label="Pendientes" value={globalStats.pending} color="#CB912F" icon="⏳" />
        )}
      </div>

      {/* Header con botón crear */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 12, gap: 10, flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#37352F" }}>
          {profiles.length === 0 ? "Sin proveedores todavía" : `${profiles.length} proveedores`}
        </div>
        <Btn onClick={openNew}>➕ Nuevo proveedor</Btn>
      </div>

      {profiles.length === 0 ? (
        <Card>
          <div style={{ textAlign: "center", padding: isMobile ? 24 : 48, color: "#8C8A82" }}>
            <div style={{ fontSize: isMobile ? 48 : 64, marginBottom: 12 }}>🏭</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#37352F", marginBottom: 6 }}>
              Empezá creando un proveedor
            </div>
            <div style={{ fontSize: 13, maxWidth: 500, margin: "0 auto 16px" }}>
              Cada proveedor guarda sus costos típicos (comisión, pasero, envío),
              su contacto y un diccionario aprendido de cómo nombran sus productos.
            </div>
            <Btn onClick={openNew}>➕ Crear primer proveedor</Btn>
          </div>
        </Card>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? "260px" : "300px"}, 1fr))`,
          gap: 12,
        }}>
          {profiles.map(p => (
            <SupplierProfileCard
              key={p.id}
              profile={p}
              purchases={purchases}
              lists={supplierLists}
              onEdit={openEdit}
            />
          ))}
        </div>
      )}

      <SupplierProfileModal
        open={modalOpen}
        profile={editingProfile}
        existingProfiles={supplierProfiles}
        onClose={() => setModalOpen(false)}
        onSave={saveProfile}
        onDelete={deleteProfile}
      />
    </div>
  );
}
