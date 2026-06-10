// src/lib/storyImageGenerator.js
//
// Genera una imagen PNG 1080×1920 (formato Stories de Instagram/WhatsApp)
// usando HTML5 Canvas. Devuelve un Blob descargable.
//
// Estilo: fondo navy IZN, logo arriba, hasta 4 productos destacados con
// precios, footer con IG y teléfono.

const W = 1080;
const H = 1920;
const NAVY = "#1E2B4A";
const CREAM = "#F8F2E7";
const ACCENT = "#0F7B6C";
const SOFT = "rgba(248,242,231,0.65)";

function moneyShort(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString("es-AR")}`;
}

// Dibuja el escudo IZN (vectorial, igual al LogoMark de la app)
function drawLogo(ctx, cx, cy, scale = 1) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  ctx.strokeStyle = CREAM;
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Escudo (relativo a centro 0,0)
  ctx.beginPath();
  ctx.moveTo(0, -50);
  ctx.lineTo(45, -34);
  ctx.lineTo(45, 0);
  ctx.bezierCurveTo(45, 30, 25, 50, 0, 60);
  ctx.bezierCurveTo(-25, 50, -45, 30, -45, 0);
  ctx.lineTo(-45, -34);
  ctx.closePath();
  ctx.stroke();

  // Vape body
  ctx.fillStyle = CREAM;
  ctx.fillRect(-9, -10, 18, 40);
  ctx.fillRect(-7, -22, 14, 12);
  // Línea separadora
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-9, 0);
  ctx.lineTo(9, 0);
  ctx.stroke();

  ctx.restore();
}

// Crea un canvas off-screen y genera el PNG.
// products: array de objetos producto (con priceUSD/priceARS/brand/model/flavor/stock)
// opts: { title, headline, exchangeRate, footerLine }
export async function generateStoryImage(products = [], opts = {}) {
  const {
    title = "Stock disponible",
    headline = "",
    exchangeRate = 1,
    footerLine = "📲 11 6872 5293  ·  IG @imports.zonanorte",
  } = opts;

  // En tests, OffscreenCanvas no existe — devolvemos null y el componente
  // simplemente no muestra el botón. Esto NO es un bug, es defensive.
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Fondo
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, NAVY);
  grad.addColorStop(1, "#2D3D63");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Logo top center
  drawLogo(ctx, W / 2, 180, 1.6);

  // Brand text
  ctx.fillStyle = CREAM;
  ctx.font = "900 70px Inter, -apple-system, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("IMPORTS", W / 2, 320);
  ctx.font = "700 36px Inter, -apple-system, system-ui, sans-serif";
  ctx.letterSpacing = "0.16em";
  ctx.fillText("ZONA NORTE", W / 2, 370);

  // Línea divisoria
  ctx.strokeStyle = SOFT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(140, 430);
  ctx.lineTo(W - 140, 430);
  ctx.stroke();

  // Título / headline
  ctx.fillStyle = CREAM;
  ctx.font = "800 56px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(title.toUpperCase(), W / 2, 520);

  if (headline) {
    ctx.font = "500 32px Inter, system-ui, sans-serif";
    ctx.fillStyle = SOFT;
    ctx.fillText(headline, W / 2, 580);
  }

  // Lista de productos (máx 4 para que entren cómodos)
  const list = (products || []).slice(0, 4);
  const startY = 700;
  const rowH = 220;

  list.forEach((p, i) => {
    const y = startY + i * rowH;

    // Caja blanca con borde redondeado (rectángulo simple si no hay roundRect)
    ctx.fillStyle = "rgba(248,242,231,0.10)";
    ctx.strokeStyle = SOFT;
    ctx.lineWidth = 2;
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(80, y, W - 160, rowH - 30, 24);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(80, y, W - 160, rowH - 30);
      ctx.strokeRect(80, y, W - 160, rowH - 30);
    }

    // Brand
    ctx.fillStyle = SOFT;
    ctx.font = "700 26px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText((p.brand || "").toUpperCase(), 120, y + 50);

    // Model + flavor (truncado)
    ctx.fillStyle = CREAM;
    ctx.font = "800 42px Inter, system-ui, sans-serif";
    const name = `${p.model || ""} · ${p.flavor || ""}`.trim();
    const truncated = name.length > 28 ? name.slice(0, 27) + "…" : name;
    ctx.fillText(truncated, 120, y + 105);

    // Puffs
    if (p.puffs) {
      ctx.fillStyle = SOFT;
      ctx.font = "500 24px Inter, system-ui, sans-serif";
      ctx.fillText(`${Number(p.puffs).toLocaleString("es-AR")} puffs`, 120, y + 145);
    }

    // Precio (derecha)
    const priceARS = Number(p.priceARS) || (Number(p.priceUSD) || 0) * exchangeRate;
    ctx.fillStyle = "#7BFFD9";
    ctx.font = "900 52px Inter, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(moneyShort(priceARS), W - 120, y + 110);
  });

  // Footer (sticky abajo)
  ctx.fillStyle = SOFT;
  ctx.font = "600 28px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(footerLine, W / 2, H - 90);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png", 0.95);
  });
}

// Trigger de descarga del blob como archivo .png
export function downloadBlob(blob, filename = "izn-stories.png") {
  if (!blob || typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Liberar después de unos segundos para asegurar que el download arrancó
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
