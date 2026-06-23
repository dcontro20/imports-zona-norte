import { useMemo, useState, useRef } from "react";
import { useResponsive } from "../../App.jsx";
import { formatMoney } from "../../helpers.js";
import { Card, Btn } from "../UI.jsx";
import { generateIncomeStatement, generateBalanceSheet, generateCashFlow } from "../../lib/financialStatements.js";
import { ACCOUNTS } from "../../lib/chartOfAccounts.js";
import { parseBankCSV, reconcileBank } from "../../lib/reconciliation.js";
import { calcWarrantyRate, warrantyProvisionForPeriod } from "../../lib/warrantyProvision.js";
import { downloadFiscalReport } from "../../lib/fiscalReport.js";

// Sección de contabilidad formal: P&L + Balance + Cash Flow + Conciliación + Provisión garantías
export function AccountingPanel({ sales = [], purchases = [], expenses = [], withdrawals = [], products = [], clients = [], exchangeRate = 1 }) {
  const { isMobile } = useResponsive();
  const now = new Date();

  // Período por defecto: este mes
  const yyyymm = now.toISOString().slice(0, 7);
  const monthStart = `${yyyymm}-01`;
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(monthEnd);

  // Estados financieros
  const incomeStmt = useMemo(
    () => generateIncomeStatement({ sales, expenses, withdrawals, products, from, to, exchangeRate }),
    [sales, expenses, withdrawals, products, from, to, exchangeRate]
  );

  const balance = useMemo(
    () => generateBalanceSheet({ products, clients, cashARS: 0, exchangeRate, asOf: new Date(to) }),
    // cashARS = 0 hasta que conectemos con CashBox real
    [products, clients, exchangeRate, to]
  );

  const cashFlow = useMemo(
    () => generateCashFlow({ sales, expenses, purchases, from, to, exchangeRate }),
    [sales, expenses, purchases, from, to, exchangeRate]
  );

  // Garantías
  const warrantyRate = useMemo(
    () => calcWarrantyRate({ sales, withdrawals, exchangeRate, monthsBack: 6, now }),
    [sales, withdrawals, exchangeRate]
  );
  const warrantyProv = useMemo(
    () => warrantyProvisionForPeriod({ sales, withdrawals, from, to, exchangeRate, ratePct: warrantyRate.ratePct }),
    [sales, withdrawals, from, to, exchangeRate, warrantyRate.ratePct]
  );

  // Conciliación bancaria
  const fileInputRef = useRef(null);
  const [reconcileResult, setReconcileResult] = useState(null);
  const [reconcileMethod, setReconcileMethod] = useState("Mercado Pago");
  const handleCSVUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const bankMovements = parseBankCSV(text);
    if (bankMovements.length === 0) {
      alert("No se pudo parsear el CSV. Formato esperado: date,amount,description en la primera línea.");
      return;
    }
    const result = reconcileBank({ bankMovements, sales, paymentMethod: reconcileMethod, exchangeRate });
    setReconcileResult(result);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Header con selector de período */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#1E2B4A" }}>📐 Estados Contables Formales</div>
            <div style={{ fontSize: 11, color: "#6B7794", marginTop: 2 }}>
              Formato tipo PCGA para presentar a contador externo o llevar registro profesional.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={dateInput} />
            <span style={{ color: "#6B7794", fontSize: 12 }}>a</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={dateInput} />
            <Btn onClick={() => downloadFiscalReport({
              sales, expenses, withdrawals, products,
              from, to, exchangeRate,
            })}>📥 Exportar CSV para contador</Btn>
          </div>
        </div>
      </Card>

      {/* === 1. ESTADO DE RESULTADOS === */}
      <Card>
        <SectionTitle icon="📈" title="Estado de Resultados (P&L)" />
        <table style={tableStyle}>
          <tbody>
            <Row label="(+) Ingresos por ventas" value={incomeStmt.income.revenue} />
            <Row label="(−) Costo de mercadería vendida (COGS)" value={-incomeStmt.cogs} />
            <Subtotal label="Margen bruto" value={incomeStmt.grossProfit} subtitle={`(${incomeStmt.grossMarginPct}%)`} />
            <Row label="(−) Gastos operativos" value={-incomeStmt.opex.total} bold />
            {incomeStmt.opex.lines.map(l => (
              <Row key={l.code} label={`     · ${l.name}`} value={-l.amount} small />
            ))}
            <Row label="(−) Mermas" value={-incomeStmt.shrinkage.total} bold />
            {incomeStmt.shrinkage.lines.map(l => (
              <Row key={l.code} label={`     · ${l.name}`} value={-l.amount} small />
            ))}
            <Total label="Resultado neto del período" value={incomeStmt.netResult} subtitle={`(margen neto ${incomeStmt.netMarginPct}%)`} />
          </tbody>
        </table>
      </Card>

      {/* === 2. BALANCE GENERAL === */}
      <Card>
        <SectionTitle icon="⚖️" title={`Balance General (al ${balance.asOf})`} />
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12 }}>
          {/* ACTIVO */}
          <div>
            <ColumnHeader>ACTIVO</ColumnHeader>
            <table style={tableStyle}>
              <tbody>
                <Row label="Caja (todas las monedas)" value={balance.assets.current.cash} small />
                <Row label="Cuentas a cobrar" value={balance.assets.current.accountsReceivable} small />
                <Row label="Bienes de cambio (stock)" value={balance.assets.current.inventory} small />
                <Total label="Total Activo" value={balance.assets.total} />
              </tbody>
            </table>
          </div>
          {/* PASIVO */}
          <div>
            <ColumnHeader>PASIVO</ColumnHeader>
            <table style={tableStyle}>
              <tbody>
                <Row label="Créditos a clientes (vuelto)" value={balance.liabilities.current.clientCreditsOwed} small />
                <Total label="Total Pasivo" value={balance.liabilities.total} />
              </tbody>
            </table>
          </div>
          {/* PATRIMONIO */}
          <div>
            <ColumnHeader>PATRIMONIO</ColumnHeader>
            <table style={tableStyle}>
              <tbody>
                <Total label="Patrimonio neto" value={balance.equity} subtitle="Activo − Pasivo" />
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#6B7794", marginTop: 10 }}>
          ⚠️ El cálculo de caja usa $0 como base hasta que conectemos los saldos reales de CashBox.
        </div>
      </Card>

      {/* === 3. ESTADO DE FLUJO DE EFECTIVO === */}
      <Card>
        <SectionTitle icon="💵" title="Estado de Flujo de Efectivo (operativo)" />
        <table style={tableStyle}>
          <tbody>
            <Row label="(+) Cobros de ventas" value={cashFlow.operating.inflows.salesCollections} />
            <Row label="(−) Pagos a proveedores (compras verificadas)" value={-cashFlow.operating.outflows.toSuppliers} />
            <Row label="(−) Gastos operativos" value={-cashFlow.operating.outflows.operatingExpenses} />
            <Total label="Flujo neto del período" value={cashFlow.netCashFlow} />
          </tbody>
        </table>
      </Card>

      {/* === 4. PROVISIÓN PARA GARANTÍAS === */}
      <Card>
        <SectionTitle icon="🛡️" title="Provisión para garantías" />
        <div style={{ fontSize: 12, color: "#6B7794", marginBottom: 10 }}>
          Tasa histórica de garantías (últimos 6 meses):{" "}
          <strong style={{ color: "#1E2B4A" }}>{warrantyRate.ratePct}%</strong>
          {" "}sobre revenue. Esta es la reserva sugerida del período.
        </div>
        <table style={tableStyle}>
          <tbody>
            <Row label="Revenue del período" value={warrantyProv.revenueARS} small />
            <Row label={`Provisión sugerida (${warrantyProv.ratePct}%)`} value={warrantyProv.provisionARS} bold />
            <Row label="Garantías reales del período" value={warrantyProv.actualWarrantyARS} small />
            <Subtotal
              label={warrantyProv.status === "deficit" ? "⚠️ Déficit (reservaste de menos)" :
                     warrantyProv.status === "sobra" ? "✓ Sobra (reservaste de más)" : "Exacto"}
              value={warrantyProv.diff}
              negative={warrantyProv.diff < 0}
            />
          </tbody>
        </table>
      </Card>

      {/* === 5. CONCILIACIÓN BANCARIA === */}
      <Card>
        <SectionTitle icon="🔄" title="Conciliación bancaria" />
        <div style={{ fontSize: 12, color: "#6B7794", marginBottom: 12 }}>
          Subí el CSV de movimientos de tu cuenta (MP / Lemon). El sistema matchea
          contra tus ventas por monto + fecha y muestra qué quedó sin match.
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <select value={reconcileMethod} onChange={e => setReconcileMethod(e.target.value)}
            style={{ ...dateInput, minWidth: 160 }}>
            <option>Mercado Pago</option>
            <option>Lemon</option>
            <option>USDT</option>
          </select>
          <input type="file" accept=".csv" ref={fileInputRef} onChange={handleCSVUpload}
            style={{ display: "none" }} />
          <Btn onClick={() => fileInputRef.current?.click()}>📁 Subir CSV</Btn>
          {reconcileResult && (
            <button onClick={() => setReconcileResult(null)} style={{
              padding: "6px 12px", background: "transparent", border: "1px solid #E5DAC2",
              borderRadius: 8, fontSize: 12, color: "#6B7794", cursor: "pointer",
            }}>Limpiar</button>
          )}
        </div>

        {reconcileResult && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 10, marginBottom: 12 }}>
              <MiniStat label="Movimientos banco" value={reconcileResult.summary.bankCount} />
              <MiniStat label="Matcheados" value={reconcileResult.summary.matchedCount}
                color={reconcileResult.summary.matchRate >= 80 ? "#0F6B5C" : "#CB912F"}
                sub={`${reconcileResult.summary.matchRate}%`} />
              <MiniStat label="Sin match (banco)" value={reconcileResult.unmatched_bank.length}
                color={reconcileResult.unmatched_bank.length > 0 ? "#B83232" : "#0F6B5C"} />
              <MiniStat label="Sin match (ventas)" value={reconcileResult.unmatched_sales.length}
                color={reconcileResult.unmatched_sales.length > 0 ? "#CB912F" : "#0F6B5C"} />
            </div>
            <div style={{ fontSize: 12, color: "#6B7794" }}>
              Diferencia total: <strong style={{ color: reconcileResult.summary.diffARS === 0 ? "#0F6B5C" : "#B83232" }}>
                {formatMoney(reconcileResult.summary.diffARS)}
              </strong>
            </div>
            {reconcileResult.unmatched_bank.length > 0 && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, color: "#B83232", fontWeight: 700 }}>
                  ▶ Ver {reconcileResult.unmatched_bank.length} movimiento{reconcileResult.unmatched_bank.length > 1 ? "s" : ""} sin venta correspondiente
                </summary>
                <table style={tableStyle}>
                  <tbody>
                    {reconcileResult.unmatched_bank.slice(0, 20).map(b => (
                      <tr key={b.id}>
                        <td style={{ padding: "6px 8px", fontSize: 12 }}>{b.date}</td>
                        <td style={{ padding: "6px 8px", fontSize: 12 }}>{b.description}</td>
                        <td style={{ padding: "6px 8px", fontSize: 12, textAlign: "right", color: "#B83232", fontWeight: 700 }}>
                          {formatMoney(b.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
            {reconcileResult.unmatched_sales.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, color: "#CB912F", fontWeight: 700 }}>
                  ▶ Ver {reconcileResult.unmatched_sales.length} venta{reconcileResult.unmatched_sales.length > 1 ? "s" : ""} sin movimiento bancario
                </summary>
                <table style={tableStyle}>
                  <tbody>
                    {reconcileResult.unmatched_sales.slice(0, 20).map(s => (
                      <tr key={s.id}>
                        <td style={{ padding: "6px 8px", fontSize: 12 }}>{s.date}</td>
                        <td style={{ padding: "6px 8px", fontSize: 12 }}>{s.clientName}</td>
                        <td style={{ padding: "6px 8px", fontSize: 12, textAlign: "right", color: "#CB912F", fontWeight: 700 }}>
                          {formatMoney(s.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// === Helpers ===

function SectionTitle({ icon, title }) {
  return <div style={{ fontSize: 14, fontWeight: 800, color: "#1E2B4A", marginBottom: 12 }}>{icon} {title}</div>;
}

function ColumnHeader({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 800, color: "#6B7794", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>{children}</div>;
}

const tableStyle = { width: "100%", borderCollapse: "collapse", fontSize: 13 };

function Row({ label, value, bold = false, small = false }) {
  return (
    <tr style={{ borderBottom: "1px solid #EFE5CE" }}>
      <td style={{ padding: small ? "4px 8px" : "6px 8px", fontSize: small ? 11 : 13, fontWeight: bold ? 700 : 400, color: "#1E2B4A" }}>{label}</td>
      <td style={{ padding: small ? "4px 8px" : "6px 8px", textAlign: "right", fontSize: small ? 11 : 13, fontWeight: bold ? 700 : 500, color: value < 0 ? "#B83232" : "#1E2B4A" }}>
        {formatMoney(value)}
      </td>
    </tr>
  );
}

function Subtotal({ label, value, subtitle, negative }) {
  return (
    <tr style={{ borderTop: "2px solid #E5DAC2", borderBottom: "1px solid #E5DAC2", background: "#F8F2E7" }}>
      <td style={{ padding: "8px", fontSize: 13, fontWeight: 700, color: "#1E2B4A" }}>
        {label} {subtitle && <span style={{ color: "#6B7794", fontWeight: 400, fontSize: 11 }}>{subtitle}</span>}
      </td>
      <td style={{ padding: "8px", textAlign: "right", fontSize: 14, fontWeight: 800, color: negative ? "#B83232" : "#0F6B5C" }}>
        {formatMoney(value)}
      </td>
    </tr>
  );
}

function Total({ label, value, subtitle }) {
  const positive = value >= 0;
  return (
    <tr style={{ borderTop: "3px double #1E2B4A" }}>
      <td style={{ padding: "10px 8px", fontSize: 14, fontWeight: 800, color: "#1E2B4A" }}>
        {label} {subtitle && <span style={{ color: "#6B7794", fontWeight: 400, fontSize: 11 }}>{subtitle}</span>}
      </td>
      <td style={{ padding: "10px 8px", textAlign: "right", fontSize: 16, fontWeight: 800, color: positive ? "#0F6B5C" : "#B83232" }}>
        {formatMoney(value)}
      </td>
    </tr>
  );
}

function MiniStat({ label, value, sub, color }) {
  return (
    <div style={{ padding: "10px 12px", background: "#F8F2E7", border: "1px solid #EFE5CE", borderRadius: 10 }}>
      <div style={{ fontSize: 10, color: "#6B7794", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || "#1E2B4A", marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#9AA2B3", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const dateInput = {
  padding: "10px 12px", fontSize: 16, border: "1px solid #E5DAC2",
  borderRadius: 8, background: "#FFF", outline: "none", minHeight: 44,
  boxSizing: "border-box",
};
