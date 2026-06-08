# JAMC's Tech — Supabase Schema Reference

> **Verificado contra la DB el 2026-06-07** (proyecto `oicxvnnzocwnqlsojhco`).
> Los IDs de cuentas/préstamos/contrapartes y los nombres de enum de aquí son
> los REALES (versiones anteriores de este doc estaban desactualizadas — ver
> `BUGS_DATOS.md`). Para reglas de negocio ver `CLAUDE.md` y la skill `jamc-reglas`.

## Conteos reales (2026-06-07)

| Tabla | Filas |
|---|---|
| skus | 50 (49 reales + placeholder `LEGACY-SALE`) |
| ventas | 201 |
| ventas_items | 201 |
| entradas | 84 |
| lotes | 20 |
| movimientos | 288 |
| cuotas | 4 (todas del Coop; faltan 44 del schedule — ver DEU-3) |
| prestamos | 5 |
| inversores | 2 (Andrea + dueño; ojo data de prueba) |
| contrapartes | 19 |
| disenos | 4 |
| cuentas | 7 |

---

## Tablas (15)

### `skus` — Productos
PK: `id_sku` (text, formato `CAT-MAR-MOD-COL`)

| Columna | Tipo | Notas |
|---|---|---|
| id_sku | text PK | `MOU-HXS-T90-NEG` |
| nombre | text | "Mouse HXSJ T90 Negro" |
| categoria | enum `categoria_sku` | MOUSE, TECLADO, HEADSET, STAND, MOUSEPAD, OTRO (UPPERCASE) |
| marca | text | HXSJ, Attack Shark, Ajazz, Razer, etc. |
| modelo | text | |
| color | text | |
| precio_venta_sugerido | numeric | |
| cpp_actual | numeric | **Calculado por trigger** (weighted avg lifetime) |
| notas | text | |
| activa | bool | default true; false = Descontinuado |

> No hay columna `requiere_diseno`. El vínculo a diseño es `entradas.diseno_id` / `ventas_items.diseno_id`.

### `entradas` — Compras de inventario (líneas de un lote)
PK: `id` (bigint)

| Columna | Tipo | Notas |
|---|---|---|
| fecha | date | |
| sku_id | text FK→skus | ON UPDATE CASCADE |
| diseno_id | bigint FK→disenos | NULL si no aplica |
| lote_id | bigint FK→lotes | NULL si entrada suelta |
| status | enum `status_entrada` | PENDIENTE, RECIBIDO, PERDIDO |
| cantidad | int | |
| costo_unitario_base | numeric | costo del producto sin shared costs. **OJO INV-1: debe estar en RD$ (si la compra fue USD, convertir antes de guardar).** |
| costo_compartido_asignado | numeric | **Calculado por trigger** (prorrateo de envío/courier/impuestos/otros del lote) |
| costo_unitario_total | numeric | base + compartido. Esto entra al CPP |
| notas | text | |

### `lotes` — Agrupa entradas que compartieron costos
PK: `id` (bigint)

| Columna | Tipo | Notas |
|---|---|---|
| codigo | text | identificador del lote (ej. `L-260512-01`) |
| fecha_pedido | date | |
| fecha_recibido | date | |
| proveedor_id | bigint FK→contrapartes | |
| status | enum `status_lote` | **PENDIENTE, EN_TRANSITO, EN_COURIER_USA, RECIBIDO, CANCELADO** (5 valores) |
| costo_envio | numeric | se prorratea entre entradas |
| costo_courier | numeric | idem |
| costo_impuestos | numeric | idem |
| costo_otros | numeric | idem |
| moneda | enum `moneda_tipo` | RD, USD |
| notas | text | |

### `ventas` — Encabezado de venta
PK: `id` (bigint), UNIQUE: `codigo`

| Columna | Tipo | Notas |
|---|---|---|
| codigo | text UNIQUE | `V-MIG-0001`, `V-LEG-0001`, `VTA-YYMMDD-NNN` (nuevas) |
| fecha | date | |
| canal_id | bigint FK→contrapartes | Facebook=9 (CANAL_VENTA) |
| cliente_nombre | text | opcional |
| envio_cobrado | numeric | cobrado al cliente |
| descuento | numeric | |
| total_facturado | numeric | **Calculado por trigger** (Σ subtotales + envío − descuento) |
| total_ganancia | numeric | **Calculado por trigger** |
| notas | text | |

### `ventas_items` — Líneas de cada venta
| Columna | Tipo | Notas |
|---|---|---|
| venta_id | bigint FK→ventas | ON DELETE CASCADE |
| sku_id | text FK→skus | ON UPDATE CASCADE |
| diseno_id | bigint FK→disenos | NULL si no aplica |
| cantidad | int | |
| precio_unitario | numeric | |
| cpp_historico | numeric | **Snapshot del CPP al INSERT** (trigger; no se recaptura en UPDATE) |
| subtotal | numeric | **Calculado** cantidad × precio_unitario |
| ganancia_unitaria | numeric | **Calculado** precio − cpp_historico |
| ganancia_total | numeric | **Calculado** cantidad × ganancia_unitaria |
| margen_pct | numeric | **Calculado** |

### `movimientos` — Cash flow + financiero (UNA sola tabla)
PK: `id` (bigint)

| Columna | Tipo | Notas |
|---|---|---|
| fecha | date | |
| tipo | enum `tipo_movimiento` | 22 valores (ver enums abajo) |
| cuenta_id | bigint FK→cuentas | de qué cuenta sale/entra |
| contraparte_id | bigint FK→contrapartes | con quién |
| entrada | numeric NOT NULL | usar 0, nunca NULL |
| salida | numeric NOT NULL | usar 0, nunca NULL |
| monto_usd | numeric | si fue en USD (**INV-4: hoy casi nunca poblado — la reescritura DEBE persistirlo**) |
| tasa_cambio | numeric | RD/USD |
| lote_id | bigint FK→lotes | pago de envío/compra ligado a lote |
| venta_id | bigint FK→ventas | ingreso/gasto ligado a venta |
| prestamo_id | bigint FK→prestamos | pago/cargo a deuda o tarjeta |
| inversor_id | bigint FK→inversores | aporte/pago a inversor |
| cuota_id | bigint FK→cuotas | si paga una cuota específica |
| cuenta_destino_id | bigint FK→cuentas | transferencias internas |
| notas | text | |
| **naturaleza** | text GENERATED | `CASHFLOW` o `FINANCIERO` (auto, no escribir) |

**Constraints activos:** `entrada >= 0 AND salida >= 0` · `entrada > 0 OR salida > 0`.
NO hay constraint que prohíba ambas > 0 (eliminado para soportar "venta + envío").

### `cuentas` — Bancos / efectivo / tarjetas (7) ⚠️ IDs REALES
| ID | Nombre | Tipo | Moneda |
|---|---|---|---|
| 1 | BHD Débito | DEBITO | RD |
| 2 | Efectivo | EFECTIVO | RD |
| 3 | Scotia CC RD | CREDITO | RD |
| 4 | Scotia CC USD | CREDITO | USD |
| 5 | Qik | CREDITO | RD |
| 6 | BHD Línea | CREDITO | RD |
| 7 | Scotia Debito USD | DEBITO | USD |

> Columnas: id, nombre, tipo, moneda, limite_credito, notas, activa.
> Las tarjetas/líneas (3,4,5,6) son tipo CREDITO **y** existen como préstamo
> (modelo dual — ver regla 8). El panel de cuentas líquidas excluye CREDITO.

### `prestamos` — Deudas unificadas (5) ⚠️ IDs REALES
| ID | Nombre | Tipo | Notas |
|---|---|---|---|
| 1 | Scotia CC RD | TARJETA_CREDITO | gemelo de cuenta 3 |
| 2 | Scotia CC USD | TARJETA_CREDITO | gemelo de cuenta 4 |
| 3 | Qik | TARJETA_CREDITO | gemelo de cuenta 5 |
| 4 | Coop Prestamo | PRESTAMO | monto_inicial 115,000 |
| 5 | BHD Línea | LINEA_CREDITO | gemelo de cuenta 6 |

> Columnas: id, nombre, tipo, contraparte_id, monto_inicial, limite_credito,
> tasa_mensual, seguro_mensual, plazo_meses, fecha_inicio, fecha_primer_pago,
> moneda, activa, notas, dia_corte, dia_vencimiento, **saldo_corte, fecha_corte**.
> `saldo_corte`/`fecha_corte` son snapshots manuales (DEU-4: ningún writer los
> mantiene → la vista se congela; la reescritura debe dejar de depender de ellos).

### `cuotas` — Schedule de pagos
| Columna | Tipo | Notas |
|---|---|---|
| prestamo_id | bigint FK→prestamos | |
| numero | int | 1, 2, 3… |
| fecha_pago | date | día programado |
| capital | numeric | |
| interes | numeric | |
| seguro | numeric | |
| abono_capital | numeric | extra al capital |
| monto_total | numeric | |
| saldo_post | numeric | saldo después de esta cuota |
| pagada | bool | |
| fecha_pagada | date | |
| movimiento_id | bigint FK→movimientos | link al pago real |
| notas | text | |

**Count: 4** (todas del Coop, sin `saldo_post`). DEU-2/DEU-3: pagar una cuota
NO toca esta tabla hoy, y faltan 44 cuotas del schedule de 48.

### `contrapartes` — Personas/empresas (19) ⚠️ IDs REALES
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
| 9 | Facebook | CANAL_VENTA |
| 10 | Teo | PERSONA_OPERATIVA |
| 11 | Alexander | PERSONA_OPERATIVA |
| 12 | Ramon | PERSONA_OPERATIVA |
| 13 | Braulio | CLIENTE_FAMILIAR |
| 14 | Uber | SERVICIO |
| 15 | Courrier | SERVICIO |
| 16 | Facebook Ads | SERVICIO |
| 17 | Cliente Generico | OTRO |
| 20 | Julio | INVERSOR |
| 22 | Hola | INVERSOR |

> Defaults usados por el cliente: cuenta=1 (BHD Débito) **(CTA-1: dejar de
> defaultear silenciosamente — exigir cuenta real)**, contraparte=17 (Cliente
> Generico), canal venta=9 (Facebook), proveedor=5 (Alibaba). `Julio` y `Hola`
> parecen data de prueba/dueño — no asumir.

### `inversores` (2)
| Columna | Tipo | Notas |
|---|---|---|
| id | bigint PK | |
| nombre | text | |
| contraparte_id | bigint FK | NOT NULL |
| capital_invertido | numeric | |
| monto_pactado_devolver | numeric | |
| fecha_inicio | date | |
| plazo_meses | int | |
| es_dueno | bool | true = dueño (recibe paquete distinto). **INVR-3: createInversor debe escribirlo.** |
| tipo_compensacion | enum `tipo_compensacion` | método legacy simple |
| pct_aplicado, cuota_mensual, bonus_threshold, cap_devolver | numeric | params legacy |
| activa | bool | |
| notas | text | |

### `compensaciones_inversor` — N reglas de compensación por inversor
| Columna | Tipo | Notas |
|---|---|---|
| inversor_id | bigint FK→inversores | |
| tipo_compensacion | enum `tipo_compensacion` | 22 valores (FLAT, AMORTIZACION, PCT_GANANCIA, …) |
| monto_pactado, pct_aplicado, cuota_mensual, bonus_threshold, cap_devolver, monto_por_unidad | numeric | |
| dia_pago | smallint | default 17 |
| subordina_a | bigint | **INVR-4: create/updateCompensacion debe escribirlo** |
| frecuencia | text | **INVR-4: idem** |
| fecha_inicio, fecha_fin | date | |
| activa | bool | |
| notas | text | |

### `disenos` (4)
Diseños impresos para Stands (Hollow Knight, etc.). Vinculados vía
`entradas.diseno_id` / `ventas_items.diseno_id`.

### `tasas_cambio`
Histórico RD/USD opcional. Por ahora cada movimiento USD lleva su `tasa_cambio`.

### `agente_memoria`
Tabla de soporte para el sistema de agentes (futuro, `JARVIS.md`). No la usa el dashboard.

---

## Views (6) — columnas reales

### `vw_cashflow`
`id, fecha, tipo, cuenta, contraparte, entrada, salida, neto, venta_id, lote_id, notas`
(solo `naturaleza='CASHFLOW'`).

### `vw_financiero`
`id, fecha, tipo, cuenta, contraparte, prestamo, entrada, salida, neto, cuota_id, inversor_id, notas`
(solo `naturaleza='FINANCIERO'`).

### `vw_saldo_cuenta`
`id, nombre, tipo, moneda, limite_credito, total_entradas, total_salidas, saldo_actual, credito_disponible`.
**Fuente de verdad del saldo por cuenta** (Σ entrada − salida por cuenta_id).

### `vw_saldo_prestamo`
`id, nombre, tipo, monto_inicial, limite_credito, tasa_mensual, plazo_meses, capital_pagado, interes_pagado, saldo_pendiente`.
⚠️ DEU-1/DEU-2: `capital_pagado` se calcula desde `cuotas.pagada`, así que un pago
que no toque `cuotas` NO baja el saldo. La reescritura debe sincronizar `cuotas`.

### `vw_saldo_inversor`
`id, nombre, capital_invertido, monto_pactado_devolver, total_devuelto, saldo_pendiente`.
⚠️ INVR-1: `total_devuelto` requiere que el pago lleve `inversor_id`.

### `vw_stock_sku`
`id_sku, nombre, categoria, marca, modelo, color, cpp_actual, precio_venta_sugerido, uds_recibidas, uds_en_transito, uds_vendidas, stock_actual, ingresos_totales, ganancia_total, activa`.
⚠️ KPI-1: `LEGACY-SALE` tiene `stock_actual` negativo (−88) — filtrarlo en el stock total.

---

## Triggers automáticos (no replicar en frontend)

1. Prorrateo de costos del lote → `costo_compartido_asignado` por entrada.
2. Redistribución al insertar/cambiar/borrar entradas del lote.
3. Recálculo de `skus.cpp_actual` al cambiar entradas RECIBIDO (weighted avg lifetime).
4. Snapshot `cpp_historico` al INSERT de `ventas_items`.
5. Recálculo de `ventas.total_facturado` / `total_ganancia` al cambiar líneas.
6. Recálculo de totales al cambiar `envio_cobrado` / `descuento` del encabezado.

---

## Enums (verificados vs Supabase 2026-06-07)

```sql
tipo_movimiento:  APORTE_DUENO, APORTE_INVERSOR, VENTA, ENVIO_COBRADO,
  COMPRA_MERCANCIA, COMPRA_OPERATIVA, ENVIO_LOTE, PAGO_PRESTAMO,
  PAGO_LINEA_CREDITO, PAGO_TARJETA_CREDITO, PAGO_INTERESES, PAGO_ADS,
  PAGO_COMISION, PAGO_INVERSOR, PAGO_TRANSPORTE, DRAWDOWN, FEE_BANCARIO,
  TRANSFERENCIA_INTERNA, REFUND_PROVEEDOR, REFUND_CLIENTE, AJUSTE, OTROS  (22)

tipo_prestamo:     PRESTAMO, LINEA_CREDITO, TARJETA_CREDITO
status_entrada:    PENDIENTE, RECIBIDO, PERDIDO
status_lote:       PENDIENTE, EN_TRANSITO, EN_COURIER_USA, RECIBIDO, CANCELADO  (5)
moneda_tipo:       RD, USD
categoria_sku:     MOUSE, TECLADO, HEADSET, STAND, MOUSEPAD, OTRO
                   (UPPERCASE; dashboard mapea a 'Mouse'/'Teclado'/… vía CAT_MAP)
tipo_cuenta:       DEBITO, CREDITO, EFECTIVO
tipo_contraparte:  PROVEEDOR, BANCO, INVERSOR, CANAL_VENTA, PERSONA_OPERATIVA,
                   CLIENTE_FAMILIAR, SERVICIO, OTRO
tipo_compensacion: FLAT, AMORTIZACION, PCT_GANANCIA, PCT_REVENUE, CUOTA_BONUS,
                   ROYALTY, SALARIO_FIJO, PCT_UTILIDADES, DRAWDOWN_LIBRE,
                   PCT_REVENUE_PROP, BONUS_HITOS, REEMBOLSO_GASTOS,
                   DIVIDENDO_PREFERENTE, ROYALTY_BRUTO, RBF, SALARIO_PRO_LABORE,
                   UTILIDADES_SUBORD, SWEAT_EQUITY, REINVERSION, CASHFLOW_ANUAL,
                   COMISION_SKU, EXCEDENTE_REAL  (22)
```

> Nota: los nombres de enum son `tipo_movimiento` / `status_entrada` /
> `status_lote` / `moneda_tipo` / `categoria_sku` / `tipo_cuenta` /
> `tipo_prestamo` / `tipo_contraparte` / `tipo_compensacion` (NO
> `movimiento_tipo` / `entrada_status` / `lote_status` como decían docs viejas).

---

## Queries comunes (cheat sheet)

```sql
-- Saldo por cuenta (fuente de verdad del capital líquido)
SELECT nombre, saldo_actual FROM vw_saldo_cuenta WHERE tipo IN ('DEBITO','EFECTIVO');

-- Estado del préstamo Coop
SELECT * FROM vw_saldo_prestamo WHERE nombre = 'Coop Prestamo';

-- Stock total real (excluye placeholder LEGACY-SALE)
SELECT SUM(stock_actual) FROM vw_stock_sku WHERE id_sku <> 'LEGACY-SALE';

-- Top SKUs por unidades vendidas del mes
SELECT s.nombre, SUM(vi.cantidad) uds, SUM(vi.ganancia_total) ganancia
FROM ventas_items vi
JOIN ventas v ON v.id = vi.venta_id
JOIN skus s   ON s.id_sku = vi.sku_id
WHERE v.fecha >= date_trunc('month', CURRENT_DATE)
GROUP BY s.nombre ORDER BY uds DESC LIMIT 10;

-- Próximas cuotas a pagar
SELECT p.nombre, c.numero, c.fecha_pago, c.capital, c.interes, c.seguro
FROM cuotas c JOIN prestamos p ON p.id = c.prestamo_id
WHERE NOT c.pagada ORDER BY c.fecha_pago ASC LIMIT 5;
```
</content>
</invoke>
