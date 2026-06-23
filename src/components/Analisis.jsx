import { useState } from "react";
import { useResponsive } from "../App.jsx";
import { AnalysisSummary } from "./analisis/AnalysisSummary.jsx";
import { Finance } from "./Finance.jsx";
import { Reports } from "./Reports.jsx";
import { Partners } from "./Partners.jsx";
import { MonthlyClosures } from "./Closures.jsx";
import { FinanceProjections } from "./analisis/FinanceProjections.jsx";
import { AccountingPanel } from "./analisis/AccountingPanel.jsx";

// Hub "📊 Análisis" — consolida toda la visión financiera del negocio en
// un solo lugar con tabs. Los módulos existentes entran en modo embedded.
//
//   📊 Resumen     — panorama ejecutivo (nuevo)
//   📈 Resultados  — Finanzas (P&L, COGS, inventario, flujo de caja)
//   🛒 Reportes    — Reports (ventas x marca/canal, break-even, ABC)
//   💼 Patrimonio  — Socios (patrimonio del negocio + balance 50/50 por socio)
//   📅 Cierres     — Cierres mensuales
export const Analisis = (props) => {
  const {
    products, sales, purchases, expenses, withdrawals, clients = [],
    cashMovements = [], priceLog = [], partnerWithdrawals = [], setPartnerWithdrawals,
    monthlyClosures = [], setMonthlyClosures,
    exchangeRate, currentUser, logAudit,
  } = props;

  const { isMobile } = useResponsive();
  const [tab, setTab] = useState("summary");

  const TABS = [
    { key: "summary", label: "📊 Resumen" },
    { key: "projections", label: "📐 Proyecciones" },
    { key: "accounting", label: "🧾 Contabilidad" },
    { key: "results", label: "📈 Resultados" },
    { key: "reports", label: "🛒 Reportes" },
    { key: "patrimony", label: "💼 Patrimonio" },
    { key: "closures", label: "📅 Cierres" },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Header del hub */}
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, color: "#1E2B4A", margin: 0, letterSpacing: "-0.5px" }}>
          📊 Análisis
        </h1>
        <p style={{ color: "#6B7794", fontSize: 13, margin: "6px 0 0" }}>
          Toda la salud financiera del negocio en un lugar: resultados, ventas, patrimonio y cierres.
        </p>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 18,
        borderBottom: "1px solid #E5DAC2",
        overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none",
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: isMobile ? "10px 14px" : "12px 18px",
              background: "transparent",
              color: tab === t.key ? "#1E2B4A" : "#6B7794",
              border: "none",
              borderBottom: `3px solid ${tab === t.key ? "#1E2B4A" : "transparent"}`,
              borderRadius: 0,
              fontSize: isMobile ? 13 : 15, fontWeight: 800,
              cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
              marginBottom: -1, whiteSpace: "nowrap", flexShrink: 0, letterSpacing: "-0.2px",
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "summary" && (
        <AnalysisSummary
          sales={sales} purchases={purchases} expenses={expenses} withdrawals={withdrawals}
          products={products} clients={clients} exchangeRate={exchangeRate} onGoToTab={setTab}
        />
      )}
      {tab === "projections" && (
        <FinanceProjections
          sales={sales} purchases={purchases} expenses={expenses}
          products={products} exchangeRate={exchangeRate}
        />
      )}
      {tab === "accounting" && (
        <AccountingPanel
          sales={sales} purchases={purchases} expenses={expenses}
          withdrawals={withdrawals} products={products} clients={clients}
          exchangeRate={exchangeRate}
        />
      )}
      {tab === "results" && (
        <Finance
          sales={sales} purchases={purchases} expenses={expenses} withdrawals={withdrawals}
          products={products} exchangeRate={exchangeRate} embedded
        />
      )}
      {tab === "reports" && (
        <Reports
          products={products} sales={sales} purchases={purchases} expenses={expenses}
          withdrawals={withdrawals} clients={clients} priceLog={priceLog} embedded
        />
      )}
      {tab === "patrimony" && (
        <Partners
          partnerWithdrawals={partnerWithdrawals} setPartnerWithdrawals={setPartnerWithdrawals}
          sales={sales} purchases={purchases} expenses={expenses} withdrawals={withdrawals}
          products={products} cashMovements={cashMovements} clients={clients}
          exchangeRate={exchangeRate} currentUser={currentUser} logAudit={logAudit} embedded
        />
      )}
      {tab === "closures" && (
        <MonthlyClosures
          monthlyClosures={monthlyClosures} setMonthlyClosures={setMonthlyClosures}
          sales={sales} purchases={purchases} expenses={expenses} withdrawals={withdrawals}
          products={products} exchangeRate={exchangeRate} logAudit={logAudit} embedded
        />
      )}
    </div>
  );
};
