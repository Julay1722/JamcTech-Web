// Ventas — Lista + Nueva venta (multi-SKU + envío + gasto asociado) + Editar.
// FASE 4: transacción atómica de caja (VEN-1/VEN-2/VEN-4), gasto=DRAWDOWN si tarjeta.
export default function VentasPage({ period }) {
  return (
    <div>
      <div className="topbar"><div><h1>Ventas</h1><div className="sub">Período: {period}</div></div></div>
      <div className="section"><div className="empty">Ventas — pendiente de implementar (Fase 4)</div></div>
    </div>
  );
}
