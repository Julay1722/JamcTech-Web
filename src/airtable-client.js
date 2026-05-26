// ════════════════════════════════════════════════════════════════
// airtable-client.js
//
// Thin client over the Airtable REST API for the JAMC.Tech base.
// Exposes window.AT and window.AT_CLIENT with simple async helpers.
//
// USAGE
//   await AT_CLIENT.fetchAll('skus')         → array of records
//   await AT_CLIENT.create('ventas', fields) → newly created record
//   await AT_CLIENT.update('ventas', id, fields) → updated record
//   await AT_CLIENT.remove('ventas', id)     → { deleted, id }
//
// SECURITY
//   El cliente JAMÁS toca un PAT. Todas las llamadas pasan por el proxy
//   /.netlify/functions/airtable, que vive en el mismo origen y agrega el
//   header Authorization con el PAT guardado en las env vars de Netlify
//   (AIRTABLE_PAT, AIRTABLE_BASE_ID). Ver PROMPT_RECONSTRUCCION.md §3.
// ════════════════════════════════════════════════════════════════

const AT = {
  // El BASE_ID y el PAT viven SOLO en las env vars de Netlify
  // (AIRTABLE_BASE_ID, AIRTABLE_PAT). El cliente no los necesita: todas
  // las llamadas pasan por el proxy /.netlify/functions/airtable.
  // Table IDs · verificados vía fetchSchema() contra la base de producción.
  tables: {
    skus:            'tbldPTh7FVIh3F3sz',
    ventas:          'tblmR928T0ILBQSnV',
    entradas:        'tbleVa2YYHPSP4X95',
    cashflow:        'tblDKWu1XrnaHr3D8',
    financiero:      'tblQxt724Tu9JieOU',
    resumenMensual:  'tbljR7fLArrNTXPv6',
    movFin:          'tbltaqSskerQ6cWWO',  // §8.2 · Movimientos Financieros
  },
  // Field IDs · agrupados por tabla. Necesarios para crear records
  // (los nombres de campo cambian si renombras columnas en Airtable;
  //  los IDs son estables).
  fields: {
    skus: {
      idSku:               'fldNqVEpqVAR0r2R1',
      nombre:              'fldU6OrcRcHk4CIia',
      marca:               'fldnDucRX84XjTlBq',
      modelo:              'fldqYOIi2UTa5hb0M',
      color:               'fld2EU78SiYy2uA6s',
      categoria:           'fldR31oU7pPqEGZjM',
      precioVenta:         'fldpuhhbH2SDrGXEn',
      notas:               'fldGz2vAVs0DtIQnZ',
      pedidoOrdenado:      'fldkIzrGy5uSlHqEk',
      cppCalculado:        'fldRnYAfNYwERH2BO',
      udsCompradasTotal:   'fldTnXoVQPh9LOCJ0',
      capitalInvertidoTot: 'fldJRHiGyFCpWBxJy',
      ventas:              'fldCsWDrgexRI7US8',
      entradas:            'fld2CR78eg4s8xMO7',
      udsRecibidas:        'fldpXMNSQykDvecEz',
      udsAjuste:           'fld6o4V9D7BUDiIsG',
      udsVendidas:         'fldGfOVsBdwcxnGXt',
      numVentas:           'fldVd78mrc2Ij8dfp',
      ingresosTotales:     'fldMOWF5521PXWtFM',
      gananciaTotal:       'fldFSEWtx9kacmECG',
      capitalInvertido:    'fldJUrSDnKDVegSYt',
      stockCalculado:      'fldyQP6PiwWD8vc3E',
    },
    ventas: {
      idVenta:       'fldStod0n1bkjTH4Q',
      fecha:         'fldGcxdmgdYvacFOm',
      skuRef:        'fldQKV6DUIWqRgufy',
      cantidad:      'fldP3AAThw5j7ybOm',
      facturado:     'fldZG6jms1qI2uldP',
      canal:         'fldNyFnWLwiYvlZ0p',
      envioCobrado:  'fldDAqm0xjI0bDQgd',
      costoUnitario: 'fldEJnWdNWKZxj5lU',
      notas:         'fldcOOUawVSGivk2T',
      ganancia:      'fldEaocO6EVmFuAFt',     // formula
      margenPct:     'fldvJORhwMunXUQRE',     // formula
      sku:           'fldbmeex2xf1PggSR',     // linked record
    },
    entradas: {
      idEntrada:     'fldNiz5pHbXNUadOE',
      fecha:         'fldPEImXAhOrSALGh',
      skuRef:        'fldiAzZ0Fz8jFK1n6',
      status:        'fldqSCH3DCIpmelJR',
      cantidad:      'fldNqfisSLMm5YJeZ',
      proveedor:     'fld5ayxPTFEIyflyI',
      costoBase:     'fldNYa8wHJRCuUB3M',
      envio:         'fldKZVdWdlelv1jmr',
      impuestos:     'fldFsd5Ow7jWvZJna',
      notas:         'fldEdkLp5vTxg2Nz8',
      costoUnitario: 'fldgtqc4UKClKT6fH',     // formula
      valorLote:     'fldhmuS5B7ajbnXp6',     // formula
      sku:           'fldvspqxdi21QmubL',     // linked record
      courier:       'fld7J1mUbY6mGwKo3',
      otrosCostos:   'fld8o6HuSCrJGRo5C',
      loteId:        'fldYE6Y9GGvotUXLM',
    },
    cashflow: {
      idMov:    'fldZGzfC13Tx4sAlO',
      fecha:    'fldbaVd6iy70Brupw',
      cuenta:   'fldEQMdMN3xtP5kj1',
      auxiliar: 'fld4GSqIFzcht8JRk',
      entrada:  'fldjHM3B6XPlElqM4',
      salida:   'fldHgLllmHnkB9UyP',
      origen:   'fld0ioY3dsR4WFTUN',
      notas:    'fldbxhSE3k4HhClKr',
      mes:      'fldhHGd657Arthdq2',           // formula
    },
    financiero: {
      idFin:           'fldgnVqnBYpfJbDum',
      tipo:            'fld7MpjO6UHIepgBH',
      nombre:          'fld0UnCmK1rlyxvFp',
      montoTotal:      'fldzVtUIZZuZdM4dx',
      totalPagado:     'fldcFLNmYtTJg9X05',
      tasaMensual:     'fld6b2jsmyt8qgeEa',
      seguroMensual:   'fldXssdTpyvW2pwxa',
      fechaInicio:     'fldmFbbfgFuswnyJa',
      notas:           'fldShhKBstSfS7QVE',
      balancePendiente:'fldcRMmQ4N1IooFPG',   // formula
    },
    resumen: {
      mes:             'fldObhvgNPGOogJbe',
      capitalInicio:   'fld2VIPUagD6vlBSY',
      ventasTotales:   'fldfFT2n9fMxp6OCz',
      ganancia:        'fldlduSmhwtlSMjmJ',
      margenPct:       'fldxBELuwApDzRmug',
      totalSalidas:    'fld3QARICg6ncfOYG',
      capitalCierre:   'fldBeQvm2q82hOMye',  // formula
    },
    movFin: {
      idMov:       'fld3rBFjGMhiDnvJM',  // formula auto
      tipo:        'fldOgMTwKPbVCOwTV',  // singleSelect
      fecha:       'fldrKLSZGojbqW3Me',  // date
      productoFin: 'fldRmRU7Iv3yr2yo6',  // multipleRecordLinks → financiero
      cuentaBanco: 'fldEuSczEfB7QgcvD',  // singleLineText
      capital:     'fld9ZXTo6XrIUCTnt',  // currency (solo cuota préstamo)
      interes:     'flduRht8mFwOKdQBX',  // currency (con tilde · solo cuota)
      seguro:      'fldpNRTZMSqiij8cE',  // currency (solo cuota)
      notas:       'fldQMSs7ZXgwpzWvv',  // multilineText
      comision:    'fldzovq6WN0y5HVhH',  // currency · cargo bancario extra (ITBIS, tax, fee)
      mora:        'fldREDnR5KbamAiVn',  // currency · cargo manual por atraso (Cuota Préstamo / Pago Línea)
      monto:       'fldEb1kQCLCoqlBNJ',  // currency · monto principal del movimiento
    },
  },
};

// Todas las URLs pasan por el proxy Netlify (/.netlify/functions/airtable).
// El cliente NUNCA envía el PAT — la función Netlify lo añade del lado servidor.
const _PROXY = '/.netlify/functions/airtable';

// Construye la URL del proxy a partir del path remoto (sin BASE_ID) y un
// objeto plano con querystring opcional. Los control params (path, meta)
// los maneja el proxy y no llegan a Airtable.
function _proxyUrl(path, params, opts) {
  const qs = new URLSearchParams();
  qs.set('path', String(path || ''));
  if (opts && opts.meta) qs.set('meta', '1');
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v == null) continue;
      qs.append(k, String(v));
    }
  }
  return `${_PROXY}?${qs.toString()}`;
}

// Resolve a table key/alias to a table ID
function _resolveTable(t) {
  return AT.tables[t] || t;
}

// Generic request wrapper — surfaces Airtable errors clearly.
async function _req(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AT ${method} ${res.status}: ${txt}`);
  }
  return res.json();
}

// Fetch all records of a table (paginates automatically).
async function fetchAll(tableKey, opts = {}) {
  const tableId = _resolveTable(tableKey);
  const records = [];
  let offset = null;
  const max = opts.max || 5000;
  do {
    const params = {};
    if (offset) params.offset = offset;
    if (opts.view) params.view = opts.view;
    if (opts.filterByFormula) params.filterByFormula = opts.filterByFormula;
    if (opts.pageSize) params.pageSize = String(opts.pageSize);
    const data = await _req('GET', _proxyUrl(tableId, params));
    records.push(...data.records);
    offset = data.offset || null;
    if (records.length >= max) break;
  } while (offset);
  return records;
}

async function create(tableKey, fields) {
  const tableId = _resolveTable(tableKey);
  const data = await _req('POST', _proxyUrl(tableId), { fields });
  return data;
}

async function update(tableKey, id, fields) {
  const tableId = _resolveTable(tableKey);
  const data = await _req('PATCH', _proxyUrl(`${tableId}/${id}`), { fields });
  return data;
}

async function remove(tableKey, id) {
  const tableId = _resolveTable(tableKey);
  const data = await _req('DELETE', _proxyUrl(`${tableId}/${id}`));
  return data;
}

// Fetch the meta description of all tables (schema + field IDs).
// Requires the token to have the `schema.bases:read` scope.
async function fetchSchema() {
  return _req('GET', _proxyUrl('tables', null, { meta: true }));
}

// ── Connection sanity-check, runs once on load ───────────────────
// Logs to console; does NOT block anything. Replace this with the
// data-layer swap once you're ready to migrate from seeds to Airtable.
async function _bootCheck() {
  console.group('[AT] verificando conexión a Airtable vía proxy Netlify...');
  try {
    const skus = await fetchAll('skus', { max: 5 });
    console.log(`✓ SKUs · ${skus.length} muestra leída (max 5)`);
    if (skus[0]) console.log('  primer record:', skus[0].id, skus[0].fields);
    const ventas = await fetchAll('ventas', { max: 5 });
    console.log(`✓ Ventas · ${ventas.length} muestra leída (max 5)`);
    if (ventas[0]) console.log('  primer record:', ventas[0].id, ventas[0].fields);
    const cashflow = await fetchAll('cashflow', { max: 5 });
    console.log(`✓ Cashflow · ${cashflow.length} muestra leída (max 5)`);
    if (cashflow[0]) console.log('  primer record:', cashflow[0].id, cashflow[0].fields);
    console.log('▸ conexión OK · usa AT_CLIENT.fetchAll(...) desde la consola para explorar.');
  } catch (e) {
    console.error('✕ falló la conexión vía proxy:', e.message);
    if (/configuración faltante|AIRTABLE_PAT|AIRTABLE_BASE_ID/.test(e.message)) {
      console.error('  → verifica las env vars AIRTABLE_PAT y AIRTABLE_BASE_ID en Netlify.');
    }
  }
  console.groupEnd();
}

window.AT = AT;
window.AT_CLIENT = { fetchAll, create, update, remove, fetchSchema };

// ── SKU loader · Phase 1 de la migración Airtable ─────────────────
// Mapea records de la tabla SKUs al modelo que usa el dashboard (SK_RAW shape).
// Usa detección heurística de field names para no requerir conocer los fldIDs
// exactos — match insensible a mayúsculas/acentos contra patrones comunes.
//
// Resultado guardado en window.__AIRTABLE_DATA__.skus + dispatch event.

const _norm = (s) => (s || '').toString()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip diacríticos
  .toLowerCase()
  .replace(/[.,;:_\-]+$/g, '')                        // strip trailing puntuación
  .trim();

// Patrón → key del modelo dashboard.
// Schema verificado contra la base de producción; patrones más explícitos
// que mapean exactamente los campos de la tabla SKUs.
const _SKU_FIELD_PATTERNS = [
  { key: 'id',       re: /^(id_sku|id|sku|codigo|c[óo]d)$/ },
  { key: 'nm',       re: /^(nombre|name|producto)$/ },
  { key: 'mk',       re: /^(marca|brand|fabricante)$/ },
  { key: 'modelo',   re: /^(modelo|model)$/ },
  { key: 'color',    re: /^(color|colour)$/ },
  { key: 'cat',      re: /^(categoria|category|tipo)$/ },
  { key: 's',        re: /^(stock.calculado|stock|inventario|qty|existencia)$/ },
  { key: 'cpp',      re: /^(costo.promedio.pond|cpp|costo.prom|costo|cost)$/ },
  { key: 'pv',       re: /^(precio.venta|pv|precio|price)$/ },
  { key: 'min',      re: /^(m[íi]nimo|min|umbral|reorden)$/ },
  { key: 'vendido',  re: /^(uds.vendidas|vendido|ventas.totales)$/ },
  { key: 'recibido', re: /^(uds.recibidas|recibido)$/ },
  { key: 'ajuste',   re: /^(uds.ajuste|ajuste)$/ },
  { key: 'numVentas', re: /^(#.*ventas|num.ventas|cantidad.ventas)$/ },
  { key: 'notas',    re: /^(notas|nota|notes)$/ },
];

function _mapSKURecord(rec) {
  const out = { _airtableId: rec.id };
  const unmapped = [];
  for (const [fname, val] of Object.entries(rec.fields || {})) {
    const n = _norm(fname);
    const match = _SKU_FIELD_PATTERNS.find((p) => p.re.test(n));
    if (match) out[match.key] = val;
    else unmapped.push(fname);
  }
  // Reconstruct `nm` if empty using marca + modelo + color (Airtable schema)
  if (!out.nm || out.nm === '(sin nombre)') {
    const parts = [out.mk, out.modelo, out.color].filter(Boolean);
    if (parts.length > 0) out.nm = parts.join(' ');
  }
  // Defaults para mantener compatibilidad con buildSK
  out.id  = out.id  || rec.id;
  out.nm  = out.nm  || '(sin nombre)';
  out.mk  = out.mk  || '—';
  out.cat = out.cat || '—';
  out.s   = parseFloat(out.s)   || 0;
  out.cpp = parseFloat(out.cpp) || 0;
  out.pv  = parseFloat(out.pv)  || 0;
  out.min = parseFloat(out.min) || 0;
  out.enCamino = 0;
  out._unmapped = unmapped;
  return out;
}

async function loadSKUs() {
  try {
    const recs = await fetchAll('skus');
    const mapped = recs.map(_mapSKURecord);
    // Diagnostic: log fields that no patrón pudo mapear (1ra vez)
    const allUnmapped = new Set();
    mapped.forEach((r) => (r._unmapped || []).forEach((u) => allUnmapped.add(u)));
    if (allUnmapped.size > 0) {
      console.log('[AT/skus] fields sin mapear (ignorados):', [...allUnmapped]);
    }
    if (!window.__AIRTABLE_DATA__) window.__AIRTABLE_DATA__ = {};
    window.__AIRTABLE_DATA__.skus = mapped;
    window.dispatchEvent(new CustomEvent('airtable-loaded', { detail: { table: 'skus', count: mapped.length } }));
    console.log(`✓ [AT/skus] ${mapped.length} SKUs cargados desde Airtable`);
    return mapped;
  } catch (e) {
    console.error('✕ [AT/skus] falló:', e.message);
    if (!window.__AIRTABLE_DATA__) window.__AIRTABLE_DATA__ = {};
    window.__AIRTABLE_DATA__.skusError = e.message;
    window.dispatchEvent(new CustomEvent('airtable-error', { detail: { table: 'skus', error: e.message } }));
    return null;
  }
}

window.AT_CLIENT.loadSKUs = loadSKUs;

// ── SKUs writer · §8.3 (Tarea C) ────────────────────────────────
// El campo `Categoría` en la tabla SKUs es singleSelect. Las choices
// vienen del schema verificado vía API (re-leer si Julio modifica).
// Si pasas una categoría fuera de la lista, Airtable rechazará el insert.
const SKU_CATEGORIAS = ['Mouse', 'Teclado', 'Headset', 'Otro'];

function _buildSKUFields(data) {
  const F = AT.fields.skus;
  const out = {};
  if (data.id !== undefined)     out[F.idSku]      = data.id;
  if (data.nm !== undefined)     out[F.nombre]     = data.nm;
  if (data.mk !== undefined)     out[F.marca]      = data.mk;
  if (data.modelo !== undefined) out[F.modelo]     = data.modelo;
  if (data.color !== undefined)  out[F.color]      = data.color;
  if (data.cat !== undefined && data.cat !== '')
    out[F.categoria] = data.cat;
  if (data.pv !== undefined && data.pv !== '' && data.pv !== null)
    out[F.precioVenta] = Number(data.pv) || 0;
  if (data.notas !== undefined)  out[F.notas]      = data.notas;
  return out;
}

// data = { id, nm, mk, modelo, color, cat, pv, notas }
async function createSKU(data) {
  if (data.cat && !SKU_CATEGORIAS.includes(data.cat)) {
    throw new Error(`categoría "${data.cat}" no existe en Airtable. Permitidas: ${SKU_CATEGORIAS.join(', ')}`);
  }
  if (!data.id) throw new Error('createSKU requiere id (CAT-MARCA-MODELO-COLOR)');
  const fields = _buildSKUFields(data);
  const res = await create('skus', fields);
  const mapped = _mapSKURecord(res);
  if (!window.__AIRTABLE_DATA__) window.__AIRTABLE_DATA__ = {};
  if (!window.__AIRTABLE_DATA__.skus) window.__AIRTABLE_DATA__.skus = [];
  window.__AIRTABLE_DATA__.skus = [mapped, ...window.__AIRTABLE_DATA__.skus];
  window.dispatchEvent(new CustomEvent('airtable-loaded', {
    detail: { table: 'skus', count: window.__AIRTABLE_DATA__.skus.length },
  }));
  return mapped;
}

// patch puede traer: id, nm, mk, modelo, color, cat, pv, notas
async function updateSKU(airtableId, patch) {
  if (patch.cat && !SKU_CATEGORIAS.includes(patch.cat)) {
    throw new Error(`categoría "${patch.cat}" no existe en Airtable. Permitidas: ${SKU_CATEGORIAS.join(', ')}`);
  }
  const fields = _buildSKUFields(patch);
  const res = await update('skus', airtableId, fields);
  const mapped = _mapSKURecord(res);
  if (window.__AIRTABLE_DATA__?.skus) {
    window.__AIRTABLE_DATA__.skus = window.__AIRTABLE_DATA__.skus.map((s) =>
      s._airtableId === airtableId ? { ...s, ...mapped } : s,
    );
    window.dispatchEvent(new CustomEvent('airtable-loaded', {
      detail: { table: 'skus', count: window.__AIRTABLE_DATA__.skus.length },
    }));
  }
  return mapped;
}

async function removeSKU(airtableId) {
  await remove('skus', airtableId);
  if (window.__AIRTABLE_DATA__?.skus) {
    window.__AIRTABLE_DATA__.skus = window.__AIRTABLE_DATA__.skus
      .filter((s) => s._airtableId !== airtableId);
    window.dispatchEvent(new CustomEvent('airtable-loaded', {
      detail: { table: 'skus', count: window.__AIRTABLE_DATA__.skus.length },
    }));
  }
  return { deleted: true, id: airtableId };
}

// Cuenta referencias históricas (ventas + entradas) que apuntan al SKU
// dado. Usado por FormEditarSku para mostrar warning antes de eliminar.
function countSKURefs(skuDashId) {
  const ventas = window.__AIRTABLE_DATA__?.ventasRaw || [];
  const entradas = window.__AIRTABLE_DATA__?.entradasRaw || [];
  return {
    ventas: ventas.filter((v) => v.skuRef === skuDashId).length,
    entradas: entradas.filter((e) => e.skuRef === skuDashId).length,
  };
}

window.AT_CLIENT.createSKU      = createSKU;
window.AT_CLIENT.updateSKU      = updateSKU;
window.AT_CLIENT.removeSKU      = removeSKU;
window.AT_CLIENT.countSKURefs   = countSKURefs;
window.AT_CLIENT.SKU_CATEGORIAS = SKU_CATEGORIAS;

// ── Ventas loader · Phase 2 de la migración ─────────────────────
// Cada record en `Ventas` es 1 línea (1 SKU). Una venta multi-SKU son N
// records con el mismo `ID_Venta`. El loader:
//   1. Hace fetchAll
//   2. Agrupa por ID_Venta para reconstruir el header (header.lineas[])
//   3. Sintetiza CF rows (1 entrada por venta agrupada) que el dashboard
//      consume para reemplazar las ventas mock de CF_ALL.

const _VENTA_FIELD_PATTERNS = [
  { key: 'idVenta',  re: /^(id_venta|id|venta_id|venta)$/ },
  { key: 'fecha',    re: /^(fecha|date)$/ },
  { key: 'skuRef',   re: /^(sku_ref|sku.ref|sku.codigo|sku.id)$/ },
  { key: 'sku',      re: /^(sku|skus|sku_link)$/ },
  { key: 'cantidad', re: /^(cantidad|qty|uds)$/ },
  { key: 'facturado',re: /^(facturado|precio.facturado|total|precio.total)$/ },
  { key: 'canal',    re: /^(canal|channel|origen)$/ },
  { key: 'envio',    re: /^(envio.cobrado|envio|shipping)$/ },
  { key: 'costoUd',  re: /^(costo.unitario|costo.ud|costo|cpp)$/ },
  { key: 'ganancia', re: /^(ganancia|profit)$/ },
  { key: 'margen',   re: /^(margen|margin|margen.%|margen %)$/ },
  { key: 'notas',    re: /^(notas|nota|notes)$/ },
];

function _mapVentaLine(rec) {
  const out = { _airtableId: rec.id };
  for (const [fname, val] of Object.entries(rec.fields || {})) {
    const n = _norm(fname);
    const match = _VENTA_FIELD_PATTERNS.find((p) => p.re.test(n));
    if (match) out[match.key] = val;
  }
  out.cantidad  = parseFloat(out.cantidad)  || 0;
  out.facturado = parseFloat(out.facturado) || 0;
  out.envio     = parseFloat(out.envio)     || 0;
  out.costoUd   = parseFloat(out.costoUd)   || 0;
  return out;
}

// Agrupa líneas por idVenta. Reconstruye header con sum de cantidades + max facturado.
function _aggregateVentaLines(lineas) {
  const byId = {};
  lineas.forEach((l) => {
    const key = l.idVenta || l._airtableId;  // fallback si no hay grouping
    if (!byId[key]) {
      byId[key] = {
        idVenta: key,
        fecha: l.fecha,
        canal: l.canal,
        envio: l.envio || 0,
        notas: l.notas || '',
        lineas: [],
        precioFacturadoTotal: 0,
        baseCostTotal: 0,
        gananciaTotal: 0,
        cantidadTotal: 0,
      };
    }
    const g = byId[key];
    // Para multi-line con facturado duplicado, tomar el MAX (todas iguales).
    if (l.facturado > g.precioFacturadoTotal) g.precioFacturadoTotal = l.facturado;
    if (!g.envio && l.envio) g.envio = l.envio;
    if (!g.canal && l.canal) g.canal = l.canal;
    if (!g.fecha && l.fecha) g.fecha = l.fecha;
    g.lineas.push({
      _airtableId: l._airtableId,
      skuRef: l.skuRef,
      skuLinked: Array.isArray(l.sku) ? l.sku[0] : l.sku,
      qty: l.cantidad,
      costoUd: l.costoUd,
      ganancia: l.ganancia || 0,
      baseCost: l.costoUd * l.cantidad,
    });
    g.cantidadTotal += l.cantidad;
    g.baseCostTotal += l.costoUd * l.cantidad;
    g.gananciaTotal += (l.ganancia || 0);
  });
  // If facturado not set on individual lines (some shapes), derive from lineas
  Object.values(byId).forEach((g) => {
    if (g.precioFacturadoTotal === 0) {
      g.precioFacturadoTotal = g.baseCostTotal + g.gananciaTotal;
    }
    g.margenPct = g.precioFacturadoTotal > 0 ? (g.gananciaTotal / g.precioFacturadoTotal) * 100 : 0;
  });
  return Object.values(byId).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

// Sintetiza CF rows (mismo shape que CF_ALL) desde las ventas agrupadas.
function _ventasToCF(ventas) {
  return ventas.map((v) => ({
    f: v.fecha,
    c: 'Venta de mercancia',
    a: v.canal || '',
    e: v.precioFacturadoTotal,
    s: 0,
    _src: 'airtable · venta',
    _ventaId: v.idVenta,
  }));
}

async function loadVentas() {
  try {
    const recs = await fetchAll('ventas');
    const lineas = recs.map(_mapVentaLine);
    const ventas = _aggregateVentaLines(lineas);
    const cfRows = _ventasToCF(ventas);
    if (!window.__AIRTABLE_DATA__) window.__AIRTABLE_DATA__ = {};
    window.__AIRTABLE_DATA__.ventasRaw = lineas;
    window.__AIRTABLE_DATA__.ventas = ventas;
    window.__AIRTABLE_DATA__.ventasCF = cfRows;
    window.dispatchEvent(new CustomEvent('airtable-loaded', { detail: { table: 'ventas', count: ventas.length } }));
    console.log(`✓ [AT/ventas] ${lineas.length} líneas · ${ventas.length} ventas agrupadas`);
    return { lineas, ventas, cfRows };
  } catch (e) {
    console.error('✕ [AT/ventas] falló:', e.message);
    if (!window.__AIRTABLE_DATA__) window.__AIRTABLE_DATA__ = {};
    window.__AIRTABLE_DATA__.ventasError = e.message;
    window.dispatchEvent(new CustomEvent('airtable-error', { detail: { table: 'ventas', error: e.message } }));
    return null;
  }
}

window.AT_CLIENT.loadVentas = loadVentas;

// ── Ventas writer · Phase 2b ────────────────────────────────────
// Recibe una "venta" del dashboard (header + lineas[]) y la persiste como
// N records de Airtable (1 por línea), todos con el mismo ID_Venta.
// Actualiza el cache local + dispara `airtable-loaded` para refrescar la UI.

async function createBatch(tableKey, recordsList) {
  const tableId = _resolveTable(tableKey);
  // Airtable acepta hasta 10 records por request
  const all = [];
  for (let i = 0; i < recordsList.length; i += 10) {
    const chunk = recordsList.slice(i, i + 10);
    const data = await _req('POST', _proxyUrl(tableId), {
      records: chunk.map((fields) => ({ fields })),
    });
    all.push(...data.records);
  }
  return all;
}

function _nextVentaId(fecha) {
  const f = (fecha || HOY_ISO()).replace(/-/g, '').slice(2); // 'YYMMDD'
  const existing = (window.__AIRTABLE_DATA__?.ventas || [])
    .filter((v) => (v.idVenta || '').startsWith(`VTA-${f}`));
  return `VTA-${f}-${String(existing.length + 1).padStart(3, '0')}`;
}
function HOY_ISO() {
  return new Date().toISOString().slice(0, 10);
}

async function createVenta(venta) {
  // venta = { fecha, lineas[{skuId, qty, cppEnVenta}], precioFacturadoTotal, canal, envio?, nota? }
  const skuMap = window.__AIRTABLE_DATA__?.skus || [];
  const findSkuRec = (skuId) => skuMap.find((s) => s.id === skuId)?._airtableId;
  const idVenta = venta.idVenta || _nextVentaId(venta.fecha);
  const F = AT.fields.ventas;
  const records = venta.lineas.map((l) => {
    const skuRec = findSkuRec(l.skuId);
    const fields = {
      [F.idVenta]:       idVenta,
      [F.fecha]:         venta.fecha,
      [F.cantidad]:      l.qty,
      [F.facturado]:     venta.precioFacturadoTotal,
      [F.costoUnitario]: l.cppEnVenta || 0,
      [F.notas]:         venta.nota || '',
      [F.skuRef]:        l.skuId,
    };
    if (venta.canal) fields[F.canal] = venta.canal;
    if (venta.envio) fields[F.envioCobrado] = venta.envio;
    if (skuRec)      fields[F.sku] = [skuRec];
    return fields;
  });
  const created = await createBatch('ventas', records);
  // Mutate local cache so the dashboard reflects the new venta inmediatamente.
  const newLineas = created.map(_mapVentaLine);
  const newVentaGrouped = _aggregateVentaLines(newLineas)[0];
  if (newVentaGrouped) {
    if (!window.__AIRTABLE_DATA__) window.__AIRTABLE_DATA__ = {};
    window.__AIRTABLE_DATA__.ventasRaw = [...newLineas, ...(window.__AIRTABLE_DATA__.ventasRaw || [])];
    window.__AIRTABLE_DATA__.ventas    = [newVentaGrouped, ...(window.__AIRTABLE_DATA__.ventas || [])];
    window.__AIRTABLE_DATA__.ventasCF  = [..._ventasToCF([newVentaGrouped]), ...(window.__AIRTABLE_DATA__.ventasCF || [])];
    window.dispatchEvent(new CustomEvent('airtable-loaded', {
      detail: { table: 'ventas', count: window.__AIRTABLE_DATA__.ventas.length },
    }));
  }
  return { idVenta, airtableIds: created.map((r) => r.id), grouped: newVentaGrouped };
}

window.AT_CLIENT.createBatch = createBatch;
window.AT_CLIENT.createVenta = createVenta;

// ── Venta multi-record helpers ──────────────────────────────────
// Una "venta" en el dashboard agrupa N líneas (cada SKU). En Airtable
// son N records con el mismo ID_Venta. Para borrar/editar venta como
// entidad, hay que operar sobre todos sus records.

async function removeVenta(idVenta) {
  const ventas = window.__AIRTABLE_DATA__?.ventas || [];
  const venta = ventas.find((v) => v.idVenta === idVenta);
  if (!venta) throw new Error(`venta no encontrada: ${idVenta}`);
  const ids = (venta.lineas || []).map((l) => l._airtableId).filter(Boolean);
  if (ids.length === 0) throw new Error(`venta ${idVenta} sin records Airtable`);
  for (const id of ids) {
    await remove('ventas', id);
  }
  // Sincroniza cache local + dispara evento de refresco UI
  if (window.__AIRTABLE_DATA__) {
    window.__AIRTABLE_DATA__.ventas = ventas.filter((v) => v.idVenta !== idVenta);
    window.__AIRTABLE_DATA__.ventasRaw = (window.__AIRTABLE_DATA__.ventasRaw || [])
      .filter((l) => !ids.includes(l._airtableId));
    window.__AIRTABLE_DATA__.ventasCF = (window.__AIRTABLE_DATA__.ventasCF || [])
      .filter((c) => c._ventaId !== idVenta);
    window.dispatchEvent(new CustomEvent('airtable-loaded', {
      detail: { table: 'ventas', count: window.__AIRTABLE_DATA__.ventas.length },
    }));
  }
  return { idVenta, deletedCount: ids.length };
}

// Aplica cambios de "header" (fecha/canal/notas) a TODAS las líneas
// de la venta. No toca los SKUs ni cantidades — para eso, borrar+recrear.
async function updateVentaHeader(idVenta, patch) {
  const ventas = window.__AIRTABLE_DATA__?.ventas || [];
  const venta = ventas.find((v) => v.idVenta === idVenta);
  if (!venta) throw new Error(`venta no encontrada: ${idVenta}`);
  const ids = (venta.lineas || []).map((l) => l._airtableId).filter(Boolean);
  const F = AT.fields.ventas;
  const fields = {};
  if (patch.fecha != null) fields[F.fecha] = patch.fecha;
  if (patch.canal != null) fields[F.canal] = patch.canal;
  if (patch.notas != null) fields[F.notas] = patch.notas;
  for (const id of ids) {
    await update('ventas', id, fields);
  }
  // Actualiza cache local
  if (window.__AIRTABLE_DATA__) {
    if (patch.fecha != null) venta.fecha = patch.fecha;
    if (patch.canal != null) venta.canal = patch.canal;
    if (patch.notas != null) venta.notas = patch.notas;
    window.dispatchEvent(new CustomEvent('airtable-loaded', {
      detail: { table: 'ventas', count: ventas.length },
    }));
  }
  return { idVenta, updatedCount: ids.length };
}

window.AT_CLIENT.removeVenta = removeVenta;
window.AT_CLIENT.updateVentaHeader = updateVentaHeader;

// ── Entradas (Lotes) loader · Phase 3 ───────────────────────────
// Cada record en `Entradas` es 1 línea (1 SKU del lote). Multi-SKU = N
// records con el mismo `Lote ID`. Reconstruye el header agrupando.

const _ENTRADA_FIELD_PATTERNS = [
  { key: 'idEntrada', re: /^(id_entrada|id|entrada_id)$/ },
  { key: 'loteId',    re: /^(lote_id|lote id|lote)$/ },
  { key: 'fecha',     re: /^(fecha|date)$/ },
  { key: 'skuRef',    re: /^(sku_ref|sku.ref|sku.codigo)$/ },
  { key: 'sku',       re: /^(sku|skus)$/ },
  { key: 'status',    re: /^(status|estado)$/ },
  { key: 'cantidad',  re: /^(cantidad|qty|uds)$/ },
  { key: 'proveedor', re: /^(proveedor|provider)$/ },
  { key: 'costoBase', re: /^(costo.base|costo.unit|cost)$/ },
  { key: 'envio',     re: /^(envio|shipping)$/ },
  { key: 'courier',   re: /^(courier|delivery)$/ },
  { key: 'otros',     re: /^(otros.costos|otros|otros.gastos)$/ },
  { key: 'impuestos', re: /^(impuestos|tax)$/ },
  { key: 'notas',     re: /^(notas|nota|notes)$/ },
];

function _mapEntradaLine(rec) {
  const out = { _airtableId: rec.id };
  for (const [fname, val] of Object.entries(rec.fields || {})) {
    const n = _norm(fname);
    const match = _ENTRADA_FIELD_PATTERNS.find((p) => p.re.test(n));
    if (match) out[match.key] = val;
  }
  out.cantidad  = parseFloat(out.cantidad)  || 0;
  out.costoBase = parseFloat(out.costoBase) || 0;
  out.envio     = parseFloat(out.envio)     || 0;
  out.courier   = parseFloat(out.courier)   || 0;
  out.otros     = parseFloat(out.otros)     || 0;
  out.impuestos = parseFloat(out.impuestos) || 0;
  return out;
}

// Lookup SKU dashboard id from linked record reference or skuRef text.
function _resolveSkuDashboardId(line) {
  if (line.skuRef) return line.skuRef;
  const skuMap = window.__AIRTABLE_DATA__?.skus || [];
  const linkedId = Array.isArray(line.sku) ? line.sku[0] : line.sku;
  if (linkedId) {
    const found = skuMap.find((s) => s._airtableId === linkedId);
    if (found) return found.id;
  }
  return '';
}
function _resolveSkuNombre(line) {
  const dashId = _resolveSkuDashboardId(line);
  const skuMap = window.__AIRTABLE_DATA__?.skus || [];
  return skuMap.find((s) => s.id === dashId)?.nm || dashId || '(sin nombre)';
}

// Agrupa entradas por loteId → header con lineas[] (shape LOTES_MOCK del dashboard).
function _aggregateEntradaLines(lineas) {
  const byId = {};
  lineas.forEach((l) => {
    const key = l.loteId || l._airtableId;
    if (!byId[key]) {
      byId[key] = {
        id:        key,
        fecha:     l.fecha,
        status:    l.status || 'En Camino',
        proveedor: l.proveedor || '',
        envio:     0,
        courier:   0,
        otros:     0,
        impuestos: 0,
        nota:      l.notas || '',
        skus:      [],
        pendiente: [],
      };
    }
    const g = byId[key];
    if (l.envio && !g.envio)         g.envio = l.envio;
    if (l.courier && !g.courier)     g.courier = l.courier;
    if (l.otros && !g.otros)         g.otros = l.otros;
    if (l.impuestos && !g.impuestos) g.impuestos = l.impuestos;
    if (l.status)                    g.status = l.status;
    if (!g.fecha && l.fecha)         g.fecha = l.fecha;
    g.skus.push({
      _airtableId: l._airtableId,
      id:          _resolveSkuDashboardId(l),
      nm:          _resolveSkuNombre(l),
      qty:         l.cantidad,
      costoUd:     l.costoBase,
    });
  });
  Object.values(byId).forEach((g) => {
    // Compute "pendiente" list: which shared costs aren't filled yet
    if (g.envio === 0)   g.pendiente.push('envio');
    if (g.courier === 0) g.pendiente.push('courier');
    if (g.otros === 0)   g.pendiente.push('otros');
  });
  return Object.values(byId).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

async function loadEntradas() {
  try {
    const recs = await fetchAll('entradas');
    const lineas = recs.map(_mapEntradaLine);
    const lotes = _aggregateEntradaLines(lineas);
    if (!window.__AIRTABLE_DATA__) window.__AIRTABLE_DATA__ = {};
    window.__AIRTABLE_DATA__.entradasRaw = lineas;
    window.__AIRTABLE_DATA__.lotes = lotes;
    window.dispatchEvent(new CustomEvent('airtable-loaded', { detail: { table: 'entradas', count: lotes.length } }));
    console.log(`✓ [AT/entradas] ${lineas.length} líneas · ${lotes.length} lotes agrupados`);
    return { lineas, lotes };
  } catch (e) {
    console.error('✕ [AT/entradas] falló:', e.message);
    if (!window.__AIRTABLE_DATA__) window.__AIRTABLE_DATA__ = {};
    window.__AIRTABLE_DATA__.entradasError = e.message;
    window.dispatchEvent(new CustomEvent('airtable-error', { detail: { table: 'entradas', error: e.message } }));
    return null;
  }
}

// Crear lote = N records de entrada (1 por SKU) con mismo Lote ID.
async function createLote(lote) {
  // lote = { fecha, status, lineas:[{skuId, qty, costoUd}], envio, courier, otros, nota, loteId? }
  const skuMap = window.__AIRTABLE_DATA__?.skus || [];
  const findSkuRec = (skuId) => skuMap.find((s) => s.id === skuId)?._airtableId;
  const loteId = lote.loteId || `L-${(lote.fecha || HOY_ISO()).replace(/-/g, '').slice(2)}-${String(((window.__AIRTABLE_DATA__?.lotes || []).filter((l) => l.id?.startsWith(`L-${(lote.fecha || HOY_ISO()).replace(/-/g, '').slice(2)}`)).length) + 1).padStart(2, '0')}`;
  const F = AT.fields.entradas;
  const records = lote.lineas.map((l) => {
    const skuRec = findSkuRec(l.skuId);
    const fields = {
      [F.loteId]:    loteId,
      [F.fecha]:     lote.fecha,
      [F.cantidad]:  l.qty,
      [F.costoBase]: l.costoUd,
      [F.skuRef]:    l.skuId,
    };
    if (lote.status)  fields[F.status] = lote.status;
    if (lote.envio)   fields[F.envio] = lote.envio;
    if (lote.courier) fields[F.courier] = lote.courier;
    if (lote.otros)   fields[F.otrosCostos] = lote.otros;
    if (lote.nota)    fields[F.notas] = lote.nota;
    if (skuRec)       fields[F.sku] = [skuRec];
    return fields;
  });
  const created = await createBatch('entradas', records);
  const newLineas = created.map(_mapEntradaLine);
  const newLote = _aggregateEntradaLines(newLineas)[0];
  if (newLote) {
    window.__AIRTABLE_DATA__.entradasRaw = [...newLineas, ...(window.__AIRTABLE_DATA__.entradasRaw || [])];
    window.__AIRTABLE_DATA__.lotes       = [newLote, ...(window.__AIRTABLE_DATA__.lotes || [])];
    window.dispatchEvent(new CustomEvent('airtable-loaded', {
      detail: { table: 'entradas', count: window.__AIRTABLE_DATA__.lotes.length },
    }));
  }
  return { loteId, airtableIds: created.map((r) => r.id), grouped: newLote };
}

window.AT_CLIENT.loadEntradas = loadEntradas;
window.AT_CLIENT.createLote = createLote;

// ── Lote multi-record helpers · §8.1 (Tarea A) ──────────────────
// Un lote en el dashboard agrupa N líneas (cada SKU). En Airtable son
// N records con el mismo loteId. Para borrar/editar el lote como
// entidad hay que operar sobre TODOS sus records — mismo patrón que
// removeVenta/updateVentaHeader.

async function removeLote(loteId) {
  const lotes = window.__AIRTABLE_DATA__?.lotes || [];
  const lote = lotes.find((l) => l.id === loteId);
  if (!lote) throw new Error(`lote no encontrado: ${loteId}`);
  const ids = (lote.skus || []).map((s) => s._airtableId).filter(Boolean);
  if (ids.length === 0) throw new Error(`lote ${loteId} sin records Airtable`);
  for (const id of ids) {
    await remove('entradas', id);
  }
  // Sincroniza cache local
  if (window.__AIRTABLE_DATA__) {
    window.__AIRTABLE_DATA__.lotes = lotes.filter((l) => l.id !== loteId);
    window.__AIRTABLE_DATA__.entradasRaw = (window.__AIRTABLE_DATA__.entradasRaw || [])
      .filter((e) => !ids.includes(e._airtableId));
    window.dispatchEvent(new CustomEvent('airtable-loaded', {
      detail: { table: 'entradas', count: window.__AIRTABLE_DATA__.lotes.length },
    }));
  }
  return { loteId, deletedCount: ids.length };
}

// Aplica cambios de "header" (fecha/status/proveedor/extras/notas) a TODAS
// las líneas del lote. No toca SKUs ni cantidades — para esos cambios,
// borrar y recrear con createLote.
async function updateLoteHeader(loteId, patch) {
  const lotes = window.__AIRTABLE_DATA__?.lotes || [];
  const lote = lotes.find((l) => l.id === loteId);
  if (!lote) throw new Error(`lote no encontrado: ${loteId}`);
  const ids = (lote.skus || []).map((s) => s._airtableId).filter(Boolean);
  const F = AT.fields.entradas;
  const fields = {};
  if (patch.fecha != null)     fields[F.fecha]       = patch.fecha;
  if (patch.status != null)    fields[F.status]      = patch.status;
  if (patch.proveedor != null) fields[F.proveedor]   = patch.proveedor;
  if (patch.envio != null)     fields[F.envio]       = Number(patch.envio) || 0;
  if (patch.courier != null)   fields[F.courier]     = Number(patch.courier) || 0;
  if (patch.otros != null)     fields[F.otrosCostos] = Number(patch.otros) || 0;
  if (patch.impuestos != null) fields[F.impuestos]   = Number(patch.impuestos) || 0;
  if (patch.notas != null)     fields[F.notas]       = patch.notas;
  for (const id of ids) {
    await update('entradas', id, fields);
  }
  // Actualiza cache local
  if (window.__AIRTABLE_DATA__) {
    if (patch.fecha != null)     lote.fecha = patch.fecha;
    if (patch.status != null)    lote.status = patch.status;
    if (patch.proveedor != null) lote.proveedor = patch.proveedor;
    if (patch.envio != null)     lote.envio = Number(patch.envio) || 0;
    if (patch.courier != null)   lote.courier = Number(patch.courier) || 0;
    if (patch.otros != null)     lote.otros = Number(patch.otros) || 0;
    if (patch.impuestos != null) lote.impuestos = Number(patch.impuestos) || 0;
    if (patch.notas != null)     lote.nota = patch.notas;
    // Recalcula pendiente
    lote.pendiente = [];
    if (lote.envio === 0)   lote.pendiente.push('envio');
    if (lote.courier === 0) lote.pendiente.push('courier');
    if (lote.otros === 0)   lote.pendiente.push('otros');
    window.dispatchEvent(new CustomEvent('airtable-loaded', {
      detail: { table: 'entradas', count: lotes.length },
    }));
  }
  return { loteId, updatedCount: ids.length };
}

// Edita UN record de entrada (1 línea de lote). Útil si Julio quiere
// ajustar cantidad/costo de UNA línea específica sin tocar las otras.
async function updateEntrada(airtableId, patch) {
  const F = AT.fields.entradas;
  const fields = {};
  if (patch.fecha != null)     fields[F.fecha]       = patch.fecha;
  if (patch.status != null)    fields[F.status]      = patch.status;
  if (patch.cantidad != null)  fields[F.cantidad]    = Number(patch.cantidad) || 0;
  if (patch.costoBase != null) fields[F.costoBase]   = Number(patch.costoBase) || 0;
  if (patch.proveedor != null) fields[F.proveedor]   = patch.proveedor;
  if (patch.notas != null)     fields[F.notas]       = patch.notas;
  const res = await update('entradas', airtableId, fields);
  // Re-mapea y reagrega para mantener consistencia del cache
  const mapped = _mapEntradaLine(res);
  if (window.__AIRTABLE_DATA__) {
    const raw = window.__AIRTABLE_DATA__.entradasRaw || [];
    window.__AIRTABLE_DATA__.entradasRaw = raw.map((l) =>
      l._airtableId === airtableId ? { ...l, ...mapped } : l,
    );
    window.__AIRTABLE_DATA__.lotes = _aggregateEntradaLines(window.__AIRTABLE_DATA__.entradasRaw);
    window.dispatchEvent(new CustomEvent('airtable-loaded', {
      detail: { table: 'entradas', count: window.__AIRTABLE_DATA__.lotes.length },
    }));
  }
  return mapped;
}

async function removeEntrada(airtableId) {
  await remove('entradas', airtableId);
  if (window.__AIRTABLE_DATA__) {
    const raw = window.__AIRTABLE_DATA__.entradasRaw || [];
    window.__AIRTABLE_DATA__.entradasRaw = raw.filter((l) => l._airtableId !== airtableId);
    window.__AIRTABLE_DATA__.lotes = _aggregateEntradaLines(window.__AIRTABLE_DATA__.entradasRaw);
    window.dispatchEvent(new CustomEvent('airtable-loaded', {
      detail: { table: 'entradas', count: window.__AIRTABLE_DATA__.lotes.length },
    }));
  }
  return { deleted: true, id: airtableId };
}

window.AT_CLIENT.removeLote        = removeLote;
window.AT_CLIENT.updateLoteHeader  = updateLoteHeader;
window.AT_CLIENT.updateEntrada     = updateEntrada;
window.AT_CLIENT.removeEntrada     = removeEntrada;

// ── Cashflow loader · Phase 4 ───────────────────────────────────
// Cada record = 1 movimiento. Mapeo directo a shape de CF_ALL.

const _CF_FIELD_PATTERNS = [
  { key: 'fecha',    re: /^(fecha|date)$/ },
  { key: 'cuenta',   re: /^(cuenta|categor[íi]a|category)$/ },
  { key: 'auxiliar', re: /^(auxiliar|aux|cuenta.auxiliar)$/ },
  { key: 'entrada',  re: /^(entrada|in|ingreso)$/ },
  { key: 'salida',   re: /^(salida|out|egreso|gasto)$/ },
  { key: 'origen',   re: /^(origen|source|tipo)$/ },
  { key: 'notas',    re: /^(notas|nota|notes)$/ },
];
function _mapCFRecord(rec) {
  const out = { _airtableId: rec.id };
  for (const [fname, val] of Object.entries(rec.fields || {})) {
    const n = _norm(fname);
    const match = _CF_FIELD_PATTERNS.find((p) => p.re.test(n));
    if (match) out[match.key] = val;
  }
  // Map to CF_ALL shape: { f, c, a, e, s }
  return {
    f: out.fecha,
    c: out.cuenta || 'Otro',
    a: out.auxiliar || '',
    e: parseFloat(out.entrada) || 0,
    s: parseFloat(out.salida)  || 0,
    _src:     'airtable · cf',
    _origen:  out.origen,
    _airtableId: rec.id,
  };
}
async function loadCashflow() {
  try {
    const recs = await fetchAll('cashflow');
    const cf = recs.map(_mapCFRecord).sort((a, b) => (a.f < b.f ? 1 : -1));
    if (!window.__AIRTABLE_DATA__) window.__AIRTABLE_DATA__ = {};
    window.__AIRTABLE_DATA__.cashflow = cf;
    window.dispatchEvent(new CustomEvent('airtable-loaded', { detail: { table: 'cashflow', count: cf.length } }));
    console.log(`✓ [AT/cashflow] ${cf.length} movimientos`);
    return cf;
  } catch (e) {
    console.error('✕ [AT/cashflow] falló:', e.message);
    if (!window.__AIRTABLE_DATA__) window.__AIRTABLE_DATA__ = {};
    window.__AIRTABLE_DATA__.cashflowError = e.message;
    window.dispatchEvent(new CustomEvent('airtable-error', { detail: { table: 'cashflow', error: e.message } }));
    return null;
  }
}
window.AT_CLIENT.loadCashflow = loadCashflow;

// ── Financiero loader · Phase 5 ─────────────────────────────────
// Una tabla con todos los productos (Préstamo / Inversor / Línea / Banco)
// distinguidos por el campo `Tipo`.

const _FIN_FIELD_PATTERNS = [
  { key: 'idFin',         re: /^(id_fin|id|fin_id)$/ },
  { key: 'tipo',          re: /^(tipo|type|categoria)$/ },
  { key: 'nombre',        re: /^(nombre|name)$/ },
  { key: 'montoTotal',    re: /^(monto.total|monto|principal)$/ },
  { key: 'totalPagado',   re: /^(total.pagado|pagado)$/ },
  { key: 'tasaMensual',   re: /^(tasa.mensual.%|tasa.mensual|tasa.%|tasa)$/ },
  { key: 'seguroMensual', re: /^(seguro.mensual|seguro)$/ },
  { key: 'fechaInicio',   re: /^(fecha.inicio|inicio|start)$/ },
  { key: 'notas',         re: /^(notas|nota|notes)$/ },
  { key: 'balance',       re: /^(balance.pendiente|balance|saldo)$/ },
];
function _mapFinRecord(rec) {
  const out = { _airtableId: rec.id };
  for (const [fname, val] of Object.entries(rec.fields || {})) {
    const n = _norm(fname);
    const match = _FIN_FIELD_PATTERNS.find((p) => p.re.test(n));
    if (match) out[match.key] = val;
  }
  return out;
}
async function loadFinanciero() {
  try {
    const recs = await fetchAll('financiero');
    const fin = recs.map(_mapFinRecord);
    if (!window.__AIRTABLE_DATA__) window.__AIRTABLE_DATA__ = {};
    window.__AIRTABLE_DATA__.financiero = fin;
    window.dispatchEvent(new CustomEvent('airtable-loaded', { detail: { table: 'financiero', count: fin.length } }));
    console.log(`✓ [AT/financiero] ${fin.length} productos`);
    return fin;
  } catch (e) {
    console.error('✕ [AT/financiero] falló:', e.message);
    if (!window.__AIRTABLE_DATA__) window.__AIRTABLE_DATA__ = {};
    window.__AIRTABLE_DATA__.financieroError = e.message;
    window.dispatchEvent(new CustomEvent('airtable-error', { detail: { table: 'financiero', error: e.message } }));
    return null;
  }
}
window.AT_CLIENT.loadFinanciero = loadFinanciero;

// ── Resumen Mensual loader · Phase 6 ────────────────────────────
const _RES_FIELD_PATTERNS = [
  { key: 'm',  re: /^(mes|month)$/ },
  { key: 'ci', re: /^(capital.inicio|inicio)$/ },
  { key: 'v',  re: /^(ventas.totales|ventas)$/ },
  { key: 'g',  re: /^(ganancia|profit)$/ },
  { key: 'p',  re: /^(margen.%|margen)$/ },
  { key: 'sa', re: /^(total.salidas|salidas)$/ },
  { key: 'c',  re: /^(capital.cierre|cierre)$/ },
];
function _mapResumenRecord(rec) {
  const out = { _airtableId: rec.id };
  for (const [fname, val] of Object.entries(rec.fields || {})) {
    const n = _norm(fname);
    const match = _RES_FIELD_PATTERNS.find((p) => p.re.test(n));
    if (match) out[match.key] = val;
  }
  return {
    m: out.m,
    v: parseFloat(out.v) || 0,
    g: parseFloat(out.g) || 0,
    p: parseFloat(out.p) || 0,
    c: parseFloat(out.c) || 0,
    _ci: parseFloat(out.ci) || 0,
    _airtableId: rec.id,
  };
}
async function loadResumen() {
  try {
    const recs = await fetchAll('resumenMensual');
    const res = recs.map(_mapResumenRecord);
    if (!window.__AIRTABLE_DATA__) window.__AIRTABLE_DATA__ = {};
    window.__AIRTABLE_DATA__.resumen = res;
    window.dispatchEvent(new CustomEvent('airtable-loaded', { detail: { table: 'resumen', count: res.length } }));
    console.log(`✓ [AT/resumen] ${res.length} meses`);
    return res;
  } catch (e) {
    console.error('✕ [AT/resumen] falló:', e.message);
    if (!window.__AIRTABLE_DATA__) window.__AIRTABLE_DATA__ = {};
    window.__AIRTABLE_DATA__.resumenError = e.message;
    return null;
  }
}
window.AT_CLIENT.loadResumen = loadResumen;

// ── Financiero consumer · maps records → dashboard product shapes ─
// Cada record de la tabla Financiero (3 productos: Préstamo / Inversor /
// Línea de Crédito) se traduce al modelo que consume FinProductoPanel,
// agrupado por idPrefix de panel.

function _buildFinancieroProductos() {
  const fin = window.__AIRTABLE_DATA__?.financiero || [];
  const cf  = window.__AIRTABLE_DATA__?.cashflow   || [];
  const productos = { 'FIN-P': [], 'FIN-I': [], 'FIN-LC': [] };

  fin.forEach((r) => {
    const tipo = (r.tipo || '').toLowerCase();
    const base = {
      _airtableId: r._airtableId,
      id:          r.idFin || r._airtableId,
      nombre:      r.nombre || 'Sin nombre',
      fechaInicio: r.fechaInicio || '',
      nota:        r.notas || '',
      movimientos: [],
    };
    if (tipo.includes('prestamo') || tipo.includes('préstamo') || tipo === 'loan') {
      productos['FIN-P'].push({
        ...base,
        tipoSub:      'Cooperativa',
        monto:        r.montoTotal || 0,
        saldo:        r.balance || 0,
        pagado:       r.totalPagado || 0,
        tasa:         r.tasaMensual || 0,
        cuota:        0,                  // no en Airtable · derivable
        seguro:       r.seguroMensual || 0,
        abonoMin5pct: (r.balance || 0) * 0.05,
        abonoAcum:    0,
        movimientos: cf
          .filter((m) => m.c === 'Pago Prestamo')
          .map((m, i) => ({
            id:      'pp-' + m._airtableId,
            fecha:   m.f,
            tipo:    'cuota',
            monto:   m.s || 0,
            capital: 0, interes: 0, seguro: 0, abono: 0,
            nota:    m.a || '',
          })),
      });
    } else if (tipo.includes('inversor')) {
      productos['FIN-I'].push({
        ...base,
        tipoSub:    'Inversor 2×',
        aporte:     r.montoTotal || 0,
        retorno:    (r.montoTotal || 0) * 2,
        pagado:     r.totalPagado || 0,
        pendiente:  (r.montoTotal * 2) - (r.totalPagado || 0),
        meta:       48,
        movimientos: cf
          .filter((m) => m.c === 'Pago a Inversores')
          .map((m) => ({
            id:    'pi-' + m._airtableId,
            fecha: m.f,
            tipo:  'pago',
            monto: m.s || 0,
            nota:  m.a || '',
          })),
      });
    } else if (tipo.includes('linea') || tipo.includes('línea') || tipo.includes('credito') || tipo.includes('crédito')) {
      productos['FIN-LC'].push({
        ...base,
        tipoSub:    'Línea Revolvente',
        moneda:     'DOP',
        limite:     r.montoTotal || 0,
        usado:      r.balance || 0,
        tasaAnual:  (r.tasaMensual || 0) * 12,
        tasaMensual:r.tasaMensual || 0,
        movimientos: cf
          .filter((m) => m.a && (m.a.toLowerCase().includes('bhd') || m.a.toLowerCase().includes(r.nombre.toLowerCase())))
          .map((m) => ({
            id:    'lc-' + m._airtableId,
            fecha: m.f,
            tipo:  m.e > 0 ? 'cargo' : 'pago',
            categoria: m.c === 'Intereses' ? 'interes' : 'otro',
            monto: Math.abs(m.e || m.s || 0),
            nota:  m.c,
          })),
      });
    }
  });
  window.__AIRTABLE_DATA__.productos = productos;
  window.dispatchEvent(new CustomEvent('airtable-loaded', { detail: { table: 'productos', count: fin.length } }));
  console.log(`✓ [AT/productos] ${productos['FIN-P'].length} préstamos · ${productos['FIN-I'].length} inversores · ${productos['FIN-LC'].length} líneas`);
}

// Run consumer after both financiero + cashflow load.
let _finReady = false, _cfReady = false;
function _maybeBuildProductos() {
  if (_finReady && _cfReady) _buildFinancieroProductos();
}
window.addEventListener('airtable-loaded', (e) => {
  if (e.detail?.table === 'financiero') { _finReady = true; _maybeBuildProductos(); }
  if (e.detail?.table === 'cashflow')   { _cfReady  = true; _maybeBuildProductos(); }
});

// ── Movimientos Financieros (Phase 7 · §8.2) ────────────────────
// Cada record = un movimiento de un producto financiero (Cooperativa, Andrea,
// línea BHD). Tipos: cuota préstamo, abono, disposición, pago línea, cargo
// línea, depósito inversor, retorno inversor, otro.
//
// Estructura cliente (output del mapper):
//   { _airtableId, idMov, tipo, fecha, monto, productoFinId, productoFinName,
//     cuentaBanco, capital, interes, seguro, notas }

const _MOVFIN_FIELD_PATTERNS = [
  { key: 'idMov',       re: /^(id_mov|id)$/ },
  { key: 'tipo',        re: /^(tipo|type)$/ },
  { key: 'fecha',       re: /^(fecha|date)$/ },
  { key: 'productoFin', re: /^(producto.?fin|producto)$/ },
  { key: 'cuentaBanco', re: /^(cuenta.?banco|banco|cuenta)$/ },
  { key: 'capital',     re: /^(capital)$/ },
  { key: 'interes',     re: /^(inter[eé]s|interes)$/ },
  { key: 'seguro',      re: /^(seguro)$/ },
  { key: 'comision',    re: /^(comisi[oó]n|comision|fee|tax)$/ },
  { key: 'mora',        re: /^(mora|atraso)$/ },
  { key: 'notas',       re: /^(notas|nota|notes)$/ },
  { key: 'monto',       re: /^(monto|total|amount)$/ },
];

function _mapMovFinRecord(rec) {
  const out = { _airtableId: rec.id };
  for (const [fname, val] of Object.entries(rec.fields || {})) {
    const n = _norm(fname);
    const match = _MOVFIN_FIELD_PATTERNS.find((p) => p.re.test(n));
    if (match) out[match.key] = val;
  }
  // ProductoFin viene como array de airtableIds (multipleRecordLinks).
  // Resolvemos al productoFinId del dashboard si lo encontramos.
  const linked = Array.isArray(out.productoFin) ? out.productoFin[0] : null;
  const finList = window.__AIRTABLE_DATA__?.financiero || [];
  const found = finList.find((p) => p._airtableId === linked);
  return {
    _airtableId: rec.id,
    idMov:       out.idMov || rec.id,
    tipo:        out.tipo || 'Otro',
    fecha:       out.fecha || '',
    monto:       parseFloat(out.monto) || 0,
    capital:     parseFloat(out.capital) || 0,
    interes:     parseFloat(out.interes) || 0,
    seguro:      parseFloat(out.seguro) || 0,
    comision:    parseFloat(out.comision) || 0,
    mora:        parseFloat(out.mora) || 0,
    cuentaBanco: out.cuentaBanco || '',
    notas:       out.notas || '',
    productoFinAirtableId: linked,
    productoFinId:   found?.idFin || '',
    productoFinName: found?.nombre || '',
  };
}

async function loadMovFin() {
  try {
    const recs = await fetchAll('movFin');
    const movs = recs.map(_mapMovFinRecord)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    if (!window.__AIRTABLE_DATA__) window.__AIRTABLE_DATA__ = {};
    window.__AIRTABLE_DATA__.movFin = movs;
    window.dispatchEvent(new CustomEvent('airtable-loaded', { detail: { table: 'movFin', count: movs.length } }));
    console.log(`✓ [AT/movFin] ${movs.length} movimientos financieros`);
    return movs;
  } catch (e) {
    console.error('✕ [AT/movFin] falló:', e.message);
    if (!window.__AIRTABLE_DATA__) window.__AIRTABLE_DATA__ = {};
    window.__AIRTABLE_DATA__.movFinError = e.message;
    window.dispatchEvent(new CustomEvent('airtable-error', { detail: { table: 'movFin', error: e.message } }));
    return null;
  }
}

// Tipos válidos según el singleSelect de la tabla Airtable.
// Si pasas otro string, Airtable rechazará el insert.
const MOVFIN_TIPOS = [
  'Cuota Préstamo', 'Abono Préstamo',
  'Disposición Línea', 'Pago Línea', 'Cargo Línea',
  'Depósito Inversor', 'Retorno Inversor',
  'Otro',
];

// data = { tipo, fecha, monto, productoFinId, cuentaBanco?, capital?, interes?, seguro?, notas? }
// productoFinId puede ser el idFin del dashboard ('FIN-P-001' o lo que sea)
// o el _airtableId directo. Resolvemos.
async function createMovFin(data) {
  const F = AT.fields.movFin;
  if (!MOVFIN_TIPOS.includes(data.tipo)) {
    throw new Error(`tipo inválido: "${data.tipo}". Permitidos: ${MOVFIN_TIPOS.join(', ')}`);
  }
  // Resolver productoFinId → airtableId si hace falta
  let linkedId = null;
  if (data.productoFinAirtableId) {
    linkedId = data.productoFinAirtableId;
  } else if (data.productoFinId) {
    const finList = window.__AIRTABLE_DATA__?.financiero || [];
    const found = finList.find((p) => p.idFin === data.productoFinId);
    if (!found) throw new Error(`producto financiero no encontrado: ${data.productoFinId}`);
    linkedId = found._airtableId;
  }
  const fields = {
    [F.tipo]:  data.tipo,
    [F.fecha]: data.fecha,
    [F.monto]: Number(data.monto) || 0,
  };
  if (linkedId)             fields[F.productoFin] = [linkedId];
  if (data.cuentaBanco)     fields[F.cuentaBanco] = data.cuentaBanco;
  if (data.capital != null)  fields[F.capital]    = Number(data.capital)  || 0;
  if (data.interes != null)  fields[F.interes]    = Number(data.interes)  || 0;
  if (data.seguro != null)   fields[F.seguro]     = Number(data.seguro)   || 0;
  if (data.comision != null) fields[F.comision]   = Number(data.comision) || 0;
  if (data.mora != null)     fields[F.mora]       = Number(data.mora)     || 0;
  if (data.notas)            fields[F.notas]      = data.notas;

  const res = await create('movFin', fields);
  // Sincroniza cache local + dispara evento UI refresh
  const mapped = _mapMovFinRecord(res);
  if (!window.__AIRTABLE_DATA__) window.__AIRTABLE_DATA__ = {};
  if (!window.__AIRTABLE_DATA__.movFin) window.__AIRTABLE_DATA__.movFin = [];
  window.__AIRTABLE_DATA__.movFin = [mapped, ...window.__AIRTABLE_DATA__.movFin];
  window.dispatchEvent(new CustomEvent('airtable-loaded', {
    detail: { table: 'movFin', count: window.__AIRTABLE_DATA__.movFin.length },
  }));
  return mapped;
}

async function removeMovFin(airtableId) {
  await remove('movFin', airtableId);
  if (window.__AIRTABLE_DATA__?.movFin) {
    window.__AIRTABLE_DATA__.movFin = window.__AIRTABLE_DATA__.movFin
      .filter((m) => m._airtableId !== airtableId);
    window.dispatchEvent(new CustomEvent('airtable-loaded', {
      detail: { table: 'movFin', count: window.__AIRTABLE_DATA__.movFin.length },
    }));
  }
  return { deleted: true, id: airtableId };
}

window.AT_CLIENT.loadMovFin   = loadMovFin;
window.AT_CLIENT.createMovFin = createMovFin;
window.AT_CLIENT.removeMovFin = removeMovFin;
window.AT_CLIENT.MOVFIN_TIPOS = MOVFIN_TIPOS;

// Run boot check after a tick so it doesn't block the React boot.
setTimeout(_bootCheck, 100);
// Kick off table loads in parallel.
setTimeout(loadSKUs,       150);
setTimeout(loadVentas,     200);
setTimeout(loadEntradas,   250);
setTimeout(loadCashflow,   300);
setTimeout(loadFinanciero, 350);
setTimeout(loadResumen,    400);
setTimeout(loadMovFin,     450);
