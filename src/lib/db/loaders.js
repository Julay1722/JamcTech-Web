// ════════════════════════════════════════════════════════════════
// src/lib/db/loaders.js — Capa de LECTURA. Cada loader lee de las vistas
// vw_* (fuente de verdad) o tablas y devuelve un shape limpio que las
// páginas consumen vía useData. Sin globals window.__AIRTABLE_DATA__.
//
// Reglas aplicadas (ver jamc-reglas / BUGS_DATOS.md):
//  - KPIs/saldos leen UNA fuente de verdad (vistas vw_*).
//  - Stock total excluye LEGACY-SALE (KPI-1).
//  - Ganancia neta = facturado − costo − gastos asociados (regla 10).
// ════════════════════════════════════════════════════════════════
import { supabase, CAT_FROM_DB } from '../supabase.js';
import { num } from '../format.js';

/* ──────────── SKUs (vw_stock_sku + notas) ──────────── */
// estado: critico (<=2 y activo) / atencion (<=5) / ok / descontinuado.
export async function loadSKUs() {
  const [{ data: stock, error: e1 }, { data: meta, error: e2 }] = await Promise.all([
    supabase.from('vw_stock_sku').select('*'),
    supabase.from('skus').select('id_sku, notas, activa'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const metaById = Object.fromEntries((meta || []).map((s) => [s.id_sku, s]));
  return (stock || [])
    .filter((r) => r.id_sku !== 'LEGACY-SALE') // placeholder, no es un SKU real
    .map((r) => {
      const activa = metaById[r.id_sku]?.activa !== false;
      const s = num(r.stock_actual);
      let estado = 'ok';
      if (!activa) estado = 'descontinuado';
      else if (s <= 2) estado = 'critico';
      else if (s <= 5) estado = 'atencion';
      return {
        id: r.id_sku,
        nombre: r.nombre || '(sin nombre)',
        categoria: CAT_FROM_DB[r.categoria] || 'Otro',
        marca: r.marca || '—',
        modelo: r.modelo || '',
        color: r.color || '',
        cpp: num(r.cpp_actual),
        precioSugerido: num(r.precio_venta_sugerido),
        stock: s,
        recibidas: num(r.uds_recibidas),
        enTransito: num(r.uds_en_transito),
        vendidas: num(r.uds_vendidas),
        ingresos: num(r.ingresos_totales),
        ganancia: num(r.ganancia_total),
        activa,
        estado,
        notas: metaById[r.id_sku]?.notas || '',
      };
    });
}

/* ──────────── Ventas (ventas + items + canal + gastos asociados) ──────────── */
export async function loadVentas() {
  const { data, error } = await supabase
    .from('ventas')
    .select(`
      id, codigo, fecha, canal_id, cliente_nombre, envio_cobrado, descuento,
      total_facturado, total_ganancia, notas,
      canal:contrapartes!canal_id ( nombre ),
      ventas_items ( id, sku_id, cantidad, precio_unitario, cpp_historico, subtotal, ganancia_total )
    `)
    .order('fecha', { ascending: false })
    .order('id', { ascending: false })
    .limit(2000);
  if (error) throw error;

  // Gastos directos asociados a una venta (courier/comisión), pagados con
  // débito (salida>0) o cargados a tarjeta (entrada>0 DRAWDOWN). Ambos restan
  // de la ganancia neta. Identificados por nota "Asociado a venta {código}".
  const { data: gastos } = await supabase
    .from('movimientos')
    .select('entrada, salida, notas')
    .ilike('notas', '%Asociado a venta %');
  const gastoMap = {};
  (gastos || []).forEach((g) => {
    const m = (g.notas || '').match(/Asociado a venta (\S+)/);
    if (m) gastoMap[m[1]] = (gastoMap[m[1]] || 0) + num(g.salida) + num(g.entrada);
  });

  return (data || []).map((v) => {
    const items = v.ventas_items || [];
    const facturado = num(v.total_facturado);
    const baseCost = items.reduce((s, l) => s + num(l.cpp_historico) * num(l.cantidad), 0);
    const gananciaProducto = num(v.total_ganancia);
    const gasto = gastoMap[v.codigo] || 0;
    // Ganancia neta: si conocemos el costo real, = facturado − costo − gasto;
    // si no (legacy costo 0), neta = gananciaProducto − gasto.
    const gananciaNeta = baseCost > 0 ? facturado - baseCost - gasto : gananciaProducto - gasto;
    return {
      id: v.id,
      codigo: v.codigo,
      fecha: v.fecha,
      canal: v.canal?.nombre || '',
      canalId: v.canal_id,
      clienteNombre: v.cliente_nombre || '',
      envioCobrado: num(v.envio_cobrado),
      descuento: num(v.descuento),
      facturado,
      gananciaProducto,
      gananciaNeta,
      gastoAsociado: gasto,
      margenPct: facturado > 0 ? (gananciaNeta / facturado) * 100 : 0,
      notas: v.notas || '',
      lineas: items.map((l) => ({
        id: l.id,
        skuId: l.sku_id,
        cantidad: num(l.cantidad),
        precio: num(l.precio_unitario),
        cppHistorico: num(l.cpp_historico),
        subtotal: num(l.subtotal),
        gananciaTotal: num(l.ganancia_total),
      })),
    };
  });
}

/* ──────────── Lotes + entradas ──────────── */
export async function loadLotes() {
  const [{ data: entradas, error: e1 }, { data: skus }] = await Promise.all([
    supabase.from('entradas').select(`
      id, fecha, sku_id, status, cantidad, costo_unitario_base,
      costo_compartido_asignado, costo_unitario_total, lote_id, notas,
      lotes ( id, codigo, fecha_pedido, fecha_recibido, proveedor_id, status,
              costo_envio, costo_courier, costo_otros, costo_impuestos, moneda,
              proveedor:contrapartes!proveedor_id ( nombre ) )
    `).order('fecha', { ascending: false }),
    supabase.from('skus').select('id_sku, nombre'),
  ]);
  if (e1) throw e1;
  const skuName = Object.fromEntries((skus || []).map((s) => [s.id_sku, s.nombre]));

  const byKey = {};
  (entradas || []).forEach((e) => {
    const key = e.lote_id ? `L-${e.lote_id}` : `E-${e.id}`;
    const L = e.lotes;
    if (!byKey[key]) {
      byKey[key] = {
        key,
        loteId: e.lote_id || null,
        codigo: L ? (L.codigo || key) : key,
        fecha: L ? (L.fecha_pedido || e.fecha) : e.fecha,
        fechaRecibido: L?.fecha_recibido || null,
        status: L ? L.status : e.status,
        proveedor: L?.proveedor?.nombre || '',
        proveedorId: L?.proveedor_id || null,
        moneda: L?.moneda || 'RD',
        envio: num(L?.costo_envio),
        courier: num(L?.costo_courier),
        otros: num(L?.costo_otros),
        impuestos: num(L?.costo_impuestos),
        notas: e.notas || '',
        entradas: [],
      };
    }
    byKey[key].entradas.push({
      id: e.id,
      skuId: e.sku_id,
      skuNombre: skuName[e.sku_id] || e.sku_id,
      status: e.status,
      cantidad: num(e.cantidad),
      costoBase: num(e.costo_unitario_base),
      costoCompartido: num(e.costo_compartido_asignado),
      costoTotal: num(e.costo_unitario_total),
      notas: e.notas || '',
    });
  });
  return Object.values(byKey).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

/* ──────────── Movimientos (libro contable completo) ──────────── */
export async function loadMovimientos() {
  const { data, error } = await supabase
    .from('movimientos')
    .select(`
      id, fecha, tipo, entrada, salida, naturaleza, notas, monto_usd, tasa_cambio,
      venta_id, lote_id, prestamo_id, inversor_id, cuota_id, cuenta_destino_id,
      cuenta:cuentas!cuenta_id ( id, nombre ),
      contraparte:contrapartes!contraparte_id ( id, nombre )
    `)
    .order('fecha', { ascending: false })
    .order('id', { ascending: false })
    .limit(5000);
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    fecha: r.fecha,
    tipo: r.tipo,
    cuenta: r.cuenta?.nombre || '',
    cuentaId: r.cuenta?.id || null,
    contraparte: r.contraparte?.nombre || '',
    contraparteId: r.contraparte?.id || null,
    entrada: num(r.entrada),
    salida: num(r.salida),
    neto: num(r.entrada) - num(r.salida),
    naturaleza: r.naturaleza,
    notas: r.notas || '',
    montoUsd: r.monto_usd != null ? num(r.monto_usd) : null,
    tasaCambio: r.tasa_cambio != null ? num(r.tasa_cambio) : null,
    ventaId: r.venta_id,
    loteId: r.lote_id,
    prestamoId: r.prestamo_id,
    inversorId: r.inversor_id,
    cuotaId: r.cuota_id,
    cuentaDestinoId: r.cuenta_destino_id,
  }));
}

/* ──────────── Cuentas (vw_saldo_cuenta — fuente de verdad del saldo) ──────────── */
export async function loadCuentas() {
  const { data, error } = await supabase.from('vw_saldo_cuenta').select('*').order('id');
  if (error) throw error;
  return (data || []).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    tipo: c.tipo,
    moneda: c.moneda,
    limiteCredito: num(c.limite_credito),
    totalEntradas: num(c.total_entradas),
    totalSalidas: num(c.total_salidas),
    saldo: num(c.saldo_actual),
    creditoDisponible: num(c.credito_disponible),
    esLiquida: c.tipo === 'DEBITO' || c.tipo === 'EFECTIVO',
  }));
}

/* ──────────── Préstamos (vw_saldo_prestamo + prestamos meta) ──────────── */
export async function loadPrestamos() {
  const [{ data: saldos, error: e1 }, { data: meta, error: e2 }] = await Promise.all([
    supabase.from('vw_saldo_prestamo').select('*'),
    supabase.from('prestamos').select('*').eq('activa', true),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const metaById = Object.fromEntries((meta || []).map((p) => [p.id, p]));
  return (saldos || [])
    .filter((s) => metaById[s.id]) // solo activos
    .map((s) => {
      const m = metaById[s.id] || {};
      return {
        id: s.id,
        nombre: s.nombre,
        tipo: s.tipo, // PRESTAMO / LINEA_CREDITO / TARJETA_CREDITO
        montoInicial: num(s.monto_inicial),
        limiteCredito: num(s.limite_credito),
        tasaMensual: num(s.tasa_mensual),
        seguroMensual: num(m.seguro_mensual),
        plazoMeses: m.plazo_meses || null,
        capitalPagado: num(s.capital_pagado),
        interesPagado: num(s.interes_pagado),
        saldoPendiente: num(s.saldo_pendiente),
        moneda: m.moneda || 'RD',
        fechaInicio: m.fecha_inicio || '',
        fechaPrimerPago: m.fecha_primer_pago || '',
        diaCorte: m.dia_corte || null,
        diaVencimiento: m.dia_vencimiento || null,
        notas: m.notas || '',
        // "usado" de tarjeta/línea = el saldo pendiente (lo dispuesto sin pagar).
        usado: s.tipo === 'PRESTAMO' ? num(s.capital_pagado) : num(s.saldo_pendiente),
      };
    });
}

/* ──────────── Inversores (vw_saldo_inversor + inversores + compensaciones) ──────────── */
export async function loadInversores() {
  const [{ data: saldos, error: e1 }, { data: meta, error: e2 }, { data: comps, error: e3 }] = await Promise.all([
    supabase.from('vw_saldo_inversor').select('*'),
    supabase.from('inversores').select('*').eq('activa', true),
    supabase.from('compensaciones_inversor').select('*').eq('activa', true).order('id'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  const saldoById = Object.fromEntries((saldos || []).map((s) => [s.id, s]));
  const compsByInv = {};
  (comps || []).forEach((c) => {
    (compsByInv[c.inversor_id] ||= []).push({
      id: c.id,
      tipoCompensacion: c.tipo_compensacion,
      montoPactado: c.monto_pactado != null ? num(c.monto_pactado) : null,
      pctAplicado: c.pct_aplicado != null ? num(c.pct_aplicado) : null,
      cuotaMensual: c.cuota_mensual != null ? num(c.cuota_mensual) : null,
      bonusThreshold: c.bonus_threshold != null ? num(c.bonus_threshold) : null,
      capDevolver: c.cap_devolver != null ? num(c.cap_devolver) : null,
      montoPorUnidad: c.monto_por_unidad != null ? num(c.monto_por_unidad) : null,
      subordinaA: c.subordina_a || null,
      frecuencia: c.frecuencia || null,
      diaPago: c.dia_pago != null ? c.dia_pago : 17,
      fechaInicio: c.fecha_inicio || null,
      fechaFin: c.fecha_fin || null,
      notas: c.notas || '',
    });
  });
  return (meta || []).map((i) => {
    const s = saldoById[i.id] || {};
    return {
      id: i.id,
      nombre: i.nombre,
      contraparteId: i.contraparte_id,
      capitalInvertido: num(i.capital_invertido),
      montoPactadoDevolver: num(i.monto_pactado_devolver),
      totalDevuelto: num(s.total_devuelto),
      saldoPendiente: num(s.saldo_pendiente),
      fechaInicio: i.fecha_inicio || '',
      plazoMeses: i.plazo_meses || null,
      esDueno: !!i.es_dueno,
      tipoCompensacion: i.tipo_compensacion || 'FLAT',
      notas: i.notas || '',
      compensaciones: compsByInv[i.id] || [],
    };
  });
}

/* ──────────── Cuotas (schedule de préstamos) ──────────── */
export async function loadCuotas() {
  const { data, error } = await supabase
    .from('cuotas')
    .select('id, prestamo_id, numero, fecha_pago, capital, interes, seguro, abono_capital, monto_total, saldo_post, pagada, fecha_pagada, movimiento_id, notas')
    .order('prestamo_id', { ascending: true })
    .order('numero', { ascending: true });
  if (error) throw error;
  return (data || []).map((c) => ({
    id: c.id,
    prestamoId: c.prestamo_id,
    numero: c.numero,
    fechaPago: c.fecha_pago,
    capital: num(c.capital),
    interes: num(c.interes),
    seguro: num(c.seguro),
    abonoCapital: num(c.abono_capital),
    montoTotal: num(c.monto_total),
    saldoPost: c.saldo_post != null ? num(c.saldo_post) : null,
    pagada: !!c.pagada,
    fechaPagada: c.fecha_pagada || null,
    movimientoId: c.movimiento_id || null,
    notas: c.notas || '',
  }));
}

/* ──────────── Contrapartes (para los pickers: canal, proveedor, etc.) ──────────── */
export async function loadContrapartes() {
  const { data, error } = await supabase.from('contrapartes').select('id, nombre, tipo').order('id');
  if (error) throw error;
  return (data || []).map((c) => ({ id: c.id, nombre: c.nombre, tipo: c.tipo }));
}

/* ──────────── refreshAll: carga todo en paralelo ──────────── */
export async function loadAll() {
  const [skus, ventas, lotes, movimientos, cuentas, prestamos, inversores, cuotas, contrapartes] =
    await Promise.all([
      loadSKUs(), loadVentas(), loadLotes(), loadMovimientos(),
      loadCuentas(), loadPrestamos(), loadInversores(), loadCuotas(), loadContrapartes(),
    ]);
  return { skus, ventas, lotes, movimientos, cuentas, prestamos, inversores, cuotas, contrapartes };
}
