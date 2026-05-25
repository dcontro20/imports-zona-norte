// src/lib/saleReceipt.js
//
// Genera un recibo PDF profesional de una venta, con el branding de
// Imports Zona Norte (navy + cream + escudo). Para mandar al cliente por WhatsApp.

import { jsPDF } from "jspdf";
import { safeRate } from "../helpers.js";

const NAVY = [30, 43, 74];      // #1E2B4A
const CREAM = [248, 242, 231];  // #F8F2E7
const GREEN = [15, 107, 92];    // #0F6B5C
const GRAY = [107, 119, 148];   // #6B7794

function money(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString("es-AR")}`;
}

// Dibuja el escudo del logo (simplificado) en vectores jsPDF.
function drawShield(doc, x, y, size, color) {
  const s = size;
  doc.setDrawColor(...color);
  doc.setLineWidth(s * 0.06);
  // Escudo: aproximado con líneas
  doc.lines(
    [
      [s * 0.5, 0],        // top-right del medio
      [0, s * 0.32],
      [-s * 0.5, s * 0.48],
      [-s * 0.5, -s * 0.48],
      [0, -s * 0.32],
    ],
    x, y + s * 0.05,
    [1, 1], "S", true
  );
  // Globo (círculo) dentro
  doc.circle(x, y + s * 0.55, s * 0.22, "S");
  // Vape (rect vertical)
  doc.setFillColor(...CREAM);
  doc.rect(x - s * 0.08, y + s * 0.28, s * 0.16, s * 0.42, "FD");
}

// Genera y descarga (o devuelve) el PDF del recibo.
//   sale: { id, date, clientName, items:[{name,qty,priceARS,...}], total, currency,
//           exchangeRate, payments, discountAmount, couponDiscount }
//   products: catálogo (para nombres si falta)
//   options: { exchangeRate, download=true, fileName }
export function generateSaleReceipt(sale, products = [], { exchangeRate = 1, download = true, fileName } = {}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const margin = 18;
  const rate = safeRate(sale.exchangeRate || exchangeRate);
  const productById = new Map(products.map(p => [p.id, p]));

  // ---- Header banda navy ----
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 42, "F");
  drawShield(doc, margin + 6, 12, 16, CREAM);
  doc.setTextColor(...CREAM);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("IMPORTS ZONA NORTE", margin + 22, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Comprobante de compra", margin + 22, 25);
  doc.setFontSize(8);
  doc.text("Vapes importados · Zona Norte, Buenos Aires", margin + 22, 31);

  let y = 56;

  // ---- Datos del recibo ----
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("RECIBO", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  const dateStr = new Date(sale.date || Date.now()).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
  doc.text(`Fecha: ${dateStr}`, W - margin, y, { align: "right" });
  y += 5;
  if (sale.clientName) {
    doc.text(`Cliente: ${sale.clientName}`, margin, y);
    y += 5;
  }
  if (sale.id) {
    doc.text(`N°: ${String(sale.id).slice(-6).toUpperCase()}`, W - margin, y - (sale.clientName ? 5 : 0), { align: "right" });
  }
  y += 4;

  // ---- Tabla de items ----
  doc.setFillColor(...NAVY);
  doc.rect(margin, y, W - margin * 2, 8, "F");
  doc.setTextColor(...CREAM);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Producto", margin + 3, y + 5.5);
  doc.text("Cant", W - margin - 50, y + 5.5, { align: "right" });
  doc.text("Precio", W - margin - 26, y + 5.5, { align: "right" });
  doc.text("Subtotal", W - margin - 3, y + 5.5, { align: "right" });
  y += 8;

  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "normal");
  const cur = sale.currency || "ARS";
  const toARS = (v) => (cur === "USD" || cur === "USDT") ? v * rate : v;
  (sale.items || []).forEach((it, i) => {
    if (y > 250) { doc.addPage(); y = margin; }
    const prod = productById.get(it.productId);
    const name = it.name || (prod ? `${prod.brand} ${prod.model} - ${prod.flavor}` : "Producto");
    const qty = Number(it.qty) || 1;
    const unit = Number(it.customPrice ?? it.priceARS) || 0;
    const unitARS = toARS(unit);
    const subtotal = unitARS * qty;
    if (i % 2 === 1) {
      doc.setFillColor(...CREAM);
      doc.rect(margin, y, W - margin * 2, 7, "F");
    }
    doc.setFontSize(9);
    doc.text(name.slice(0, 48), margin + 3, y + 5);
    doc.text(String(qty), W - margin - 50, y + 5, { align: "right" });
    doc.text(money(unitARS), W - margin - 26, y + 5, { align: "right" });
    doc.text(money(subtotal), W - margin - 3, y + 5, { align: "right" });
    y += 7;
  });

  // ---- Descuentos + total ----
  y += 4;
  const lineRight = (label, value, opts = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(opts.big ? 13 : 9);
    doc.setTextColor(...(opts.color || NAVY));
    doc.text(label, W - margin - 50, y, { align: "right" });
    doc.text(value, W - margin - 3, y, { align: "right" });
    y += opts.big ? 8 : 5.5;
  };
  if (sale.discountAmount > 0) lineRight("Descuento", `- ${money(toARS(sale.discountAmount))}`, { color: GRAY });
  if (sale.couponDiscount > 0) lineRight(`Cupón ${sale.couponCode || ""}`, `- ${money(toARS(sale.couponDiscount))}`, { color: GRAY });

  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.4);
  doc.line(W - margin - 60, y, W - margin, y);
  y += 6;
  lineRight("TOTAL", money(toARS(sale.total)), { bold: true, big: true, color: GREEN });

  // ---- Método de pago ----
  if (sale.payments && sale.payments.length > 0) {
    y += 2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    const methods = sale.payments.filter(p => p.method).map(p => p.method).join(", ");
    if (methods) doc.text(`Pago: ${methods}`, margin, y);
  }

  // ---- Footer ----
  doc.setFillColor(...CREAM);
  doc.rect(0, 277, W, 20, "F");
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("¡Gracias por tu compra! 💨", W / 2, 287, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text("Imports Zona Norte", W / 2, 292, { align: "center" });

  const name = fileName || `Recibo_${(sale.clientName || "venta").replace(/[^a-zA-Z0-9]/g, "_")}_${(sale.date || "").slice(0, 10)}.pdf`;
  if (download) {
    doc.save(name);
    return null;
  }
  return doc;
}
