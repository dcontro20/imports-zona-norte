// Helpers compartidos entre Clients.jsx y sus sub-componentes.

export const resolveItemName = (item, productsById) => {
  if (item.name) return item.name;
  if (item.productName) return item.productName;
  const p = item.productId ? productsById[item.productId] : null;
  if (p) return `${p.brand} ${p.model} - ${p.flavor}`;
  return "Producto eliminado";
};

export const digitsOnly = (s) => String(s || "").replace(/\D/g, "");
export const isValidPhone = (s) => digitsOnly(s).length >= 10;
export const cleanIG = (s) =>
  String(s || "").replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, "").trim();

export const monthLabel = (k) => {
  const [y, m] = k.split("-");
  return new Date(+y, +m - 1, 1).toLocaleDateString("es-AR", { month: "short" });
};
