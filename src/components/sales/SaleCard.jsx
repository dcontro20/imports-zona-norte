import { useState, memo } from "react";
import { formatDate, formatMoney } from "../../helpers.js";
import { T, pickAvatarColor } from "../../theme.js";

// SaleCard — una fila visual por venta en la lista de Sales.jsx.
// Extraído de Sales.jsx. Envuelto en memo al final del archivo para evitar
// re-renders cuando cambian props no relacionados del parent.

// resolveSaleItemName — resuelve nombre de item de venta. Vive acá porque
// SaleCard es su único consumer. Nota: toma products (array) como input,
// a diferencia de resolveItemName en clients/helpers.js que toma productsById (objeto).
const resolveSaleItemName = (item, products) => {
  if (item.name) return item.name;
  if (item.productName) return item.productName;
  const p = item.productId ? products.find(pr => pr.id === item.productId) : null;
  return p ? `${p.brand} ${p.model} - ${p.flavor}` : "Producto eliminado";
};

const SaleCard = ({ sale: r, products, clients = [], exchangeRate, isMobile, onEdit, onRepeat, onDelete, onReceiptPdf, confirmDelete, selectionMode, selected, onToggleSelect }) => {
  // Email receipt via mailto — abre el cliente de email del usuario con todos los campos pre-cargados
  const sendReceipt = () => {
    const client = clients.find(c => c.id === r.clientId);
    const email = client?.email || "";
    const itemsList = (r.items || []).map(i => {
      const p = products.find(pr => pr.id === i.productId);
      const name = p ? `${p.brand} ${p.model} - ${p.flavor}` : "Producto";
      return `• ${i.qty || 1}× ${name}`;
    }).join("\n");
    const subject = `Recibo IZN · ${formatDate(r.date)}`;
    const body = [
      `¡Hola ${client?.name || ""}!`,
      ``,
      `Gracias por tu compra. Detalle:`,
      ``,
      itemsList,
      ``,
      `Total: ${formatMoney(r.total || 0, r.currency || "ARS")}`,
      r.paymentMethod ? `Pago: ${r.paymentMethod}` : "",
      ``,
      `— Imports Zona Norte`,
    ].filter(Boolean).join("\n");
    const url = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = url;
  };

  // Recibo via WhatsApp — abre wa.me con el número del cliente y mensaje pre-cargado.
  // Si el cliente no tiene teléfono, abre WhatsApp Web sin destinatario.
  const sendReceiptWhatsApp = () => {
    const client = clients.find(c => c.id === r.clientId);
    const phoneRaw = (client?.phone || "").replace(/\D/g, "");
    const phone = phoneRaw ? (phoneRaw.startsWith("54") ? phoneRaw : `54${phoneRaw}`) : "";
    const itemsList = (r.items || []).map(i => {
      const p = products.find(pr => pr.id === i.productId);
      const name = p ? `${p.brand} ${p.model} - ${p.flavor}` : "Producto";
      return `• ${i.qty || 1}× ${name}`;
    }).join("\n");
    const lines = [
      `*Recibo IZN* · ${formatDate(r.date)}`,
      client?.name ? `Para: ${client.name}` : "",
      ``,
      itemsList,
      ``,
      `*Total: ${formatMoney(r.total || 0, r.currency || "ARS")}*`,
      r.paymentMethod ? `Pago: ${r.paymentMethod}` : "",
      (r.debtAmount || 0) > 0 ? `Saldo pendiente: ${formatMoney(r.debtAmount)}` : "",
      ``,
      `_Imports Zona Norte_`,
    ].filter(Boolean).join("\n");
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(lines)}`
      : `https://wa.me/?text=${encodeURIComponent(lines)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const clientHasEmail = !!(clients.find(c => c.id === r.clientId)?.email);
  const [hover, setHover] = useState(false);
  const payments = r.payments && r.payments.length > 0 ? r.payments : [{ method: r.paymentMethod, amount: r.total }];
  const itemCount = (r.items || []).reduce((s, i) => s + (i.qty || 1), 0);
  const avatar = pickAvatarColor(r.clientId || r.clientName || r.id);
  const clientInitial = (r.clientName || "?").trim().charAt(0).toUpperCase() || "?";
  const socioColor = r.createdBy === "Diego" ? T.primary : T.green;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={selectionMode ? () => onToggleSelect?.(r.id) : undefined}
      style={{
        position: "relative",
        background: selected ? `${T.primary}10` : T.card,
        borderRadius: T.radiusLg,
        border: `1px solid ${selected ? T.primary : (hover ? T.border : T.borderSoft)}`,
        padding: isMobile ? 14 : 18,
        boxShadow: hover ? T.shadow : T.shadowXs,
        transition: "all .18s ease",
        animation: "fadeIn 0.22s ease",
        cursor: selectionMode ? "pointer" : "default",
      }}
    >
      {selectionMode && (
        <div
          onClick={e => { e.stopPropagation(); onToggleSelect?.(r.id); }}
          aria-label={selected ? "Deseleccionar venta" : "Seleccionar venta"}
          role="checkbox"
          aria-checked={!!selected}
          style={{
            position: "absolute", top: 10, right: 10,
            width: 22, height: 22, borderRadius: 6,
            border: `2px solid ${selected ? T.primary : T.border}`,
            background: selected ? T.primary : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", zIndex: 2,
          }}
        >
          {selected && <span style={{ color: "#fff", fontSize: 13, lineHeight: 1, fontWeight: 800 }}>✓</span>}
        </div>
      )}
      {/* Top row: client + date + total */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: "50%", background: avatar.bg, color: avatar.fg,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 700, fontSize: 16, flexShrink: 0, fontFamily: T.fontDisplay,
        }}>{clientInitial}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>
              {r.clientName || "Cliente sin nombre"}
            </span>
            {r.createdBy && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                background: `${socioColor}18`, color: socioColor,
              }}>{r.createdBy}</span>
            )}
            {r.quickSale && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                background: T.amberBg, color: T.amber,
              }}>Rápida</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span>{formatDate(r.date)}</span>
            {r.channel && <span>· {r.channel}</span>}
            {r.exchangeRate && <span style={{ color: T.textFaint }}>· Blue ${r.exchangeRate}</span>}
          </div>
        </div>

        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{
            fontSize: isMobile ? 20 : 22, fontWeight: 800, color: T.green,
            fontFamily: T.fontDisplay, lineHeight: 1, letterSpacing: "-0.02em",
          }}>
            {formatMoney(r.total, r.currency)}
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3 }}>
            {itemCount} {itemCount === 1 ? "unidad" : "unidades"}
          </div>
        </div>
      </div>

      {/* Items list */}
      <div style={{
        background: T.surface2, borderRadius: 10, padding: "10px 14px",
        border: `1px solid ${T.borderSoft}`, marginBottom: 10,
      }}>
        {(r.items || []).map((item, idx) => {
          const p = products.find(pr => pr.id === item.productId);
          const prodName = resolveSaleItemName(item, products);
          const puffs = p?.puffs || "";
          const unitPrice = item.priceARS || item.customPrice || (() => {
            const totalItems = (r.items || []).length;
            if (totalItems === 1) return r.total / (item.qty || 1);
            if (!p) return 0;
            const saleRate = r.exchangeRate || exchangeRate;
            return r.currency === "USD" ? p.priceUSD : Math.round(p.priceUSD * saleRate);
          })();
          const [head, ...tail] = prodName.split(" - ");
          return (
            <div key={idx} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
              padding: "5px 0",
              borderBottom: idx < (r.items || []).length - 1 ? `1px solid ${T.borderSoft}` : "none",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{head}</span>
                {tail.length > 0 && <span style={{ fontSize: 12, color: T.textSub }}> · {tail.join(" - ")}</span>}
                {puffs && <span style={{ fontSize: 11, color: T.textFaint, marginLeft: 4 }}>({puffs}p)</span>}
              </div>
              <div style={{ textAlign: "right", whiteSpace: "nowrap", flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: T.textMuted }}>×{item.qty}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text, marginLeft: 8, fontFamily: T.fontDisplay }}>
                  {formatMoney(unitPrice * item.qty, r.currency)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom row: badges + actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
          {payments.map((pay, i) => pay.method && (
            <span key={i} style={{
              fontSize: 11, color: T.textSub, background: T.surface2,
              padding: "3px 9px", borderRadius: 999, border: `1px solid ${T.borderSoft}`,
            }}>
              {pay.method}{pay.mpAccount ? ` · ${pay.mpAccount}` : ""}
              {payments.length > 1 && <strong style={{ color: T.text, marginLeft: 4, fontFamily: T.fontDisplay }}>{formatMoney(Number(pay.amount) || 0)}</strong>}
            </span>
          ))}
          {(r.discountAmount || 0) > 0 && (
            <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 999, background: T.amberBg, color: T.amber, fontWeight: 600 }}>
              −{formatMoney(r.discountAmount)}
            </span>
          )}
          {(r.debtAmount || 0) > 0 && (
            <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 999, background: T.redBg, color: T.red, fontWeight: 600 }}>
              Debe {formatMoney(r.debtAmount)}
            </span>
          )}
          {(r.changeAmount || 0) > 0 && r.changeMethod === "credit" && (
            <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 999, background: T.primarySoft, color: T.primary, fontWeight: 600 }}>
              Crédito {formatMoney(r.changeAmount)}
            </span>
          )}
          {(r.changeAmount || 0) > 0 && r.changeMethod && r.changeMethod !== "credit" && (
            <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 999, background: T.amberBg, color: T.amber, fontWeight: 600 }}>
              Vuelto {formatMoney(r.changeAmount)} · {r.changeMethod}
            </span>
          )}
          {r.notes && (
            <span style={{ fontSize: 11, color: T.textMuted, fontStyle: "italic" }}>"{r.notes}"</span>
          )}
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          {onReceiptPdf && <GhostBtn onClick={onReceiptPdf} color={T.primary} title="Descargar recibo PDF">🧾</GhostBtn>}
          <GhostBtn onClick={sendReceiptWhatsApp} color={T.green} title="Enviar recibo por WhatsApp">📲</GhostBtn>
          {clientHasEmail && <GhostBtn onClick={sendReceipt} color={T.primary} title="Enviar recibo por email">📧</GhostBtn>}
          <GhostBtn onClick={onRepeat} color={T.amber} title="Repetir">🔄</GhostBtn>
          <GhostBtn onClick={onEdit} color={T.primary} title="Editar">✏️</GhostBtn>
          {confirmDelete
            ? <button onClick={onDelete} style={{
                padding: "6px 12px", borderRadius: 8, border: "none",
                background: T.red, color: "#fff", fontSize: 12, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit", minHeight: 32,
              }}>¿Eliminar?</button>
            : <GhostBtn onClick={onDelete} color={T.red} title="Eliminar">🗑️</GhostBtn>
          }
        </div>
      </div>
    </div>
  );
};

const GhostBtn = ({ children, onClick, color, title }) => {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick} title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 32, height: 32, borderRadius: 8,
        border: `1px solid ${hover ? color : T.borderSoft}`,
        background: hover ? `${color}12` : "transparent",
        color: hover ? color : T.textSub, fontSize: 14,
        cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontFamily: "inherit", transition: "all .15s",
      }}>{children}</button>
  );
};

export default memo(SaleCard);
