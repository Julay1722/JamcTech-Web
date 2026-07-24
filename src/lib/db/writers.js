// ════════════════════════════════════════════════════════════════
// src/lib/db/writers.js — Capa de ESCRITURA. Cada crear/editar/borrar es
// una transacción atómica SINCRONIZADA: toca todas las tablas de la entidad
// (negocio + caja), con monto/moneda correctos y FKs siempre ligadas, con
// rollback compensatorio si una parte falla.
//
// Arregla los bugs de BUGS_DATOS.md (NO los copia). Marcas 🐛 = bug arreglado.
// Supabase-js no da transacciones multi-statement en el cliente; usamos
// secuencia + rollback (igual filosofía que el código viejo, pero corrigiendo
// QUÉ se escribe).
// ════════════════════════════════════════════════════════════════
import { supabase, CAT_TO_DB } from '../supabase.js';
import { num, todayISO } from '../format.js';
import { LOTE_TO_ENTRADA_STATUS, toRD, nextVentaCodigo, nextLoteCodigo, construirScheduleAmortizado } from './helpers.js';

const NOTA_INGRESO = (codigo) => `Ingreso venta ${codigo}`;
const NOTA_GASTO = (codigo) => `Asociado a venta ${codigo}`;

/* ════════════════════════ SKUs ════════════════════════ */
export async function createSKU(d) {
  if (!d.id) throw new Error('createSKU requiere id (CAT-MARCA-MODELO-COLOR)');
  const { data, error } = await supabase.from('skus').insert({
    id_sku: d.id,
    nombre: d.nombre || d.id,
    marca: d.marca || '',
    modelo: d.modelo || '',
    color: d.color || '',
    categoria: CAT_TO_DB[d.categoria] || 'MOUSE',
    precio_venta_sugerido: d.precioSugerido !== '' && d.precioSugerido != null ? num(d.precioSugerido) : null,
    notas: d.notas || '',
    activa: true,
  }).select().single();
  if (error) throw new Error(`createSKU: ${error.message}`);
  return data;
}

export async function updateSKU(idSku, patch) {
  const row = {};
  if (patch.nombre !== undefined) row.nombre = patch.nombre;
  if (patch.marca !== undefined) row.marca = patch.marca;
  if (patch.modelo !== undefined) row.modelo = patch.modelo;
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.categoria !== undefined && patch.categoria !== '') row.categoria = CAT_TO_DB[patch.categoria] || 'MOUSE';
  if (patch.precioSugerido !== undefined && patch.precioSugerido !== '' && patch.precioSugerido != null) row.precio_venta_sugerido = num(patch.precioSugerido);
  if (patch.notas !== undefined) row.notas = patch.notas;
  if (patch.activa !== undefined) row.activa = !!patch.activa;
  if (patch.nuevoId !== undefined && patch.nuevoId && patch.nuevoId !== idSku) row.id_sku = patch.nuevoId; // FK ON UPDATE CASCADE
  const { data, error } = await supabase.from('skus').update(row).eq('id_sku', idSku).select().single();
  if (error) throw new Error(`updateSKU: ${error.message}`);
  return data;
}

export async function removeSKU(idSku) {
  const { error } = await supabase.from('skus').delete().eq('id_sku', idSku);
  if (error) throw new Error(`removeSKU: ${error.message}`);
  return { deleted: true };
}

// Cuántas ventas/entradas referencian el SKU (para confirmar antes de borrar).
export async function countSKURefs(idSku) {
  const [{ count: ventas }, { count: entradas }] = await Promise.all([
    supabase.from('ventas_items').select('id', { count: 'exact', head: true }).eq('sku_id', idSku),
    supabase.from('entradas').select('id', { count: 'exact', head: true }).eq('sku_id', idSku),
  ]);
  return { ventas: ventas || 0, entradas: entradas || 0 };
}

/* ════════════════════════ Ventas ════════════════════════ */
// Sincroniza el movimiento de caja (ingreso VENTA) con el total_facturado real
// de la venta. 🐛 VEN-1: editar venta re-sincroniza la caja. 🐛 VEN-4: venta_id
// siempre ligado.
async function syncIngresoVenta(ventaId, codigo, fecha, canalId, cuentaCobroId) {
  const { data: v } = await supabase.from('ventas').select('total_facturado').eq('id', ventaId).single();
  const entrada = num(v?.total_facturado);
  const { data: existing } = await supabase
    .from('movimientos').select('id').eq('venta_id', ventaId).eq('tipo', 'VENTA').limit(1);
  const row = { fecha, tipo: 'VENTA', entrada, salida: 0, venta_id: ventaId, contraparte_id: canalId, notas: NOTA_INGRESO(codigo) };
  if (cuentaCobroId) row.cuenta_id = cuentaCobroId;
  if (existing && existing.length) {
    const patch = { entrada, fecha, notas: NOTA_INGRESO(codigo) };
    if (cuentaCobroId) patch.cuenta_id = cuentaCobroId;
    if (canalId) patch.contraparte_id = canalId;
    const { error } = await supabase.from('movimientos').update(patch).eq('id', existing[0].id);
    if (error) throw new Error(`syncIngresoVenta update: ${error.message}`);
  } else {
    if (!cuentaCobroId) throw new Error('Falta la cuenta de cobro de la venta'); // 🐛 CTA-1
    const { error } = await supabase.from('movimientos').insert(row);
    if (error) throw new Error(`syncIngresoVenta insert: ${error.message}`);
  }
}

// Gasto directo de la venta (courier/comisión). 🐛 regla 7: si se paga con
// tarjeta → DRAWDOWN entrada>0 + prestamo_id; si débito/efectivo → salida>0.
async function upsertGastoVenta(ventaId, codigo, fecha, gasto) {
  if (!gasto || !num(gasto.monto)) return;
  const monto = num(gasto.monto);
  const esTarjeta = gasto.prestamoId != null;
  const row = {
    fecha,
    tipo: esTarjeta ? 'DRAWDOWN' : (gasto.tipo || 'PAGO_TRANSPORTE'),
    cuenta_id: gasto.cuentaId,
    entrada: esTarjeta ? monto : 0,
    salida: esTarjeta ? 0 : monto,
    prestamo_id: esTarjeta ? gasto.prestamoId : null,
    venta_id: ventaId,
    notas: `${gasto.concepto || 'Gasto'} · ${NOTA_GASTO(codigo)}`,
  };
  if (!row.cuenta_id) throw new Error('Falta la cuenta del gasto asociado'); // 🐛 CTA-1
  const { error } = await supabase.from('movimientos').insert(row);
  if (error) throw new Error(`upsertGastoVenta: ${error.message}`);
}

// v = { fecha, canalId, clienteNombre?, envioCobrado?, descuento?, cuentaCobroId,
//       lineas:[{skuId, cantidad, precio}], gasto?:{monto, cuentaId, prestamoId?, concepto, tipo}, codigo? }
export async function createVenta(v, ventasExistentes) {
  if (!v.cuentaCobroId) throw new Error('Selecciona la cuenta de cobro'); // 🐛 CTA-1
  if (!v.lineas || !v.lineas.length) throw new Error('La venta necesita al menos una línea');
  const codigo = v.codigo || nextVentaCodigo(v.fecha, ventasExistentes);

  // 1. Header
  const { data: header, error: e1 } = await supabase.from('ventas').insert({
    codigo,
    fecha: v.fecha,
    canal_id: v.canalId,
    cliente_nombre: v.clienteNombre || null,
    envio_cobrado: num(v.envioCobrado),
    descuento: num(v.descuento),
    total_facturado: 0,
    total_ganancia: 0,
  }).select().single();
  if (e1) throw new Error(`createVenta header: ${e1.message}`);

  // 2. Items (trigger captura cpp_historico + recalcula totales)
  const items = v.lineas.filter((l) => l.skuId && num(l.cantidad) > 0).map((l) => ({
    venta_id: header.id, sku_id: l.skuId, cantidad: num(l.cantidad), precio_unitario: num(l.precio),
  }));
  const { error: e2 } = await supabase.from('ventas_items').insert(items);
  if (e2) { await supabase.from('ventas').delete().eq('id', header.id); throw new Error(`createVenta items: ${e2.message}`); }

  // 3. Caja: ingreso (entrada = total_facturado, incluye envío cobrado) 🐛 VEN-2/VEN-4
  try {
    await syncIngresoVenta(header.id, codigo, v.fecha, v.canalId, v.cuentaCobroId);
    await upsertGastoVenta(header.id, codigo, v.fecha, v.gasto); // 🐛 regla 7
  } catch (err) {
    // rollback total: sin caja, no hay venta (evita revenue sin capital)
    await supabase.from('movimientos').delete().eq('venta_id', header.id);
    await supabase.from('ventas').delete().eq('id', header.id);
    throw err;
  }
  return { id: header.id, codigo };
}

export async function updateVentaHeader(ventaId, patch, ctx) {
  const row = {};
  if (patch.fecha != null) row.fecha = patch.fecha;
  if (patch.canalId != null) row.canal_id = patch.canalId;
  if (patch.clienteNombre != null) row.cliente_nombre = patch.clienteNombre;
  if (patch.envioCobrado != null) row.envio_cobrado = num(patch.envioCobrado); // trigger recalcula total
  if (patch.descuento != null) row.descuento = num(patch.descuento);
  if (patch.notas != null) row.notas = patch.notas;
  if (Object.keys(row).length) {
    const { error } = await supabase.from('ventas').update(row).eq('id', ventaId);
    if (error) throw new Error(`updateVentaHeader: ${error.message}`);
  }
  // 🐛 VEN-1: re-sincronizar caja con el nuevo total_facturado
  await syncIngresoVenta(ventaId, ctx.codigo, patch.fecha ?? ctx.fecha, patch.canalId ?? ctx.canalId, patch.cuentaCobroId ?? ctx.cuentaCobroId);
  return { id: ventaId };
}

// lineas: { upsert:[{id?, skuId, cantidad, precio}], removeIds:[id] }
export async function updateVentaLineas(ventaId, changes, ctx) {
  for (const id of changes.removeIds || []) {
    const { error } = await supabase.from('ventas_items').delete().eq('id', id);
    if (error) throw new Error(`removeVentaLinea ${id}: ${error.message}`);
  }
  for (const l of changes.upsert || []) {
    if (l.id) {
      const row = {};
      if (l.skuId != null) row.sku_id = l.skuId;
      if (l.cantidad != null) row.cantidad = num(l.cantidad);
      if (l.precio != null) row.precio_unitario = num(l.precio);
      if (l.cppHistorico != null) row.cpp_historico = num(l.cppHistorico);
      if (Object.keys(row).length) {
        const { error } = await supabase.from('ventas_items').update(row).eq('id', l.id);
        if (error) throw new Error(`updateVentaLinea ${l.id}: ${error.message}`);
      }
    } else if (l.skuId && num(l.cantidad) > 0) {
      const { error } = await supabase.from('ventas_items').insert({ venta_id: ventaId, sku_id: l.skuId, cantidad: num(l.cantidad), precio_unitario: num(l.precio) });
      if (error) throw new Error(`addVentaLinea: ${error.message}`);
    }
  }
  // 🐛 VEN-1: triggers ya recalcularon total_facturado; re-sincronizar caja
  await syncIngresoVenta(ventaId, ctx.codigo, ctx.fecha, ctx.canalId, ctx.cuentaCobroId);
  return { id: ventaId };
}

export async function removeVenta(ventaId) {
  // 🐛 VEN-3: borra TODA la caja ligada a la venta (ingreso + gastos asociados)
  await supabase.from('movimientos').delete().eq('venta_id', ventaId);
  const { error } = await supabase.from('ventas').delete().eq('id', ventaId); // items cascadean
  if (error) throw new Error(`removeVenta: ${error.message}`);
  return { deleted: true };
}

/* ════════════════════════ Lotes / Entradas ════════════════════════ */
// l = { fecha, proveedorId, status, moneda('RD'/'USD'), tasaCambio, envio, courier,
//       otros, impuestos, cuentaPagoId, prestamoId?, nota,
//       lineas:[{skuId, cantidad, costoUd}] }
export async function createLote(l, lotesExistentes) {
  if (!l.cuentaPagoId) throw new Error('Selecciona la cuenta de pago del lote'); // 🐛 CTA-1
  if (!l.lineas || !l.lineas.length) throw new Error('El lote necesita al menos una línea');
  const moneda = String(l.moneda || 'RD').toUpperCase();
  const tasa = num(l.tasaCambio);
  if (moneda === 'USD' && !(tasa > 0)) throw new Error('Falta la tasa de cambio USD→RD'); // 🐛 INV-1
  const sbStatus = l.status || 'PENDIENTE';
  const entStatus = LOTE_TO_ENTRADA_STATUS[sbStatus] || 'PENDIENTE';

  // Shared costs convertidos a RD$ (el trigger de prorrateo + CPP asume RD$).
  const envioRD = toRD(l.envio, moneda, tasa);
  const courierRD = toRD(l.courier, moneda, tasa);
  const otrosRD = toRD(l.otros, moneda, tasa);
  const impuestosRD = toRD(l.impuestos, moneda, tasa);

  // 1. Header de lote (valores en RD$ → moneda='RD'; el USD original se anota
  //    en la caja vía monto_usd/tasa_cambio). 🐛 INV-1
  const codigo = l.codigo || nextLoteCodigo(l.fecha, lotesExistentes);
  const { data: lote, error: e0 } = await supabase.from('lotes').insert({
    codigo,
    fecha_pedido: l.fecha,
    fecha_recibido: sbStatus === 'RECIBIDO' ? l.fecha : null,
    proveedor_id: l.proveedorId || null,
    status: sbStatus,
    costo_envio: envioRD,
    costo_courier: courierRD,
    costo_otros: otrosRD,
    costo_impuestos: impuestosRD,
    moneda: 'RD',
    notas: l.nota || '',
  }).select().single();
  if (e0) throw new Error(`createLote header: ${e0.message}`);

  // 2. Entradas — costo_unitario_base SIEMPRE en RD$ 🐛 INV-1
  const rows = l.lineas.filter((x) => x.skuId && num(x.cantidad) > 0).map((x) => ({
    lote_id: lote.id, fecha: l.fecha, sku_id: x.skuId, status: entStatus,
    cantidad: num(x.cantidad), costo_unitario_base: toRD(x.costoUd, moneda, tasa), notas: l.nota || '',
  }));
  const { error: e1 } = await supabase.from('entradas').insert(rows);
  if (e1) { await supabase.from('lotes').delete().eq('id', lote.id); throw new Error(`createLote entradas: ${e1.message}`); }

  // 3. Caja — ligada al lote por lote_id 🐛 INV-5. USD persistido 🐛 INV-4.
  //    Si paga con tarjeta → DRAWDOWN + prestamo_id 🐛 regla 7.
  try {
    const esTarjeta = l.prestamoId != null;
    const merchRD = rows.reduce((s, r) => s + num(r.cantidad) * num(r.costo_unitario_base), 0);
    const merchUSD = moneda === 'USD' && tasa > 0 ? merchRD / tasa : null;
    const movs = [];
    if (merchRD > 0) movs.push(cajaLote('COMPRA_MERCANCIA', merchRD, merchUSD, tasa, moneda, l, lote.id, esTarjeta, `Compra mercancía · lote ${codigo}`));
    const shipRD = envioRD + courierRD;
    if (shipRD > 0) movs.push(cajaLote('ENVIO_LOTE', shipRD, moneda === 'USD' && tasa > 0 ? shipRD / tasa : null, tasa, moneda, l, lote.id, esTarjeta, `Envío/courier · lote ${codigo}`));
    const customsRD = otrosRD + impuestosRD;
    if (customsRD > 0) movs.push(cajaLote('COMPRA_OPERATIVA', customsRD, null, tasa, moneda, l, lote.id, esTarjeta, `Aduana/otros · lote ${codigo}`));
    if (movs.length) {
      const { error: e2 } = await supabase.from('movimientos').insert(movs);
      if (e2) throw new Error(e2.message);
    }
  } catch (err) {
    await supabase.from('entradas').delete().eq('lote_id', lote.id);
    await supabase.from('lotes').delete().eq('id', lote.id);
    throw new Error(`createLote caja: ${err.message}`);
  }
  return { id: lote.id, codigo };
}

function cajaLote(tipo, montoRD, montoUSD, tasa, moneda, l, loteId, esTarjeta, notas) {
  return {
    fecha: l.fecha,
    tipo: esTarjeta ? 'DRAWDOWN' : tipo,
    cuenta_id: l.cuentaPagoId,
    contraparte_id: l.proveedorId || null,
    entrada: esTarjeta ? montoRD : 0,
    salida: esTarjeta ? 0 : montoRD,
    prestamo_id: esTarjeta ? l.prestamoId : null,
    lote_id: loteId,
    monto_usd: moneda === 'USD' && montoUSD != null ? montoUSD : null,
    tasa_cambio: moneda === 'USD' && tasa > 0 ? tasa : null,
    notas,
  };
}

// Editar una entrada (qty/costo/sku). 🐛 INV-2: re-sincronizar el COMPRA_MERCANCIA
// del lote para que la caja siga el costo de mercancía.
export async function updateEntrada(entradaId, patch, moneda, tasa) {
  const row = {};
  if (patch.skuId !== undefined) row.sku_id = patch.skuId;
  if (patch.cantidad !== undefined) row.cantidad = num(patch.cantidad);
  if (patch.costoUd !== undefined) row.costo_unitario_base = toRD(patch.costoUd, moneda, tasa); // 🐛 INV-1
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.notas !== undefined) row.notas = patch.notas;
  const { data, error } = await supabase.from('entradas').update(row).eq('id', entradaId).select('lote_id').single();
  if (error) throw new Error(`updateEntrada: ${error.message}`);
  if (data?.lote_id) await syncCompraLote(data.lote_id);
  return { id: entradaId };
}

export async function addEntradaToLote(loteId, linea, status, moneda, tasa) {
  const { error } = await supabase.from('entradas').insert({
    lote_id: loteId, fecha: linea.fecha, sku_id: linea.skuId,
    status: LOTE_TO_ENTRADA_STATUS[status] || 'PENDIENTE',
    cantidad: num(linea.cantidad), costo_unitario_base: toRD(linea.costoUd, moneda, tasa), notas: linea.nota || '',
  });
  if (error) throw new Error(`addEntradaToLote: ${error.message}`);
  await syncCompraLote(loteId);
  return { ok: true };
}

export async function removeEntrada(entradaId) {
  const { data } = await supabase.from('entradas').select('lote_id').eq('id', entradaId).single();
  const { error } = await supabase.from('entradas').delete().eq('id', entradaId);
  if (error) throw new Error(`removeEntrada: ${error.message}`);
  if (data?.lote_id) await syncCompraLote(data.lote_id);
  return { deleted: true };
}

// Re-sincroniza el movimiento COMPRA_MERCANCIA del lote con el costo real de
// sus entradas. 🐛 INV-2.
async function syncCompraLote(loteId) {
  const { data: ents } = await supabase.from('entradas').select('cantidad, costo_unitario_base').eq('lote_id', loteId);
  const merch = (ents || []).reduce((s, e) => s + num(e.cantidad) * num(e.costo_unitario_base), 0);
  const { data: mov } = await supabase.from('movimientos').select('id, entrada, salida, prestamo_id').eq('lote_id', loteId).eq('tipo', 'COMPRA_MERCANCIA').limit(1);
  if (mov && mov.length) {
    const m = mov[0];
    const esTarjeta = m.prestamo_id != null;
    const patch = esTarjeta ? { entrada: merch } : { salida: merch };
    await supabase.from('movimientos').update(patch).eq('id', m.id);
  }
}

// Editar header del lote (status, proveedor, shared costs). 🐛 INV-3: convierte
// USD, re-sincroniza caja de envío/courier/aduana, respeta regla 7.
export async function updateLoteHeader(loteId, patch, moneda, tasa) {
  const m = String(moneda || 'RD').toUpperCase();
  const lhRow = {};
  if (patch.status != null) lhRow.status = patch.status;
  if (patch.proveedorId != null) lhRow.proveedor_id = patch.proveedorId;
  if (patch.fechaRecibido != null) lhRow.fecha_recibido = patch.fechaRecibido;
  if (patch.envio != null) lhRow.costo_envio = toRD(patch.envio, m, tasa);
  if (patch.courier != null) lhRow.costo_courier = toRD(patch.courier, m, tasa);
  if (patch.otros != null) lhRow.costo_otros = toRD(patch.otros, m, tasa);
  if (patch.impuestos != null) lhRow.costo_impuestos = toRD(patch.impuestos, m, tasa);
  if (Object.keys(lhRow).length) {
    const { error } = await supabase.from('lotes').update(lhRow).eq('id', loteId);
    if (error) throw new Error(`updateLoteHeader: ${error.message}`);
  }
  // Si cambió el status, propagar a las entradas (recibir lote → entradas RECIBIDO)
  if (patch.status != null) {
    await supabase.from('entradas').update({ status: LOTE_TO_ENTRADA_STATUS[patch.status] || 'PENDIENTE' }).eq('lote_id', loteId);
  }
  return { id: loteId };
}

export async function removeLote(loteId) {
  // Borra caja satélite ligada por lote_id, luego entradas, luego header.
  await supabase.from('movimientos').delete().eq('lote_id', loteId);
  await supabase.from('entradas').delete().eq('lote_id', loteId);
  const { error } = await supabase.from('lotes').delete().eq('id', loteId);
  if (error) throw new Error(`removeLote: ${error.message}`);
  return { deleted: true };
}

/* ════════════════════════ Movimientos (caja genérica / gasto / transferencia) ════════════════════════ */
// 🐛 CTA-1: exige cuenta. 🐛 CTA-2: transferencia interna = 1 fila con
// cuenta_destino_id. 🐛 regla 7: gasto a tarjeta = DRAWDOWN+prestamo_id.
export async function createMovimiento(d) {
  if (!d.cuentaId) throw new Error('Selecciona la cuenta'); // 🐛 CTA-1
  if (d.tipo === 'TRANSFERENCIA_INTERNA') {
    if (!d.cuentaDestinoId) throw new Error('Selecciona la cuenta destino de la transferencia');
    if (d.cuentaDestinoId === d.cuentaId) throw new Error('Origen y destino no pueden ser la misma cuenta');
    const monto = num(d.monto);                          // sale del origen (moneda del origen)
    // Cross-currency: si las cuentas tienen monedas distintas, la pata destino
    // recibe el monto EN SU MONEDA (montoLlega), no el mismo número que sale.
    // Ej. BHD(RD) → Scotia(USD): salida 5,900 RD en origen, entrada 100 USD en
    // destino, tasa 59. Cada saldo queda correcto en la moneda de su cuenta.
    const montoLlega = d.montoLlega != null && num(d.montoLlega) > 0 ? num(d.montoLlega) : monto;
    const tasa = d.tasaCambio != null && num(d.tasaCambio) ? num(d.tasaCambio) : null;
    // Persistimos el valor USD del cruce en AMBAS patas para que la conversión
    // quede auditable (antes quedaba null y la diferencia cambiaria se perdía).
    const montoUsd = d.montoUsd != null && num(d.montoUsd) ? num(d.montoUsd) : null;
    // 🐛 CTA-2: transferencia = DOS patas. vw_saldo_cuenta solo suma por cuenta_id
    // (NO lee cuenta_destino_id), así que una sola fila debitaría el origen pero
    // NUNCA acreditaría el destino. Creamos: (salida del origen) + (entrada al
    // destino), ambas con un token compartido en notas para borrarlas juntas
    // (resuelve el riesgo de "pata huérfana" del código viejo). cuenta_destino_id
    // queda en ambas para trazar el par.
    const token = `#TRF-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const nota = d.notas || 'Transferencia interna';
    const legs = [
      { fecha: d.fecha, tipo: 'TRANSFERENCIA_INTERNA', cuenta_id: d.cuentaId, cuenta_destino_id: d.cuentaDestinoId, entrada: 0, salida: monto, monto_usd: montoUsd, tasa_cambio: tasa, notas: `${nota} ${token}` },
      { fecha: d.fecha, tipo: 'TRANSFERENCIA_INTERNA', cuenta_id: d.cuentaDestinoId, cuenta_destino_id: d.cuentaId, entrada: montoLlega, salida: 0, monto_usd: montoUsd, tasa_cambio: tasa, notas: `${nota} ${token}` },
    ];
    const { data, error } = await supabase.from('movimientos').insert(legs).select();
    if (error) throw new Error(`createMovimiento (transfer): ${error.message}`);
    return { ...data[0], _token: token, _legs: data };
  }
  const esTarjeta = d.prestamoId != null;
  const monto = num(d.monto);
  const row = {
    fecha: d.fecha,
    tipo: esTarjeta ? 'DRAWDOWN' : (d.tipo || 'OTROS'),
    cuenta_id: d.cuentaId,
    contraparte_id: d.contraparteId || null,
    entrada: d.entrada != null ? num(d.entrada) : (esTarjeta ? monto : (d.side === 'entrada' ? monto : 0)),
    salida: d.salida != null ? num(d.salida) : (esTarjeta ? 0 : (d.side === 'salida' ? monto : 0)),
    prestamo_id: esTarjeta ? d.prestamoId : null,
    inversor_id: d.inversorId || null,
    monto_usd: d.montoUsd != null && num(d.montoUsd) ? num(d.montoUsd) : null,
    tasa_cambio: d.tasaCambio != null && num(d.tasaCambio) ? num(d.tasaCambio) : null,
    notas: d.notas || '',
  };
  const { data, error } = await supabase.from('movimientos').insert(row).select().single();
  if (error) throw new Error(`createMovimiento: ${error.message}`);
  return data;
}

export async function updateMovimiento(id, patch) {
  const row = {};
  if (patch.fecha !== undefined) row.fecha = patch.fecha;
  if (patch.tipo !== undefined) row.tipo = patch.tipo;
  if (patch.cuentaId !== undefined) row.cuenta_id = patch.cuentaId;
  if (patch.contraparteId !== undefined) row.contraparte_id = patch.contraparteId;
  if (patch.entrada !== undefined) row.entrada = num(patch.entrada);
  if (patch.salida !== undefined) row.salida = num(patch.salida);
  if (patch.prestamoId !== undefined) row.prestamo_id = patch.prestamoId;
  if (patch.notas !== undefined) row.notas = patch.notas;
  const { error } = await supabase.from('movimientos').update(row).eq('id', id);
  if (error) throw new Error(`updateMovimiento: ${error.message}`);
  return { id };
}

export async function removeMovimiento(id) {
  // Leer el movimiento para detectar casos especiales (transferencia de 2 patas).
  const { data: mov } = await supabase.from('movimientos').select('tipo, notas').eq('id', id).single();

  // 🐛 CTA-2: si es una pata de transferencia, borrar AMBAS patas (mismo token)
  // para no descuadrar las cuentas dejando una pata huérfana.
  if (mov && mov.tipo === 'TRANSFERENCIA_INTERNA') {
    const tk = (mov.notas || '').match(/#TRF-\d+-\d+/);
    if (tk) {
      const { error } = await supabase.from('movimientos').delete().ilike('notas', `%${tk[0]}%`);
      if (error) throw new Error(`removeMovimiento (transfer): ${error.message}`);
      return { deleted: true, transfer: true };
    }
  }

  // Si este movimiento pagaba una cuota, desligar y revertir la cuota a pendiente
  // antes de borrar (FK circular cuotas↔movimientos; además borrar el pago debe
  // dejar la cuota como NO pagada para que el saldo vuelva a subir). Inverso de DEU-2.
  const { data: cuotasLigadas } = await supabase.from('cuotas').select('id').eq('movimiento_id', id);
  if (cuotasLigadas && cuotasLigadas.length) {
    await supabase.from('cuotas').update({ pagada: false, fecha_pagada: null, movimiento_id: null })
      .eq('movimiento_id', id);
  }
  const { error } = await supabase.from('movimientos').delete().eq('id', id);
  if (error) throw new Error(`removeMovimiento: ${error.message}`);
  return { deleted: true };
}

/* ════════════════════════ Pago a préstamo / línea / cuota / inversor ════════════════════════ */
// 🐛 DEU-2: pagar una cuota marca cuotas.pagada + fecha_pagada + movimiento_id.
// 🐛 INVR-1: pago a inversor lleva inversor_id (la vista baja).
// d = { fecha, monto, cuentaId, prestamoId?, inversorId?, cuotaId?, capital?, interes?, seguro?, tipo, side, notas }
export async function createPagoFinanciero(d) {
  if (!d.cuentaId) throw new Error('Selecciona la cuenta'); // 🐛 CTA-1
  const monto = num(d.monto);
  const side = d.side || 'salida';
  const { data: mov, error } = await supabase.from('movimientos').insert({
    fecha: d.fecha,
    tipo: d.tipo,
    cuenta_id: d.cuentaId,
    contraparte_id: d.contraparteId || null,
    entrada: side === 'entrada' ? monto : 0,
    salida: side === 'salida' ? monto : 0,
    prestamo_id: d.prestamoId || null,
    inversor_id: d.inversorId || null, // 🐛 INVR-1
    cuota_id: d.cuotaId || null,
    // FX: en pagos a deuda/cuenta USD guardamos el valor USD + la tasa del día,
    // para que quede el equivalente RD y sea auditable (antes se perdía).
    monto_usd: d.montoUsd != null && num(d.montoUsd) ? num(d.montoUsd) : null,
    tasa_cambio: d.tasaCambio != null && num(d.tasaCambio) ? num(d.tasaCambio) : null,
    notas: d.notas || '',
  }).select().single();
  if (error) throw new Error(`createPagoFinanciero: ${error.message}`);

  // 🐛 DEU-2: si paga una cuota, marcarla pagada y ligar el movimiento.
  if (d.cuotaId) {
    const { error: e2 } = await supabase.from('cuotas').update({
      pagada: true, fecha_pagada: d.fecha, movimiento_id: mov.id,
    }).eq('id', d.cuotaId);
    if (e2) { await supabase.from('movimientos').delete().eq('id', mov.id); throw new Error(`pago cuota: ${e2.message}`); }
  }
  return mov;
}

/* ════════════════════════ Cuentas ════════════════════════ */
export async function createCuenta(d) {
  const { data, error } = await supabase.from('cuentas').insert({
    nombre: d.nombre,
    tipo: d.tipo || 'DEBITO',
    moneda: d.moneda || 'RD',
    limite_credito: d.tipo === 'CREDITO' && d.limite ? num(d.limite) : null,
    notas: d.notas || '',
    activa: true,
  }).select().single();
  if (error) throw new Error(`createCuenta: ${error.message}`);
  return data;
}
export async function updateCuenta(id, patch) {
  const row = {};
  if (patch.nombre != null) row.nombre = patch.nombre;
  if (patch.tipo != null) row.tipo = patch.tipo;
  if (patch.moneda != null) row.moneda = patch.moneda;
  if (patch.limite != null) row.limite_credito = num(patch.limite) || null;
  if (patch.notas != null) row.notas = patch.notas;
  if (patch.activa != null) row.activa = !!patch.activa;
  const { data, error } = await supabase.from('cuentas').update(row).eq('id', id).select().single();
  if (error) throw new Error(`updateCuenta: ${error.message}`);
  return data;
}
export async function removeCuenta(id) {
  const { error } = await supabase.from('cuentas').update({ activa: false }).eq('id', id); // soft-delete
  if (error) throw new Error(`removeCuenta: ${error.message}`);
  return { deleted: true };
}

/* ════════════════════════ Préstamos ════════════════════════ */
export async function createPrestamo(d) {
  const { data, error } = await supabase.from('prestamos').insert({
    nombre: d.nombre,
    tipo: d.tipo || 'PRESTAMO',
    contraparte_id: d.contraparteId || null,
    monto_inicial: d.montoInicial ? num(d.montoInicial) : null,
    limite_credito: d.limiteCredito ? num(d.limiteCredito) : null,
    tasa_mensual: d.tasaMensual !== '' && d.tasaMensual != null ? num(d.tasaMensual) : null,
    seguro_mensual: d.seguroMensual ? num(d.seguroMensual) : null,
    plazo_meses: d.plazoMeses ? num(d.plazoMeses) : null,
    fecha_inicio: d.fechaInicio || null,
    fecha_primer_pago: d.fechaPrimerPago || null,
    dia_corte: d.diaCorte ? num(d.diaCorte) : null,
    dia_vencimiento: d.diaVencimiento ? num(d.diaVencimiento) : null,
    moneda: d.moneda || 'RD',
    activa: true,
    notas: d.notas || '',
  }).select().single();
  if (error) throw new Error(`createPrestamo: ${error.message}`);
  return data;
}
export async function updatePrestamo(id, patch) {
  const map = { nombre: 'nombre', tipo: 'tipo', notas: 'notas', montoInicial: 'monto_inicial', limiteCredito: 'limite_credito', tasaMensual: 'tasa_mensual', seguroMensual: 'seguro_mensual', plazoMeses: 'plazo_meses', fechaInicio: 'fecha_inicio', fechaPrimerPago: 'fecha_primer_pago', moneda: 'moneda', diaCorte: 'dia_corte', diaVencimiento: 'dia_vencimiento', contraparteId: 'contraparte_id', activa: 'activa' };
  const textCols = ['nombre', 'tipo', 'fechaInicio', 'fechaPrimerPago', 'moneda', 'notas'];
  const row = {};
  for (const [k, col] of Object.entries(map)) {
    if (patch[k] === undefined) continue;
    row[col] = textCols.includes(k) ? patch[k] : (k === 'activa' ? !!patch[k] : (patch[k] === '' ? null : num(patch[k])));
  }
  const { data, error } = await supabase.from('prestamos').update(row).eq('id', id).select().single();
  if (error) throw new Error(`updatePrestamo: ${error.message}`);
  return data;
}
export async function removePrestamo(id) {
  // 🐛 DEU-6: soft-delete (FK NO ACTION rompería el gemelo cuenta+tarjeta).
  const { error } = await supabase.from('prestamos').update({ activa: false }).eq('id', id);
  if (error) throw new Error(`removePrestamo: ${error.message}`);
  return { deleted: true };
}

/* ════════════════════════ Inversores + compensaciones ════════════════════════ */
export async function createInversor(d) {
  const { data, error } = await supabase.from('inversores').insert({
    nombre: d.nombre,
    contraparte_id: d.contraparteId || null,
    capital_invertido: num(d.capitalInvertido),
    monto_pactado_devolver: num(d.montoPactadoDevolver),
    fecha_inicio: d.fechaInicio || null,
    plazo_meses: d.plazoMeses ? num(d.plazoMeses) : null,
    es_dueno: !!d.esDueno, // 🐛 INVR-3
    tipo_compensacion: d.tipoCompensacion || 'FLAT',
    activa: true,
    notas: d.notas || '',
  }).select().single();
  if (error) throw new Error(`createInversor: ${error.message}`);
  return data;
}
export async function updateInversor(id, patch) {
  const row = {};
  if (patch.nombre != null) row.nombre = patch.nombre;
  if (patch.capitalInvertido != null) row.capital_invertido = num(patch.capitalInvertido);
  if (patch.montoPactadoDevolver != null) row.monto_pactado_devolver = num(patch.montoPactadoDevolver);
  if (patch.fechaInicio != null) row.fecha_inicio = patch.fechaInicio || null;
  if (patch.plazoMeses != null) row.plazo_meses = patch.plazoMeses ? num(patch.plazoMeses) : null;
  if (patch.contraparteId != null && patch.contraparteId !== '') row.contraparte_id = num(patch.contraparteId); // 🐛 INVR-9: no NULL
  if (patch.esDueno !== undefined) row.es_dueno = !!patch.esDueno;
  if (patch.tipoCompensacion != null) row.tipo_compensacion = patch.tipoCompensacion;
  if (patch.activa != null) row.activa = !!patch.activa;
  if (patch.notas != null) row.notas = patch.notas;
  const { data, error } = await supabase.from('inversores').update(row).eq('id', id).select().single();
  if (error) throw new Error(`updateInversor: ${error.message}`);
  return data;
}
export async function removeInversor(id) {
  const { error } = await supabase.from('inversores').update({ activa: false }).eq('id', id); // soft-delete
  if (error) throw new Error(`removeInversor: ${error.message}`);
  return { deleted: true };
}

export async function createCompensacion(inversorId, d) {
  const { data, error } = await supabase.from('compensaciones_inversor').insert({
    inversor_id: num(inversorId),
    tipo_compensacion: d.tipoCompensacion || 'FLAT',
    monto_pactado: d.montoPactado !== '' && d.montoPactado != null ? num(d.montoPactado) : null,
    pct_aplicado: d.pctAplicado !== '' && d.pctAplicado != null ? num(d.pctAplicado) : null,
    cuota_mensual: d.cuotaMensual !== '' && d.cuotaMensual != null ? num(d.cuotaMensual) : null,
    bonus_threshold: d.bonusThreshold !== '' && d.bonusThreshold != null ? num(d.bonusThreshold) : null,
    cap_devolver: d.capDevolver !== '' && d.capDevolver != null ? num(d.capDevolver) : null,
    monto_por_unidad: d.montoPorUnidad !== '' && d.montoPorUnidad != null ? num(d.montoPorUnidad) : null,
    subordina_a: d.subordinaA || null, // 🐛 INVR-4
    frecuencia: d.frecuencia || null,  // 🐛 INVR-4
    dia_pago: d.diaPago !== '' && d.diaPago != null ? num(d.diaPago) : 17,
    fecha_inicio: d.fechaInicio || null,
    fecha_fin: d.fechaFin || null,
    activa: d.activa !== false,
    notas: d.notas || '',
  }).select().single();
  if (error) throw new Error(`createCompensacion: ${error.message}`);
  return data;
}
export async function updateCompensacion(id, patch) {
  const row = {};
  const numCols = { montoPactado: 'monto_pactado', pctAplicado: 'pct_aplicado', cuotaMensual: 'cuota_mensual', bonusThreshold: 'bonus_threshold', capDevolver: 'cap_devolver', montoPorUnidad: 'monto_por_unidad' };
  if (patch.tipoCompensacion != null) row.tipo_compensacion = patch.tipoCompensacion;
  for (const [k, col] of Object.entries(numCols)) {
    if (patch[k] !== undefined) row[col] = patch[k] === '' || patch[k] == null ? null : num(patch[k]);
  }
  if (patch.subordinaA !== undefined) row.subordina_a = patch.subordinaA || null;
  if (patch.frecuencia !== undefined) row.frecuencia = patch.frecuencia || null;
  if (patch.diaPago !== undefined) row.dia_pago = patch.diaPago === '' || patch.diaPago == null ? 17 : num(patch.diaPago);
  if (patch.fechaInicio !== undefined) row.fecha_inicio = patch.fechaInicio || null;
  if (patch.fechaFin !== undefined) row.fecha_fin = patch.fechaFin || null;
  if (patch.activa !== undefined) row.activa = !!patch.activa;
  if (patch.notas !== undefined) row.notas = patch.notas;
  const { data, error } = await supabase.from('compensaciones_inversor').update(row).eq('id', id).select().single();
  if (error) throw new Error(`updateCompensacion: ${error.message}`);
  return data;
}
export async function removeCompensacion(id) {
  const { error } = await supabase.from('compensaciones_inversor').delete().eq('id', id);
  if (error) throw new Error(`removeCompensacion: ${error.message}`);
  return { deleted: true };
}

/* ════════════════════════ Pagos programados ════════════════════════ */
// Pagos recurrentes/futuros que NO son préstamo/tarjeta/inversor (servicios
// fijos: internet, luz, courier, suscripciones, etc.). El sistema recuerda la
// próxima fecha; "pagar" registra el movimiento real y AVANZA a la siguiente.

// Avanza una fecha ISO según la frecuencia. Devuelve null si es UNICO (se desactiva).
function avanzarFechaPP(iso, frecuencia) {
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
  switch (frecuencia) {
    case 'SEMANAL': d.setDate(d.getDate() + 7); break;
    case 'QUINCENAL': d.setDate(d.getDate() + 15); break;
    case 'MENSUAL': d.setMonth(d.getMonth() + 1); break;
    case 'BIMESTRAL': d.setMonth(d.getMonth() + 2); break;
    case 'TRIMESTRAL': d.setMonth(d.getMonth() + 3); break;
    case 'ANUAL': d.setFullYear(d.getFullYear() + 1); break;
    default: return null; // UNICO
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function createPagoProgramado(d) {
  if (!d.concepto || !d.concepto.trim()) throw new Error('Falta el concepto del pago');
  if (!(num(d.monto) > 0)) throw new Error('El monto debe ser mayor que 0');
  if (!d.proximaFecha) throw new Error('Falta la próxima fecha de pago');
  const row = {
    concepto: d.concepto.trim(), monto: num(d.monto), moneda: d.moneda || 'RD',
    tipo_movimiento: d.tipoMovimiento || 'COMPRA_OPERATIVA', frecuencia: d.frecuencia || 'MENSUAL',
    proxima_fecha: d.proximaFecha, cuenta_pago_id: d.cuentaPagoId || null,
    contraparte_id: d.contraparteId || null, activa: d.activa !== false, notas: d.notas || null,
  };
  const { data, error } = await supabase.from('pagos_programados').insert(row).select().single();
  if (error) throw new Error(`createPagoProgramado: ${error.message}`);
  return data;
}

export async function updatePagoProgramado(id, patch) {
  const map = { concepto: 'concepto', monto: 'monto', moneda: 'moneda', tipoMovimiento: 'tipo_movimiento', frecuencia: 'frecuencia', proximaFecha: 'proxima_fecha', cuentaPagoId: 'cuenta_pago_id', contraparteId: 'contraparte_id', activa: 'activa', notas: 'notas' };
  const row = {};
  for (const k in patch) if (map[k]) row[map[k]] = patch[k] === '' ? null : patch[k];
  if ('monto' in patch) row.monto = num(patch.monto);
  const { data, error } = await supabase.from('pagos_programados').update(row).eq('id', id).select().single();
  if (error) throw new Error(`updatePagoProgramado: ${error.message}`);
  return data;
}

export async function removePagoProgramado(id) {
  const { error } = await supabase.from('pagos_programados').delete().eq('id', id);
  if (error) throw new Error(`removePagoProgramado: ${error.message}`);
  return { deleted: true };
}

// Registrar el pago: crea el movimiento real (salida) y avanza la próxima fecha
// (o desactiva si es UNICO). pp = el pago programado (shape camelCase del loader).
export async function pagarPagoProgramado(pp, { cuentaId, prestamoId, fecha } = {}) {
  if (!cuentaId) throw new Error('Selecciona la cuenta de pago'); // 🐛 CTA-1
  const fechaPago = fecha || todayISO();
  await createMovimiento({
    fecha: fechaPago, tipo: pp.tipoMovimiento || 'COMPRA_OPERATIVA',
    cuentaId, prestamoId: prestamoId || null,   // si paga con tarjeta → DRAWDOWN (regla 7)
    salida: pp.monto, contraparteId: pp.contraparteId || null,
    notas: `${pp.concepto} · pago programado`,
  });
  const next = avanzarFechaPP(pp.proximaFecha, pp.frecuencia);
  const patch = next ? { proxima_fecha: next } : { activa: false };
  const { error } = await supabase.from('pagos_programados').update(patch).eq('id', pp.id);
  if (error) throw new Error(`pagarPagoProgramado (avanzar fecha): ${error.message}`);
  return { next };
}

/* ════════════════════════ Contrapartes ════════════════════════ */
// Contrapartes gestionables desde la UI (ej. "Netlify" tipo SERVICIO).
export async function createContraparte(d) {
  if (!d.nombre || !d.nombre.trim()) throw new Error('Falta el nombre de la contraparte');
  const row = { nombre: d.nombre.trim(), tipo: d.tipo || 'SERVICIO' };
  if (d.notas) row.notas = d.notas;
  const { data, error } = await supabase.from('contrapartes').insert(row).select().single();
  if (error) throw new Error(`createContraparte: ${error.message}`);
  return data;
}

// Cuántas filas referencian la contraparte (7 FKs). Para bloquear el borrado
// con un mensaje claro en vez de un error críptico de FK.
export async function countContraparteRefs(id) {
  const q = (tabla, col) => supabase.from(tabla).select('*', { count: 'exact', head: true }).eq(col, id);
  const checks = [
    ['movimientos', 'contraparte_id'], ['ventas', 'canal_id'], ['lotes', 'proveedor_id'],
    ['prestamos', 'contraparte_id'], ['inversores', 'contraparte_id'], ['cuentas', 'banco_id'],
    ['pagos_programados', 'contraparte_id'],
  ];
  const results = await Promise.all(checks.map(([t, c]) => q(t, c)));
  let total = 0; const detalle = {};
  results.forEach((r, i) => { const n = r.count || 0; total += n; if (n > 0) detalle[checks[i][0]] = n; });
  return { total, detalle };
}

export async function removeContraparte(id) {
  const refs = await countContraparteRefs(id);
  if (refs.total > 0) {
    const donde = Object.entries(refs.detalle).map(([t, n]) => `${n} en ${t}`).join(', ');
    throw new Error(`Está en uso (${donde}). No se puede eliminar sin dejar registros huérfanos.`);
  }
  const { error } = await supabase.from('contrapartes').delete().eq('id', id);
  if (error) throw new Error(`removeContraparte: ${error.message}`);
  return { deleted: true };
}

/* ════════════════════════ Cuadrar deuda a saldo real ════════════════════════ */
// Reconcilia una deuda al saldo REAL del banco (estado de cuenta). Evita que el
// drift por centavos/intereses se acumule y que un préstamo "no se pueda cerrar".
// - TARJETA/LINEA: inserta un movimiento de ajuste ligado al prestamo_id, sobre la
//   cuenta CREDITO gemela (no toca cuentas líquidas): entrada=DRAWDOWN si el saldo
//   real es mayor (ej. interés cobrado), salida=AJUSTE si es menor.
// - PRESTAMO: inserta una cuota de ajuste (abono_capital = diferencia, pagada=true,
//   sin cash) — la vista resta abono_capital del saldo. No toca cuotas existentes.
// Los registros pasados NUNCA se recalculan: el ajuste es una fila nueva con nota.
export async function cuadrarDeuda(prestamo, { saldoReal, fecha, notas } = {}) {
  const real = num(saldoReal);
  const actual = num(prestamo.saldoPendiente);
  const diff = Math.round((real - actual) * 100) / 100;
  if (Math.abs(diff) < 0.005) return { diff: 0, mensaje: 'Ya cuadra, sin cambios' };
  const f = fecha || todayISO();
  const nota = `Cuadre a saldo real ${real.toFixed(2)} (sistema: ${actual.toFixed(2)}, dif ${diff > 0 ? '+' : ''}${diff.toFixed(2)})${notas ? ' · ' + notas : ''}`;

  if (prestamo.tipo === 'PRESTAMO') {
    // abono_capital positivo BAJA el saldo; negativo lo sube. diff>0 (real mayor) → abono negativo.
    const { data: maxRow } = await supabase.from('cuotas').select('numero').eq('prestamo_id', prestamo.id).order('numero', { ascending: false }).limit(1);
    const numero = ((maxRow && maxRow[0]?.numero) || 0) + 1;
    const { error } = await supabase.from('cuotas').insert({
      prestamo_id: prestamo.id, numero, fecha_pago: f, fecha_pagada: f,
      capital: 0, interes: 0, seguro: 0, abono_capital: -diff, pagada: true, notas: nota,
    });
    if (error) throw new Error(`cuadrarDeuda (cuota ajuste): ${error.message}`);
    return { diff, via: 'cuota-ajuste' };
  }

  // Tarjeta / línea: movimiento sobre la cuenta CREDITO gemela (mismo nombre).
  const { data: cuentas } = await supabase.from('cuentas').select('id, nombre').eq('tipo', 'CREDITO');
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const gemela = (cuentas || []).find((c) => norm(c.nombre) === norm(prestamo.nombre));
  if (!gemela) throw new Error(`No encontré la cuenta CREDITO gemela de "${prestamo.nombre}"`);
  // Ambos lados con naturaleza FINANCIERO (DRAWDOWN / PAGO_*): el cuadre no entra
  // en el cash flow operacional ni toca ninguna cuenta líquida (va a la gemela CREDITO).
  const tipoBaja = prestamo.tipo === 'TARJETA_CREDITO' ? 'PAGO_TARJETA_CREDITO' : 'PAGO_LINEA_CREDITO';
  const row = diff > 0
    ? { fecha: f, tipo: 'DRAWDOWN', cuenta_id: gemela.id, entrada: diff, salida: 0, prestamo_id: prestamo.id, notas: nota }
    : { fecha: f, tipo: tipoBaja, cuenta_id: gemela.id, entrada: 0, salida: -diff, prestamo_id: prestamo.id, notas: nota };
  const { error } = await supabase.from('movimientos').insert(row);
  if (error) throw new Error(`cuadrarDeuda (mov ajuste): ${error.message}`);
  return { diff, via: 'movimiento-ajuste' };
}

/* ════════════════════════ Abono a capital (préstamo amortizado) ════════════════════════ */
const _r2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;

// Lee el estado vivo del préstamo amortizado para calcular un abono: saldo actual,
// cuotas pendientes, cuota P&I vigente y la fecha de la próxima cuota.
async function _estadoAmortizado(prestamo) {
  if (prestamo.tipo !== 'PRESTAMO') throw new Error('El abono a capital aplica solo a préstamos amortizados (no líneas/tarjetas).');
  const { data: cuotas, error } = await supabase.from('cuotas')
    .select('id,numero,capital,interes,seguro,monto_total,fecha_pago,pagada,abono_capital')
    .eq('prestamo_id', prestamo.id).order('numero');
  if (error) throw new Error(`abono (leer cuotas): ${error.message}`);
  const pagadas = (cuotas || []).filter((c) => c.pagada);
  const pendientes = (cuotas || []).filter((c) => !c.pagada).sort((a, b) => a.numero - b.numero);
  const capitalPagado = pagadas.reduce((s, c) => s + num(c.capital) + num(c.abono_capital), 0);
  const saldoActual = _r2(num(prestamo.montoInicial) - capitalPagado);
  const cuotaPI = pendientes.length ? _r2(num(pendientes[0].capital) + num(pendientes[0].interes))
    : _r2(num(prestamo.cuotaMensual || 0) - num(prestamo.seguroMensual || 0));
  return { cuotas, pagadas, pendientes, saldoActual, cuotaPI };
}

// Previsualiza el efecto de un abono SIN escribir nada (para el modal).
// Devuelve, según el modo, la nueva cuota o el nuevo plazo + ahorro de interés.
export async function previewAbono(prestamo, { monto, modo }) {
  const m = num(monto);
  const { saldoActual, pendientes, cuotaPI } = await _estadoAmortizado(prestamo);
  const r = num(prestamo.tasaMensual), seguro = num(prestamo.seguroMensual);
  const saldoPost = _r2(saldoActual - m);
  const out = { saldoActual, saldoPost, cuotaPIactual: _r2(cuotaPI + seguro), plazoActual: pendientes.length, liquida: m >= saldoActual };
  if (out.liquida || saldoPost <= 0) return { ...out, liquida: true, nuevaCuota: 0, nuevoPlazo: 0, ahorroInteres: 0 };
  const interesRestanteActual = pendientes.reduce((s, c) => s + num(c.interes), 0);
  const fechaPrimera = pendientes.length ? pendientes[0].fecha_pago : null;
  const sched = construirScheduleAmortizado({
    saldo: saldoPost, r, seguro, fechaPrimera, numeroInicial: 1,
    modo, nCuotas: pendientes.length, cuotaPI,
  });
  const interesNuevo = sched.reduce((s, c) => s + num(c.interes), 0);
  return {
    ...out,
    nuevaCuota: modo === 'REDUCIR_CUOTA' ? _r2(num(sched[0].monto_total)) : _r2(cuotaPI + seguro),
    nuevoPlazo: sched.length,
    ahorroInteres: _r2(interesRestanteActual - interesNuevo),
  };
}

// Aplica un abono a capital: registra el egreso real de caja, baja el capital del
// préstamo (fila de abono pagada con abono_capital) y REGENERA las cuotas pendientes.
// modo 'REDUCIR_CUOTA' (mismo plazo, cuota menor) | 'ACORTAR_PLAZO' (misma cuota, menos meses).
// Transacción con rollback: si algo falla, deshace el movimiento y la fila de abono.
// d = { monto, fecha, cuentaId, modo, notas }
export async function abonarCapital(prestamo, { monto, fecha, cuentaId, modo, notas } = {}) {
  const m = num(monto);
  if (!(m > 0)) throw new Error('El abono debe ser mayor que 0.');
  if (!cuentaId) throw new Error('Selecciona la cuenta de donde sale el abono.');
  if (!['REDUCIR_CUOTA', 'ACORTAR_PLAZO'].includes(modo)) throw new Error('Modo de abono inválido.');
  const f = fecha || todayISO();
  const { pendientes, saldoActual, cuotaPI } = await _estadoAmortizado(prestamo);
  if (saldoActual <= 0) throw new Error('Este préstamo ya está saldado.');
  const abono = Math.min(m, saldoActual);            // no se puede abonar más que el saldo
  const saldoPost = _r2(saldoActual - abono);
  const liquida = saldoPost <= 0;
  const r = num(prestamo.tasaMensual), seguro = num(prestamo.seguroMensual);
  const numAbono = pendientes.length ? pendientes[0].numero : ((prestamo.plazoMeses || 0) + 1);
  const fechaPrimera = pendientes.length ? pendientes[0].fecha_pago : null;
  const nota = `Abono a capital (${modo === 'REDUCIR_CUOTA' ? 'baja cuota' : 'acorta plazo'}) · saldo ${saldoActual.toFixed(2)} → ${saldoPost.toFixed(2)}${notas ? ' · ' + notas : ''}`;

  // 1) Egreso real de caja (FINANCIERO). Sale de la cuenta elegida.
  const { data: mov, error: e1 } = await supabase.from('movimientos').insert({
    fecha: f, tipo: 'PAGO_PRESTAMO', cuenta_id: cuentaId, entrada: 0, salida: abono,
    prestamo_id: prestamo.id, notas: nota,
  }).select().single();
  if (e1) throw new Error(`abono (movimiento): ${e1.message}`);

  // Snapshot de las pendientes ANTES de borrarlas (para restaurar si algo falla).
  const { data: snap } = await supabase.from('cuotas')
    .select('numero,fecha_pago,capital,interes,seguro,abono_capital,saldo_post,pagada,fecha_pagada,movimiento_id,notas')
    .eq('prestamo_id', prestamo.id).eq('pagada', false);
  const restaurarPendientes = async () => {
    if (snap && snap.length) await supabase.from('cuotas').insert(snap.map((c) => ({ ...c, prestamo_id: prestamo.id })));
  };

  // 2) Borrar las pendientes PRIMERO (libera sus numeros para la fila de abono / regeneración).
  const idsBorrar = pendientes.map((c) => c.id);
  if (idsBorrar.length) {
    const { error: e2 } = await supabase.from('cuotas').delete().in('id', idsBorrar);
    if (e2) { await supabase.from('movimientos').delete().eq('id', mov.id); throw new Error(`abono (borrar pendientes): ${e2.message}`); }
  }

  // 3) Fila de abono (pagada, abono_capital = abono) → la vista baja el saldo de una vez.
  // monto_total es columna GENERADA (capital+interes+seguro+abono_capital) → no se inserta.
  const { error: e3 } = await supabase.from('cuotas').insert({
    prestamo_id: prestamo.id, numero: numAbono, fecha_pago: f, fecha_pagada: f,
    capital: 0, interes: 0, seguro: 0, abono_capital: abono,
    saldo_post: saldoPost, pagada: true, movimiento_id: mov.id, notas: nota,
  });
  if (e3) { await restaurarPendientes(); await supabase.from('movimientos').delete().eq('id', mov.id); throw new Error(`abono (fila): ${e3.message}`); }

  // 4) Regenerar las cuotas pendientes desde el nuevo saldo.
  let nuevas = [];
  if (!liquida && fechaPrimera) {
    nuevas = construirScheduleAmortizado({
      saldo: saldoPost, r, seguro, fechaPrimera, numeroInicial: numAbono + 1,
      modo, nCuotas: pendientes.length, cuotaPI,
    }).map(({ monto_total, ...c }) => ({ ...c, prestamo_id: prestamo.id })); // monto_total es generada
    if (nuevas.length) {
      const { error: e4 } = await supabase.from('cuotas').insert(nuevas);
      if (e4) {
        await supabase.from('cuotas').delete().eq('movimiento_id', mov.id); // quita la fila de abono
        await restaurarPendientes();
        await supabase.from('movimientos').delete().eq('id', mov.id);
        throw new Error(`abono (regenerar cuotas): ${e4.message}`);
      }
    }
  }
  return { abono, saldoPost, liquida, cuotasNuevas: nuevas.length, nuevaCuota: nuevas.length ? _r2(num(nuevas[0].monto_total)) : 0 };
}
