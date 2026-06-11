// ════════════════════════════════════════════════════════════════
// Alertas — centro de control. Tres focos:
//   1. SKUs en estado CRÍTICO (stock<=2) → pedir ahora.
//   2. SKUs en estado ATENCIÓN (stock<=5) → vigilar.
//   3. Próximas CUOTAS a pagar, leídas de la tabla real `data.cuotas`
//      (pagada=false, ordenadas por fechaPago).
//
// Reescritura del monolito (AlertasPage 8121-8411) reproduciendo la INTENCIÓN,
// NO los bugs (ver jamc-reglas / BUGS_DATOS.md):
//   - KPI-8: las cuotas próximas se leen de `data.cuotas` (schedule real),
//     NUNCA se proyectan por día-del-mes como hacía el monolito.
//   - DEU-2: pagar una cuota usa createPagoFinanciero con cuotaId → el writer
//     marca cuotas.pagada y liga el movimiento.
//   - El estado de SKU (critico/atencion) viene calculado en la vista de stock;
//     no se recalcula a mano. LEGACY-SALE no tiene esos estados → queda fuera.
// ════════════════════════════════════════════════════════════════
import { useMemo, useState } from 'react';
import { useData } from '../hooks/useData.jsx';
import { createPagoFinanciero } from '../lib/db/writers.js';
import { Modal } from '../components/Modal.jsx';
import { Field } from '../components/Form.jsx';
import { DataTable } from '../components/Table.jsx';
import { CuentaSelect } from '../components/Pickers.jsx';
import { KPI } from '../components/Charts.jsx';
import { useToast } from '../components/Toast.jsx';
import { money, intNum, fmtDate, todayISO, proximoDiaMesISO } from '../lib/format.js';
import { PagarPagoModal } from './Finanzas.jsx';

// Días entre hoy y una fecha ISO (negativo = ya vencida).
function diasHasta(iso) {
  if (!iso) return null;
  const hoy = new Date(todayISO() + 'T00:00:00');
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
  return Math.round((d - hoy) / 86400000);
}

// Badge de urgencia según días restantes.
function urgencia(iso) {
  const n = diasHasta(iso);
  if (n == null) return { cls: 'neutral', text: '—' };
  if (n < 0) return { cls: 'danger', text: `vencida ${-n}d` };
  if (n === 0) return { cls: 'danger', text: 'HOY' };
  if (n === 1) return { cls: 'warning', text: 'mañana' };
  if (n <= 7) return { cls: 'warning', text: `en ${n}d` };
  return { cls: 'neutral', text: `en ${n}d` };
}

export default function AlertasPage() {
  const data = useData();
  const { skus, prestamos, cuotas, loading } = data;
  const t = useToast();

  const [tab, setTab] = useState('cuotas'); // 'cuotas' | 'inventario'
  const [pagando, setPagando] = useState(null); // cuota seleccionada para pagar
  const [horizonte, setHorizonte] = useState(60); // días: solo cuotas que vencen dentro de este horizonte
  const [pagarPP, setPagarPP] = useState(null); // pago programado a pagar

  const m = useMemo(() => {
    // Estado de SKU ya viene calculado en la vista de stock (critico<=2, atencion<=5).
    // LEGACY-SALE no tiene estado 'critico'/'atencion', así que queda fuera natural.
    const criticos = skus.filter((s) => s.estado === 'critico');
    const atencion = skus.filter((s) => s.estado === 'atencion');

    // KPI-8: cuotas próximas = tabla real, NO proyección por día-del-mes.
    const prestamoNombre = (id) => prestamos.find((p) => p.id === id)?.nombre || '—';
    const proximas = (cuotas || [])
      .filter((c) => !c.pagada)
      .map((c) => ({ ...c, prestamoNombre: prestamoNombre(c.prestamoId), dias: diasHasta(c.fechaPago) }))
      .sort((a, b) => String(a.fechaPago).localeCompare(String(b.fechaPago)));

    const totalPorPagar = proximas.reduce((s, c) => s + c.montoTotal, 0);

    // Pagos próximos de crédito revolvente (tarjetas Y líneas) con saldo (usado>0)
    // y día de vencimiento. El pago vence en su día de vencimiento (que rueda al
    // mes siguiente si es menor que el día de corte — proximoDiaMesISO lo resuelve).
    // No es una cuota fija: se paga el saldo usado del ciclo. (Los préstamos
    // amortizados van por su schedule de cuotas, arriba.)
    const tarjetasPago = (prestamos || [])
      .filter((p) => (p.tipo === 'TARJETA_CREDITO' || p.tipo === 'LINEA_CREDITO') && p.diaVencimiento && p.usado > 0)
      .map((p) => {
        const iso = proximoDiaMesISO(p.diaVencimiento);
        return { ...p, proximoPago: iso, dias: diasHasta(iso) };
      })
      .sort((a, b) => (a.dias ?? 999) - (b.dias ?? 999));

    return { criticos, atencion, proximas, totalPorPagar, tarjetasPago };
  }, [skus, prestamos, cuotas]);

  const totalAlertas = m.criticos.length + m.atencion.length + m.proximas.length;

  // Horizonte: por defecto solo las cuotas que vencen pronto (no llenar la página
  // con las de 2027-2029). Siempre incluye las vencidas (dias < 0).
  const HORIZONTES = [{ d: 30, l: '30 días' }, { d: 60, l: '60 días' }, { d: 90, l: '90 días' }, { d: 99999, l: 'Todas' }];
  const proximasH = m.proximas.filter((c) => c.dias == null || c.dias <= horizonte);
  const porPagarH = proximasH.reduce((s, c) => s + c.montoTotal, 0);

  // Pagos programados (servicios fijos) activos, dentro del horizonte.
  const pagosProx = (data.pagosProgramados || [])
    .filter((p) => p.activa)
    .map((p) => ({ ...p, dias: diasHasta(p.proximaFecha) }))
    .sort((a, b) => (a.dias ?? 9999) - (b.dias ?? 9999));
  const pagosProxH = pagosProx.filter((p) => p.dias == null || p.dias <= horizonte);

  // ── Pago de cuota (DEU-2) ──
  const onPagar = async (cuentaId) => {
    const cuota = pagando;
    const prestamo = prestamos.find((p) => p.id === cuota.prestamoId);
    const tipoPago = prestamo?.tipo === 'LINEA_CREDITO' ? 'PAGO_LINEA_CREDITO'
      : prestamo?.tipo === 'TARJETA_CREDITO' ? 'PAGO_TARJETA_CREDITO' : 'PAGO_PRESTAMO';
    try {
      await createPagoFinanciero({
        fecha: todayISO(),
        monto: cuota.montoTotal,
        cuentaId,
        tipo: tipoPago,
        side: 'salida',
        prestamoId: cuota.prestamoId,
        cuotaId: cuota.id, // DEU-2 → marca la cuota pagada y liga el movimiento
        notas: `Pago cuota #${cuota.numero} · ${cuota.prestamoNombre}`,
      });
      await data.refreshAll();
      t.ok('Cuota pagada', `#${cuota.numero} · ${money(cuota.montoTotal)}`);
      setPagando(null);
    } catch (e) {
      t.err('No se pudo pagar', e.message);
    }
  };

  // ── Columnas tabla de cuotas ──
  const colsCuotas = [
    {
      key: 'urg', label: 'Cuándo',
      render: (c) => { const u = urgencia(c.fechaPago); return <span className={`badge ${u.cls}`}>{u.text}</span>; },
    },
    { key: 'fechaPago', label: 'Fecha', render: (c) => fmtDate(c.fechaPago) },
    { key: 'prestamoNombre', label: 'Préstamo' },
    { key: 'numero', label: 'Cuota', align: 'right', num: true, render: (c) => `#${c.numero}` },
    { key: 'capital', label: 'Capital', align: 'right', num: true, render: (c) => money(c.capital) },
    { key: 'interes', label: 'Interés', align: 'right', num: true, render: (c) => money(c.interes) },
    { key: 'montoTotal', label: 'Total', align: 'right', num: true, render: (c) => money(c.montoTotal) },
    {
      key: 'accion', label: '', align: 'right',
      render: (c) => (
        <button className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }}
                onClick={(e) => { e.stopPropagation(); setPagando(c); }}>
          Pagar
        </button>
      ),
    },
  ];

  // ── Columnas tablas de SKU (danger=crítico, sino=atención) ──
  const colsSku = (danger) => [
    {
      key: 'nombre', label: danger ? 'Crítico · pedir ahora' : 'Atención · vigilar',
      render: (s) => (<>{s.nombre} <span className="num muted" style={{ fontSize: 11 }}>{s.id}</span></>),
    },
    { key: 'categoria', label: 'Categoría', render: (s) => <span className="muted">{s.categoria}</span> },
    {
      key: 'stock', label: 'Stock', align: 'right', num: true,
      render: (s) => <span className={danger ? 'neg' : ''}>{intNum(s.stock)} ud</span>,
    },
    {
      key: 'enTransito', label: 'En camino', align: 'right', num: true,
      render: (s) => s.enTransito > 0
        ? <span style={{ color: 'var(--warning)' }}>{intNum(s.enTransito)} ud</span>
        : <span className="muted">—</span>,
    },
    { key: 'cpp', label: 'CPP', align: 'right', num: true, render: (s) => money(s.cpp) },
  ];

  if (loading) {
    return (
      <div>
        <div className="topbar"><div><h1>Alertas</h1><div className="sub">Cargando…</div></div></div>
        <div className="section"><div className="empty">Cargando datos…</div></div>
      </div>
    );
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Alertas</h1>
          <div className="sub">
            {totalAlertas} alerta{totalAlertas === 1 ? '' : 's'} activa{totalAlertas === 1 ? '' : 's'} · inventario y cuotas por pagar
          </div>
        </div>
      </div>

      <div className="kpi-row">
        <KPI label="SKUs críticos" value={intNum(m.criticos.length)}
             tone={m.criticos.length > 0 ? 'danger' : undefined} deltaLabel="stock ≤ 2 · pedir ya" />
        <KPI label="SKUs en atención" value={intNum(m.atencion.length)}
             tone={m.atencion.length > 0 ? 'warning' : undefined} deltaLabel="stock ≤ 5 · vigilar" />
        <KPI label="Cuotas próximas" value={intNum(proximasH.length)}
             tone={proximasH.length > 0 ? 'warning' : undefined} deltaLabel={horizonte > 9999 ? `todas · ${m.proximas.length} pendientes` : `próx. ${horizonte}d · de ${m.proximas.length} en total`} />
        <KPI label="Por pagar" currency value={intNum(porPagarH)}
             deltaLabel={horizonte > 9999 ? 'todas las cuotas pendientes' : `en próximos ${horizonte} días`} />
      </div>

      <div className="tabs">
        <button className={tab === 'cuotas' ? 'tab active' : 'tab'} onClick={() => setTab('cuotas')}>
          Cuotas por pagar {proximasH.length > 0 && <span className="badge warning" style={{ marginLeft: 6 }}>{proximasH.length}</span>}
        </button>
        <button className={tab === 'inventario' ? 'tab active' : 'tab'} onClick={() => setTab('inventario')}>
          Inventario {m.criticos.length > 0 && <span className="badge danger" style={{ marginLeft: 6 }}>{m.criticos.length}</span>}
        </button>
      </div>

      {tab === 'cuotas' && (
        <>
          <div className="section">
            <div className="section-head">
              <div>
                <div className="section-title">Próximas cuotas a pagar</div>
                <div className="section-desc">
                  {horizonte > 9999 ? 'Todas las cuotas pendientes' : `Cuotas que vencen en los próximos ${horizonte} días`} · marcar pagada actualiza la cuota y el banco
                </div>
              </div>
              <div className="chips">
                {HORIZONTES.map((h) => (
                  <button key={h.d} className={`chip ${horizonte === h.d ? 'active' : ''}`} onClick={() => setHorizonte(h.d)}>{h.l}</button>
                ))}
              </div>
            </div>
            <DataTable
              columns={colsCuotas}
              rows={proximasH}
              getRowKey={(c) => c.id}
              empty={m.proximas.length > 0 ? `Sin cuotas en los próximos ${horizonte} días · ${m.proximas.length} más adelante (ver "Todas").` : 'No hay cuotas pendientes. Todo al día.'}
            />
          </div>

          {m.tarjetasPago.length > 0 && (
            <div className="section">
              <div className="section-head">
                <div>
                  <div className="section-title">Pagos de tarjeta y línea próximos</div>
                  <div className="section-desc">
                    Tarjetas y líneas con saldo · el pago vence el día configurado (rueda al mes siguiente si vence antes del corte)
                  </div>
                </div>
                <span className="badge neutral">{m.tarjetasPago.length}</span>
              </div>
              <DataTable
                columns={[
                  { key: 'urg', label: 'Cuándo', render: (p) => { const u = urgencia(p.proximoPago); return <span className={`badge ${u.cls}`}>{u.text}</span>; } },
                  { key: 'fecha', label: 'Vence', render: (p) => fmtDate(p.proximoPago) },
                  { key: 'nombre', label: 'Producto', render: (p) => <>{p.nombre} <span className="muted" style={{ fontSize: 11 }}>{p.tipo === 'LINEA_CREDITO' ? 'línea' : 'tarjeta'}</span></> },
                  { key: 'corte', label: 'Corte', align: 'right', render: (p) => (p.diaCorte ? `día ${p.diaCorte}` : '—') },
                  { key: 'usado', label: 'Saldo a pagar', align: 'right', num: true, render: (p) => money(p.usado, p.moneda === 'USD' ? 'USD$' : 'RD$') },
                ]}
                rows={m.tarjetasPago}
                getRowKey={(p) => p.id}
                empty="Sin pagos de tarjeta próximos."
              />
            </div>
          )}

          {pagosProxH.length > 0 && (
            <div className="section">
              <div className="section-head">
                <div>
                  <div className="section-title">Pagos fijos próximos</div>
                  <div className="section-desc">Servicios fijos / recurrentes programados · "Pagar" registra el movimiento y avanza la fecha</div>
                </div>
                <span className="badge neutral">{pagosProxH.length}</span>
              </div>
              <DataTable
                columns={[
                  { key: 'urg', label: 'Cuándo', render: (p) => { const u = urgencia(p.proximaFecha); return <span className={`badge ${u.cls}`}>{u.text}</span>; } },
                  { key: 'fecha', label: 'Vence', render: (p) => fmtDate(p.proximaFecha) },
                  { key: 'concepto', label: 'Concepto' },
                  { key: 'frecuencia', label: 'Frecuencia', render: (p) => <span className="muted" style={{ fontSize: 11 }}>{p.frecuencia.toLowerCase()}</span> },
                  { key: 'monto', label: 'Monto', align: 'right', num: true, render: (p) => money(p.monto, p.moneda === 'USD' ? 'USD$' : 'RD$') },
                  { key: 'acc', label: '', align: 'right', render: (p) => <button className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => setPagarPP(p)}>Pagar</button> },
                ]}
                rows={pagosProxH}
                getRowKey={(p) => p.id}
                empty="Sin pagos fijos próximos."
              />
            </div>
          )}
        </>
      )}

      {tab === 'inventario' && (
        <>
          <div className="section">
            <div className="section-head">
              <div>
                <div className="section-title" style={{ color: 'var(--danger)' }}>Stock crítico</div>
                <div className="section-desc">Stock ≤ 2 unidades · pedir reposición ahora</div>
              </div>
              <span className="badge danger">{m.criticos.length}</span>
            </div>
            <DataTable
              columns={colsSku(true)}
              rows={m.criticos}
              getRowKey={(s) => s.id}
              empty="Ningún SKU en estado crítico."
            />
          </div>

          <div className="section">
            <div className="section-head">
              <div>
                <div className="section-title" style={{ color: 'var(--warning)' }}>Stock en atención</div>
                <div className="section-desc">Stock ≤ 5 unidades · vigilar, podría volverse crítico</div>
              </div>
              <span className="badge warning">{m.atencion.length}</span>
            </div>
            <DataTable
              columns={colsSku(false)}
              rows={m.atencion}
              getRowKey={(s) => s.id}
              empty="Ningún SKU en estado de atención."
            />
          </div>
        </>
      )}

      {pagando && (
        <PagoCuotaModal
          cuota={pagando}
          onClose={() => setPagando(null)}
          onConfirm={onPagar}
        />
      )}

      {pagarPP && <PagarPagoModal pago={pagarPP} onClose={() => setPagarPP(null)} />}
    </div>
  );
}

// ──────────── Modal: pagar cuota (DEU-2) ────────────
function PagoCuotaModal({ cuota, onClose, onConfirm }) {
  const [cuentaId, setCuentaId] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!cuentaId) return;
    setBusy(true);
    await onConfirm(cuentaId); // si tiene éxito, el padre cierra el modal (setPagando(null))
    setBusy(false);
  };

  return (
    <Modal title={`Pagar cuota #${cuota.numero}`} onClose={onClose} width={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div className="muted" style={{ fontSize: 13 }}>
          {cuota.prestamoNombre} · vence {fmtDate(cuota.fechaPago)}
        </div>

        <div className="grid-3" style={{ gap: 'var(--s-2)' }}>
          <Stat label="Capital" value={money(cuota.capital)} />
          <Stat label="Interés" value={money(cuota.interes)} />
          <Stat label="Seguro" value={money(cuota.seguro)} />
        </div>

        <div style={{
          padding: 'var(--s-2)', borderRadius: 6, background: 'var(--surface-2)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total a pagar</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600 }}>{money(cuota.montoTotal)}</span>
        </div>

        <Field label="Cuenta de pago" required hint="De qué cuenta sale el dinero">
          <CuentaSelect value={cuentaId} onChange={setCuentaId} filter="liquidas" />
        </Field>

        <div style={{ display: 'flex', gap: 'var(--s-2)', justifyContent: 'flex-end', marginTop: 'var(--s-2)' }}>
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn" onClick={submit} disabled={busy || !cuentaId}>
            {busy ? 'Pagando…' : 'Marcar pagada'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text-3)', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>{value}</div>
    </div>
  );
}
