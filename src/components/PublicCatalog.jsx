import { useState, useMemo } from "react";
import { decodeCatalogFromURL, isCatalogExpired, clientOrderLink } from "../lib/publicCatalog.js";

// Vista pública del catálogo. Renderiza un snapshot decodificado del hash
// de la URL. NO requiere autenticación ni Firebase. NO tiene navegación
// hacia el resto de la app (es como una mini-landing).
//
// El cliente puede:
//   - Ver todos los productos con precio
//   - Filtrar por marca
//   - Marcar los que le interesan
//   - Tocar "Pedir por WhatsApp" → abre wa.me con los productos pre-cargados

const NAVY = "#1E2B4A";
const CREAM = "#F8F2E7";
const GREEN = "#0F7B6C";
const ACCENT = "#7BFFD9";

function money(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString("es-AR")}`;
}

export function PublicCatalog() {
  const snapshot = useMemo(() => decodeCatalogFromURL(), []);
  const [selectedIds, setSelectedIds] = useState([]);
  const [brandFilter, setBrandFilter] = useState("");

  const expired = snapshot ? isCatalogExpired(snapshot) : false;
  const items = snapshot?.items || [];
  const brands = useMemo(() => [...new Set(items.map(i => i.brand))].sort(), [items]);
  const filtered = useMemo(() => {
    if (!brandFilter) return items;
    return items.filter(i => i.brand === brandFilter);
  }, [items, brandFilter]);

  const toggle = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const orderLink = useMemo(() => {
    if (!snapshot || selectedIds.length === 0) return null;
    return clientOrderLink(snapshot, selectedIds);
  }, [snapshot, selectedIds]);

  // === Errores ===
  if (!snapshot) {
    return (
      <FullScreen>
        <Card>
          <h1 style={{ margin: "0 0 12px", fontSize: 22, color: NAVY }}>Catálogo no encontrado</h1>
          <p style={{ margin: 0, color: "#6B7794", lineHeight: 1.5, fontSize: 14 }}>
            El link parece inválido o está incompleto. Pedile a IZN que te mande el link nuevo.
          </p>
        </Card>
      </FullScreen>
    );
  }

  if (expired) {
    return (
      <FullScreen>
        <Card>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📅</div>
          <h1 style={{ margin: "0 0 12px", fontSize: 22, color: NAVY }}>Catálogo expirado</h1>
          <p style={{ margin: 0, color: "#6B7794", lineHeight: 1.5, fontSize: 14 }}>
            Este catálogo fue generado el {new Date(snapshot.createdAt).toLocaleDateString("es-AR")}.
            Para ver el stock actualizado, escribinos por WhatsApp.
          </p>
          <a href={`https://wa.me/${snapshot.contactPhone}`} style={ctaStyle}>📲 Escribir a IZN</a>
        </Card>
      </FullScreen>
    );
  }

  // === Catálogo activo ===
  return (
    <div style={{ minHeight: "100dvh", background: "#FFF", color: NAVY, fontFamily: "Inter, -apple-system, system-ui, sans-serif" }}>
      {/* HEADER navy */}
      <header style={{
        background: `linear-gradient(135deg, ${NAVY} 0%, #2D3D63 100%)`,
        color: CREAM, padding: "32px 20px 28px",
        paddingTop: "calc(32px + env(safe-area-inset-top))",
      }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" }}>
            Imports Zona Norte
          </div>
          <h1 style={{ margin: "6px 0 0", fontSize: 28, fontWeight: 900, letterSpacing: "-0.02em" }}>
            {snapshot.title}
          </h1>
          <div style={{ fontSize: 13, opacity: 0.78, marginTop: 8 }}>
            {snapshot.stats.productCount} sabores · {snapshot.stats.brands} marcas · {snapshot.stats.totalUnits} unidades
          </div>
          {snapshot.promoNote && (
            <div style={{
              marginTop: 14, padding: "10px 14px",
              background: "rgba(123,255,217,0.15)", border: "1px solid rgba(123,255,217,0.3)",
              borderRadius: 10, fontSize: 13, color: ACCENT, fontWeight: 600,
            }}>🎁 {snapshot.promoNote}</div>
          )}
        </div>
      </header>

      {/* FILTROS */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "#FFF", borderBottom: "1px solid #E5DAC2",
        padding: "10px 20px", boxShadow: "0 1px 4px rgba(15,15,15,0.04)",
      }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
          <BrandChip active={!brandFilter} onClick={() => setBrandFilter("")}>Todas</BrandChip>
          {brands.map(b => (
            <BrandChip key={b} active={brandFilter === b} onClick={() => setBrandFilter(b)}>{b}</BrandChip>
          ))}
        </div>
      </div>

      {/* PRODUCTOS */}
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "16px 20px 200px" }}>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "#9AA2B3", fontSize: 14 }}>
            Sin productos en esta categoría
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(it => {
            const selected = selectedIds.includes(it.id);
            return (
              <button key={it.id} onClick={() => toggle(it.id)} style={{
                display: "flex", alignItems: "center", gap: 14,
                background: selected ? "#F0F9F6" : "#FFF",
                border: selected ? `2px solid ${GREEN}` : `1px solid #E5DAC2`,
                borderRadius: 14, padding: "14px 16px", minHeight: 64,
                cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                transition: "all 0.15s",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "#6B7794", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {it.brand}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginTop: 2 }}>
                    {it.model} · {it.flavor}
                  </div>
                  {it.puffs && (
                    <div style={{ fontSize: 11, color: "#9AA2B3", marginTop: 2 }}>
                      {Number(it.puffs).toLocaleString("es-AR")} puffs
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: GREEN }}>
                    {money(it.priceARS)}
                  </div>
                  {it.stock <= 3 && (
                    <div style={{ fontSize: 10, color: "#B83232", fontWeight: 700, marginTop: 2 }}>
                      Quedan {it.stock}
                    </div>
                  )}
                </div>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%",
                  background: selected ? GREEN : "transparent",
                  border: selected ? `2px solid ${GREEN}` : "2px solid #E5DAC2",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#FFF", fontWeight: 800, fontSize: 14,
                  flexShrink: 0,
                }}>{selected ? "✓" : ""}</div>
              </button>
            );
          })}
        </div>
      </main>

      {/* BOTÓN FIJO ABAJO */}
      {selectedIds.length > 0 && orderLink && (
        <a href={orderLink} target="_blank" rel="noopener" style={{
          position: "fixed",
          bottom: "max(16px, env(safe-area-inset-bottom))",
          left: 16, right: 16,
          maxWidth: 720, margin: "0 auto",
          background: GREEN, color: "#FFF", textDecoration: "none",
          padding: "16px 20px", minHeight: 56,
          borderRadius: 14, fontSize: 16, fontWeight: 800,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          boxShadow: "0 8px 24px rgba(15,123,108,0.4)",
        }}>
          📲 Pedir {selectedIds.length} {selectedIds.length === 1 ? "producto" : "productos"} por WhatsApp
        </a>
      )}

      {/* FOOTER */}
      <footer style={{
        textAlign: "center", padding: "20px",
        fontSize: 12, color: "#9AA2B3",
        borderTop: "1px solid #E5DAC2", marginTop: 40,
      }}>
        <a href={`https://wa.me/${snapshot.contactPhone}`} style={{ color: GREEN, textDecoration: "none", fontWeight: 600 }}>
          WhatsApp
        </a>
        {" · "}
        <a href={`https://instagram.com/${snapshot.contactIG}`} style={{ color: GREEN, textDecoration: "none", fontWeight: 600 }}>
          @{snapshot.contactIG}
        </a>
      </footer>
    </div>
  );
}

function FullScreen({ children }) {
  return (
    <div style={{
      minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center",
      background: CREAM, padding: 20,
    }}>{children}</div>
  );
}

function Card({ children }) {
  return (
    <div style={{
      background: "#FFF", borderRadius: 18, padding: 32,
      maxWidth: 420, width: "100%", textAlign: "center",
      boxShadow: "0 8px 24px rgba(15,15,15,0.08)",
    }}>{children}</div>
  );
}

function BrandChip({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "8px 14px", borderRadius: 999,
      background: active ? NAVY : "#F8F2E7",
      color: active ? CREAM : NAVY,
      border: active ? "none" : "1px solid #E5DAC2",
      fontSize: 13, fontWeight: 700, cursor: "pointer",
      fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0,
      minHeight: 36,
    }}>{children}</button>
  );
}

const ctaStyle = {
  display: "inline-block", marginTop: 18,
  background: GREEN, color: "#FFF",
  padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 700,
  textDecoration: "none",
};
