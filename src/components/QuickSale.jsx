import { useState, useMemo, useEffect, useRef } from "react";
import { uid, formatMoney } from "../helpers.js";
import { Modal, Btn, Badge } from "./UI.jsx";
import { PAYMENT_METHODS, MP_ACCOUNTS, BRAND_COLORS } from "../constants.js";
import { productPriceARS } from "../lib/offers.js";

// ============================================
// QUICK SALE — Mobile-optimized one-tap sale
// Designed for speed: pick product → qty → pay → done
// ============================================

const ACCOUNT_MAP = {
  "Pesos Cash": "pesosCash",
  "Mercado Pago": null,
  "Lemon": "lemonPesos",
  "USD Cash": "usdCash",
  "USDT": "lemonUSDT",
};
const resolveAccount = (method, mpAccount) => {
  if (method === "Mercado Pago") {
    // mpAccount típicamente "MP Diego" → "mpDiego"
    if (mpAccount === "MP Diego" || !mpAccount) return "mpDiego";
    return mpAccount.toLowerCase().replace(/\s+/g, "");
  }
  return ACCOUNT_MAP[method] || "";
};

export const QuickSale = ({
  open, onClose, products, setProducts, sales, setSales,
  logStock, exchangeRate, currentUser, logAudit,
}) => {
  const [step, setStep] = useState(1); // 1=pick product, 2=confirm+pay
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null); // product object
  const [qty, setQty] = useState(1);
  const [payMethod, setPayMethod] = useState("Pesos Cash");
  const [mpAccount, setMpAccount] = useState("MP Diego");
  const [customPrice, setCustomPrice] = useState("");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Cleanup de timeouts pendientes al desmontar — evita warnings de React
  // por setState en componente desmontado.
  const closeTimerRef = useRef(null);
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const available = useMemo(() => {
    return products.filter(p => !p.isDeleted && p.stock > 0);
  }, [products]);

  const filtered = useMemo(() => {
    if (!search) return available;
    const q = search.toLowerCase();
    return available.filter(p =>
      `${p.brand} ${p.model} ${p.flavor}`.toLowerCase().includes(q)
    );
  }, [available, search]);

  // Group by brand for nicer display
  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach(p => {
      if (!map[p.brand]) map[p.brand] = [];
      map[p.brand].push(p);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  // FIX: usar productPriceARS (maneja priceUSD || priceARS) en lugar de solo priceUSD
  // Antes: productos cargados solo en ARS daban unitPrice=0 → botón disabled
  // silencioso → "toco y toco y no pasa nada".
  const basePriceARS = selected ? productPriceARS(selected, exchangeRate) : 0;
  const unitPrice = selected
    ? (customPrice !== "" ? Number(customPrice) : basePriceARS)
    : 0;
  const total = unitPrice * qty;

  const reset = () => {
    setStep(1);
    setSearch("");
    setSelected(null);
    setQty(1);
    setPayMethod("Pesos Cash");
    setMpAccount("MP Diego");
    setCustomPrice("");
    setSuccess(false);
    setError("");
  };

  const handleClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    reset();
    onClose();
  };

  const pickProduct = (p) => {
    setSelected(p);
    setCustomPrice("");
    setQty(1);
    setError("");
    setStep(2);
  };

  const confirm = () => {
    // Validaciones explícitas con mensaje al usuario (antes era disabled mudo)
    if (!selected) {
      setError("Elegí un producto antes de confirmar.");
      return;
    }
    if (qty <= 0) {
      setError("La cantidad tiene que ser mayor a 0.");
      return;
    }
    if (qty > (selected.stock || 0)) {
      setError(`Solo hay ${selected.stock} en stock.`);
      return;
    }
    if (total <= 0) {
      setError("El precio del producto es 0. Cargá un precio manual antes de confirmar.");
      return;
    }
    setError("");

    const saleId = uid();
    const now = new Date().toISOString();

    const sale = {
      id: saleId,
      date: now,
      items: [{
        productId: selected.id,
        name: `${selected.brand} ${selected.model} - ${selected.flavor}`,
        qty,
        priceUSD: selected.priceUSD || 0,
      }],
      currency: "ARS",
      total,
      payments: [{
        method: payMethod,
        mpAccount: payMethod === "Mercado Pago" ? mpAccount : "",
        amount: total,
        account: resolveAccount(payMethod, mpAccount),
      }],
      paymentMethod: payMethod,
      mpAccount: payMethod === "Mercado Pago" ? mpAccount : "",
      channel: "Presencial",
      clientId: "", clientName: "",
      discountAmount: 0,
      exchangeRate: Number(exchangeRate) || 0,
      createdBy: currentUser?.name || "",
      quickSale: true,
    };

    try {
      setSales(prev => [sale, ...prev]);
      setProducts(prev => prev.map(p =>
        p.id === selected.id ? { ...p, stock: Math.max(0, p.stock - qty) } : p
      ));
      if (logStock) {
        logStock({
          productId: selected.id,
          type: "venta",
          qty: -qty,
          reason: `Venta rápida #${saleId.slice(-5)}`,
          refId: saleId,
        });
      }
      if (logAudit) {
        logAudit("create", "sale", saleId,
          `Venta rápida: ${qty}x ${selected.brand} ${selected.model} - ${selected.flavor} · ${formatMoney(total)}`
        );
      }
      setSuccess(true);
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null;
        handleClose();
      }, 1500);
    } catch (e) {
      console.error("[QuickSale] error al confirmar:", e);
      setError("Hubo un error guardando la venta. Probá de nuevo.");
    }
  };

  if (!open) return null;

  // Success screen
  if (success) {
    return (
      <Modal open={true} onClose={handleClose} title="Venta registrada">
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
          <p style={{ fontSize: 18, fontWeight: 700, color: "#0F7B6C", marginBottom: 4 }}>Venta exitosa</p>
          <p style={{ color: "#6B7794", fontSize: 14 }}>
            {qty}x {selected?.brand} {selected?.model} - {selected?.flavor}
          </p>
          <p style={{ color: "#0F7B6C", fontSize: 22, fontWeight: 800 }}>{formatMoney(total)}</p>
        </div>
      </Modal>
    );
  }

  // Step 1: Pick product
  if (step === 1) {
    return (
      <Modal open={true} onClose={handleClose} title="Venta Rápida">
        {/* Sin autoFocus: en iOS dispara el teclado apenas abre el modal y
            desplaza el viewport (se ve como que "se traba"). fontSize 16
            evita el auto-zoom de iOS al enfocar. */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar producto..."
          style={{
            width: "100%", padding: "12px 14px", background: "#F8F2E7",
            border: "1px solid #E5DAC2", borderRadius: 10, fontSize: 16,
            outline: "none", boxSizing: "border-box", marginBottom: 12,
          }}
        />
        <div style={{ maxHeight: "55vh", overflowY: "auto" }}>
          {grouped.length === 0 && (
            <p style={{ textAlign: "center", color: "#9AA2B3", padding: 20 }}>
              {search ? "Sin resultados" : "No hay productos con stock"}
            </p>
          )}
          {grouped.map(([brand, prods]) => (
            <div key={brand} style={{ marginBottom: 12 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: BRAND_COLORS[brand] || "#1E2B4A",
                textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, padding: "0 4px"
              }}>{brand}</div>
              {prods.map(p => (
                <button key={p.id} onClick={() => pickProduct(p)} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  width: "100%", padding: "10px 12px", background: "#FFFFFF",
                  border: "1px solid #E5DAC2", borderRadius: 8, marginBottom: 4,
                  cursor: "pointer", textAlign: "left", transition: "background 0.15s",
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1E2B4A" }}>
                      {p.model} - {p.flavor}
                    </div>
                    <div style={{ fontSize: 11, color: "#6B7794" }}>{p.puffs}p</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0F7B6C" }}>
                      {formatMoney(productPriceARS(p, exchangeRate))}
                    </div>
                    <Badge color={p.stock <= 3 ? "#E03E3E" : "#0F7B6C"}>{p.stock} uds</Badge>
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      </Modal>
    );
  }

  // Step 2: Qty + Payment + Confirm
  return (
    <Modal open={true} onClose={handleClose} title="Confirmar Venta">
      {/* Product summary */}
      <div style={{
        background: "#F8F2E7", borderRadius: 10, padding: "12px 16px",
        marginBottom: 16, border: "1px solid #E5DAC2"
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1E2B4A" }}>
          {selected?.brand} {selected?.model} - {selected?.flavor}
        </div>
        <div style={{ fontSize: 12, color: "#6B7794" }}>
          Stock: {selected?.stock} · {selected?.puffs}p
        </div>
      </div>

      {/* Quantity */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 12, color: "#6B7794", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>Cantidad</label>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{
            width: 40, height: 40, borderRadius: 10, border: "1px solid #E5DAC2",
            background: "#F8F2E7", fontSize: 20, cursor: "pointer", color: "#1E2B4A", fontWeight: 700
          }}>-</button>
          <span style={{ fontSize: 28, fontWeight: 800, color: "#1E2B4A", minWidth: 40, textAlign: "center" }}>{qty}</span>
          <button onClick={() => setQty(q => Math.min(selected?.stock || 99, q + 1))} style={{
            width: 40, height: 40, borderRadius: 10, border: "1px solid #E5DAC2",
            background: "#F8F2E7", fontSize: 20, cursor: "pointer", color: "#1E2B4A", fontWeight: 700
          }}>+</button>
        </div>
      </div>

      {/* Price (editable) */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 12, color: "#6B7794", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>
          Precio unitario ARS
        </label>
        <input
          type="number"
          value={customPrice !== "" ? customPrice : Math.round(basePriceARS)}
          onChange={e => setCustomPrice(e.target.value)}
          style={{
            width: "100%", padding: "10px 12px", background: "#F8F2E7",
            border: "1px solid #E5DAC2", borderRadius: 8, fontSize: 16,
            outline: "none", boxSizing: "border-box"
          }}
        />
      </div>

      {/* Payment method */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 12, color: "#6B7794", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>Método de pago</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {PAYMENT_METHODS.map(m => (
            <button key={m} onClick={() => setPayMethod(m)} style={{
              padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: payMethod === m ? "2px solid #1E2B4A" : "1px solid #E5DAC2",
              background: payMethod === m ? "#E8EBF2" : "#F8F2E7",
              color: payMethod === m ? "#1E2B4A" : "#3A4868",
              cursor: "pointer",
            }}>{m}</button>
          ))}
        </div>
        {payMethod === "Mercado Pago" && (
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            {MP_ACCOUNTS.map(a => (
              <button key={a} onClick={() => setMpAccount(a)} style={{
                padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: mpAccount === a ? "2px solid #1E2B4A" : "1px solid #E5DAC2",
                background: mpAccount === a ? "#E8EBF2" : "#F8F2E7",
                color: mpAccount === a ? "#1E2B4A" : "#6B7794",
                cursor: "pointer",
              }}>{a}</button>
            ))}
          </div>
        )}
      </div>

      {/* Total */}
      <div style={{
        background: "#DDEDEA", borderRadius: 10, padding: "14px 16px",
        marginBottom: 16, border: "1px solid #B6D4CC", textAlign: "center"
      }}>
        <div style={{ fontSize: 12, color: "#0F7B6C", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Total</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: "#0F7B6C" }}>{formatMoney(total)}</div>
        {qty > 1 && <div style={{ fontSize: 12, color: "#6B7794" }}>{qty} x {formatMoney(unitPrice)}</div>}
      </div>

      {/* Mensaje de error (validación o excepción) */}
      {error && (
        <div style={{
          background: "#FBE4E4", border: "1px solid #F1B8B6",
          borderRadius: 8, padding: "10px 12px", marginBottom: 12,
          fontSize: 13, color: "#B83232", fontWeight: 600,
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="secondary" onClick={() => setStep(1)} style={{ flex: 1 }}>Volver</Btn>
        <Btn onClick={confirm} style={{ flex: 2 }}>
          Confirmar Venta
        </Btn>
      </div>
    </Modal>
  );
};
