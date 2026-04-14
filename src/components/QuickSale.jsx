import { useState, useMemo } from "react";
import { uid, formatMoney } from "../helpers.js";
import { Modal, Btn, Badge } from "./UI.jsx";
import { PAYMENT_METHODS, MP_ACCOUNTS, BRAND_COLORS } from "../constants.js";

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
  if (method === "Mercado Pago") return mpAccount === "MP Diego" ? "mpDiego" : mpAccount === "MP Gustavo" ? "mpGustavo" : "";
  return ACCOUNT_MAP[method] || "";
};

export const QuickSale = ({
  open, onClose, products, setProducts, sales, setSales,
  logStock, exchangeRate, currentUser, logAudit,
  cashMovements, setCashMovements,
}) => {
  const [step, setStep] = useState(1); // 1=pick product, 2=confirm+pay
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null); // product object
  const [qty, setQty] = useState(1);
  const [payMethod, setPayMethod] = useState("Pesos Cash");
  const [mpAccount, setMpAccount] = useState("MP Diego");
  const [customPrice, setCustomPrice] = useState("");
  const [success, setSuccess] = useState(false);

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

  const unitPrice = selected
    ? (customPrice !== "" ? Number(customPrice) : (selected.priceUSD || 0) * exchangeRate)
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
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const pickProduct = (p) => {
    setSelected(p);
    setCustomPrice("");
    setQty(1);
    setStep(2);
  };

  const confirm = () => {
    if (!selected || qty <= 0) return;

    const saleId = uid();
    const now = new Date().toISOString();

    // Build sale object
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
      channel: "Presencial",
      clientId: "", clientName: "",
      discountAmount: 0,
      createdBy: currentUser?.name || "",
      quickSale: true,
    };

    // Save sale
    setSales(prev => [sale, ...prev]);

    // Decrease stock
    setProducts(prev => prev.map(p =>
      p.id === selected.id ? { ...p, stock: Math.max(0, p.stock - qty) } : p
    ));

    // Log stock
    logStock({
      productId: selected.id,
      type: "venta",
      qty: -qty,
      reason: `Venta rápida #${saleId.slice(-5)}`,
      refId: saleId,
    });

    // Log audit
    if (logAudit) {
      logAudit("create", "sale", saleId,
        `Venta rápida: ${qty}x ${selected.brand} ${selected.model} - ${selected.flavor} · ${formatMoney(total)}`
      );
    }

    setSuccess(true);
    setTimeout(() => {
      handleClose();
    }, 1200);
  };

  if (!open) return null;

  // Success screen
  if (success) {
    return (
      <Modal open={true} onClose={handleClose} title="Venta registrada">
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
          <p style={{ fontSize: 18, fontWeight: 700, color: "#059669", marginBottom: 4 }}>Venta exitosa</p>
          <p style={{ color: "#6b7280", fontSize: 14 }}>
            {qty}x {selected?.brand} {selected?.model} - {selected?.flavor}
          </p>
          <p style={{ color: "#059669", fontSize: 22, fontWeight: 800 }}>{formatMoney(total)}</p>
        </div>
      </Modal>
    );
  }

  // Step 1: Pick product
  if (step === 1) {
    return (
      <Modal open={true} onClose={handleClose} title="Venta Rápida">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar producto..."
          autoFocus
          style={{
            width: "100%", padding: "12px 14px", background: "#f7f8fa",
            border: "1px solid #e2e4e9", borderRadius: 10, fontSize: 15,
            outline: "none", boxSizing: "border-box", marginBottom: 12,
          }}
        />
        <div style={{ maxHeight: "55vh", overflowY: "auto" }}>
          {grouped.length === 0 && (
            <p style={{ textAlign: "center", color: "#9ca3af", padding: 20 }}>
              {search ? "Sin resultados" : "No hay productos con stock"}
            </p>
          )}
          {grouped.map(([brand, prods]) => (
            <div key={brand} style={{ marginBottom: 12 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: BRAND_COLORS[brand] || "#6366f1",
                textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, padding: "0 4px"
              }}>{brand}</div>
              {prods.map(p => (
                <button key={p.id} onClick={() => pickProduct(p)} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  width: "100%", padding: "10px 12px", background: "#fff",
                  border: "1px solid #e2e4e9", borderRadius: 8, marginBottom: 4,
                  cursor: "pointer", textAlign: "left", transition: "background 0.15s",
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>
                      {p.model} - {p.flavor}
                    </div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>{p.puffs}p</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#059669" }}>
                      {formatMoney(p.priceUSD * exchangeRate)}
                    </div>
                    <Badge color={p.stock <= 3 ? "#e74c3c" : "#059669"}>{p.stock} uds</Badge>
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
        background: "#f7f8fa", borderRadius: 10, padding: "12px 16px",
        marginBottom: 16, border: "1px solid #e2e4e9"
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a2e" }}>
          {selected?.brand} {selected?.model} - {selected?.flavor}
        </div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Stock: {selected?.stock} · {selected?.puffs}p
        </div>
      </div>

      {/* Quantity */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>Cantidad</label>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{
            width: 40, height: 40, borderRadius: 10, border: "1px solid #e2e4e9",
            background: "#f7f8fa", fontSize: 20, cursor: "pointer", color: "#1a1a2e", fontWeight: 700
          }}>-</button>
          <span style={{ fontSize: 28, fontWeight: 800, color: "#1a1a2e", minWidth: 40, textAlign: "center" }}>{qty}</span>
          <button onClick={() => setQty(q => Math.min(selected?.stock || 99, q + 1))} style={{
            width: 40, height: 40, borderRadius: 10, border: "1px solid #e2e4e9",
            background: "#f7f8fa", fontSize: 20, cursor: "pointer", color: "#1a1a2e", fontWeight: 700
          }}>+</button>
        </div>
      </div>

      {/* Price (editable) */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>
          Precio unitario ARS
        </label>
        <input
          type="number"
          value={customPrice !== "" ? customPrice : Math.round((selected?.priceUSD || 0) * exchangeRate)}
          onChange={e => setCustomPrice(e.target.value)}
          style={{
            width: "100%", padding: "10px 12px", background: "#f7f8fa",
            border: "1px solid #e2e4e9", borderRadius: 8, fontSize: 16,
            outline: "none", boxSizing: "border-box"
          }}
        />
      </div>

      {/* Payment method */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>Método de pago</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {PAYMENT_METHODS.map(m => (
            <button key={m} onClick={() => setPayMethod(m)} style={{
              padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: payMethod === m ? "2px solid #6366f1" : "1px solid #e2e4e9",
              background: payMethod === m ? "#f0f0ff" : "#fff",
              color: payMethod === m ? "#6366f1" : "#4b5563",
              cursor: "pointer",
            }}>{m}</button>
          ))}
        </div>
        {payMethod === "Mercado Pago" && (
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            {MP_ACCOUNTS.map(a => (
              <button key={a} onClick={() => setMpAccount(a)} style={{
                padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: mpAccount === a ? "2px solid #6366f1" : "1px solid #e2e4e9",
                background: mpAccount === a ? "#f0f0ff" : "#fff",
                color: mpAccount === a ? "#6366f1" : "#6b7280",
                cursor: "pointer",
              }}>{a}</button>
            ))}
          </div>
        )}
      </div>

      {/* Total */}
      <div style={{
        background: "#f0fdf4", borderRadius: 10, padding: "14px 16px",
        marginBottom: 16, border: "1px solid #bbf7d0", textAlign: "center"
      }}>
        <div style={{ fontSize: 12, color: "#059669", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Total</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: "#059669" }}>{formatMoney(total)}</div>
        {qty > 1 && <div style={{ fontSize: 12, color: "#6b7280" }}>{qty} x {formatMoney(unitPrice)}</div>}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="secondary" onClick={() => setStep(1)} style={{ flex: 1 }}>Volver</Btn>
        <Btn onClick={confirm} style={{ flex: 2 }} disabled={!selected || qty <= 0 || total <= 0}>
          Confirmar Venta
        </Btn>
      </div>
    </Modal>
  );
};
