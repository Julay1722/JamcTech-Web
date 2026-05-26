# JAMC's Tech — Project Context for Claude Code

> **Lee este archivo primero.** Es el contexto operacional del proyecto. Para historia detallada de la migración, ver `HANDOFF.md`. Para schema de la DB, ver `SCHEMA.md`. Para trabajo pendiente, ver `TODO.md`.

## Qué es JAMC's Tech

Tienda online de periféricos gaming (mouse, teclados, headsets, mousepads, stands) en Santo Domingo, República Dominicana. Vende por Facebook + envíos por courier local. Dueño: Julio.

**Operación actual:** ~190 ventas históricas (jul 2025 - may 2026), ~50 SKUs activos, importa de Temu/Alibaba/Amazon, opera con préstamo Coop ($115K RD), línea de crédito BHD ($112K límite), 3 tarjetas de crédito, 1 inversora (Andrea Correa - $50K).

## Stack

| Componente | Tech | Status |
|---|---|---|
| **Database** | Supabase (Postgres) | ✓ Migrado, 276 movimientos, 190 ventas, 79 entradas |
| **Frontend dashboard** | HTML/JS estático en Netlify | ⚠️ Actualmente apunta a Airtable, hay que migrar a Supabase |
| **Repo dashboard** | github.com/Julay1722/Jamc-s | - |
| **Fuente histórica** | Google Sheets "1722PRO V2.1" (ya migrado a Supabase) | Solo referencia |

## Credenciales Supabase

```
Project ID:       oicxvnnzocwnqlsojhco
URL:              https://oicxvnnzocwnqlsojhco.supabase.co
Anon key:         [Julio debe sacarlo de Supabase dashboard > Settings > API]
Service role key: [NO usar en frontend. Solo para scripts admin.]
```

## Estructura del proyecto local

```
C:\Users\coco2\OneDrive\Escritorio\3.4\jamcs-tech\
├── index.html               # Dashboard principal
├── airtable-client.js       # ⚠️ A REEMPLAZAR por supabase-client.js
├── wizard.js                # Wizard para nuevas ventas/entradas
├── styles.css
└── (otros assets)
```

## Modelo mental del negocio

**Flujo de inventario:**
1. Julio pide a Temu/Alibaba (entrada con status='En Camino', creates lote)
2. Llega merca → status='Recibido', dispara recálculo de CPP (Costo Promedio Ponderado)
3. Vende por Facebook → registra venta con SKU + precio. cpp_historico se snapshota
4. Cliente paga → registra movimiento de cash inflow

**Flujo de dinero:**
- Cuentas de débito: BHD, Scotia RD, Scotia USD, Qik, Efectivo (5 cuentas)
- Deudas: 1 préstamo (Coop), 1 línea de crédito (BHD), 3 tarjetas (Scotia RD, Scotia USD, Qik)
- Inversora: Andrea Correa

**Movimientos tienen `naturaleza` calculada automáticamente:**
- `CASHFLOW` — ventas, compras, ads, aportes del dueño, etc. (operacional)
- `FINANCIERO` — pagos a préstamos/tarjetas, intereses, fees bancarios, pagos a inversores, drawdowns

Hay 2 vistas listas: `vw_cashflow` y `vw_financiero`.

## Convenciones críticas

### IDs de SKU
Formato: `{CATEGORIA}-{MARCA}-{MODELO}-{COLOR}`. Ejemplo: `MOU-HXS-T90-NEG` = Mouse HXSJ T90 Negro.

Códigos largos (no abreviados). Ejemplos correctos:
- ✅ `TEC-AJA-AK820-NEG` (Teclado Ajazz AK820 Negro)
- ✅ `MOU-AJA-AJ159PRO-BLA`
- ❌ `TEC-AJA-KA8-NEG` (formato corto de V2.1, ya migrado al largo)

Cuando Julio tipea SKUs cortos en su sheet, hay un mapeo histórico aplicado durante la migración (ver `HANDOFF.md` sección "Mapeo SKUs V2.1 → Supabase"). Para NUEVOS SKUs, usar el formato largo.

### Códigos de ventas
- `V-MIG-XXXX` — ventas migradas con SKU correcto (feb-may 2026)
- `V-LEG-XXXX` — ventas legacy sin SKU específico (jul 2025 - ene 2026, bajo placeholder SKU `LEGACY-SALE`)
- Para NUEVAS ventas desde el dashboard: usar formato `V-{YYYYMMDD}-{NNN}` o similar incremental

### Moneda
Todo en **RD$** salvo compras USD a Temu/Alibaba/Amazon que tienen campo `monto_usd` + `tasa_cambio`. Cuentas en USD existen (Scotia USD, Scotia CC USD).

### Cálculo de cuotas
Préstamo Coop: cuota mensual `3,568.64` = `3,501.94` (capital+interés) + `66.70` (seguro). Schedule de 48 meses generado, cuotas 1-3 ya pagadas. Saldo actual: `$110,176.01`.

Si Julio decide hacer abonos extra al capital, regenerar el schedule (ver función pendiente en TODO.md).

## Triggers automáticos en la DB

**NO duplicar lógica en frontend para estos cálculos:**

1. **CPP automático**: al insertar/actualizar `entradas` con status='Recibido', se recalcula `skus.cpp_actual` (promedio ponderado por lote considerando todas las entradas recibidas históricas).

2. **Prorrateo de costos compartidos del lote**: cuando un lote tiene `costo_envio` + `costo_courier` + `costo_impuestos`, se reparte proporcionalmente entre las entradas del lote según valor base de cada una.

3. **Snapshot de CPP en venta**: al insertar `ventas_items`, se captura el `cpp_actual` del SKU en ese momento como `cpp_historico` (así la ganancia es históricamente correcta aunque el CPP cambie después).

4. **Recálculo de total de venta**: el encabezado `ventas` tiene `total_facturado`, `total_ganancia`. Estos se recalculan automáticamente con cada cambio en `ventas_items`, `envio_cobrado` o `descuento`.

## Tipos enum importantes

### `movimiento_tipo` (22 valores)
```
APORTE_DUENO, APORTE_INVERSOR, VENTA, ENVIO_COBRADO,
COMPRA_MERCANCIA, COMPRA_OPERATIVA, ENVIO_LOTE,
PAGO_PRESTAMO, PAGO_LINEA_CREDITO, PAGO_TARJETA_CREDITO,
PAGO_INTERESES, PAGO_ADS, PAGO_COMISION, PAGO_INVERSOR,
PAGO_TRANSPORTE, DRAWDOWN, FEE_BANCARIO, TRANSFERENCIA_INTERNA,
REFUND_PROVEEDOR, REFUND_CLIENTE, AJUSTE, OTROS
```

### `prestamos.tipo`
```
PRESTAMO, LINEA_CREDITO, TARJETA_CREDITO
```

### `entradas.status`
```
PENDIENTE, RECIBIDO, PERDIDO
```

### `categoria` (SKU)
```
Stand, Mouse, Teclado, Headset, Mouse Pad
```

## Discrepancia conocida

El saldo BHD calculado por suma de movimientos da $33,759.66 vs V2.1 que muestra $31,959.66. Diferencia: $1,800. Esto viene de un error en el sheet V2.1 de septiembre 2025 (registró una venta de 1,800 pero no la sumó al balance running). La data Supabase es **más correcta** porque esa venta existe en V-LEG-0019.

## Estilo de comunicación con Julio

- Español dominicano, respuestas cortas y directas
- "Que solo sea copiar y pegar" — necesita instrucciones explícitas
- No es dev experimentado, va paso a paso
- Prefiere mantener su dashboard custom (NO sugerir reemplazarlo por solución prefab)

## Decisiones de diseño que NO cambiar

1. **Una sola tabla `movimientos`** con columna calculada `naturaleza`. Las vistas separan CASHFLOW y FINANCIERO. NO crear dos tablas físicas.
2. **`entrada` y `salida` permiten ambas > 0** en la misma fila (eventos compuestos como "venta + envío cobrado al mismo cliente"). El check constraint `movimientos_check2` fue eliminado intencionalmente.
3. **`ventas` tiene encabezado + líneas** (`ventas_items`). Multi-SKU por venta. Triggers recalculan totales.
4. **CPP es weighted average lifetime**, no FIFO. Documentado y aceptado.
5. **Préstamos unificados** en una tabla con `tipo` (PRESTAMO/LINEA_CREDITO/TARJETA_CREDITO), no tablas separadas.
6. **FKs a `skus.id_sku`** tienen `ON UPDATE CASCADE` (rename de SKU se propaga).
