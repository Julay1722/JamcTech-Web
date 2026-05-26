# JAMC's Tech — Supabase Schema Reference

## Tablas (13)

### `skus` — Productos
PK: `id_sku` (text, formato `CAT-MAR-MOD-COL`)

| Columna | Tipo | Notas |
|---|---|---|
| id_sku | text PK | `MOU-HXS-T90-NEG` |
| nombre | text | "Mouse HXSJ T90 Negro" |
| categoria | enum | Stand, Mouse, Teclado, Headset, Mouse Pad |
| marca | text | HXSJ, Attack Shark, Ajazz, Razer, etc. |
| modelo | text | |
| color | text | |
| requiere_diseno | bool | true para Stands (necesitan diseño impreso) |
| precio_venta_sugerido | numeric | |
| cpp_actual | numeric | **Calculado por trigger** (weighted avg lifetime) |
| activa | bool | default true |

**Count actual: 50** (49 reales + 1 placeholder `LEGACY-SALE`)

### `entradas` — Compras de inventario (líneas de un lote)
PK: `id` (bigint)

| Columna | Tipo | Notas |
|---|---|---|
| fecha | date | |
| sku_id | text FK→skus | ON UPDATE CASCADE |
| diseno_id | bigint FK→disenos | NULL si no requiere diseño |
| lote_id | bigint FK→lotes | NULL si entrada suelta |
| status | enum | PENDIENTE, RECIBIDO, PERDIDO |
| cantidad | int | |
| costo_unitario_base | numeric | costo del producto sin shared costs |
| costo_compartido_asignado | numeric | **Calculado por trigger** (prorrateo de envío/impuestos del lote) |
| costo_unitario_total | numeric | base + compartido. Esto es lo que entra al CPP |

**Count actual: 79** (60 RECIBIDO, 19 PENDIENTE)

### `lotes` — Agrupa entradas que compartieron costos (envío, courier, impuestos)
| Columna | Tipo | Notas |
|---|---|---|
| codigo | text | identificador del lote |
| fecha_pedido | date | |
| fecha_recibido | date | |
| proveedor_id | bigint FK→contrapartes | |
| status | enum | PENDIENTE, RECIBIDO |
| costo_envio | numeric | se prorratea entre entradas del lote |
| costo_courier | numeric | idem |
| costo_impuestos | numeric | idem |
| costo_otros | numeric | idem |
| moneda | enum | RD, USD |

**Count actual: 0** (V2.1 no modelaba lotes; trabajo futuro asignar entradas a lotes)

### `ventas` — Encabezado de venta
PK: `id` (bigint), UNIQUE: `codigo`

| Columna | Tipo | Notas |
|---|---|---|
| codigo | text UNIQUE | `V-MIG-0001`, `V-LEG-0001`, etc. |
| fecha | date | |
| canal_id | bigint FK→contrapartes | Facebook=9 (canal de venta) |
| cliente_nombre | text | opcional |
| envio_cobrado | numeric | cobrado al cliente |
| descuento | numeric | |
| total_facturado | numeric | **Calculado por trigger** |
| total_ganancia | numeric | **Calculado por trigger** |

**Count actual: 190** (94 V-MIG modernas + 96 V-LEG legacy)

### `ventas_items` — Líneas de cada venta
| Columna | Tipo | Notas |
|---|---|---|
| venta_id | bigint FK→ventas | |
| sku_id | text FK→skus | ON UPDATE CASCADE |
| diseno_id | bigint FK→disenos | NULL si no aplica |
| cantidad | int | |
| precio_unitario | numeric | |
| cpp_historico | numeric | **Snapshot del CPP al momento de venta** |
| subtotal | numeric | cantidad * precio_unitario |
| ganancia_unitaria | numeric | precio - cpp_historico |
| ganancia_total | numeric | cantidad * ganancia_unitaria |
| margen_pct | numeric | ganancia / cpp |

**Count actual: 190**

### `movimientos` — Cash flow + financiero
PK: `id` (bigint)

| Columna | Tipo | Notas |
|---|---|---|
| fecha | date | |
| tipo | enum | 22 valores (ver CLAUDE.md) |
| cuenta_id | bigint FK→cuentas | de qué cuenta sale/entra |
| contraparte_id | bigint FK→contrapartes | con quién se hizo |
| entrada | numeric NOT NULL | usar 0, no NULL |
| salida | numeric NOT NULL | usar 0, no NULL |
| monto_usd | numeric | si fue en USD |
| tasa_cambio | numeric | RD/USD |
| lote_id | bigint FK→lotes | si linkea a un lote (ej: pago de envío) |
| venta_id | bigint FK→ventas | si linkea a una venta |
| prestamo_id | bigint FK→prestamos | si es pago a deuda |
| inversor_id | bigint FK→inversores | si es pago a inversor |
| cuota_id | bigint FK→cuotas | si específicamente paga una cuota |
| cuenta_destino_id | bigint FK→cuentas | para transferencias internas |
| notas | text | descripción libre |
| **naturaleza** | text GENERATED | `CASHFLOW` o `FINANCIERO` (auto) |

**Constraints activos:**
- `entrada >= 0 AND salida >= 0`
- `entrada > 0 OR salida > 0` (al menos uno)
- (NO HAY constraint que prohíba ambas positivas — fue eliminado para soportar "venta + envío")

**Count actual: 276**

### `cuentas` — Bancos / efectivo
| ID | Nombre | Tipo | Moneda |
|---|---|---|---|
| 1 | BHD Debito | DEBITO | RD |
| 2 | Scotia RD | DEBITO | RD |
| 3 | Scotia USD | DEBITO | USD |
| 4 | Qik | DEBITO | RD |
| 5 | Efectivo | EFECTIVO | RD |

### `prestamos` — Deudas (unificado)
| ID | Nombre | Tipo | Monto/Límite |
|---|---|---|---|
| 1 | Coop Prestamo | PRESTAMO | 115,000 |
| 2 | BHD Linea | LINEA_CREDITO | 112,000 (límite) |
| 3 | Scotia CC RD | TARJETA_CREDITO | 20,000 (límite) |
| 4 | Scotia CC USD | TARJETA_CREDITO | 450 USD (límite) |
| 5 | Qik CC | TARJETA_CREDITO | 18,000 (límite) |

### `cuotas` — Schedule de pagos
| Columna | Tipo | Notas |
|---|---|---|
| prestamo_id | bigint FK→prestamos | |
| numero | int | 1, 2, 3... |
| fecha_pago | date | día programado |
| capital | numeric | |
| interes | numeric | |
| seguro | numeric | |
| abono_capital | numeric | extra al capital |
| saldo_post | numeric | saldo después de esta cuota |
| pagada | bool | |
| fecha_pagada | date | |
| movimiento_id | bigint FK→movimientos | link al pago real |

**Count actual: 48** (todas son del Coop. 3 pagadas, 45 pendientes)

### `contrapartes` — Personas/empresas con quien transacciono
| ID | Nombre | Tipo |
|---|---|---|
| 1 | BHD | BANCO |
| 2 | Cooperativa | BANCO |
| 3 | Scotiabank | BANCO |
| 4 | Qik | BANCO |
| 5 | Alibaba | PROVEEDOR |
| 6 | Temu | PROVEEDOR |
| 7 | Amazon | PROVEEDOR |
| 8 | Andrea Correa | INVERSOR |
| 9 | Facebook | CANAL |
| 10 | Teo | PERSONA |
| 11 | Alexander | CLIENTE |
| 12 | Ramon | CLIENTE |
| 13 | Braulio | PERSONA |
| 14 | Uber | SERVICIO |
| 15 | Courrier | SERVICIO |
| 16 | Facebook Ads | SERVICIO |
| 17 | Cliente Generico | CLIENTE |

### `inversores`
| ID | Nombre | Capital | A devolver | Pagado |
|---|---|---|---|---|
| 1 | Andrea Correa | 50,000 | 100,000 | 5,000 |

### `disenos`
Tabla vacía. Para futuras Stands con diseño impreso (Hollow Knight, etc.). El usuario llenará después.

### `tasas_cambio`
Tabla vacía. Para registrar histórico de tasa RD/USD si se quiere granular. Por ahora cada movimiento USD lleva su propia `tasa_cambio`.

---

## Views (6)

### `vw_cashflow`
Movimientos con `naturaleza = 'CASHFLOW'`. Columnas: id, fecha, tipo, cuenta (nombre), contraparte (nombre), entrada, salida, neto, venta_id, lote_id, notas. Ordenado por fecha.

### `vw_financiero`  
Movimientos con `naturaleza = 'FINANCIERO'`. Mismo formato + prestamo (nombre).

### `vw_saldo_cuenta`
Saldo actual por cuenta. Suma de (entrada - salida) por `cuenta_id`.

### `vw_saldo_prestamo`
Estado de cada préstamo: monto_inicial, capital_pagado (suma de cuotas pagadas), saldo_pendiente.

### `vw_saldo_inversor`
Estado de cada inversora: capital_invertido, pagado_total, monto_pactado_devolver, % completado.

### `vw_stock_sku`
Por cada SKU: stock_fisico (entradas RECIBIDO - ventas), stock_camino (entradas PENDIENTE), cpp_actual.

---

## Triggers automáticos

**No replicar esta lógica en el frontend:**

1. **`trg_lote_prorratear`** — al actualizar costos del lote, recalcula `costo_compartido_asignado` en cada entrada hija
2. **`trg_entrada_prorratear_lote_ins_del`** / **`_upd`** — cuando entran/cambian/salen entradas del lote, redistribuye costos compartidos
3. **`trg_entrada_recalcular_cpp`** — al cambiar entradas RECIBIDO, recalcula `skus.cpp_actual`
4. **`trg_ventas_items_capturar_cpp`** — al insertar línea de venta, snapshot `cpp_historico` desde `skus.cpp_actual`
5. **`trg_ventas_items_recalc_venta`** — al cambiar líneas, recalcula totales del encabezado
6. **`trg_ventas_envio_descuento_recalc`** — al cambiar envío/descuento del encabezado, recalcula totales

---

## Enums

```sql
movimiento_tipo: APORTE_DUENO, APORTE_INVERSOR, VENTA, ENVIO_COBRADO,
  COMPRA_MERCANCIA, COMPRA_OPERATIVA, ENVIO_LOTE, PAGO_PRESTAMO,
  PAGO_LINEA_CREDITO, PAGO_TARJETA_CREDITO, PAGO_INTERESES, PAGO_ADS,
  PAGO_COMISION, PAGO_INVERSOR, PAGO_TRANSPORTE, DRAWDOWN, FEE_BANCARIO,
  TRANSFERENCIA_INTERNA, REFUND_PROVEEDOR, REFUND_CLIENTE, AJUSTE, OTROS

prestamo_tipo:    PRESTAMO, LINEA_CREDITO, TARJETA_CREDITO
entrada_status:   PENDIENTE, RECIBIDO, PERDIDO
lote_status:      PENDIENTE, RECIBIDO
moneda:           RD, USD
categoria_sku:    Stand, Mouse, Teclado, Headset, Mouse Pad
cuenta_tipo:      DEBITO, EFECTIVO
contraparte_tipo: BANCO, PROVEEDOR, CLIENTE, CANAL, INVERSOR, PERSONA, SERVICIO, OTRO
```

---

## Queries comunes (cheat sheet)

```sql
-- Cash flow del último mes
SELECT * FROM vw_cashflow 
WHERE fecha >= CURRENT_DATE - INTERVAL '30 days' 
ORDER BY fecha DESC;

-- Saldo de cuenta operativa BHD
SELECT * FROM vw_saldo_cuenta WHERE nombre = 'BHD Debito';

-- Estado del préstamo Coop
SELECT * FROM vw_saldo_prestamo WHERE nombre = 'Coop Prestamo';

-- Top 10 SKUs más vendidos en mes actual
SELECT s.nombre, SUM(vi.cantidad) as unidades, SUM(vi.ganancia_total) as ganancia
FROM ventas_items vi
JOIN ventas v ON v.id = vi.venta_id
JOIN skus s ON s.id_sku = vi.sku_id
WHERE v.fecha >= date_trunc('month', CURRENT_DATE)
GROUP BY s.nombre ORDER BY unidades DESC LIMIT 10;

-- Stock actual por categoría
SELECT s.categoria, SUM(vs.stock_fisico) as unidades_fisicas, 
       SUM(vs.stock_fisico * s.cpp_actual) as valor_inventario
FROM vw_stock_sku vs
JOIN skus s ON s.id_sku = vs.id_sku
WHERE s.activa = true
GROUP BY s.categoria;

-- Próximas cuotas a pagar
SELECT p.nombre as prestamo, c.numero, c.fecha_pago, c.capital, c.interes, c.seguro
FROM cuotas c
JOIN prestamos p ON p.id = c.prestamo_id
WHERE NOT c.pagada
ORDER BY c.fecha_pago ASC LIMIT 5;
```
