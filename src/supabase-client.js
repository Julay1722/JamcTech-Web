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

// skus.categoria enum (UPPERCASE, sin underscore) → label que usa el dashboard
const CAT_MAP = {
  MOUSE:    'Mouse',
  TECLADO:  'Teclado',
  HEADSET:  'Headset',
  STAND:    'Stand',
  MOUSEPAD: 'Mouse Pad',
  OTRO:     'Otro',
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
  FEE_BANCARIO:          'Fee bancario',
  TRANSFERENCIA_INTERNA: 'Transferencia',
  REFUND_PROVEEDOR:      'Refund proveedor',
  REFUND_CLIENTE:        'Refund cliente',
  AJUSTE:                'Ajuste',
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

    // Fallback histórico: SOLO si una venta legacy quedó con cpp_historico=0
    // (placeholder viejo, margen 100% irreal) aplicamos el 42% de V2.1. Tras el
    // reload del sheet las ventas legacy ya traen su costo real, así que esto
    // casi nunca aplica y se usa la ganancia real de la DB.
    const LEGACY_DEFAULT_MARGIN = 0.42;
    const ventas = (data || []).map((v) => {
      const items = v.ventas_items || [];
      const allLegacy = items.length > 0 && items.every(
        (l) => l.sku_id === 'LEGACY-SALE' && (parseFloat(l.cpp_historico) || 0) === 0,
      );
      const baseCostTotal = items.reduce(
        (sum, l) => sum + (parseFloat(l.cpp_historico) || 0) * (parseFloat(l.cantidad) || 0),
        0,
      );
      const cantidadTotal = items.reduce((sum, l) => sum + (parseFloat(l.cantidad) || 0), 0);
      const facturado     = parseFloat(v.total_facturado) || 0;
      const gananciaTotal = allLegacy
        ? facturado * LEGACY_DEFAULT_MARGIN
        : parseFloat(v.total_ganancia) || 0;
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
          precio:      parseFloat(l.precio_unitario) || 0,
          costoUd:     parseFloat(l.cpp_historico) || 0,
          ganancia:    parseFloat(l.ganancia_total) || 0,
          subtotal:    parseFloat(l.subtotal) || (parseFloat(l.precio_unitario) || 0) * (parseFloat(l.cantidad) || 0),
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
// Lee de la tabla `movimientos` directamente (no de vw_cashflow), para
// incluir TODOS los movimientos (operacionales + financieros). Esto matchea
// el comportamiento de la antigua tabla Airtable "Cashflow" que mezclaba
// ambas naturalezas, y permite que COOP/ANDREA/BHD overrides funcionen
// filtrando por categoría desde CF_ALL.
async function loadCashflow() {
  try {
    const { data, error } = await sb
      .from('movimientos')
      .select(`
        id, fecha, tipo, entrada, salida, naturaleza, notas, prestamo_id, inversor_id,
        cuenta:cuentas!cuenta_id ( nombre ),
        contraparte:contrapartes!contraparte_id ( nombre )
      `)
      .order('fecha', { ascending: false })
      .limit(5000);
    if (error) throw error;
    const cf = (data || []).map((r) => ({
      f:           r.fecha,
      c:           TIPO_MAP[r.tipo] || r.tipo || 'Otro',
      a:           r.contraparte?.nombre || '',
      e:           parseFloat(r.entrada) || 0,
      s:           parseFloat(r.salida)  || 0,
      notas:       r.notas || '',
      _src:        'supabase · cf',
      _origen:     r.cuenta?.nombre,
      _naturaleza: r.naturaleza,
      _prestamoId: r.prestamo_id != null ? Number(r.prestamo_id) : null,
      _inversorId: r.inversor_id != null ? Number(r.inversor_id) : null,
      _airtableId: 'cf-' + r.id,
    }));
    window.__AIRTABLE_DATA__.cashflow = cf;
    _dispatch('cashflow', cf.length);
    console.log(`✓ [SB/cashflow] ${cf.length} movimientos (operacionales + financieros)`);
    return cf;
  } catch (e) {
    console.error('✕ [SB/cashflow] falló:', e.message);
    window.__AIRTABLE_DATA__.cashflowError = e.message;
    _dispatchError('cashflow', e.message);
    return null;
  }
}

// ── Cuotas (pagos reales registrados de préstamos amortizados, ej. COOP) ──
// Se adjuntan a productos['FIN-P'][i].cuotas para que el drilldown muestre los
// pagos REALES del banco en vez de una proyección de amortización.
async function loadCuotas() {
  try {
    const { data, error } = await sb
      .from('cuotas')
      .select('prestamo_id, numero, fecha_pago, capital, interes, seguro, abono_capital, monto_total, pagada, notas')
      .order('prestamo_id', { ascending: true })
      .order('numero', { ascending: true });
    if (error) throw error;
    const cuotas = (data || []).map((c) => ({
      prestamoId: c.prestamo_id,
      numero:     c.numero,
      fecha:      c.fecha_pago,
      capital:    parseFloat(c.capital)       || 0,
      interes:    parseFloat(c.interes)       || 0,
      seguro:     parseFloat(c.seguro)        || 0,
      abono:      parseFloat(c.abono_capital) || 0,
      total:      parseFloat(c.monto_total)   || 0,
      pagada:     !!c.pagada,
      notas:      c.notas || '',
    }));
    window.__AIRTABLE_DATA__.cuotas = cuotas;
    // Re-arma productos para adjuntar las cuotas a cada FIN-P.
    if (Array.isArray(window.__AIRTABLE_DATA__.financiero) && Array.isArray(window.__AIRTABLE_DATA__.cashflow)) {
      try { _buildFinancieroProductos(); } catch (e) {}
    }
    _dispatch('cuotas', cuotas.length);
    console.log(`✓ [SB/cuotas] ${cuotas.length} cuotas`);
    return cuotas;
  } catch (e) {
    console.error('✕ [SB/cuotas] falló:', e.message);
    return null;
  }
}

// ── Financiero (productos: préstamo/línea/tarjeta + inversores) ──
async function loadFinanciero() {
  try {
    const [{ data: prestamos, error: e1 }, { data: inversores, error: e2 }, { data: saldos }, { data: compensaciones }] = await Promise.all([
      sb.from('prestamos').select('*').eq('activa', true),
      sb.from('inversores').select('*').eq('activa', true),
      sb.from('vw_saldo_prestamo').select('*'),
      sb.from('compensaciones_inversor').select('*').eq('activa', true).order('id'),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    // Index compensaciones por inversor_id para attach
    const compByInversor = {};
    (compensaciones || []).forEach((c) => {
      const k = c.inversor_id;
      if (!compByInversor[k]) compByInversor[k] = [];
      compByInversor[k].push({
        id:              c.id,
        tipoCompensacion: c.tipo_compensacion,
        montoPactado:    c.monto_pactado    != null ? parseFloat(c.monto_pactado)    : null,
        pctAplicado:     c.pct_aplicado     != null ? parseFloat(c.pct_aplicado)     : null,
        cuotaMensual:    c.cuota_mensual    != null ? parseFloat(c.cuota_mensual)    : null,
        bonusThreshold:  c.bonus_threshold  != null ? parseFloat(c.bonus_threshold)  : null,
        capDevolver:     c.cap_devolver     != null ? parseFloat(c.cap_devolver)     : null,
        montoPorUnidad:  c.monto_por_unidad != null ? parseFloat(c.monto_por_unidad) : null,
        diaPago:         c.dia_pago != null ? parseInt(c.dia_pago) : 17,
        fechaInicio:     c.fecha_inicio || null,
        fechaFin:        c.fecha_fin    || null,
        notas:           c.notas || '',
      });
    });
    const saldosByPrestamoId = Object.fromEntries(
      (saldos || []).map((s) => [s.id, {
        capital_pagado:  parseFloat(s.capital_pagado)  || 0,
        interes_pagado:  parseFloat(s.interes_pagado)  || 0,
        saldo_pendiente: parseFloat(s.saldo_pendiente) || 0,
      }])
    );

    const tipoLabel = {
      PRESTAMO:        'Préstamo',
      LINEA_CREDITO:   'Línea de Crédito',
      TARJETA_CREDITO: 'Tarjeta de Crédito',
    };

    const fin = [];
    // Normaliza el código de moneda del backend ('RD' o 'USD') al símbolo
    // visible ('RD$' o 'USD$'). Default a RD$ si viene null/vacío.
    const monedaLabel = (m) => {
      const s = String(m || '').toUpperCase();
      if (s === 'USD' || s === 'USD$' || s === 'US$') return 'USD$';
      return 'RD$';
    };
    (prestamos || []).forEach((p) => {
      const sal = saldosByPrestamoId[p.id] || {};
      fin.push({
        _airtableId:    'p-' + p.id,
        idFin:          'FIN-P-' + p.id,
        tipo:           tipoLabel[p.tipo] || p.tipo,
        nombre:         p.nombre,
        montoTotal:     parseFloat(p.monto_inicial || p.limite_credito) || 0,
        totalPagado:    sal.capital_pagado || 0,
        tasaMensual:    parseFloat(p.tasa_mensual)   || 0,
        seguroMensual:  parseFloat(p.seguro_mensual) || 0,
        plazoMeses:     parseInt(p.plazo_meses) || null,
        fechaInicio:    p.fecha_inicio || '',
        fechaPrimerPago: p.fecha_primer_pago || '',
        diaCorte:       parseInt(p.dia_corte) || null,   // tarjetas: día del mes que corta
        diaVencimiento: parseInt(p.dia_vencimiento) || null,  // día que se paga
        moneda:         monedaLabel(p.moneda),
        notas:          p.notas || '',
        balance:        sal.saldo_pendiente || 0,
        _capitalPagado: sal.capital_pagado || 0,
        _interesPagado: sal.interes_pagado || 0,
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
        plazoMeses:    parseInt(i.plazo_meses) || null,
        notas:         i.notas || '',
        balance:       parseFloat(i.monto_pactado_devolver) || 0,
        esDueno:       !!i.es_dueno,
        // Metodo de compensacion legacy (mantiene compat con vista simple)
        tipoCompensacion: i.tipo_compensacion || 'FLAT',
        pctAplicado:    i.pct_aplicado    != null ? parseFloat(i.pct_aplicado)    : null,
        cuotaMensual:   i.cuota_mensual   != null ? parseFloat(i.cuota_mensual)   : null,
        bonusThreshold: i.bonus_threshold != null ? parseFloat(i.bonus_threshold) : null,
        capDevolver:    i.cap_devolver    != null ? parseFloat(i.cap_devolver)    : null,
        // Nuevo: array de N reglas de compensacion activas en paralelo
        compensaciones: compByInversor[i.id] || [],
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
// No hay tabla resumen_mensual en Supabase. Calculamos el resumen mensual
// desde ventas + cashflow (mismo cálculo que _overrideGlobals para
// window.MES) y lo guardamos en el shape que esperan los paneles:
//   { m: 'Jul-25', v, g, p, c, _ci }
// Importante: NO devolver array vacío — panel-mando.jsx hace
//   const baseMES = atResumen.loaded ? (window.__AIRTABLE_DATA__?.resumen || MES) : MES;
// Si el resumen es [] (truthy), MES nunca cae como fallback y el panel
// se queda en blanco. Esto se ejecuta una vez que ventas + cashflow ya
// están cargados (loop espera o re-corre cuando llegue el evento).
async function loadResumen() {
  // Espera a que ventas + cashflow estén cargados
  const D = window.__AIRTABLE_DATA__;
  if (!Array.isArray(D?.ventas) || !Array.isArray(D?.cashflow)) {
    // Reintenta una vez que esos eventos lleguen
    const tryBuild = () => {
      if (Array.isArray(D?.ventas) && Array.isArray(D?.cashflow)) {
        window.removeEventListener('airtable-loaded', tryBuild);
        loadResumen();
      }
    };
    window.addEventListener('airtable-loaded', tryBuild);
    return [];
  }
  // Agregado por mes
  const vmap = {};
  D.ventas.forEach((v) => {
    const ym = (v.fecha || '').slice(0, 7);
    if (!ym) return;
    if (!vmap[ym]) vmap[ym] = { v: 0, g: 0 };
    vmap[ym].v += v.precioFacturadoTotal || 0;
    vmap[ym].g += v.gananciaTotal        || 0;
  });
  const sorted = D.cashflow.slice().sort((a, b) => (a.f < b.f ? -1 : 1));
  let running = 0;
  const cmap = {};
  sorted.forEach((r) => {
    running += (r.e || 0) - (r.s || 0);
    const ym = (r.f || '').slice(0, 7);
    if (ym) cmap[ym] = running;
  });
  const months = Array.from(new Set([...Object.keys(vmap), ...Object.keys(cmap)])).sort();
  const resumen = months.map((ym) => {
    const v = vmap[ym]?.v || 0;
    const g = vmap[ym]?.g || 0;
    return {
      m:   _ymToLabel(ym),
      v,
      g,
      p:   v > 0 ? Number(((g / v) * 100).toFixed(2)) : 0,
      c:   cmap[ym] || 0,
      _ci: 0,
    };
  });
  D.resumen = resumen;
  _dispatch('resumen', resumen.length);
  console.log(`✓ [SB/resumen] ${resumen.length} meses computados desde ventas + cashflow`);
  return resumen;
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
      const medianaPagos = pagosCF.length > 0
        ? pagosCF.slice().map((m) => m.s).sort((a, b) => a - b)[Math.floor(pagosCF.length / 2)]
        : 0;
      const pagadoCF = pagosCF.reduce((s, m) => s + (m.s || 0), 0);
      // Preferimos cashflow sobre vw_saldo_prestamo: la vista solo computa con
      // FK prestamo_id explicito en movimientos (no siempre se setea en
      // bulk-loads ni en cuotas manuales). Cashflow refleja la realidad.
      const capitalPagadoOficial = r._capitalPagado || 0;
      const pagadoEfectivo = Math.max(pagadoCF, capitalPagadoOficial);
      const saldoCalc = Math.max(0, (r.montoTotal || 0) - pagadoEfectivo);
      // Solo confiamos en r.balance si es estrictamente menor que monto inicial
      // (significaria que la vista ya descontó pagos). Sino usamos calc.
      const saldo = (r.balance > 0 && r.balance < r.montoTotal) ? r.balance : saldoCalc;
      productos['FIN-P'].push({
        ...base,
        tipoSub:      'Cooperativa',
        monto:        r.montoTotal,
        saldo,
        pagado:       pagadoEfectivo,
        tasa:         (r.tasaMensual || 0) * 100,
        cuota:        medianaPagos || 3568.64,
        seguro:       r.seguroMensual,
        abonoMin5pct: saldo * 0.05,
        abonoAcum:    0,
        movimientos:  pagosCF.map((m) => ({
          id:      'pp-' + m._airtableId,
          fecha:   m.f,
          tipo:    'cuota',
          monto:   m.s || 0,
          capital: 0, interes: 0, seguro: 0, abono: 0,
          nota:    m.a || '',
        })),
        // Pagos REALES registrados (tabla cuotas) — el drilldown los muestra en
        // vez de la proyección de amortización si existen.
        cuotas: (window.__AIRTABLE_DATA__.cuotas || [])
          .filter((c) => c.prestamoId === Number(String(r._airtableId).replace('p-', '')))
          .sort((a, b) => (a.numero || 0) - (b.numero || 0)),
      });
    } else if (t.includes('inversor')) {
      // Pagado = SOLO los pagos etiquetados a las reglas de ESTE inversor ("regla #ID"
      // en notas, que pone PagoMensualModal). Antes sumaba TODOS los 'Pago a Inversores'
      // sin distinguir inversor, así que el mismo monto aparecía en todos (incluido el
      // dueño, sin haber cobrado). Dueño paga como entrada; inversor como salida → sumo ambos.
      const ruleIds = (r.compensaciones || []).map((c) => c.id);
      const pagosCF = cf.filter((m) =>
        typeof m.notas === 'string' && ruleIds.some((id) => m.notas.includes(`regla #${id}`)),
      );
      const pagado  = pagosCF.reduce((sum, m) => sum + (m.s || 0) + (m.e || 0), 0);
      // Para ROYALTY usamos el cap; para los demas el monto_pactado_devolver
      const targetTotal = r.tipoCompensacion === 'ROYALTY' && r.capDevolver
        ? r.capDevolver
        : r.balance;
      const multiplicador = r.montoTotal > 0 ? targetTotal / r.montoTotal : 0;
      productos['FIN-I'].push({
        ...base,
        tipoSub:       `Inversor ${multiplicador.toFixed(1)}×`,
        aporte:        r.montoTotal,
        retorno:       targetTotal,
        pagado,
        pendiente:     Math.max(0, targetTotal - pagado),
        meta:          r.plazoMeses || 48,
        // Pasar los campos de compensacion hasta el panel
        tipoCompensacion: r.tipoCompensacion || 'FLAT',
        pctAplicado:      r.pctAplicado,
        cuotaMensual:     r.cuotaMensual,
        bonusThreshold:   r.bonusThreshold,
        capDevolver:      r.capDevolver,
        plazoMeses:       r.plazoMeses,
        movimientos: pagosCF.map((m) => ({
          id:    'pi-' + m._airtableId,
          fecha: m.f,
          tipo:  'pago',
          monto: (m.s || 0) + (m.e || 0),
          nota:  m.a || '',
        })),
      });
    } else if (t.includes('línea') || t.includes('linea') || t.includes('crédito') || t.includes('credito') || t.includes('tarjeta')) {
      // Filtrar movs específicos del producto. Mapeo aproximado por nombre:
      //   "BHD Linea"      → m.a contiene 'bhd' o 'linea de credito'
      //   "Scotia CC RD"   → m.a contiene 'scotia' (asume el cuenta_id estaba bien
      //                     en supabase para distinguir RD vs USD si necesario)
      //   "Qik CC"         → m.a contiene 'qik'
      // Para tarjetas Scotia/Qik la data histórica probablemente no las trackeaba
      // separado del banco; aceptamos imprecisión moderada en exchange de no
      // duplicar el mismo monto en los 4 productos.
      const nameLC = (r.nombre || '').toLowerCase();
      const prestamoNumId = Number(String(r._airtableId).replace('p-', ''));
      // Match por nombre (data histórica sin FK explícito).
      const matchByName = (m) => {
        // Una transferencia interna entre cuentas propias NUNCA cuenta como
        // movimiento de la línea/tarjeta, aunque mencione el banco en la
        // contraparte (ej. "Transferencia a BHD Débito" inflaba el usado).
        if (m.c === 'Transferencia') return false;
        const a = (m.a || '').toLowerCase();
        if (!a) return false;
        if (nameLC.includes('bhd'))    return a.includes('bhd') || a.includes('linea de credito');
        if (nameLC.includes('scotia')) return a.includes('scotia') && (!a.includes('usd') === !nameLC.includes('usd'));
        if (nameLC.includes('qik'))    return a.includes('qik');
        return false;
      };
      // Preferimos el FK prestamo_id (lo setea createMovFin en cada registro
      // nuevo, garantizando que el usado se mueva). La data histórica sin FK
      // (prestamo_id null) cae al match por nombre. Sin doble conteo.
      const movsLC = cf.filter((m) =>
        m._prestamoId != null ? m._prestamoId === prestamoNumId : matchByName(m)
      );
      const usado = movsLC.reduce((sum, m) => sum + (m.e || 0) - (m.s || 0), 0);
      // BHD no tiene tasa_mensual en prestamos (NULL). Fallback al 26% anual
      // que tenía data.js hardcoded.
      const tasaMensualPct = (r.tasaMensual && r.tasaMensual > 0)
        ? r.tasaMensual * 100   // decimal → percentage
        : 26 / 12;              // 2.17% mensual (default BHD)
      // tipoSub correcto según r.tipo del backend: distingue línea vs tarjeta
      // para que el frontend pueda separarlas en tabs distintos. Antes esto
      // era hardcoded a 'Línea Revolvente' y todas las tarjetas terminaban
      // en el tab Préstamos.
      const isTarjeta = /tarjeta/i.test(r.tipo || '');
      productos['FIN-LC'].push({
        ...base,
        tipoSub:     isTarjeta ? 'Tarjeta de Crédito' : 'Línea Revolvente',
        moneda:      r.moneda || 'RD$',  // ya viene normalizada del loader (RD$ o USD$)
        limite:      r.montoTotal,
        usado:       Math.max(0, usado),
        tasaAnual:   tasaMensualPct * 12,
        tasaMensual: tasaMensualPct,
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
  const t = e.detail?.table;
  if (t === 'financiero')      _finReady = true;
  else if (t === 'cashflow')   _cfReady  = true;
  else return; // evita re-entrar por el propio 'productos' que dispara abajo
  // Reconstruye productos cada vez que cashflow o financiero recargan (no solo
  // la primera vez). Sin esto, saldos de préstamo/línea/tarjeta + usado de
  // inversores quedaban congelados al boot y NO reflejaban movimientos nuevos
  // registrados después (bug: "funciona pero no recalcula al usarse").
  if (_finReady && _cfReady) {
    _buildFinancieroProductos();
  }
});

/* ════════════════════════ Lookup tables (internas) ════════════════════════
   contrapartes / cuentas viven en cache para que los writers puedan
   resolver "Facebook" → contraparte_id=9, "BHD Debito" → cuenta_id=1, etc.
   No emiten eventos — son solo lookup interno.                          */

async function _loadLookups() {
  try {
    const [{ data: cps }, { data: cts }] = await Promise.all([
      sb.from('contrapartes').select('id, nombre, tipo'),
      sb.from('cuentas').select('id, nombre, tipo, moneda'),
    ]);
    window.__AIRTABLE_DATA__._contrapartes = cps || [];
    window.__AIRTABLE_DATA__._cuentas      = cts || [];
  } catch (e) {
    console.warn('[SB/lookups] no se cargaron lookup tables:', e.message);
  }
}

const DEFAULT_CUENTA_ID       = 1;   // BHD Debito
const DEFAULT_CONTRAPARTE_ID  = 17;  // Cliente Generico
const DEFAULT_FACEBOOK_ID     = 9;   // canal default para ventas
const DEFAULT_PROVEEDOR_ID    = 5;   // Alibaba

function _findContraparteId(name, fallback = DEFAULT_CONTRAPARTE_ID) {
  if (!name) return fallback;
  const list = window.__AIRTABLE_DATA__._contrapartes || [];
  const n = name.toLowerCase().trim();
  const found = list.find((c) => c.nombre.toLowerCase() === n)
            || list.find((c) => c.nombre.toLowerCase().includes(n))
            || list.find((c) => n.includes(c.nombre.toLowerCase()));
  return found ? found.id : fallback;
}

// Busca o crea una contraparte por nombre. Usada por createPrestamo/createInversor
// para satisfacer el NOT NULL en contraparte_id sin forzar al usuario a crear
// la contraparte manualmente primero.
async function _ensureContraparteId(name, tipo) {
  const existing = _findContraparteId(name, null);
  if (existing) return existing;
  const { data, error } = await sb.from('contrapartes')
    .insert({ nombre: name, tipo: tipo || 'OTRO' })
    .select().single();
  if (error) throw new Error(`ensureContraparte: ${error.message}`);
  (window.__AIRTABLE_DATA__._contrapartes ||= []).push({ id: data.id, nombre: data.nombre, tipo: data.tipo });
  return data.id;
}

// Normaliza para matching: minúsculas, trim, y SIN acentos. Así "BHD Debito"
// (como lo tipean los forms) matchea "BHD Débito" (nombre real con acento).
function _norm(s) {
  return String(s || '').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function _findCuentaId(name, fallback = DEFAULT_CUENTA_ID) {
  if (!name) return fallback;
  const list = window.__AIRTABLE_DATA__._cuentas || [];
  const n = _norm(name);
  const found = list.find((c) => _norm(c.nombre) === n)
            || list.find((c) => _norm(c.nombre).includes(n));
  return found ? found.id : fallback;
}

/* ════════════════════════ Reverse maps + helpers ════════════════════════ */

// Dashboard label → movimientos.tipo enum
const TIPO_REV = {
  'Venta de mercancia':     'VENTA',
  'Envio cobrado':          'ENVIO_COBRADO',
  'Compra de mercancia':    'COMPRA_MERCANCIA',
  'Compra operativa':       'COMPRA_OPERATIVA',
  'Pago Envio':             'ENVIO_LOTE',
  'Pago Prestamo':          'PAGO_PRESTAMO',
  'Pago Linea de Credito':  'PAGO_LINEA_CREDITO',
  'Cuentas por pagar':      'PAGO_TARJETA_CREDITO',
  'Intereses':              'PAGO_INTERESES',
  'Pago ADS':               'PAGO_ADS',
  'Pago Comision':          'PAGO_COMISION',
  'Pago a Inversores':      'PAGO_INVERSOR',
  'Courier':                'PAGO_TRANSPORTE',
  'Envio Mercancia':        'PAGO_TRANSPORTE',
  'Pago Envio':             'ENVIO_LOTE',
  'Compra de mercancia':    'COMPRA_MERCANCIA',
  'Aportes para negocio':   'APORTE_DUENO',
  'Transferencia':          'TRANSFERENCIA_INTERNA',
  'Transferencia interna':  'TRANSFERENCIA_INTERNA',
  'Fee bancario':           'FEE_BANCARIO',
  'Refund proveedor':       'REFUND_PROVEEDOR',
  'Refund cliente':         'REFUND_CLIENTE',
  'Ajuste':                 'AJUSTE',
  'Pago deuda':             'OTROS',
  'Otro':                   'OTROS',
};

// Airtable singleSelect (MovFin) → Supabase tipo + lado (entrada vs salida)
const MOVFIN_REV = {
  'Cuota Préstamo':    { tipo: 'PAGO_PRESTAMO',      side: 'salida'  },
  'Abono Préstamo':    { tipo: 'PAGO_PRESTAMO',      side: 'salida'  },
  'Disposición Línea': { tipo: 'DRAWDOWN',           side: 'entrada' },
  'Pago Línea':        { tipo: 'PAGO_LINEA_CREDITO', side: 'salida'  },
  'Cargo Línea':       { tipo: 'PAGO_INTERESES',     side: 'salida'  },
  'Depósito Inversor': { tipo: 'APORTE_INVERSOR',    side: 'entrada' },
  'Retorno Inversor':  { tipo: 'PAGO_INVERSOR',      side: 'salida'  },
  'Pago Tarjeta':      { tipo: 'PAGO_TARJETA_CREDITO', side: 'salida'  },
  'Compra Tarjeta':    { tipo: 'DRAWDOWN',             side: 'entrada' },
  'Otro':              { tipo: 'OTROS',              side: 'salida'  },
};

// Dashboard 'Mouse' → Supabase enum 'MOUSE' (sin underscore en MOUSEPAD)
const CAT_REV = {
  'Mouse':     'MOUSE',
  'Teclado':   'TECLADO',
  'Headset':   'HEADSET',
  'Stand':     'STAND',
  'Mouse Pad': 'MOUSEPAD',
  'Otro':      'OTRO',
};

// 'cf-305' → 305 · 'p-1' → 1 · 'MOU-HXS-T90-NEG' → 'MOU-HXS-T90-NEG'
function _stripPrefix(id) {
  if (id == null) return null;
  const s = String(id);
  const m = s.match(/^[a-zA-Z]+-(\d+)$/);
  return m ? Number(m[1]) : s;
}

// ──── Tracking de writes recientes para auto-linkage / dedupe ────
// El wizard de paneles invoca:
//   createLote(...) + N × create('cashflow', satéliteN)   (legítimos, deben linkearse)
//   createMovFin(...) + create('cashflow', dupCF)         (duplicado, debe suprimirse)
// Sin esto los CFs satélites quedan huérfanos (lote borrado pero CFs viven) o
// duplican el monto en cashflow (MovFin + su CF mirror). Ventana corta para
// no afectar inputs manuales del usuario en el panel ADJUSTE MANUAL CF.
const _CF_LINK_TTL_MS = 8000;
let _lastLote   = null;  // { loteIdNum, fecha, ts }
let _lastMovFin = null;  // { movId, fecha, monto, ts }
function _recordLote(loteIdNum, fecha)   { _lastLote   = { loteIdNum, fecha, ts: Date.now() }; }
function _recordMovFin(movId, fecha, monto) { _lastMovFin = { movId, fecha, monto, ts: Date.now() }; }
function _recentLote()   { return _lastLote   && (Date.now() - _lastLote.ts)   < _CF_LINK_TTL_MS ? _lastLote   : null; }
function _recentMovFin() { return _lastMovFin && (Date.now() - _lastMovFin.ts) < _CF_LINK_TTL_MS ? _lastMovFin : null; }

function HOY_ISO() {
  return new Date().toISOString().slice(0, 10);
}

/* ════════════════════════ WRITERS — SKUs ════════════════════════ */

async function createSKU(data) {
  if (!data.id) throw new Error('createSKU requiere id (CAT-MARCA-MODELO-COLOR)');
  const cat = CAT_REV[data.cat] || 'MOUSE';
  const row = {
    id_sku:                data.id,
    nombre:                data.nm || data.id,
    marca:                 data.mk || '',
    modelo:                data.modelo || '',
    color:                 data.color  || '',
    categoria:             cat,
    precio_venta_sugerido: data.pv != null && data.pv !== '' ? Number(data.pv) : null,
    notas:                 data.notas || '',
    activa:                true,
  };
  const { data: inserted, error } = await sb.from('skus').insert(row).select().single();
  if (error) throw new Error(`createSKU: ${error.message}`);
  await loadSKUs();
  const mapped = (window.__AIRTABLE_DATA__.skus || []).find((s) => s.id === inserted.id_sku);
  return mapped || { id: inserted.id_sku, _airtableId: inserted.id_sku, nm: inserted.nombre };
}

async function updateSKU(airtableId, patch) {
  const idSku = _stripPrefix(airtableId);
  const row = {};
  if (patch.nm     !== undefined) row.nombre   = patch.nm;
  if (patch.mk     !== undefined) row.marca    = patch.mk;
  if (patch.modelo !== undefined) row.modelo   = patch.modelo;
  if (patch.color  !== undefined) row.color    = patch.color;
  if (patch.cat    !== undefined && patch.cat !== '') row.categoria = CAT_REV[patch.cat] || 'MOUSE';
  if (patch.pv     !== undefined && patch.pv !== '' && patch.pv !== null) row.precio_venta_sugerido = Number(patch.pv);
  if (patch.notas  !== undefined) row.notas    = patch.notas;
  // Si quieren renombrar el SKU (cambiar id_sku) — FK cascade on update lo soporta
  if (patch.id     !== undefined && patch.id !== idSku) row.id_sku = patch.id;
  const { data, error } = await sb.from('skus').update(row).eq('id_sku', idSku).select().single();
  if (error) throw new Error(`updateSKU: ${error.message}`);
  await loadSKUs();
  return (window.__AIRTABLE_DATA__.skus || []).find((s) => s.id === data.id_sku) || data;
}

async function removeSKU(airtableId) {
  const idSku = _stripPrefix(airtableId);
  const { error } = await sb.from('skus').delete().eq('id_sku', idSku);
  if (error) throw new Error(`removeSKU: ${error.message}`);
  // Quita del cache local + dispara evento
  if (window.__AIRTABLE_DATA__.skus) {
    window.__AIRTABLE_DATA__.skus = window.__AIRTABLE_DATA__.skus.filter((s) => s.id !== idSku);
    _dispatch('skus', window.__AIRTABLE_DATA__.skus.length);
  }
  return { deleted: true, id: idSku };
}

// Sync: cuenta cuántas ventas/entradas referencian el SKU dado (desde cache).
function countSKURefs(skuDashId) {
  const ventas   = window.__AIRTABLE_DATA__?.ventasRaw   || [];
  const entradas = window.__AIRTABLE_DATA__?.entradasRaw || [];
  return {
    ventas:   ventas.filter((v)   => v.skuRef === skuDashId).length,
    entradas: entradas.filter((e) => e.skuRef === skuDashId).length,
  };
}

/* ════════════════════════ WRITERS — Ventas ════════════════════════ */

function _nextVentaCodigo(fecha) {
  const f = (fecha || HOY_ISO()).replace(/-/g, '').slice(2);
  const existing = (window.__AIRTABLE_DATA__?.ventas || [])
    .filter((v) => (v.idVenta || '').startsWith(`VTA-${f}`));
  return `VTA-${f}-${String(existing.length + 1).padStart(3, '0')}`;
}

// venta = { fecha, lineas[{skuId, qty, cppEnVenta}], precioFacturadoTotal, canal, envio?, nota?, idVenta? }
async function createVenta(venta) {
  const codigo = venta.idVenta || _nextVentaCodigo(venta.fecha);
  const canalId = _findContraparteId(venta.canal, DEFAULT_FACEBOOK_ID);
  // 1. Header
  const { data: header, error: e1 } = await sb.from('ventas').insert({
    codigo,
    fecha:           venta.fecha,
    canal_id:        canalId,
    envio_cobrado:   Number(venta.envio) || 0,
    descuento:       0,
    total_facturado: Number(venta.precioFacturadoTotal) || 0,  // se recalcula vía trigger
    total_ganancia:  0,
    notas:           venta.nota || '',
  }).select().single();
  if (e1) throw new Error(`createVenta header: ${e1.message}`);
  // 2. Items (multi-línea). El trigger snapshot_cpp captura cpp_historico desde skus.cpp_actual.
  const nLineas = venta.lineas.length;
  const precioPorLinea = nLineas > 0
    ? (Number(venta.precioFacturadoTotal) || 0) / nLineas
    : 0;
  const itemsRows = venta.lineas.map((l) => ({
    venta_id:        header.id,
    sku_id:          l.skuId,
    cantidad:        Number(l.qty) || 0,
    precio_unitario: l.precioUnitario != null ? Number(l.precioUnitario) : precioPorLinea,
  }));
  const { data: items, error: e2 } = await sb.from('ventas_items').insert(itemsRows).select();
  if (e2) {
    // Rollback: borra el header si fallaron los items
    await sb.from('ventas').delete().eq('id', header.id);
    throw new Error(`createVenta items: ${e2.message}`);
  }
  // 3. Refetch para que los totales recalculados por trigger lleguen al cache
  await loadVentas();
  const newGrouped = (window.__AIRTABLE_DATA__.ventas || []).find((v) => v.idVenta === codigo);
  return {
    idVenta:     codigo,
    airtableIds: (items || []).map((i) => 'vi-' + i.id),
    grouped:     newGrouped,
  };
}

async function removeVenta(idVenta) {
  // Lookup id real por codigo
  const venta = (window.__AIRTABLE_DATA__?.ventas || []).find((v) => v.idVenta === idVenta);
  if (!venta) throw new Error(`venta no encontrada: ${idVenta}`);
  const vid = _stripPrefix(venta._airtableId);
  // ventas_items cascadea via FK. Movimientos con venta_id quedan huérfanos
  // (mismo comportamiento que tenías con Airtable).
  const { error } = await sb.from('ventas').delete().eq('id', vid);
  if (error) throw new Error(`removeVenta: ${error.message}`);
  // Sincroniza cache
  if (window.__AIRTABLE_DATA__.ventas) {
    window.__AIRTABLE_DATA__.ventas    = window.__AIRTABLE_DATA__.ventas.filter((v) => v.idVenta !== idVenta);
    window.__AIRTABLE_DATA__.ventasRaw = (window.__AIRTABLE_DATA__.ventasRaw || []).filter((l) => l.idVenta !== idVenta);
    window.__AIRTABLE_DATA__.ventasCF  = (window.__AIRTABLE_DATA__.ventasCF  || []).filter((c) => c._ventaId !== idVenta);
    _dispatch('ventas', window.__AIRTABLE_DATA__.ventas.length);
  }
  return { idVenta, deletedCount: (venta.lineas || []).length };
}

async function updateVentaHeader(idVenta, patch) {
  const venta = (window.__AIRTABLE_DATA__?.ventas || []).find((v) => v.idVenta === idVenta);
  if (!venta) throw new Error(`venta no encontrada: ${idVenta}`);
  const vid = _stripPrefix(venta._airtableId);
  const row = {};
  if (patch.fecha != null) row.fecha    = patch.fecha;
  if (patch.canal != null) row.canal_id = _findContraparteId(patch.canal, DEFAULT_FACEBOOK_ID);
  if (patch.notas != null) row.notas    = patch.notas;
  if (patch.envio != null) row.envio_cobrado = Number(patch.envio) || 0;
  const { error } = await sb.from('ventas').update(row).eq('id', vid);
  if (error) throw new Error(`updateVentaHeader: ${error.message}`);
  // Actualiza cache
  if (patch.fecha != null) venta.fecha = patch.fecha;
  if (patch.canal != null) venta.canal = patch.canal;
  if (patch.notas != null) venta.notas = patch.notas;
  if (patch.envio != null) venta.envio = Number(patch.envio) || 0;
  _dispatch('ventas', (window.__AIRTABLE_DATA__.ventas || []).length);
  return { idVenta, updatedCount: (venta.lineas || []).length };
}

// Actualiza líneas (ventas_items) de una venta. lineas = [{ _airtableId:'vi-N',
// sku?, qty?, precioUnitario? }]. Los triggers de la DB recalculan
// total_facturado / total_ganancia / subtotal automáticamente. Refetch al final.
async function updateVentaLineas(idVenta, lineas) {
  const venta = (window.__AIRTABLE_DATA__?.ventas || []).find((v) => v.idVenta === idVenta);
  if (!venta) throw new Error(`venta no encontrada: ${idVenta}`);
  for (const l of lineas || []) {
    const itemId = _stripPrefix(l._airtableId);
    if (itemId == null) continue;
    const row = {};
    if (l.sku != null)            row.sku_id          = l.sku;
    if (l.qty != null)            row.cantidad        = Number(l.qty) || 0;
    if (l.precioUnitario != null) row.precio_unitario = Number(l.precioUnitario) || 0;
    // Si cambia el SKU, re-snapshotear el costo (cpp_historico) al CPP actual del
    // nuevo SKU — el trigger snapshot_cpp solo corre en INSERT, no en UPDATE.
    if (l.cppHistorico != null)   row.cpp_historico   = Number(l.cppHistorico) || 0;
    if (Object.keys(row).length === 0) continue;
    const { error } = await sb.from('ventas_items').update(row).eq('id', itemId);
    if (error) throw new Error(`updateVentaLineas (item ${itemId}): ${error.message}`);
  }
  // Refetch: los triggers ya recalcularon totales en la DB.
  await loadVentas();
  return { idVenta, updatedCount: (lineas || []).length };
}

/* ════════════════════════ WRITERS — Lotes/Entradas ════════════════════════ */

// lote = { fecha, status ('En Camino'/'Recibido'/'Perdido'), lineas:[{skuId, qty, costoUd}],
//          envio, courier, otros, impuestos, nota, proveedor?, loteId? }
async function createLote(lote) {
  const statusMap = { 'En Camino': 'PENDIENTE', 'Recibido': 'RECIBIDO', 'Perdido': 'PERDIDO' };
  const sbStatus  = statusMap[lote.status] || 'PENDIENTE';
  const hasSharedCosts = Number(lote.envio) || Number(lote.courier) || Number(lote.otros) || Number(lote.impuestos);

  let loteId = null;
  let loteCodigo = null;

  // Si hay shared costs O viene un proveedor explícito, crear lotes header.
  // Si no, crear las entradas sueltas (sin lote_id) — más simple y mismo
  // comportamiento que tenía Julio con airtable cuando no llenaba esos costos.
  if (hasSharedCosts || lote.proveedor) {
    loteCodigo = lote.loteId || `L-${(lote.fecha || HOY_ISO()).replace(/-/g, '').slice(2)}-${String(((window.__AIRTABLE_DATA__?.lotes || []).filter((l) => (l.id || '').startsWith('L-')).length) + 1).padStart(2, '0')}`;
    const { data: lhdr, error: e0 } = await sb.from('lotes').insert({
      codigo:           loteCodigo,
      fecha_pedido:     lote.fecha,
      fecha_recibido:   sbStatus === 'RECIBIDO' ? lote.fecha : null,
      proveedor_id:     _findContraparteId(lote.proveedor, DEFAULT_PROVEEDOR_ID),
      status:           sbStatus === 'PERDIDO' ? 'PENDIENTE' : sbStatus,
      costo_envio:      Number(lote.envio)     || 0,
      costo_courier:    Number(lote.courier)   || 0,
      costo_otros:      Number(lote.otros)     || 0,
      costo_impuestos:  Number(lote.impuestos) || 0,
      moneda:           'RD',
      notas:            lote.nota || '',
    }).select().single();
    if (e0) throw new Error(`createLote header: ${e0.message}`);
    loteId = lhdr.id;
  }

  const rows = lote.lineas.map((l) => ({
    lote_id:              loteId,
    fecha:                lote.fecha,
    sku_id:               l.skuId,
    status:               sbStatus,
    cantidad:             Number(l.qty) || 0,
    costo_unitario_base:  Number(l.costoUd) || 0,
    notas:                lote.nota || '',
  }));
  const { data: created, error: e1 } = await sb.from('entradas').insert(rows).select();
  if (e1) {
    if (loteId) await sb.from('lotes').delete().eq('id', loteId);
    throw new Error(`createLote entradas: ${e1.message}`);
  }
  // Trackea el lote recién creado para que los próximos create('cashflow')
  // (CFs satélites del wizard: envío, courier, otros, compra) se linkeen
  // automáticamente vía movimientos.lote_id. Esto permite que removeLote
  // también los borre en cascada.
  if (loteId) _recordLote(loteId, lote.fecha);
  await loadEntradas();
  await loadSKUs();   // lote nuevo (recibido) afecta stock/CPP → refrescar Inventario
  const newLote = (window.__AIRTABLE_DATA__.lotes || []).find(
    (l) => loteCodigo ? l.id === loteCodigo : l.skus.some((s) => (created || []).some((c) => c.id === Number(String(s._airtableId).replace('e-', ''))))
  );
  return {
    loteId:      loteCodigo || (created[0] ? `E-${created[0].id}` : ''),
    airtableIds: (created || []).map((c) => 'e-' + c.id),
    grouped:     newLote,
  };
}

async function removeLote(loteDashId) {
  // loteDashId puede ser 'L-N' (lote real) o 'E-N' (entrada suelta) o codigo
  const lote = (window.__AIRTABLE_DATA__?.lotes || []).find((l) => l.id === loteDashId);
  if (!lote) throw new Error(`lote no encontrado: ${loteDashId}`);
  const numIds = (lote.skus || []).map((s) => Number(String(s._airtableId).replace('e-', ''))).filter(Number.isFinite);
  // ── Borra los CFs satélites linkeados via lote_id (envío, courier, otros,
  //    compra) creados por el wizard al registrar este lote. Sin esto quedan
  //    huérfanos en cashflow. (No-op si no hubo wizard CFs.)
  let cfsBorrados = 0;
  if (lote._loteIdNum) {
    const { data: cfsDel, error: eCF } = await sb.from('movimientos')
      .delete().eq('lote_id', lote._loteIdNum).select('id');
    if (eCF) console.warn(`[SB/removeLote] cleanup CFs falló: ${eCF.message}`);
    else cfsBorrados = (cfsDel || []).length;
  }
  // Borra todas las entradas
  if (numIds.length > 0) {
    const { error } = await sb.from('entradas').delete().in('id', numIds);
    if (error) throw new Error(`removeLote entradas: ${error.message}`);
  }
  // Si es lote real, borra el header después de las entradas
  if (lote._loteIdNum) {
    const { error } = await sb.from('lotes').delete().eq('id', lote._loteIdNum);
    if (error) throw new Error(`removeLote header: ${error.message}`);
  }
  // Sincroniza cache local
  if (window.__AIRTABLE_DATA__.lotes) {
    window.__AIRTABLE_DATA__.lotes       = window.__AIRTABLE_DATA__.lotes.filter((l) => l.id !== loteDashId);
    window.__AIRTABLE_DATA__.entradasRaw = (window.__AIRTABLE_DATA__.entradasRaw || []).filter((e) => !numIds.includes(Number(String(e._airtableId).replace('e-', ''))));
    if (cfsBorrados > 0 && window.__AIRTABLE_DATA__.cashflow) {
      // Refresca cashflow desde Supabase para que los CFs borrados desaparezcan
      // del tail y los KPIs se recalculen.
      loadCashflow();
    }
    _dispatch('entradas', window.__AIRTABLE_DATA__.lotes.length);
  }
  await loadSKUs();   // borrar el lote reduce stock → refrescar Inventario
  return { loteId: loteDashId, deletedCount: numIds.length, cfsBorrados };
}

// Agrega una entrada nueva a un lote existente. La entrada nueva queda
// linkeada al mismo lote_id y respeta el status del lote (recibido/pendiente).
async function addEntradaToLote(loteDashId, linea) {
  const lote = (window.__AIRTABLE_DATA__?.lotes || []).find((l) => l.id === loteDashId);
  if (!lote) throw new Error(`lote no encontrado: ${loteDashId}`);
  const statusMap = { 'En Camino': 'PENDIENTE', 'Recibido': 'RECIBIDO', 'Perdido': 'PERDIDO' };
  const sbStatus = statusMap[lote.status] || 'PENDIENTE';
  const { data, error } = await sb.from('entradas').insert({
    lote_id:             lote._loteIdNum || null,
    fecha:               lote.fecha,
    sku_id:              linea.skuId,
    status:              sbStatus,
    cantidad:            Number(linea.qty)     || 0,
    costo_unitario_base: Number(linea.costoUd) || 0,
    notas:               linea.nota || '',
  }).select().single();
  if (error) throw new Error(`addEntradaToLote: ${error.message}`);
  await loadEntradas();
  await loadSKUs();   // nueva entrada afecta stock/CPP → refrescar Inventario
  return { id: 'e-' + data.id };
}

// Actualiza qty/costoUd/sku de una entrada existente. id viene como 'e-N'.
async function updateEntrada(airtableId, patch) {
  const id = Number(String(airtableId).replace('e-', ''));
  if (!Number.isFinite(id)) throw new Error(`updateEntrada: id inválido ${airtableId}`);
  const row = {};
  if (patch.skuId   !== undefined) row.sku_id              = patch.skuId;
  if (patch.qty     !== undefined) row.cantidad            = Number(patch.qty)     || 0;
  if (patch.costoUd !== undefined) row.costo_unitario_base = Number(patch.costoUd) || 0;
  if (patch.notas   !== undefined) row.notas               = patch.notas;
  const { error } = await sb.from('entradas').update(row).eq('id', id);
  if (error) throw new Error(`updateEntrada: ${error.message}`);
  await loadEntradas();
  await loadSKUs();   // stock/CPP cambian con la entrada → refrescar Inventario
  return { id: airtableId };
}

// Borra una entrada individual (no el lote completo). id 'e-N'.
async function removeEntrada(airtableId) {
  const id = Number(String(airtableId).replace('e-', ''));
  if (!Number.isFinite(id)) throw new Error(`removeEntrada: id inválido ${airtableId}`);
  const { error } = await sb.from('entradas').delete().eq('id', id);
  if (error) throw new Error(`removeEntrada: ${error.message}`);
  await loadEntradas();
  await loadSKUs();   // stock/CPP cambian al borrar la entrada → refrescar Inventario
  return { id: airtableId, deleted: true };
}

async function updateLoteHeader(loteDashId, patch) {
  const lote = (window.__AIRTABLE_DATA__?.lotes || []).find((l) => l.id === loteDashId);
  if (!lote) throw new Error(`lote no encontrado: ${loteDashId}`);
  const numIds = (lote.skus || []).map((s) => Number(String(s._airtableId).replace('e-', ''))).filter(Number.isFinite);
  const statusMap = { 'En Camino': 'PENDIENTE', 'Recibido': 'RECIBIDO', 'Perdido': 'PERDIDO' };

  // Actualiza columnas que viven en `entradas` (fecha, status, notas)
  const entRow = {};
  if (patch.fecha  != null) entRow.fecha  = patch.fecha;
  if (patch.status != null) entRow.status = statusMap[patch.status] || 'PENDIENTE';
  if (patch.notas  != null) entRow.notas  = patch.notas;
  if (Object.keys(entRow).length > 0 && numIds.length > 0) {
    const { error } = await sb.from('entradas').update(entRow).in('id', numIds);
    if (error) throw new Error(`updateLoteHeader entradas: ${error.message}`);
  }

  // Actualiza columnas que viven en `lotes` (shared costs, proveedor)
  if (lote._loteIdNum) {
    const lhRow = {};
    if (patch.envio     != null) lhRow.costo_envio     = Number(patch.envio)     || 0;
    if (patch.courier   != null) lhRow.costo_courier   = Number(patch.courier)   || 0;
    if (patch.otros     != null) lhRow.costo_otros     = Number(patch.otros)     || 0;
    if (patch.impuestos != null) lhRow.costo_impuestos = Number(patch.impuestos) || 0;
    if (patch.proveedor != null) lhRow.proveedor_id    = _findContraparteId(patch.proveedor, DEFAULT_PROVEEDOR_ID);
    if (Object.keys(lhRow).length > 0) {
      const { error } = await sb.from('lotes').update(lhRow).eq('id', lote._loteIdNum);
      if (error) throw new Error(`updateLoteHeader lote: ${error.message}`);
    }
    // ── Sincroniza los CFs satélites linkeados a este lote:
    // si se cambió envío/courier/otros, actualiza la salida del CF
    // correspondiente para que el balance de la cuenta refleje el nuevo monto.
    // Los CFs se identifican por concepto/notas porque createLote crea uno por costo.
    if (patch.envio != null || patch.courier != null || patch.otros != null) {
      const { data: cfsLote } = await sb.from('movimientos')
        .select('id, notas, salida')
        .eq('lote_id', lote._loteIdNum);
      if (Array.isArray(cfsLote)) {
        const updates = [];
        cfsLote.forEach((cf) => {
          const n = (cf.notas || '').toLowerCase();
          let newSalida = null;
          if      (patch.envio   != null && n.includes('envío china') ) newSalida = Number(patch.envio)   || 0;
          else if (patch.courier != null && n.includes('courier usa') ) newSalida = Number(patch.courier) || 0;
          else if (patch.otros   != null && n.includes('aduana')      ) newSalida = Number(patch.otros)   || 0;
          if (newSalida != null && newSalida !== cf.salida) {
            updates.push(sb.from('movimientos').update({ salida: newSalida }).eq('id', cf.id));
          }
        });
        if (updates.length > 0) {
          await Promise.all(updates);
          await loadCashflow();
        }
      }
    }
  } else {
    // Lote "suelto" (sin lotes header) — los shared costs no se pueden guardar.
    // Avisamos en consola, no rompemos.
    if (patch.envio != null || patch.courier != null || patch.otros != null || patch.impuestos != null) {
      console.warn(`[SB/updateLoteHeader] lote ${loteDashId} no tiene header de lotes; los shared costs no se guardaron. Borrar y recrear con createLote() para inicializar.`);
    }
  }

  // Refresca cache
  await loadEntradas();
  await loadSKUs();   // status (recibido) / costos afectan stock/CPP → refrescar Inventario
  return { loteId: loteDashId, updatedCount: numIds.length };
}

/* ════════════════════════ WRITERS — MovFin ════════════════════════ */

// data = { tipo (singleSelect airtable), fecha, monto, productoFinAirtableId, productoFinId?,
//          cuentaBanco?, capital?, interes?, seguro?, comision?, mora?, notas? }
async function createMovFin(data) {
  const map = MOVFIN_REV[data.tipo];
  if (!map) throw new Error(`tipo MovFin inválido: "${data.tipo}"`);

  // Resolver producto financiero (préstamo o inversor)
  let prestamoId = null, inversorId = null;
  const refId = data.productoFinAirtableId || (window.__AIRTABLE_DATA__?.financiero || []).find((f) => f.idFin === data.productoFinId)?._airtableId;
  if (refId) {
    if (refId.startsWith('p-')) prestamoId = Number(refId.slice(2));
    if (refId.startsWith('i-')) inversorId = Number(refId.slice(2));
  }

  const monto = Number(data.monto) || 0;
  const row = {
    fecha:           data.fecha,
    tipo:            map.tipo,
    cuenta_id:       _findCuentaId(data.cuentaBanco, DEFAULT_CUENTA_ID),
    contraparte_id:  null,
    entrada:         map.side === 'entrada' ? monto : 0,
    salida:          map.side === 'salida'  ? monto : 0,
    prestamo_id:     prestamoId,
    inversor_id:     inversorId,
    notas:           data.notas || data.tipo,
  };
  // Contraparte por defecto según producto
  if (prestamoId) {
    const list = window.__AIRTABLE_DATA__.financiero || [];
    const p = list.find((f) => f._airtableId === refId);
    if (p?.nombre) row.contraparte_id = _findContraparteId(p.nombre, null);
  } else if (inversorId) {
    row.contraparte_id = _findContraparteId('Andrea Correa', null);
  }
  const { data: ins, error } = await sb.from('movimientos').insert(row).select().single();
  if (error) throw new Error(`createMovFin: ${error.message}`);

  // Trackea el movFin recién creado para que el próximo create('cashflow')
  // (CF mirror del wizard) se SUPRIMA — el movimiento PAGO_PRESTAMO ya creado
  // arriba representa ambos: la operación financiera Y el cash flow.
  _recordMovFin(ins.id, ins.fecha, monto);

  // Actualiza cache movFin
  const mapped = {
    _airtableId: 'mf-' + ins.id,
    idMov:       'MF-' + ins.id,
    tipo:        data.tipo,
    fecha:       ins.fecha,
    monto:       monto,
    capital:     Number(data.capital)  || 0,
    interes:     Number(data.interes)  || 0,
    seguro:      Number(data.seguro)   || 0,
    comision:    Number(data.comision) || 0,
    mora:        Number(data.mora)     || 0,
    cuentaBanco: data.cuentaBanco || '',
    notas:       data.notas || '',
    productoFinAirtableId: refId,
    productoFinId:         data.productoFinId || '',
    productoFinName:       (window.__AIRTABLE_DATA__?.financiero || []).find((f) => f._airtableId === refId)?.nombre || '',
  };
  if (!window.__AIRTABLE_DATA__.movFin) window.__AIRTABLE_DATA__.movFin = [];
  window.__AIRTABLE_DATA__.movFin = [mapped, ...window.__AIRTABLE_DATA__.movFin];
  _dispatch('movFin', window.__AIRTABLE_DATA__.movFin.length);
  return mapped;
}

/* ════════════════════════ WRITERS — Cuentas (banks) ════════════════════════ */

// data = { nombre, tipo (DEBITO/CREDITO/EFECTIVO), moneda (RD/USD),
//          limite (solo si tipo=CREDITO), notas }
async function createCuenta(data) {
  const row = {
    nombre:         data.nombre,
    tipo:           data.tipo || 'DEBITO',
    moneda:         data.moneda || 'RD',
    limite_credito: data.tipo === 'CREDITO' && data.limite ? Number(data.limite) : null,
    notas:          data.notas || '',
    activa:         true,
  };
  const { data: ins, error } = await sb.from('cuentas').insert(row).select().single();
  if (error) throw new Error(`createCuenta: ${error.message}`);
  await _loadLookups();  // refresh cuentas cache
  _dispatch('cuentas', (window.__AIRTABLE_DATA__?._cuentas || []).length);
  return ins;
}

async function updateCuenta(id, patch) {
  const row = {};
  if (patch.nombre  != null) row.nombre = patch.nombre;
  if (patch.tipo    != null) row.tipo = patch.tipo;
  if (patch.moneda  != null) row.moneda = patch.moneda;
  if (patch.limite  != null) row.limite_credito = Number(patch.limite) || null;
  if (patch.notas   != null) row.notas = patch.notas;
  if (patch.activa  != null) row.activa = !!patch.activa;
  const { data, error } = await sb.from('cuentas').update(row).eq('id', id).select().single();
  if (error) throw new Error(`updateCuenta: ${error.message}`);
  await _loadLookups();
  _dispatch('cuentas', (window.__AIRTABLE_DATA__?._cuentas || []).length);
  return data;
}

async function removeCuenta(id) {
  const { error } = await sb.from('cuentas').delete().eq('id', id);
  if (error) throw new Error(`removeCuenta: ${error.message}`);
  await _loadLookups();
  _dispatch('cuentas', (window.__AIRTABLE_DATA__?._cuentas || []).length);
  return { deleted: true, id };
}

/* ════════════════════════ WRITERS — Préstamos (incluye líneas y tarjetas) ════════════════════════ */

// data = { nombre, tipo (PRESTAMO/LINEA_CREDITO/TARJETA_CREDITO),
//          montoInicial?, limiteCredito?, tasaMensual?, seguroMensual?,
//          plazoMeses?, fechaInicio?, fechaPrimerPago?, moneda, contraparteId?, notas }
async function createPrestamo(data) {
  const row = {
    nombre:            data.nombre,
    tipo:              data.tipo || 'PRESTAMO',
    monto_inicial:     data.montoInicial ? Number(data.montoInicial) : null,
    limite_credito:    data.limiteCredito ? Number(data.limiteCredito) : null,
    tasa_mensual:      data.tasaMensual != null && data.tasaMensual !== '' ? Number(data.tasaMensual) : null,
    seguro_mensual:    data.seguroMensual ? Number(data.seguroMensual) : null,
    plazo_meses:       data.plazoMeses ? Number(data.plazoMeses) : null,
    fecha_inicio:      data.fechaInicio || null,
    fecha_primer_pago: data.fechaPrimerPago || null,
    dia_corte:         data.diaCorte ? Number(data.diaCorte) : null,
    dia_vencimiento:   data.diaVencimiento ? Number(data.diaVencimiento) : null,
    moneda:            data.moneda || 'RD',
    contraparte_id:    data.contraparteId ? Number(data.contraparteId)
                        : await _ensureContraparteId(data.contraparte || data.nombre, 'BANCO'),
    activa:            true,
    notas:             data.notas || '',
  };
  const { data: ins, error } = await sb.from('prestamos').insert(row).select().single();
  if (error) throw new Error(`createPrestamo: ${error.message}`);
  await loadFinanciero();
  _buildFinancieroProductos();
  return ins;
}

async function updatePrestamo(id, patch) {
  const row = {};
  const map = {
    nombre: 'nombre', tipo: 'tipo', notas: 'notas',
    montoInicial: 'monto_inicial', limiteCredito: 'limite_credito',
    tasaMensual: 'tasa_mensual', seguroMensual: 'seguro_mensual',
    plazoMeses: 'plazo_meses', fechaInicio: 'fecha_inicio',
    fechaPrimerPago: 'fecha_primer_pago', moneda: 'moneda',
    diaCorte: 'dia_corte', diaVencimiento: 'dia_vencimiento',
    contraparteId: 'contraparte_id', activa: 'activa',
  };
  for (const [k, dbCol] of Object.entries(map)) {
    if (patch[k] !== undefined) {
      row[dbCol] = ['nombre', 'tipo', 'fechaInicio', 'fechaPrimerPago', 'moneda', 'notas'].includes(k)
        ? patch[k]
        : (k === 'activa' ? !!patch[k] : (patch[k] === '' ? null : Number(patch[k])));
    }
  }
  const { data, error } = await sb.from('prestamos').update(row).eq('id', id).select().single();
  if (error) throw new Error(`updatePrestamo: ${error.message}`);
  await loadFinanciero();
  _buildFinancieroProductos();  // refresca productos['FIN-LC']/['FIN-P'] para que la tabla refleje límite/tasa nuevos
  return data;
}

async function removePrestamo(id) {
  const { error } = await sb.from('prestamos').delete().eq('id', id);
  if (error) throw new Error(`removePrestamo: ${error.message}`);
  await loadFinanciero();
  _buildFinancieroProductos();
  return { deleted: true, id };
}

/* ════════════════════════ WRITERS — Inversores ════════════════════════ */

// data = { nombre, capitalInvertido, montoPactadoDevolver, fechaInicio?,
//          plazoMeses?, contraparteId?, notas }
async function createInversor(data) {
  const row = {
    nombre:                 data.nombre,
    capital_invertido:      Number(data.capitalInvertido) || 0,
    monto_pactado_devolver: Number(data.montoPactadoDevolver) || 0,
    fecha_inicio:           data.fechaInicio || null,
    plazo_meses:            data.plazoMeses ? Number(data.plazoMeses) : null,
    contraparte_id:         data.contraparteId ? Number(data.contraparteId)
                             : await _ensureContraparteId(data.nombre, 'INVERSOR'),
    activa:                 true,
    notas:                  data.notas || '',
    tipo_compensacion:      data.tipoCompensacion || 'FLAT',
    pct_aplicado:           data.pctAplicado    != null && data.pctAplicado    !== '' ? Number(data.pctAplicado)    : null,
    cuota_mensual:          data.cuotaMensual   != null && data.cuotaMensual   !== '' ? Number(data.cuotaMensual)   : null,
    bonus_threshold:        data.bonusThreshold != null && data.bonusThreshold !== '' ? Number(data.bonusThreshold) : null,
    cap_devolver:           data.capDevolver    != null && data.capDevolver    !== '' ? Number(data.capDevolver)    : null,
  };
  const { data: ins, error } = await sb.from('inversores').insert(row).select().single();
  if (error) throw new Error(`createInversor: ${error.message}`);
  await loadFinanciero();
  _buildFinancieroProductos();
  return ins;
}

async function updateInversor(id, patch) {
  const row = {};
  if (patch.nombre               != null) row.nombre = patch.nombre;
  if (patch.capitalInvertido     != null) row.capital_invertido = Number(patch.capitalInvertido) || 0;
  if (patch.montoPactadoDevolver != null) row.monto_pactado_devolver = Number(patch.montoPactadoDevolver) || 0;
  if (patch.fechaInicio          != null) row.fecha_inicio = patch.fechaInicio || null;
  if (patch.plazoMeses           != null) row.plazo_meses = patch.plazoMeses ? Number(patch.plazoMeses) : null;
  if (patch.contraparteId        != null) row.contraparte_id = patch.contraparteId ? Number(patch.contraparteId) : null;
  if (patch.notas                != null) row.notas = patch.notas;
  if (patch.activa               != null) row.activa = !!patch.activa;
  if (patch.esDueno              !== undefined) row.es_dueno = !!patch.esDueno;
  if (patch.tipoCompensacion     != null) row.tipo_compensacion = patch.tipoCompensacion;
  if (patch.pctAplicado          !== undefined) row.pct_aplicado    = patch.pctAplicado    === '' || patch.pctAplicado    == null ? null : Number(patch.pctAplicado);
  if (patch.cuotaMensual         !== undefined) row.cuota_mensual   = patch.cuotaMensual   === '' || patch.cuotaMensual   == null ? null : Number(patch.cuotaMensual);
  if (patch.bonusThreshold       !== undefined) row.bonus_threshold = patch.bonusThreshold === '' || patch.bonusThreshold == null ? null : Number(patch.bonusThreshold);
  if (patch.capDevolver          !== undefined) row.cap_devolver    = patch.capDevolver    === '' || patch.capDevolver    == null ? null : Number(patch.capDevolver);
  const { data, error } = await sb.from('inversores').update(row).eq('id', id).select().single();
  if (error) throw new Error(`updateInversor: ${error.message}`);
  await loadFinanciero();
  _buildFinancieroProductos();
  return data;
}

async function removeInversor(id) {
  const { error } = await sb.from('inversores').delete().eq('id', id);
  if (error) throw new Error(`removeInversor: ${error.message}`);
  await loadFinanciero();
  _buildFinancieroProductos();
  return { deleted: true, id };
}

// ── Multi-compensacion: cada inversor puede tener N reglas activas ─
async function createCompensacion(inversorId, data) {
  const row = {
    inversor_id:       Number(inversorId),
    tipo_compensacion: data.tipoCompensacion || 'FLAT',
    monto_pactado:     data.montoPactado    != null && data.montoPactado    !== '' ? Number(data.montoPactado)    : null,
    pct_aplicado:      data.pctAplicado     != null && data.pctAplicado     !== '' ? Number(data.pctAplicado)     : null,
    cuota_mensual:     data.cuotaMensual    != null && data.cuotaMensual    !== '' ? Number(data.cuotaMensual)    : null,
    bonus_threshold:   data.bonusThreshold  != null && data.bonusThreshold  !== '' ? Number(data.bonusThreshold)  : null,
    cap_devolver:      data.capDevolver     != null && data.capDevolver     !== '' ? Number(data.capDevolver)     : null,
    monto_por_unidad:  data.montoPorUnidad  != null && data.montoPorUnidad  !== '' ? Number(data.montoPorUnidad)  : null,
    dia_pago:          data.diaPago         != null && data.diaPago         !== '' ? Number(data.diaPago)         : 17,
    fecha_inicio:      data.fechaInicio || null,
    fecha_fin:         data.fechaFin    || null,
    activa:            data.activa !== false,
    notas:             data.notas || '',
  };
  const { data: ins, error } = await sb.from('compensaciones_inversor').insert(row).select().single();
  if (error) throw new Error(`createCompensacion: ${error.message}`);
  await loadFinanciero();
  _buildFinancieroProductos();
  return ins;
}

async function updateCompensacion(id, patch) {
  const row = {};
  if (patch.tipoCompensacion != null)      row.tipo_compensacion = patch.tipoCompensacion;
  if (patch.montoPactado     !== undefined) row.monto_pactado    = patch.montoPactado    === '' || patch.montoPactado    == null ? null : Number(patch.montoPactado);
  if (patch.pctAplicado      !== undefined) row.pct_aplicado     = patch.pctAplicado     === '' || patch.pctAplicado     == null ? null : Number(patch.pctAplicado);
  if (patch.cuotaMensual     !== undefined) row.cuota_mensual    = patch.cuotaMensual    === '' || patch.cuotaMensual    == null ? null : Number(patch.cuotaMensual);
  if (patch.bonusThreshold   !== undefined) row.bonus_threshold  = patch.bonusThreshold  === '' || patch.bonusThreshold  == null ? null : Number(patch.bonusThreshold);
  if (patch.capDevolver      !== undefined) row.cap_devolver     = patch.capDevolver     === '' || patch.capDevolver     == null ? null : Number(patch.capDevolver);
  if (patch.montoPorUnidad   !== undefined) row.monto_por_unidad = patch.montoPorUnidad  === '' || patch.montoPorUnidad  == null ? null : Number(patch.montoPorUnidad);
  if (patch.diaPago          !== undefined) row.dia_pago         = patch.diaPago         === '' || patch.diaPago         == null ? 17   : Number(patch.diaPago);
  if (patch.fechaInicio      !== undefined) row.fecha_inicio     = patch.fechaInicio || null;
  if (patch.fechaFin         !== undefined) row.fecha_fin        = patch.fechaFin    || null;
  if (patch.activa           !== undefined) row.activa           = !!patch.activa;
  if (patch.notas            !== undefined) row.notas            = patch.notas;
  const { data, error } = await sb.from('compensaciones_inversor').update(row).eq('id', id).select().single();
  if (error) throw new Error(`updateCompensacion: ${error.message}`);
  await loadFinanciero();
  _buildFinancieroProductos();
  return data;
}

async function removeCompensacion(id) {
  const { error } = await sb.from('compensaciones_inversor').delete().eq('id', id);
  if (error) throw new Error(`removeCompensacion: ${error.message}`);
  await loadFinanciero();
  _buildFinancieroProductos();
  return { deleted: true, id };
}

async function removeMovFin(airtableId) {
  const mid = _stripPrefix(airtableId);
  const { error } = await sb.from('movimientos').delete().eq('id', mid);
  if (error) throw new Error(`removeMovFin: ${error.message}`);
  if (window.__AIRTABLE_DATA__.movFin) {
    window.__AIRTABLE_DATA__.movFin = window.__AIRTABLE_DATA__.movFin.filter((m) => m._airtableId !== airtableId);
    _dispatch('movFin', window.__AIRTABLE_DATA__.movFin.length);
  }
  return { deleted: true, id: airtableId };
}

/* ════════════════════════ WRITERS — Genéricos (cashflow, financiero) ════════════════════════
   Los paneles a veces llaman a AT_CLIENT.create('cashflow', fields) / .update() / .remove()
   pasando un objeto cuyas keys vienen del shim window.AT.fields.{table}.* (que exponemos
   debajo). Aquí traducimos esas keys planas a columnas reales de Supabase.       */

async function create(tableKey, fields) {
  if (tableKey === 'cashflow') {
    const fecha   = fields.fecha;
    const entrada = Number(fields.entrada) || 0;
    const salida  = Number(fields.salida)  || 0;
    const monto   = entrada || salida;

    // ── Dedupe: el wizard de panel-fin-productos llama create('cashflow')
    // después de createMovFin para mirror el cash flow. Pero en Supabase
    // el movimiento PAGO_PRESTAMO/PAGO_INVERSOR/etc creado por createMovFin
    // YA representa el cash flow. El CF del wizard sería un duplicado.
    // Detectamos: misma fecha, mismo monto (±1 RD$), dentro de TTL.
    const mf = _recentMovFin();
    if (mf && mf.fecha === fecha && Math.abs(mf.monto - monto) < 1) {
      console.log(`· [SB/create cashflow] suprimido (mirror de MovFin mf-${mf.movId})`);
      return { id: 'cf-' + mf.movId, fields, _dedup: true };
    }

    // Si vino `fields.cuenta` (nombre de cuenta como "BHD Debito" o
    // "Scotia USD"), resolverlo al cuenta_id real. Si no, usar default.
    // Importante: el `tipo` enum del movimiento es ortogonal a la cuenta —
    // NO se deriva del nombre de la cuenta sino del concepto/tipo.
    const cuentaIdResolved = fields.cuenta
      ? _findCuentaId(fields.cuenta, DEFAULT_CUENTA_ID)
      : DEFAULT_CUENTA_ID;

    // Manejo de USD: si el caller pasa montoUsd + tasaCambio, registramos el
    // valor RD$ en entrada/salida pero anotamos el USD en notas para trazabilidad.
    let extraNotas = '';
    if (Number(fields.montoUsd) && Number(fields.tasaCambio)) {
      extraNotas = ` · USD$${Number(fields.montoUsd).toFixed(2)} @ ${Number(fields.tasaCambio).toFixed(2)}`;
    }

    // El `tipo` enum del movimiento se determina por el concepto/tipo del
    // gasto, NO por el nombre de la cuenta. Si el caller pasa fields.tipo
    // úsalo directo; si no, intenta mapear desde fields.concepto (más
    // semántico que fields.cuenta).
    const tipoEnum = fields.tipo
      || TIPO_REV[fields.concepto]
      || TIPO_REV[fields.cuenta]
      || 'OTROS';

    const row = {
      fecha,
      tipo:           tipoEnum,
      cuenta_id:      cuentaIdResolved,
      contraparte_id: _findContraparteId(fields.auxiliar, DEFAULT_CONTRAPARTE_ID),
      entrada,
      salida,
      notas:          (fields.notas || `${fields.cuenta || ''} | ${fields.auxiliar || ''}`) + extraNotas,
    };

    // ── Auto-link: si hubo un createLote reciente, este CF es un satélite
    // (envío, courier, otros, compra) del lote — linkear via lote_id para
    // que removeLote pueda cascadear el cleanup.
    const lt = _recentLote();
    if (lt && lt.fecha === fecha) {
      row.lote_id = lt.loteIdNum;
    }

    const { data, error } = await sb.from('movimientos').insert(row).select().single();
    if (error) throw new Error(`create cashflow: ${error.message}`);
    return { id: 'cf-' + data.id, fields };
  }
  throw new Error(`create(${tableKey}) no implementado en supabase-client`);
}

async function update(tableKey, airtableId, fields) {
  if (tableKey === 'cashflow') {
    const mid = _stripPrefix(airtableId);
    const row = {};
    if (fields.fecha    !== undefined) row.fecha    = fields.fecha;
    // Concepto/tipo: `tipo` (enum directo) tiene prioridad; si no, mapear desde
    // el label amigable (`concepto` o el legacy `cuenta`) vía TIPO_REV.
    if (fields.tipo     !== undefined)      row.tipo = fields.tipo;
    else if (fields.concepto !== undefined) row.tipo = TIPO_REV[fields.concepto] || 'OTROS';
    else if (fields.cuenta   !== undefined) row.tipo = TIPO_REV[fields.cuenta]   || 'OTROS';
    // Cuenta de banco real (cuenta_id) — permite mover el movimiento a otra cuenta.
    if (fields.cuentaBanco !== undefined && fields.cuentaBanco !== '') {
      row.cuenta_id = _findCuentaId(fields.cuentaBanco, DEFAULT_CUENTA_ID);
    }
    if (fields.auxiliar !== undefined) row.contraparte_id = _findContraparteId(fields.auxiliar, DEFAULT_CONTRAPARTE_ID);
    if (fields.entrada  !== undefined) row.entrada  = Number(fields.entrada) || 0;
    if (fields.salida   !== undefined) row.salida   = Number(fields.salida)  || 0;
    if (fields.notas    !== undefined) row.notas    = fields.notas;
    const { error } = await sb.from('movimientos').update(row).eq('id', mid);
    if (error) throw new Error(`update cashflow: ${error.message}`);
    return { id: airtableId };
  }
  if (tableKey === 'financiero') {
    // En Supabase los totales pagados/balances son calculados desde movimientos,
    // no se updatean directamente. No-op silencioso para compat (el cache se
    // refrescará en el próximo loadFinanciero()).
    console.log('[SB/update financiero] no-op (campos calculados desde movimientos)');
    return { id: airtableId };
  }
  throw new Error(`update(${tableKey}) no implementado`);
}

async function remove(tableKey, airtableId) {
  if (tableKey === 'cashflow') {
    const mid = _stripPrefix(airtableId);
    const { error } = await sb.from('movimientos').delete().eq('id', mid);
    if (error) throw new Error(`remove cashflow: ${error.message}`);
    return { deleted: true, id: airtableId };
  }
  if (tableKey === 'entradas') {
    const eid = _stripPrefix(airtableId);
    const { error } = await sb.from('entradas').delete().eq('id', eid);
    if (error) throw new Error(`remove entradas: ${error.message}`);
    return { deleted: true, id: airtableId };
  }
  throw new Error(`remove(${tableKey}) no implementado`);
}

/* ════════════════════════ Compat shim: window.AT.fields ════════════════════════
   Los paneles construyen objetos de fields usando window.AT.fields.{table}.{col}.
   En airtable eso devolvía field IDs (fldXXX). Acá devolvemos strings literales
   que nuestros writers genéricos reconocen.                                     */

window.AT = window.AT || {};
window.AT.fields = window.AT.fields || {};
Object.assign(window.AT.fields, {
  cashflow:   { fecha: 'fecha', cuenta: 'cuenta', auxiliar: 'auxiliar',
                entrada: 'entrada', salida: 'salida', notas: 'notas' },
  financiero: { totalPagado: 'totalPagado', balancePendiente: 'balancePendiente' },
});

/* ════════════════════════ Override globals (CF_ALL, CF_MES, MES, COOP, ANDREA, BHD) ════════════════════════
   Los paneles ya consumen window.__AIRTABLE_DATA__ vía useAirtableTable
   hook PARA SUS PROPIOS RENDERS, pero algunas piezas (ticker, footer,
   paneles financieros, gráficos mensuales) todavía leen los globals
   hardcoded de data.js. Acá los sobrescribimos con datos reales para que
   todo el dashboard se vea consistente. Mismo patrón que VENTAS_SKU/EN_CAMINO.

   Llamar a _overrideGlobals() después de que carguen ventas + cashflow +
   financiero. Dispara airtable-loaded con table='globals' para forzar
   re-render de cualquier componente que esté suscrito.                  */

const _MES_LABELS = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr', '05': 'May', '06': 'Jun',
  '07': 'Jul', '08': 'Ago', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
};
function _ymToLabel(ym) {
  const mm = ym.slice(5, 7);
  const yy = ym.slice(2, 4);
  return `${_MES_LABELS[mm] || mm}-${yy}`;
}

// Mutar array in-place (vacía y rellena). Necesario porque data.js define
// los globals como `const MES = [...]`, que crea un binding en el Script
// Lexical Environment. Asignar window.MES = nuevo SOLO cambia la propiedad
// de window pero NO el binding lexical, así que los paneles que usan `MES`
// (sin window.) siguen viendo el array hardcoded original.
function _replaceArray(arr, newItems) {
  if (!Array.isArray(arr)) return false;
  arr.length = 0;
  for (const it of newItems) arr.push(it);
  return true;
}
function _replaceObject(obj, newProps) {
  if (!obj || typeof obj !== 'object') return false;
  for (const k of Object.keys(obj)) delete obj[k];
  Object.assign(obj, newProps);
  return true;
}

function _overrideGlobals() {
  const D = window.__AIRTABLE_DATA__;
  if (!D) return;

  // ── HOY: actualizar al día real (data.js hardcodea 2026-05-20) ──
  // Asignación a window.HOY sí afecta porque el chequeo en shell.jsx usa
  // `HOY` que cae al window scope cuando no hay binding lexical (HOY es
  // declarado const en data.js — esto NO se actualizará, pero sólo afecta
  // un display string).
  const today = new Date().toISOString().slice(0, 10);
  if (today >= (window.HOY || '0')) window.HOY = today;

  // ── CF_ALL: vaciar (paneles hacen merge con airtableCF; CF_ALL hardcoded
  //    causa duplicados). Mutate in-place. ──
  if (Array.isArray(window.CF_ALL) && Array.isArray(D.cashflow) && D.cashflow.length > 0) {
    _replaceArray(window.CF_ALL, []);
  }

  // ── CF_MES: cashflow agregado por mes ──
  if (Array.isArray(D.cashflow)) {
    const buckets = {};
    D.cashflow.forEach((r) => {
      const ym = (r.f || '').slice(0, 7);
      if (!ym) return;
      if (!buckets[ym]) buckets[ym] = { e: 0, s: 0 };
      buckets[ym].e += r.e || 0;
      buckets[ym].s += r.s || 0;
    });
    const newCfMes = Object.keys(buckets)
      .sort()
      .map((ym) => ({ m: _ymToLabel(ym), e: buckets[ym].e, s: buckets[ym].s }));
    _replaceArray(window.CF_MES, newCfMes);
  }

  // ── MES: P&L mensual real (reemplaza el array hardcoded) ──
  if (Array.isArray(D.ventas) && Array.isArray(D.cashflow)) {
    const vmap = {};
    D.ventas.forEach((v) => {
      const ym = (v.fecha || '').slice(0, 7);
      if (!ym) return;
      if (!vmap[ym]) vmap[ym] = { v: 0, g: 0 };
      vmap[ym].v += v.precioFacturadoTotal || 0;
      vmap[ym].g += v.gananciaTotal        || 0;
    });
    // Capital cierre = balance acumulado al fin del mes (cashflow)
    const sorted = D.cashflow.slice().sort((a, b) => (a.f < b.f ? -1 : 1));
    let running = 0;
    const cmap = {};
    sorted.forEach((r) => {
      running += (r.e || 0) - (r.s || 0);
      const ym = (r.f || '').slice(0, 7);
      if (ym) cmap[ym] = running;
    });
    const allMonths = Array.from(new Set([...Object.keys(vmap), ...Object.keys(cmap)])).sort();
    const newMES = allMonths.map((ym) => {
      const v = vmap[ym]?.v || 0;
      const g = vmap[ym]?.g || 0;
      return {
        m: _ymToLabel(ym),
        v,
        g,
        p: v > 0 ? Number(((g / v) * 100).toFixed(2)) : 0,
        c: cmap[ym] || 0,
        f: `${ym}-01`,
      };
    });
    _replaceArray(window.MES, newMES);
  }

  // ── COOP (préstamo Cooperativa) ──
  if (Array.isArray(D.financiero) && Array.isArray(D.cashflow)) {
    const coop = D.financiero.find((f) =>
      /préstamo|prestamo/i.test(f.tipo) && /coop/i.test(f.nombre)
    );
    if (!coop && window.COOP) {
      _replaceObject(window.COOP, { nombre:'Préstamo Cooperativa', inicio:null, monto:0, saldo:0, pagado:0, tasa:0, seguro:0, cuota:0, abonoMin5pct:0, abonoAcum:0, pagos:[] });
    }
    if (coop) {
      const pagosCF = D.cashflow.filter((m) => m.c === 'Pago Prestamo');
      const pagadoCF = pagosCF.reduce((s, m) => s + (m.s || 0), 0);
      // Saldo: preferimos cashflow (siempre actualizado) sobre vw_saldo_prestamo
      // que solo computa con FK prestamo_id explicito en movimientos (no siempre
      // se setea en bulk-loads). Si los pagos cashflow exceden el capital
      // pagado oficial, usamos cashflow.
      const capitalPagadoOficial = coop._capitalPagado || 0;
      const usarCashflow = pagadoCF > capitalPagadoOficial || coop.balance >= (coop.montoTotal || 115000);
      const saldoCalc = Math.max(0, (coop.montoTotal || 115000) - Math.max(pagadoCF, capitalPagadoOficial));
      const saldoFinal = usarCashflow ? saldoCalc : (coop.balance || saldoCalc);
      _replaceObject(window.COOP, {
        nombre:       coop.nombre || 'Coop Prestamo',
        inicio:       coop.fechaInicio || '2026-02-12',
        monto:        coop.montoTotal || 115000,
        saldo:        saldoFinal,
        pagado:       Math.max(pagadoCF, capitalPagadoOficial),
        tasa:         (coop.tasaMensual || 0.0167) * 100,
        seguro:       coop.seguroMensual || 66.7,
        cuota:        3568.64,
        abonoMin5pct: saldoFinal * 0.05,
        abonoAcum:    0,
        pagos: pagosCF.map((m, i) => ({
          mes:     _ymToLabel(m.f.slice(0, 7)),
          total:   m.s,
          capital: 0, interes: 0, seguro: 0, abono: 0,
          nota:    m.a || `Cuota ${i + 1}`,
        })),
      });
    }
  }

  // ── ANDREA (inversora) ──
  if (Array.isArray(D.financiero) && Array.isArray(D.cashflow)) {
    const inv = D.financiero.find((f) => /inversor/i.test(f.tipo));
    if (!inv && window.ANDREA) {
      _replaceObject(window.ANDREA, { nombre:'Andrea Correa', inicio:null, aporte:0, retorno:0, pagado:0, pendiente:0, pagos:[] });
    }
    if (inv) {
      const pagosCF = D.cashflow.filter((m) => m.c === 'Pago a Inversores');
      const pagado  = pagosCF.reduce((s, m) => s + (m.s || 0), 0);
      _replaceObject(window.ANDREA, {
        nombre:    inv.nombre || 'Andrea Correa',
        inicio:    inv.fechaInicio || '2026-02-14',
        aporte:    inv.montoTotal || 50000,
        retorno:   inv.balance    || 100000,
        pagado,
        pendiente: (inv.balance || 100000) - pagado,
        pagos: pagosCF.map((m) => ({
          mes:   _ymToLabel(m.f.slice(0, 7)),
          monto: m.s,
        })),
      });
    }
  }

  // ── BANCOS_SEED (cuentas de banco) ──
  // Reemplaza el mock hardcoded de panel-fin-productos con las cuentas
  // reales de Supabase. Calcula saldo dinámicamente desde cashflow.
  if (Array.isArray(D._cuentas)) {
    if (!window.BANCOS_SEED) window.BANCOS_SEED = [];
    // Compute saldos por cuenta_id desde el cashflow ya cargado.
    // Como solo BHD Debito (id=1) tiene movimientos en la data histórica,
    // las otras 4 cuentas salen en 0 (correcto reflejo de la migración).
    const saldoPorCuenta = {};
    (D.cashflow || []).forEach((m) => {
      const cid = (window.__AIRTABLE_DATA__._cuentas || []).find((c) => c.nombre === m._origen)?.id;
      if (!cid) return;
      saldoPorCuenta[cid] = (saldoPorCuenta[cid] || 0) + (m.e || 0) - (m.s || 0);
    });
    const tipoSubMap = { DEBITO: 'Corriente', CREDITO: 'Tarjeta de Crédito', EFECTIVO: 'Caja Física' };
    const newBancos = (D._cuentas || []).map((c) => ({
      id:         'BNK-' + String(c.id).padStart(3, '0'),
      _cuentaId:  c.id,
      nombre:     c.nombre,
      tipoSub:    tipoSubMap[c.tipo] || c.tipo,
      fechaInicio: '',
      saldo:      saldoPorCuenta[c.id] || 0,
      moneda:     c.moneda === 'RD' ? 'DOP' : c.moneda,
      nota:       c.notas || '',
      movimientos: (D.cashflow || [])
        .filter((m) => {
          const cuentaName = (window.__AIRTABLE_DATA__._cuentas || []).find((x) => x.id === c.id)?.nombre;
          return m._origen === cuentaName;
        })
        .slice(0, 20)
        .map((m, i) => ({
          id:    'mov-' + c.id + '-' + i,
          fecha: m.f,
          tipo:  m.e > 0 ? 'deposito' : (m.s > 0 ? 'retiro' : 'otro'),
          monto: Math.max(m.e, m.s),
          nota:  (m.c || '') + (m.a ? ' · ' + m.a : ''),
        })),
    }));
    _replaceArray(window.BANCOS_SEED, newBancos);
  }

  // ── BHD (línea de crédito) ──
  if (Array.isArray(D.financiero) && Array.isArray(D.cashflow)) {
    const bhd = D.financiero.find((f) =>
      /línea|linea/i.test(f.tipo) && /bhd/i.test(f.nombre)
    );
    if (!bhd && window.BHD) {
      _replaceObject(window.BHD, { id:'FIN-003', nombre:'Línea de Crédito BHD', limite:0, usado:0, tasaAnual:0, tasaMensual:0, pagado:0, pagos:[], nota:'' });
    }
    if (bhd) {
      // 'usado' = drawdowns netos − pagos a línea. Aproximación desde cashflow:
      //   entradas categoría 'Otro' con auxiliar tipo BHD = drawdowns
      //   salidas categoría 'Pago Linea de Credito' = pagos a línea
      const drawdowns = D.cashflow.filter(
        (m) => m.e > 0 && /bhd|linea/i.test(m.a || '') && (m.c === 'Otro' || m.c === 'Pago Linea de Credito')
      );
      const pagosLinea = D.cashflow.filter((m) => m.c === 'Pago Linea de Credito');
      const usado  = drawdowns.reduce((s, m) => s + (m.e || 0), 0)
                   - pagosLinea.reduce((s, m) => s + (m.s || 0), 0);
      _replaceObject(window.BHD, {
        id:          bhd.idFin || 'FIN-003',
        nombre:      'Línea de Crédito BHD',
        limite:      bhd.montoTotal || 112000,
        usado:       Math.max(0, usado),
        tasaAnual:   26,
        tasaMensual: 26 / 12,
        pagado:      pagosLinea.reduce((s, m) => s + (m.s || 0), 0),
        pagos:       pagosLinea.map((m) => ({ mes: _ymToLabel(m.f.slice(0, 7)), monto: m.s })),
        nota:        bhd.notas || `Línea BHD · 26% anual (~2.17% mensual).`,
      });
    }
  }

  console.log('· [SB/override] globals mutados (CF_ALL=' + (window.CF_ALL||[]).length +
              ' MES.totalV=' + (window.MES||[]).reduce((s,x)=>s+x.v,0).toFixed(0) +
              ' COOP.pagado=' + (window.COOP?.pagado || 0) + ')');
  // Re-dispatch eventos por tabla para que panels re-rendereen con los
  // globals recién mutados. El guard _overrideInFlight evita re-entrar al
  // override (loop infinito).
  _dispatch('globals', 0);
  for (const t of ['cashflow', 'ventas', 'financiero', 'resumen']) {
    const arr = D[t];
    if (Array.isArray(arr)) _dispatch(t, arr.length);
  }
}

// Auto-run el override cuando cargan las tablas relevantes. Idempotente.
// Guard `_overrideInFlight` evita loop infinito: el override re-dispara
// 'airtable-loaded' para que paneles re-rendereen con los globals mutados;
// el listener debe ignorar esos eventos para no re-correrse.
let _overrideTimer = null;
let _overrideInFlight = false;
window.addEventListener('airtable-loaded', (e) => {
  if (_overrideInFlight) return;
  const t = e.detail?.table;
  if (t === 'cashflow' || t === 'ventas' || t === 'financiero' || t === 'productos') {
    if (_overrideTimer) clearTimeout(_overrideTimer);
    _overrideTimer = setTimeout(() => {
      _overrideInFlight = true;
      try { _overrideGlobals(); } finally { _overrideInFlight = false; }
    }, 80);
  }
});

/* ════════════════════════ Exports + boot ════════════════════════ */

// Refresh manual sin recargar la página. Útil cuando Julio cambia data
// directamente en Supabase Studio o desde otra sesión y quiere ver
// los cambios en el dashboard sin perder el estado de la UI.
async function refreshAll() {
  console.log('[SB] refreshAll() iniciando...');
  await _loadLookups();
  await Promise.all([loadSKUs(), loadVentas(), loadEntradas(), loadCashflow(), loadFinanciero()]);
  await loadCuotas();
  await loadMovFin();
  await loadResumen();
  console.log('[SB] refreshAll() completo · ' +
              `${(window.__AIRTABLE_DATA__?.skus||[]).length} skus · ` +
              `${(window.__AIRTABLE_DATA__?.ventas||[]).length} ventas · ` +
              `${(window.__AIRTABLE_DATA__?.cashflow||[]).length} movs`);
  window.toastOk?.('Sincronizado', 'Datos refrescados desde Supabase');
  return { ok: true };
}

window.AT_CLIENT = window.AT_CLIENT || {};
Object.assign(window.AT_CLIENT, {
  loadSKUs, loadVentas, loadEntradas, loadCashflow,
  loadFinanciero, loadCuotas, loadResumen, loadMovFin, refreshAll,
  // Writers específicos
  createSKU, updateSKU, removeSKU, countSKURefs,
  createVenta, removeVenta, updateVentaHeader, updateVentaLineas,
  createLote, removeLote, updateLoteHeader,
  addEntradaToLote, updateEntrada, removeEntrada,
  createMovFin, removeMovFin,
  createCuenta, updateCuenta, removeCuenta,
  createPrestamo, updatePrestamo, removePrestamo,
  createInversor, updateInversor, removeInversor,
  createCompensacion, updateCompensacion, removeCompensacion,
  // Writers genéricos
  create, update, remove,
  // Constantes (los formularios las leen para validar enums)
  SKU_CATEGORIAS: ['Mouse', 'Teclado', 'Headset', 'Stand', 'Mouse Pad', 'Otro'],
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

// Boot: setTimeouts escalonados para que loaders no se solapen al
// arranque. Probamos paralelizar con Promise.all pero el _bootCheck
// concurrente colgaba sin causa clara — el secuencial es suficientemente
// rápido (~600ms total) y conocido funcional. loadMovFin necesita
// financiero cargado (para mapear m.prestamo → idFin), y loadResumen
// necesita ventas + cashflow (espera vía listener si no están listos).
setTimeout(_bootCheck,                                            100);
setTimeout(_loadLookups,                                          120);
setTimeout(loadSKUs,                                              150);
setTimeout(loadVentas,                                            200);
setTimeout(loadEntradas,                                          250);
setTimeout(loadCashflow,                                          300);
setTimeout(async () => { await loadFinanciero(); await loadCuotas(); loadMovFin(); }, 350);
setTimeout(loadResumen,                                           400);

// Fallback: re-correr override + re-dispatchear eventos a 1.5s, 3s, 5s para
// cubrir paneles que monten tarde (React + babel-standalone tarda) o que
// hayan rendereado antes de que el override mutara los globals.
function _scheduledOverride(label) {
  _overrideInFlight = true;
  try {
    console.log('· [SB/override@' + label + ']');
    _overrideGlobals();
  } finally {
    _overrideInFlight = false;
  }
}
setTimeout(() => _scheduledOverride('1.5s'), 1500);
setTimeout(() => _scheduledOverride('3s'),   3000);
setTimeout(() => _scheduledOverride('5s'),   5000);
