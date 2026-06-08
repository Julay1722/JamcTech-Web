// ════════════════════════════════════════════════════════════════
// MovForm — "Registrar movimiento" unificado (un solo form con chips de modo).
// Portado de la idea/UX de 1701 a la arquitectura 1722 (useData/useToast,
// componentes Form/Pickers, writers createMovimiento/createPagoFinanciero,
// shapes camelCase). Cubre 5 modos:
//   Gasto · Ingreso · Transferencia · Pago deuda · Pago inversor
//
// Reglas clave:
//  - CTA-1: siempre exige una cuenta real elegida; valida monto > 0.
//  - Regla 7: gasto pagado con tarjeta (CREDITO) → el MedioPagoSelect liga el
//    prestamo_id gemelo y createMovimiento lo registra como DRAWDOWN.
//  - APORTE_DUENO: liga inversor_id del dueño (inversores.find(i => i.esDueno)).
//  - Transferencia interna: una llamada a createMovimiento con cuentaDestinoId;
//    el writer crea las dos patas y valida origen != destino.
// ════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { useData } from '../../hooks/useData.jsx';
import { useToast } from '../Toast.jsx';
import { createMovimiento, createPagoFinanciero } from '../../lib/db/writers.js';
import { num, todayISO } from '../../lib/format.js';
import { Field, Select, MoneyInput, DateInput, TextArea } from '../Form.jsx';
import { CuentaSelect, MedioPagoSelect, PrestamoSelect, InversorSelect, ContraparteSelect } from '../Pickers.jsx';

const GASTO_TIPOS = [
  ['COMPRA_OPERATIVA', 'Compra operativa'],
  ['PAGO_ADS', 'Pago ADS'],
  ['PAGO_COMISION', 'Comisión'],
  ['PAGO_TRANSPORTE', 'Transporte/Courier'],
  ['FEE_BANCARIO', 'Fee bancario'],
  ['AJUSTE', 'Ajuste'],
  ['OTROS', 'Otro'],
];

const INGRESO_TIPOS = [
  ['APORTE_DUENO', 'Aporte del dueño'],
  ['REFUND_PROVEEDOR', 'Refund proveedor'],
  ['REFUND_CLIENTE', 'Refund cliente'],
  ['AJUSTE', 'Ajuste'],
  ['OTROS', 'Otro'],
];

const MODOS = [
  ['gasto', 'Gasto'],
  ['ingreso', 'Ingreso'],
  ['transferencia', 'Transferencia'],
  ['pago_deuda', 'Pago deuda'],
  ['pago_inversor', 'Pago inversor'],
];

const opts = (pares) => pares.map(([value, label]) => ({ value, label }));

// Tipo de pago financiero según el tipo del préstamo elegido.
function tipoPagoDeuda(prestamo) {
  if (!prestamo) return 'PAGO_PRESTAMO';
  if (prestamo.tipo === 'TARJETA_CREDITO') return 'PAGO_TARJETA_CREDITO';
  if (prestamo.tipo === 'LINEA_CREDITO') return 'PAGO_LINEA_CREDITO';
  return 'PAGO_PRESTAMO';
}

export default function MovForm({ onDone }) {
  const { prestamos, inversores, refreshAll } = useData();
  const toast = useToast();

  const [modo, setModo] = useState('gasto');
  const [busy, setBusy] = useState(false);

  // Estado del form. Cada modo usa el subconjunto que le aplica.
  const [fecha, setFecha] = useState(todayISO());
  const [monto, setMonto] = useState('');
  const [notas, setNotas] = useState('');

  // Gasto / Ingreso
  const [tipoGasto, setTipoGasto] = useState(GASTO_TIPOS[0][0]);
  const [tipoIngreso, setTipoIngreso] = useState(INGRESO_TIPOS[0][0]);
  const [medio, setMedio] = useState({ cuentaId: null, prestamoId: null }); // gasto (puede ser tarjeta → DRAWDOWN)
  const [cuentaIngresoId, setCuentaIngresoId] = useState(null); // ingreso (todas las cuentas)
  const [contraparteId, setContraparteId] = useState(null);

  // Transferencia
  const [origenId, setOrigenId] = useState(null);
  const [destinoId, setDestinoId] = useState(null);

  // Pago: cuenta de pago (líquida) + préstamo / inversor destino
  const [cuentaPagoId, setCuentaPagoId] = useState(null);
  const [prestamoId, setPrestamoId] = useState(null);
  const [inversorId, setInversorId] = useState(null);

  const montoNum = num(monto);
  const montoOk = montoNum > 0;

  function reset() {
    setMonto('');
    setNotas('');
    setContraparteId(null);
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (!montoOk) { toast.err('Monto inválido', 'El monto debe ser mayor que 0.'); return; }

    setBusy(true);
    try {
      if (modo === 'gasto') {
        if (!medio.cuentaId) throw new Error('Selecciona el medio de pago.');
        // Si medio.prestamoId viene ligado (tarjeta), createMovimiento lo hace DRAWDOWN (regla 7).
        await createMovimiento({
          fecha, tipo: tipoGasto,
          cuentaId: medio.cuentaId,
          prestamoId: medio.prestamoId || null,
          salida: montoNum,
          contraparteId: contraparteId || null,
          notas,
        });
        toast.ok('Gasto registrado');
      } else if (modo === 'ingreso') {
        if (!cuentaIngresoId) throw new Error('Selecciona la cuenta.');
        const row = {
          fecha, tipo: tipoIngreso,
          cuentaId: cuentaIngresoId,
          entrada: montoNum,
          contraparteId: contraparteId || null,
          notas,
        };
        if (tipoIngreso === 'APORTE_DUENO') {
          const dueno = (inversores || []).find((i) => i.esDueno);
          if (dueno) row.inversorId = dueno.id;
        }
        await createMovimiento(row);
        toast.ok('Ingreso registrado');
      } else if (modo === 'transferencia') {
        if (!origenId) throw new Error('Selecciona la cuenta origen.');
        if (!destinoId) throw new Error('Selecciona la cuenta destino.');
        if (origenId === destinoId) throw new Error('Origen y destino deben ser distintos.');
        await createMovimiento({
          fecha, tipo: 'TRANSFERENCIA_INTERNA',
          cuentaId: origenId,
          cuentaDestinoId: destinoId,
          monto: montoNum,
          notas,
        });
        toast.ok('Transferencia registrada');
      } else if (modo === 'pago_deuda') {
        if (!prestamoId) throw new Error('Selecciona el préstamo o tarjeta.');
        if (!cuentaPagoId) throw new Error('Selecciona la cuenta de pago.');
        const prestamo = (prestamos || []).find((p) => p.id === prestamoId);
        await createPagoFinanciero({
          fecha, monto: montoNum,
          cuentaId: cuentaPagoId,
          tipo: tipoPagoDeuda(prestamo),
          side: 'salida',
          prestamoId,
          notas: notas || `Pago ${prestamo?.nombre || 'deuda'}`,
        });
        toast.ok('Pago de deuda registrado');
      } else if (modo === 'pago_inversor') {
        if (!inversorId) throw new Error('Selecciona el inversor.');
        if (!cuentaPagoId) throw new Error('Selecciona la cuenta de pago.');
        const inv = (inversores || []).find((i) => i.id === inversorId);
        await createPagoFinanciero({
          fecha, monto: montoNum,
          cuentaId: cuentaPagoId,
          tipo: 'PAGO_INVERSOR',
          side: 'salida',
          inversorId,
          notas: notas || `Pago a ${inv?.nombre || 'inversor'}`,
        });
        toast.ok('Pago a inversor registrado');
      }

      await refreshAll();
      reset();
      onDone?.();
    } catch (err) {
      toast.err('No se pudo registrar', err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="chips" style={{ marginBottom: 14 }}>
        {MODOS.map(([k, label]) => (
          <button
            type="button"
            key={k}
            className={`chip ${modo === k ? 'active' : ''}`}
            onClick={() => setModo(k)}
            disabled={busy}
          >
            {label}
          </button>
        ))}
      </div>

      <Field label="Fecha" required>
        <DateInput value={fecha} onChange={setFecha} />
      </Field>

      {modo === 'gasto' && (
        <>
          <Field label="Concepto" required>
            <Select value={tipoGasto} onChange={setTipoGasto} options={opts(GASTO_TIPOS)} />
          </Field>
          <Field label="Medio de pago" hint="Si elegís una tarjeta, el gasto se registra como DRAWDOWN." required>
            <MedioPagoSelect value={medio} onChange={setMedio} invalid={!medio.cuentaId} />
          </Field>
          <Field label="Monto (RD$)" required>
            <MoneyInput value={monto} onChange={setMonto} min="0" invalid={!montoOk} placeholder="0.00" />
          </Field>
          <Field label="Contraparte (opcional)">
            <ContraparteSelect value={contraparteId} onChange={setContraparteId} incluirTodas placeholder="— ninguna —" />
          </Field>
        </>
      )}

      {modo === 'ingreso' && (
        <>
          <Field label="Concepto" required>
            <Select value={tipoIngreso} onChange={setTipoIngreso} options={opts(INGRESO_TIPOS)} />
          </Field>
          <Field label="Cuenta" required>
            <CuentaSelect value={cuentaIngresoId} onChange={setCuentaIngresoId} filter="todas" invalid={!cuentaIngresoId} />
          </Field>
          <Field label="Monto (RD$)" required>
            <MoneyInput value={monto} onChange={setMonto} min="0" invalid={!montoOk} placeholder="0.00" />
          </Field>
          <Field label="Contraparte (opcional)">
            <ContraparteSelect value={contraparteId} onChange={setContraparteId} incluirTodas placeholder="— ninguna —" />
          </Field>
        </>
      )}

      {modo === 'transferencia' && (
        <>
          <Field label="Cuenta origen" required>
            <CuentaSelect value={origenId} onChange={setOrigenId} filter="liquidas" invalid={!origenId} />
          </Field>
          <Field label="Cuenta destino" required>
            <CuentaSelect value={destinoId} onChange={setDestinoId} filter="liquidas" invalid={!destinoId || destinoId === origenId} />
          </Field>
          <Field label="Monto (RD$)" required>
            <MoneyInput value={monto} onChange={setMonto} min="0" invalid={!montoOk} placeholder="0.00" />
          </Field>
        </>
      )}

      {modo === 'pago_deuda' && (
        <>
          <Field label="Préstamo / tarjeta" required>
            <PrestamoSelect value={prestamoId} onChange={setPrestamoId} invalid={!prestamoId} />
          </Field>
          <Field label="Cuenta de pago" required>
            <CuentaSelect value={cuentaPagoId} onChange={setCuentaPagoId} filter="liquidas" invalid={!cuentaPagoId} />
          </Field>
          <Field label="Monto (RD$)" required>
            <MoneyInput value={monto} onChange={setMonto} min="0" invalid={!montoOk} placeholder="0.00" />
          </Field>
        </>
      )}

      {modo === 'pago_inversor' && (
        <>
          <Field label="Inversor" required>
            <InversorSelect value={inversorId} onChange={setInversorId} invalid={!inversorId} />
          </Field>
          <Field label="Cuenta de pago" required>
            <CuentaSelect value={cuentaPagoId} onChange={setCuentaPagoId} filter="liquidas" invalid={!cuentaPagoId} />
          </Field>
          <Field label="Monto (RD$)" required>
            <MoneyInput value={monto} onChange={setMonto} min="0" invalid={!montoOk} placeholder="0.00" />
          </Field>
        </>
      )}

      <Field label="Notas (opcional)">
        <TextArea value={notas} onChange={setNotas} rows={2} placeholder="Detalle del movimiento…" />
      </Field>

      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={() => onDone?.()} disabled={busy}>Cancelar</button>
        <button type="submit" className="btn" disabled={busy || !montoOk}>
          {busy ? 'Guardando…' : 'Registrar'}
        </button>
      </div>
    </form>
  );
}
