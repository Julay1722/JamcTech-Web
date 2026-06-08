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
import { num } from '../format.js';
import { LOTE_TO_ENTRADA_STATUS, toRD, nextVentaCodigo, nextLoteCodigo } from './helpers.js';

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
    const monto = num(d.monto);
    const { data, error } = await supabase.from('movimientos').insert({
      fecha: d.fecha, tipo: 'TRANSFERENCIA_INTERNA', cuenta_id: d.cuentaId,
      cuenta_destino_id: d.cuentaDestinoId, entrada: 0, salida: monto, notas: d.notas || 'Transferencia interna',
    }).select().single();
    if (error) throw new Error(`createMovimiento (transfer): ${error.message}`);
    return data;
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
