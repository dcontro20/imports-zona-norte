import { useState, useMemo } from "react";
import { useResponsive } from "../../App.jsx";
import { Card, Btn } from "../UI.jsx";
import { T } from "../../theme.js";
import { WHOLESALE_TIERS } from "../../constants.js";
import { useAppContext } from "../../AppContext.js";
import { priceListItems, priceListText } from "../../lib/wholesaleMessage.js";
import { formatMoney } from "../../helpers.js";

// 🏷️ Lista de precios (Bloque 2.2 — front de ventas). Herramienta de venta
// para usar PARADO EN EL MOSTRADOR con el kiosquero enfrente:
//  - La PANTALLA muestra el tier elegido (info para Diego: qué está mostrando).
//  - El TEXTO que se copia NO menciona el tier (las listas se reenvían entre
//    comercios) y lleva fecha + disclaimer del dólar. Decisiones 2026-07-24.
// Tipografía grande a propósito: se lee a un brazo de distancia.

const TIER_KEY = "izn:priceListTier";

export function PriceListScreen({ products = [] }) {
  const { isMobile } = useResponsive();
  const { exchangeRate } = useAppContext();
  const [tier, setTier] = useState(() => {
    try { return localStorage.getItem(TIER_KEY) || "C"; } catch { return "C"; }
  });
  const [copied, setCopied] = useState(false);

  const pickTier = (t) => {
    setTier(t);
    setCopied(false);
    try { localStorage.setItem(TIER_KEY, t); } catch {}
  };

  const groups = useMemo(() => priceListItems(products, tier, exchangeRate), [products, tier, exchangeRate]);
  const totalItems = groups.reduce((s, g) => s + g.items.length, 0);

  const copy = () => {
    const txt = priceListText(products, { tier, exchangeRate });
    if (!txt) return;
    navigator.clipboard?.writeText(txt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }).catch(() => {});
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: T.text, margin: 0, fontSize: isMobile ? 20 : 22 }}>🏷️ Lista de precios</h2>
        <Btn onClick={copy} disabled={totalItems === 0}>{copied ? "✅ Copiado" : "📋 Copiar para WhatsApp"}</Btn>
      </div>

      {/* Selector de tier — info INTERNA (el texto copiado no lo menciona) */}
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: T.textMuted, fontWeight: 700 }}>Mostrando tier:</span>
          {WHOLESALE_TIERS.map(t => (
            <Btn key={t} variant={tier === t ? "primary" : "secondary"} onClick={() => pickTier(t)}
              style={{ padding: "10px 20px", fontSize: 15 }}>{t}</Btn>
          ))}
        </div>
        <div style={{ fontSize: 11, color: T.textFaint, marginTop: 8 }}>
          El tier se ve solo acá — el texto que copiás dice "Lista de precios" a secas, con fecha y disclaimer del dólar.
        </div>
      </Card>

      {totalItems === 0 ? (
        <Card>
          <div style={{ textAlign: "center", color: T.textMuted, padding: isMobile ? "32px 16px" : 48 }}>
            No hay productos con stock y precio de tier {tier} cargado.<br />
            Cargá las listas en <b>📦 Stock</b> → producto → "🏪 Precios mayorista por tier".
          </div>
        </Card>
      ) : (
        groups.map(g => (
          <Card key={g.brand} style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 800, color: T.text, fontSize: isMobile ? 16 : 15, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{g.brand}</div>
            {g.items.map((it, i) => (
              <div key={it.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                padding: "12px 0",
                borderBottom: i < g.items.length - 1 ? `1px solid ${T.borderSoft}` : "none",
              }}>
                <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", fontSize: isMobile ? 16 : 14, color: T.text }}>{it.label}</span>
                <span style={{ flexShrink: 0, fontWeight: 800, fontSize: isMobile ? 18 : 16, color: T.green }}>{formatMoney(it.priceARS)}</span>
              </div>
            ))}
          </Card>
        ))
      )}

      {totalItems > 0 && (
        <p style={{ fontSize: 12, color: T.textFaint, marginTop: 4 }}>
          {totalItems} productos · dólar ${exchangeRate} · solo se listan productos con stock y lista de tier cargada.
        </p>
      )}
    </div>
  );
}
