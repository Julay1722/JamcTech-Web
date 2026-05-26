'use strict';
/* ════════════════════════════════════════════════════════════════
   supabase-client.js — Cliente Supabase (drop-in replacement de
   airtable-client.js).

   Carga datos de Supabase y los expone en `window.AT_CLIENT` +
   `window.__AIRTABLE_DATA__` con el MISMO shape que airtable-client.js.
   Los paneles consumen esos globals + el event 'airtable-loaded'
   sin enterarse del cambio de backend.

   FASE 1+2: solo lecturas (loaders). Writers en próxima entrega.

   Dependencia: window.supabase (cargar el UMD de @supabase/supabase-js@2
   ANTES que este script en index.html).

   Para rollback: en index.html, comentar la línea de este script y
   descomentar la de airtable-client.js. Nada más.
   ════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = 'https://oicxvnnzocwnqlsojhco.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pY3h2bm56b2N3bnFsc29qaGNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NTAzMzUsImV4cCI6MjA5NTMyNjMzNX0.rX41-VWKdon-3XuMCrpGhEJG-mXY7Dpl74AdoMWAUYk';

if (!window.supabase || !window.supabase.createClient) {
  throw new Error('[SB] window.supabase no está disponible — falta cargar @supabase/supabase-js@2 antes de este script.');
}

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.SB = sb;

if (!window.__AIRTABLE_DATA__) window.__AIRTABLE_DATA__ = {};

function _dispatch(table, count) {
  window.dispatchEvent(new CustomEvent('airtable-loaded', { detail: { table, count } }));
}
function _dispatchError(table, error) {
  window.dispatchEvent(new CustomEvent('airtable-error', { detail: { table, error } }));
}

/* ──── Mapeos enum Supabase → display que esperan los paneles ──── */

// skus.categoria enum (UPPERCASE en Supabase) → label que usa el dashboard
const CAT_MAP = {
  MOUSE:     'Mouse',
  TECLADO:   'Teclado',
  HEADSET:   'Headset',
  STAND:     'Otro',
  MOUSE_PAD: 'Otro',
};

// movimientos.tipo enum → string amigable que esperan los panels (mismo set
// que usaba la tabla Cashflow en Airtable, columna 'Cuenta').
const TIPO_MAP = {
  VENTA:                 'Venta de mercancia',
  ENVIO_COBRADO:         'Envio cobrado',
  COMPRA_MERCANCIA:      'Compra de mercancia',
  COMPRA_OPERATIVA:      'Compra operativa',
  ENVIO_LOTE:            'Pago Envio',
  PAGO_PRESTAMO:         'Pago Prestamo',
  PAGO_LINEA_CREDITO:    'Pago Linea de Credito',
  PAGO_TARJETA_CREDITO:  'Cuentas por pagar',
  PAGO_INTERESES:        'Intereses',
  PAGO_ADS:              'Pago ADS',
  PAGO_COMISION:         'Pago Comision',
  PAGO_INVERSOR:         'Pago a Inversores',
  PAGO_TRANSPORTE:       'Courier',
  APORTE_DUENO:          'Aportes para negocio',
  APORTE_INVERSOR:       'Aportes para negocio',
  DRAWDOWN:              'Otro',
  FEE_BANCARIO:          'Otro',
  TRANSFERENCIA_INTERNA: 'Transferencia',
  REFUND_PROVEEDOR:      'Otro',
  REFUND_CLIENTE:        'Otro',
  AJUSTE:                'Otro',
  OTROS:                 'Otro',
};

// movimientos.tipo enum → MOVFIN_TIPOS (los valores singleSelect de Airtable
// movFin). Solo aplica a movimientos con naturaleza='FINANCIERO'.
const MOVFIN_DISPLAY = {
  PAGO_PRESTAMO:        'Cuota Préstamo',
  PAGO_LINEA_CREDITO:   'Pago Línea',
  PAGO_TARJETA_CREDITO: 'Pago Línea',
  PAGO_INVERSOR:        'Retorno Inversor',
  PAGO_INTERESES:       'Cargo Línea',
  APORTE_INVERSOR:      'Depósito Inversor',
  DRAWDOWN:             'Disposición Línea',
  FEE_BANCARIO:         'Cargo Línea',
};

// entradas.status enum → label del dashboard (header de lote)
const STATUS_MAP = {
  PENDIENTE: 'En Camino',
  RECIBIDO:  'Recibido',
  PERDIDO:   'Perdido',
};

/* ════════════════════════ LOADERS ════════════════════════ */

// ── SKUs ────────────────────────────────────────────────────────
// Lee vw_stock_sku (que ya trae stock + en_transito + vendido + CPP) y
// junta con `skus` para sacar `notas` + `activa`. Sobrescribe los globals
// window.VENTAS_SKU / window.EN_CAMINO con datos reales para que buildSK()
// (en data.js, no se toca) consuma valores actualizados.
async function loadSKUs() {
  try {
    const [{ data: stockRows, error: e1 }, { data: skuRows, error: e2 }] = await Promise.all([
      sb.from('vw_stock_sku').select('*'),
      sb.from('skus').select('id_sku, notas, activa'),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;

    const meta = Object.fromEntries((skuRows || []).map((s) => [s.id_sku, s]));

    const mapped = (stockRows || [])
      .filter((r) => meta[r.id_sku]?.activa !== false)
      .map((r) => ({
        _airtableId: r.id_sku,
        id:          r.id_sku,
        nm:          r.nombre || '(sin nombre)',
        mk:          r.marca  || '—',
        modelo:      r.modelo || '',
        color:       r.color  || '',
        cat:         CAT_MAP[r.categoria] || 'Otro',
        s:           parseFloat(r.stock_actual)        || 0,
        cpp:         parseFloat(r.cpp_actual)          || 0,
        pv:          parseFloat(r.precio_venta_sugerido) || 0,
        min:         0,
        vendido:     parseFloat(r.uds_vendidas)        || 0,
        recibido:    parseFloat(r.uds_recibidas)       || 0,
        enCamino:    parseFloat(r.uds_en_transito)     || 0,
        ajuste:      0,
        numVentas:   0,
        ingresosTotales: parseFloat(r.ingresos_totales) || 0,
        gananciaTotal:   parseFloat(r.ganancia_total)   || 0,
        notas:       meta[r.id_sku]?.notas || '',
        _unmapped:   [],
      }));

    // Sobrescribe los globals que consume buildSK() en data.js (sin tocar data.js).
    // Sin esto, buildSK pisa s.vendido / s.enCamino con los valores hardcoded jul-2025.
    const ventasSku = {};
    const enCamino  = {};
    mapped.forEach((s) => {
      if (s.vendido  > 0) ventasSku[s.id] = s.vendido;
      if (s.enCamino > 0) enCamino[s.id]  = s.enCamino;
    });
    window.VENTAS_SKU = ventasSku;
    window.EN_CAMINO  = enCamino;

    window.__AIRTABLE_DATA__.skus = mapped;
    _dispatch('skus', mapped.length);
    console.log(`✓ [SB/skus] ${mapped.length} SKUs activos cargados desde Supabase`);
    return mapped;
  } catch (e) {
    console.error('✕ [SB/skus] falló:', e.message);
    window.__AIRTABLE_DATA__.skusError = e.message;
    _dispatchError('skus', e.message);
    return null;
  }
}

// ── Ventas ──────────────────────────────────────────────────────
// Pull headers + items + canal join. Produce mismo shape que airtable:
//   ventasRaw = [líneas planas con idVenta padre]
//   ventas    = [headers agrupados con lineas[]]
//   ventasCF  = [cf rows sintéticos para el tail del cashflow]
async function loadVentas() {
  try {
    const { data, error } = await sb
      .from('ventas')
      .select(`
        id, codigo, fecha, canal_id, envio_cobrado, descuento,
        total_facturado, total_ganancia, notas,
        canal:contrapartes!canal_id ( nombre ),
        ventas_items (
          id, sku_id, cantidad, precio_unitario, cpp_historico,
          subtotal, ganancia_unitaria, ganancia_total, margen_pct
        )
      `)
      .order('fecha', { ascending: false })
      .limit(2000);
    if (error) throw error;

    const ventas = (data || []).map((v) => {
      const items = v.ventas_items || [];
      const baseCostTotal = items.reduce(
        (sum, l) => sum + (parseFloat(l.cpp_historico) || 0) * (parseFloat(l.cantidad) || 0),
        0,
      );
      const cantidadTotal = items.reduce((sum, l) => sum + (parseFloat(l.cantidad) || 0), 0);
      const gananciaTotal = parseFloat(v.total_ganancia) || 0;
      const facturado     = parseFloat(v.total_facturado) || 0;
      return {
        _airtableId:    'v-' + v.id,
        idVenta:        v.codigo,
        fecha:          v.fecha,
        canal:          v.canal?.nombre || '',
        envio:          parseFloat(v.envio_cobrado) || 0,
        notas:          v.notas || '',
        precioFacturadoTotal: facturado,
        baseCostTotal,
        gananciaTotal,
        cantidadTotal,
        margenPct:      facturado > 0 ? (gananciaTotal / facturado) * 100 : 0,
        lineas: items.map((l) => ({
          _airtableId: 'vi-' + l.id,
          skuRef:      l.sku_id,
          skuLinked:   l.sku_id,
          qty:         parseFloat(l.cantidad) || 0,
          costoUd:     parseFloat(l.cpp_historico) || 0,
          ganancia:    parseFloat(l.ganancia_total) || 0,
          baseCost:    (parseFloat(l.cpp_historico) || 0) * (parseFloat(l.cantidad) || 0),
        })),
      };
    });

    // Lineas planas (mismo shape que ventasRaw de airtable)
    const lineas = [];
    ventas.forEach((v) => {
      v.lineas.forEach((l) => {
        lineas.push({
          _airtableId: l._airtableId,
          idVenta:     v.idVenta,
          fecha:       v.fecha,
          skuRef:      l.skuRef,
          cantidad:    l.qty,
          facturado:   v.precioFacturadoTotal,
          envio:       v.envio,
          canal:       v.canal,
          costoUd:     l.costoUd,
          ganancia:    l.ganancia,
        });
      });
    });

    // CF rows sintéticos (el panel de cashflow histórico los mergea
    // con el cashflow real para mostrar ventas en el tail)
    const cfRows = ventas.map((v) => ({
      f: v.fecha,
      c: 'Venta de mercancia',
      a: v.canal || '',
      e: v.precioFacturadoTotal,
      s: 0,
      _src:     'supabase · venta',
      _ventaId: v.idVenta,
    }));

    window.__AIRTABLE_DATA__.ventasRaw = lineas;
    window.__AIRTABLE_DATA__.ventas    = ventas;
    window.__AIRTABLE_DATA__.ventasCF  = cfRows;
    _dispatch('ventas', ventas.length);
    console.log(`✓ [SB/ventas] ${lineas.length} líneas · ${ventas.length} ventas agrupadas`);
    return { lineas, ventas, cfRows };
  } catch (e) {
    console.error('✕ [SB/ventas] falló:', e.message);
    window.__AIRTABLE_DATA__.ventasError = e.message;
    _dispatchError('ventas', e.message);
    return null;
  }
}

// ── Entradas (lotes) ────────────────────────────────────────────
// Si entrada.lote_id es NULL (V2.1 no modelaba lotes — todas las entradas
// actuales son sueltas), tratamos cada entrada como su propio "lote" de
// una línea. Cuando Julio empiece a usar lotes reales, el agrupamiento
// por lote_id se activa automáticamente.
async function loadEntradas() {
  try {
    const [{ data: entradas, error: e1 }, { data: skuRows }] = await Promise.all([
      sb.from('entradas').select(`
        id, fecha, sku_id, status, cantidad,
        costo_unitario_base, costo_compartido_asignado, costo_unitario_total,
        lote_id, notas,
        lotes (
          id, codigo, fecha_pedido, fecha_recibido, proveedor_id,
          costo_envio, costo_courier, costo_otros, costo_impuestos,
          proveedor:contrapartes!proveedor_id ( nombre )
        )
      `).order('fecha', { ascending: false }),
      sb.from('skus').select('id_sku, nombre'),
    ]);
    if (e1) throw e1;
    const skuName = Object.fromEntries((skuRows || []).map((s) => [s.id_sku, s.nombre]));

    const byId  = {};
    const lineas = [];
    (entradas || []).forEach((e) => {
      const loteKey = e.lote_id ? `L-${e.lote_id}` : `E-${e.id}`;
      lineas.push({
        _airtableId: 'e-' + e.id,
        idEntrada:   e.id,
        loteId:      loteKey,
        fecha:       e.fecha,
        skuRef:      e.sku_id,
        status:      STATUS_MAP[e.status] || 'En Camino',
        cantidad:    parseFloat(e.cantidad) || 0,
        costoBase:   parseFloat(e.costo_unitario_base) || 0,
        envio: 0, courier: 0, otros: 0, impuestos: 0,
        notas:       e.notas || '',
      });
      if (!byId[loteKey]) {
        const L = e.lotes;
        byId[loteKey] = {
          id:        L ? (L.codigo || loteKey) : loteKey,
          _loteIdNum: e.lote_id || null,
          fecha:     L ? (L.fecha_pedido || e.fecha) : e.fecha,
          status:    STATUS_MAP[e.status] || 'En Camino',
          proveedor: L ? (L.proveedor?.nombre || '') : '',
          envio:     L ? (parseFloat(L.costo_envio)     || 0) : 0,
          courier:   L ? (parseFloat(L.costo_courier)   || 0) : 0,
          otros:     L ? (parseFloat(L.costo_otros)     || 0) : 0,
          impuestos: L ? (parseFloat(L.costo_impuestos) || 0) : 0,
          nota:      e.notas || '',
          skus:      [],
          pendiente: [],
        };
      }
      byId[loteKey].skus.push({
        _airtableId: 'e-' + e.id,
        id:          e.sku_id,
        nm:          skuName[e.sku_id] || e.sku_id,
        qty:         parseFloat(e.cantidad) || 0,
        costoUd:     parseFloat(e.costo_unitario_base) || 0,
      });
    });

    Object.values(byId).forEach((g) => {
      if (g.envio   === 0) g.pendiente.push('envio');
      if (g.courier === 0) g.pendiente.push('courier');
      if (g.otros   === 0) g.pendiente.push('otros');
    });

    const lotes = Object.values(byId).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    window.__AIRTABLE_DATA__.entradasRaw = lineas;
    window.__AIRTABLE_DATA__.lotes       = lotes;
    _dispatch('entradas', lotes.length);
    console.log(`✓ [SB/entradas] ${lineas.length} entradas · ${lotes.length} lotes`);
    return { lineas, lotes };
  } catch (e) {
    console.error('✕ [SB/entradas] falló:', e.message);
    window.__AIRTABLE_DATA__.entradasError = e.message;
    _dispatchError('entradas', e.message);
    return null;
  }
}

// ── Cashflow ────────────────────────────────────────────────────
async function loadCashflow() {
  try {
    const { data, error } = await sb
      .from('vw_cashflow')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(2000);
    if (error) throw error;
    const cf = (data || []).map((r) => ({
      f:   r.fecha,
      c:   TIPO_MAP[r.tipo] || r.tipo || 'Otro',
      a:   r.contraparte || '',
      e:   parseFloat(r.entrada) || 0,
      s:   parseFloat(r.salida)  || 0,
      _src:        'supabase · cf',
      _origen:     r.cuenta,
      _airtableId: 'cf-' + r.id,
    }));
    window.__AIRTABLE_DATA__.cashflow = cf;
    _dispatch('cashflow', cf.length);
    console.log(`✓ [SB/cashflow] ${cf.length} movimientos`);
    return cf;
  } catch (e) {
    console.error('✕ [SB/cashflow] falló:', e.message);
    window.__AIRTABLE_DATA__.cashflowError = e.message;
    _dispatchError('cashflow', e.message);
    return null;
  }
}

// ── Financiero (productos: préstamo/línea/tarjeta + inversores) ──
async function loadFinanciero() {
  try {
    const [{ data: prestamos, error: e1 }, { data: inversores, error: e2 }] = await Promise.all([
      sb.from('prestamos').select('*').eq('activa', true),
      sb.from('inversores').select('*').eq('activa', true),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;

    const tipoLabel = {
      PRESTAMO:        'Préstamo',
      LINEA_CREDITO:   'Línea de Crédito',
      TARJETA_CREDITO: 'Tarjeta de Crédito',
    };

    const fin = [];
    (prestamos || []).forEach((p) => {
      fin.push({
        _airtableId:   'p-' + p.id,
        idFin:         'FIN-P-' + p.id,
        tipo:          tipoLabel[p.tipo] || p.tipo,
        nombre:        p.nombre,
        montoTotal:    parseFloat(p.monto_inicial || p.limite_credito) || 0,
        totalPagado:   0,         // se completa en _buildProductos post-cashflow
        tasaMensual:   parseFloat(p.tasa_mensual)   || 0,
        seguroMensual: parseFloat(p.seguro_mensual) || 0,
        fechaInicio:   p.fecha_inicio || '',
        notas:         p.notas || '',
        balance:       0,         // se completa en _buildProductos
      });
    });
    (inversores || []).forEach((i) => {
      fin.push({
        _airtableId:   'i-' + i.id,
        idFin:         'FIN-I-' + i.id,
        tipo:          'Inversor',
        nombre:        i.nombre,
        montoTotal:    parseFloat(i.capital_invertido) || 0,
        totalPagado:   0,
        tasaMensual:   0,
        seguroMensual: 0,
        fechaInicio:   i.fecha_inicio || '',
        notas:         i.notas || '',
        balance:       parseFloat(i.monto_pactado_devolver) || 0,
      });
    });

    window.__AIRTABLE_DATA__.financiero = fin;
    _dispatch('financiero', fin.length);
    console.log(`✓ [SB/financiero] ${fin.length} productos (${(prestamos || []).length} préstamos + ${(inversores || []).length} inversores)`);
    return fin;
  } catch (e) {
    console.error('✕ [SB/financiero] falló:', e.message);
    window.__AIRTABLE_DATA__.financieroError = e.message;
    _dispatchError('financiero', e.message);
    return null;
  }
}

// ── Resumen mensual ─────────────────────────────────────────────
// No hay tabla resumen_mensual en Supabase. El dashboard ya tiene un
// fallback al array MES hardcodeado en data.js para el bloque "Detalle
// Mensual P&L". Aquí solo emitimos el evento con count=0 para no
// bloquear la UI.
async function loadResumen() {
  window.__AIRTABLE_DATA__.resumen = [];
  _dispatch('resumen', 0);
  console.log('· [SB/resumen] sin tabla resumen_mensual — usando MES hardcoded de data.js');
  return [];
}

// ── MovFin (movimientos financieros) ─────────────────────────────
// Lee vw_financiero (movimientos con naturaleza='FINANCIERO'). Para
// poder linkear cada mov con su productoFin (préstamo/inversor), exige
// que loadFinanciero() haya corrido antes.
async function loadMovFin() {
  try {
    const { data, error } = await sb
      .from('vw_financiero')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(2000);
    if (error) throw error;

    const fin = window.__AIRTABLE_DATA__.financiero || [];
    const finByName = Object.fromEntries(fin.map((f) => [f.nombre, f]));

    const movs = (data || []).map((m) => {
      const prod = finByName[m.prestamo] || null;
      const monto = (parseFloat(m.salida) || 0) || (parseFloat(m.entrada) || 0);
      return {
        _airtableId: 'mf-' + m.id,
        idMov:       'MF-' + m.id,
        tipo:        MOVFIN_DISPLAY[m.tipo] || 'Otro',
        fecha:       m.fecha,
        monto:       monto,
        capital:     0,
        interes:     0,
        seguro:      0,
        comision:    0,
        mora:        0,
        cuentaBanco: m.cuenta || '',
        notas:       m.notas || '',
        productoFinAirtableId: prod?._airtableId || null,
        productoFinId:         prod?.idFin       || '',
        productoFinName:       m.prestamo        || '',
      };
    });

    window.__AIRTABLE_DATA__.movFin = movs;
    _dispatch('movFin', movs.length);
    console.log(`✓ [SB/movFin] ${movs.length} movimientos financieros`);
    return movs;
  } catch (e) {
    console.error('✕ [SB/movFin] falló:', e.message);
    window.__AIRTABLE_DATA__.movFinError = e.message;
    _dispatchError('movFin', e.message);
    return null;
  }
}

/* ──── Consumer: financiero × cashflow → productos del panel ────
   Reproduce _buildFinancieroProductos() de airtable-client. Agrupa los
   movimientos cashflow por categoría → cada producto financiero recibe
   su lista de movimientos para mostrar en FinProductoPanel.            */
function _buildFinancieroProductos() {
  const fin = window.__AIRTABLE_DATA__.financiero || [];
  const cf  = window.__AIRTABLE_DATA__.cashflow   || [];
  const productos = { 'FIN-P': [], 'FIN-I': [], 'FIN-LC': [] };

  fin.forEach((r) => {
    const t = (r.tipo || '').toLowerCase();
    const base = {
      _airtableId: r._airtableId,
      id:          r.idFin,
      nombre:      r.nombre,
      fechaInicio: r.fechaInicio,
      nota:        r.notas,
      movimientos: [],
    };
    if (t.includes('préstamo') || t.includes('prestamo')) {
      const pagosCF = cf.filter((m) => m.c === 'Pago Prestamo');
      const pagado  = pagosCF.reduce((sum, m) => sum + (m.s || 0), 0);
      productos['FIN-P'].push({
        ...base,
        tipoSub:      'Cooperativa',
        monto:        r.montoTotal,
        saldo:        Math.max(0, r.montoTotal - pagado),
        pagado,
        tasa:         r.tasaMensual,
        cuota:        0,
        seguro:       r.seguroMensual,
        abonoMin5pct: Math.max(0, r.montoTotal - pagado) * 0.05,
        abonoAcum:    0,
        movimientos:  pagosCF.map((m) => ({
          id:      'pp-' + m._airtableId,
          fecha:   m.f,
          tipo:    'cuota',
          monto:   m.s || 0,
          capital: 0, interes: 0, seguro: 0, abono: 0,
          nota:    m.a || '',
        })),
      });
    } else if (t.includes('inversor')) {
      const pagosCF = cf.filter((m) => m.c === 'Pago a Inversores');
      const pagado  = pagosCF.reduce((sum, m) => sum + (m.s || 0), 0);
      productos['FIN-I'].push({
        ...base,
        tipoSub:   'Inversor 2×',
        aporte:    r.montoTotal,
        retorno:   r.balance,
        pagado,
        pendiente: r.balance - pagado,
        meta:      48,
        movimientos: pagosCF.map((m) => ({
          id:    'pi-' + m._airtableId,
          fecha: m.f,
          tipo:  'pago',
          monto: m.s || 0,
          nota:  m.a || '',
        })),
      });
    } else if (t.includes('línea') || t.includes('linea') || t.includes('crédito') || t.includes('credito') || t.includes('tarjeta')) {
      const movsLC = cf.filter((m) =>
        m.a && (
          m.a.toLowerCase().includes('bhd') ||
          m.a.toLowerCase().includes((r.nombre || '').toLowerCase())
        )
      );
      const usado = movsLC.reduce((sum, m) => sum + (m.e || 0) - (m.s || 0), 0);
      productos['FIN-LC'].push({
        ...base,
        tipoSub:     'Línea Revolvente',
        moneda:      'DOP',
        limite:      r.montoTotal,
        usado:       Math.max(0, usado),
        tasaAnual:   (r.tasaMensual || 0) * 12,
        tasaMensual: r.tasaMensual,
        movimientos: movsLC.map((m) => ({
          id:        'lc-' + m._airtableId,
          fecha:     m.f,
          tipo:      m.e > 0 ? 'cargo' : 'pago',
          categoria: m.c === 'Intereses' ? 'interes' : 'otro',
          monto:     Math.abs(m.e || m.s || 0),
          nota:      m.c,
        })),
      });
    }
  });

  window.__AIRTABLE_DATA__.productos = productos;
  _dispatch('productos', fin.length);
  console.log(`✓ [SB/productos] ${productos['FIN-P'].length} préstamos · ${productos['FIN-I'].length} inversores · ${productos['FIN-LC'].length} líneas/tarjetas`);
}

let _finReady = false, _cfReady = false;
window.addEventListener('airtable-loaded', (e) => {
  if (e.detail?.table === 'financiero') _finReady = true;
  if (e.detail?.table === 'cashflow')   _cfReady  = true;
  if (_finReady && _cfReady) _buildFinancieroProductos();
});

/* ════════════════════════ Exports + boot ════════════════════════ */

window.AT_CLIENT = window.AT_CLIENT || {};
Object.assign(window.AT_CLIENT, {
  loadSKUs, loadVentas, loadEntradas, loadCashflow,
  loadFinanciero, loadResumen, loadMovFin,
  // Constantes de compat (los formularios las leen para validar enums)
  SKU_CATEGORIAS: ['Mouse', 'Teclado', 'Headset', 'Otro'],
  MOVFIN_TIPOS: [
    'Cuota Préstamo', 'Abono Préstamo',
    'Disposición Línea', 'Pago Línea', 'Cargo Línea',
    'Depósito Inversor', 'Retorno Inversor', 'Otro',
  ],
});

async function _bootCheck() {
  console.group('[SB] verificando conexión a Supabase...');
  try {
    const { error } = await sb.from('skus').select('id_sku').limit(1);
    if (error) throw error;
    console.log(`✓ conexión OK · ${SUPABASE_URL}`);
    console.log('▸ usa SB.from("tabla").select() desde la consola para explorar.');
  } catch (e) {
    console.error('✕ conexión falló:', e.message);
  }
  console.groupEnd();
}

// loadFinanciero antes que loadMovFin (este último necesita el cache
// para mapear m.prestamo → idFin).
setTimeout(_bootCheck,                                       100);
setTimeout(loadSKUs,                                         150);
setTimeout(loadVentas,                                       200);
setTimeout(loadEntradas,                                     250);
setTimeout(loadCashflow,                                     300);
setTimeout(async () => { await loadFinanciero(); loadMovFin(); }, 350);
setTimeout(loadResumen,                                      400);
