import { useState, useEffect } from "react";
import { useLocalStorage } from "./hooks.js";
import { Dashboard } from "./components/Dashboard.jsx";
import { Products } from "./components/Products.jsx";
import { Sales } from "./components/Sales.jsx";
import { Purchases } from "./components/Purchases.jsx";
import { Expenses } from "./components/Expenses.jsx";
import { Reports } from "./components/Reports.jsx";
import { PriceLog } from "./components/PriceLog.jsx";
import { Partners } from "./components/Partners.jsx";
import { ExportData } from "./components/ExportData.jsx";
import { WhatsAppMessage } from "./components/WhatsApp.jsx";
import { Sidebar } from "./components/UI.jsx";

export default function App() {
  const [products, setProducts] = useLocalStorage("products", []);
  const [sales, setSales] = useLocalStorage("sales", []);
  const [purchases, setPurchases] = useLocalStorage("purchases", []);
  const [expenses, setExpenses] = useLocalStorage("expenses", []);
  const [withdrawals, setWithdrawals] = useLocalStorage("withdrawals", []);
  const [priceLog, setPriceLog] = useLocalStorage("priceLog", []);
  const [partnerWithdrawals, setPartnerWithdrawals] = useLocalStorage("partnerWithdrawals", []);
  const [exchangeRate, setExchangeRate] = useLocalStorage("exchangeRate", 1000);
  const [section, setSection] = useState("dashboard");
  const [user, setUser] = useState({ name: "Usuario" });

  const logPrice = (productId, oldPrice, newPrice, currency) => {
    setPriceLog(prev => [{ id: new Date().getTime(), productId, oldPrice, newPrice, currency, date: new Date().toISOString() }, ...prev]);
  };

  const sections = {
    dashboard: <Dashboard products={products} sales={sales} purchases={purchases} expenses={expenses} withdrawals={withdrawals} exchangeRate={exchangeRate} />,
    products: <Products products={products} setProducts={setProducts} exchangeRate={exchangeRate} />,
    sales: <Sales sales={sales} setSales={setSales} products={products} exchangeRate={exchangeRate} />,
    purchases: <Purchases purchases={purchases} setPurchases={setPurchases} products={products} exchangeRate={exchangeRate} />,
    expenses: <Expenses expenses={expenses} setExpenses={setExpenses} exchangeRate={exchangeRate} />,
    reports: <Reports products={products} sales={sales} purchases={purchases} expenses={expenses} withdrawals={withdrawals} exchangeRate={exchangeRate} />,
    prices: <PriceLog priceLog={priceLog} products={products} setProducts={setProducts} logPrice={logPrice} exchangeRate={exchangeRate} />,
    partners: <Partners partnerWithdrawals={partnerWithdrawals} setPartnerWithdrawals={setPartnerWithdrawals} sales={sales} purchases={purchases} expenses={expenses} withdrawals={withdrawals} exchangeRate={exchangeRate} currentUser={user} />,
    export: <ExportData products={products} sales={sales} purchases={purchases} expenses={expenses} withdrawals={withdrawals} exchangeRate={exchangeRate} />,
    whatsapp: <WhatsAppMessage products={products} exchangeRate={exchangeRate} />,
  };

  return (
    <div style={{ display: "flex", height: "100vh", background: "#f3f4f6" }}>
      <Sidebar section={section} setSection={setSection} exchangeRate={exchangeRate} setExchangeRate={setExchangeRate} />
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {sections[section]}
      </div>
    </div>
  );
}
