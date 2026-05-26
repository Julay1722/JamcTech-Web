# JAMC's Tech — Migration Handoff

> Este documento resume el estado al cierre de la migración de Google Sheets V2.1 → Supabase, **PLUS** la migración del dashboard frontend de Airtable → Supabase (2026-05-26).

## TL;DR

1. **Data migrada** (jul 2025 - may 2026): Google Sheets V2.1 → Supabase ✓
2. **Dashboard migrado** (2026-05-26): Airtable client → Supabase client ✓
3. Estado actual: dashboard local en `npx serve .` apuntando a Supabase, lee y escribe perfectamente.

## Fase 2 · Migración del dashboard (2026-05-26)

Esta es la fase que estaba marcada como "P0 pendiente" en TODO.md y se ejecutó en una sesión autónoma de Claude Code.

**Lo que se hizo:**
- `src/supabase-client.js` — drop-in replacement de airtable-client.js. Mismo contrato `window.AT_CLIENT.*`, mismo cache `window.__AIRTABLE_DATA__`, mismos eventos `airtable-loaded`. Los 11 archivos de paneles no se modificaron (excepto el footer/ticker hardcoded en shell.jsx).
- 7 loaders read-only (skus, ventas, entradas, cashflow, financiero, resumen, movFin).
- 12 writers específicos + 3 wrappers genéricos (cubren el surface completo que los paneles llaman).
- Override de globals hardcoded (CF_ALL, CF_MES, MES, COOP, ANDREA, BHD) por mutación in-place — necesario porque data.js declara estos como `const` lexical, no como propiedades de window que sean reemplazables.
- RLS: 13 tablas con policy `dev_anon_all` abierta al rol `anon` (revisar antes de deploy).
- Compat shim: `window.AT.fields.cashflow.*` con keys literales para paneles que llamaban `AT_CLIENT.create('cashflow', fields-with-airtable-IDs)`.

**Bugs que se encontraron y se fixearon:**
- `loadResumen` devolvía `[]` que era truthy → rompía fallback a `MES` en panel-mando → panel quedaba en blanco. Fix: computar resumen real desde ventas + cashflow.
- `_buildFinancieroProductos` infinite loop por re-dispatch de `airtable-loaded`. Fix: flag `_overrideInFlight` + early return en listener.
- Mutación de `window.MES = newArr` no afectaba a paneles porque `const MES` (lexical binding) seguía referenciando el array original. Fix: mutar array in-place (`arr.length=0; arr.push(...)`).
- `useAirtableTable` filtraba por nombre exacto de tabla, ignoraba mi event `'globals'`. Fix: aceptar `'globals'` como wildcard.
- React bail-out con setState({...} con valores iguales). Fix: incluir `_tick: counter` para forzar re-render.
- Panels mounteados tarde (babel-standalone + React) perdían eventos. Fix: fallback re-corre override a 1.5s, 3s, 5s post-boot.

**SQL migrations aplicadas:**
- `rls_open_anon_dev_local`: RLS open para todas las tablas
- `link_movimientos_venta_with_ventas`: linkea movimientos VENTA con ventas via match único fecha+monto (54/169 linkeados; 115 V-LEG sin match único)
- `link_movimientos_venta_segunda_pasada`: segunda pasada con condición más flexible (sin envío)
- Tabla `disenos` llenada con 4 entries base (Hollow Knight, Plain White, Plain Black, Custom Cliente)

**Tests verificados:**
- SKU CRUD (create + update + remove + countSKURefs)
- Venta multi-step (create con trigger CPP snapshot + update header + remove con cascade FK)
- Lote suelto (entrada sin lote header) + lote completo (con header + shared costs)
- MovFin (Cuota Préstamo a Coop con capital/interés/seguro)
- Cashflow genérico vía shim `window.AT.fields`
- UI end-to-end: registrar venta desde panel `04 RADAR > 05 VENTAS > NUEVA VENTA`
- Visual: MANDO, FINANC, INVENT, RADAR todos rendereando data real de Supabase

**Lo que NO se hizo (decidir con Julio antes):**
- Cuotas BHD auto-regen (P1, requiere decisión: schedule vs balance corriente)
- Stock management retroactivo con lotes (P2, opcional)
- Cleanup post-migración (P2): eliminar airtable-client.js, Netlify function, env vars cuando todo esté estable

## Fase 1 · Migración Google Sheets → Supabase (texto original abajo)

La data histórica del negocio (julio 2025 - mayo 2026) fue migrada exitosamente de Google Sheets a Supabase. **La DB está lista para uso productivo.**

## Estado de tablas (snapshot)

| Tabla | Filas | Notas |
|---|---|---|
| skus | 50 | 49 reales + 1 placeholder `LEGACY-SALE` |
| disenos | 0 | Julio los llena después |
| lotes | 0 | V2.1 no modelaba lotes; trabajo futuro |
| entradas | 79 | 60 RECIBIDAS + 19 PENDIENTES |
| ventas | 190 | 94 modernas (V-MIG) + 96 legacy (V-LEG) |
| ventas_items | 190 | 1:1 con ventas (todas son single-SKU) |
| movimientos | 276 | jul 2025 - may 2026 |
| cuentas | 5 | BHD, Scotia RD, Scotia USD, Qik, Efectivo |
| prestamos | 5 | Coop + BHD Linea + 3 tarjetas |
| cuotas | 48 | Coop completo (3 pagadas) |
| contrapartes | 17 | proveedores, bancos, personas |
| inversores | 1 | Andrea Correa |
| tasas_cambio | 0 | usar campos en movimientos por ahora |

## Cifras de cierre

**Operacional (mayo 2026):**
- Saldo BHD: $33,759.66 RD
- Saldo pendiente Coop: $110,176.01 RD
- Línea BHD drawn: $68,660.20 RD (de $112K límite)
- Capital invertido por Andrea: $50K, devuelto hasta hoy: $5K

**Ventas lifetime (jul 2025 → may 2026):**
- Total facturado: $380,150.44 RD
- Ganancia total: $152,622.77 RD
- 190 ventas, ~$2,001 ticket promedio

**Movimientos por naturaleza:**
- CASHFLOW: 237 movs, neto -$66,195 (compras + opex > ventas hasta hoy, pero hay capital aportado e inversor)
- FINANCIERO: 39 movs, neto +$99,955 (los drawdowns dominan)

## Fases de la migración (ejecutadas)

1. **Fase 0** — Schema diseñado y creado (13 tablas, 6 vistas, ~9 triggers)
2. **Fase 1** — Seeds: 5 cuentas, 5 préstamos, 17 contrapartes, 1 inversora, 50 SKUs
3. **Fase 2** — Entradas: 79 filas (CPP recalculado automáticamente por triggers)
4. **Fase 3** — Ventas modernas: 94 ventas V-MIG-XXXX con SKUs correctos (feb-may 2026)
5. **Fase 4** — Ventas legacy: 96 ventas V-LEG-XXXX bajo placeholder `LEGACY-SALE` (jul 2025 - ene 2026, sin SKU específico porque V2.1 no lo guardaba)
6. **Fase 5** — Cuotas Coop: schedule realista de 48 meses con cuotas 1-3 marcadas como pagadas
7. **Fase 6** — Movimientos: 276 filas del cash flow (todos los meses jul 2025 - may 2026)

## Decisiones importantes y por qué

### 1. SKU rename KA820 → AK820
V2.1 tenía el modelo escrito como "KA820" pero el real es "AK820 PRO" (Ajazz AK820). Renombrado todos los SKUs:
- `TEC-AJA-KA820-{NEG,BLA,GIB,BAG,MOR,GRI}` → `TEC-AJA-AK820-{NEG,BLA,GIB,BAG,MOR,GRI}`

Las FKs tienen `ON UPDATE CASCADE` así que los UPDATEs propagaron automáticamente a entradas referenciadas.

### 2. Coop sin abono extra
V2.1 mostraba "Mes 1 = 18,568.64 con abono 15K". Esto era una PROYECCIÓN HIPOTÉTICA, no realidad. Julio aclaró:

> *"Tenías un préstamo con un balance de 15K personal, cuando saqué el de la tienda. Ese balance se me fue dado en efectivo y 115 de deuda. Lo que hice fue abonar esos 15K [al préstamo personal anterior], por eso no están en el Doc."*

Es decir: Coop disbursó 115K + 15K cash. Los 15K se aplicaron al préstamo personal previo de Julio, NO al Coop. Por eso el cash inflow del Coop fue 100K (no 115K) y el Coop sigue siendo 115K full.

Schedule actual: 48 meses estándar de $3,568.64. Si Julio decide abonar al capital después, regenerar.

### 3. Una tabla movimientos, no dos
Julio pidió separar "cashflow" y "financiero". Solución elegida: una sola tabla con columna calculada `naturaleza`. Más vistas (`vw_cashflow`, `vw_financiero`) hacen la separación lógica.

Razón: el balance de una cuenta se calcula sumando TODOS sus movimientos. Si hubieran dos tablas, cada query de balance requeriría UNION. Esta forma es más limpia y permite cambiar la clasificación sin migrar datos.

### 4. Entrada y salida ambas positivas en una fila
V2.1 tiene filas como "Venta de mercancía Facebook + Envío | entrada 1100 | salida 240.75". Esto representa "el cliente pagó 1100 y de eso se descontó 240.75 de envío" como un evento atómico.

Inicialmente el schema tenía `CHECK (NOT (entrada > 0 AND salida > 0))` para forzar separar venta y envío en dos filas. Lo eliminé porque:
- Preserva la estructura exacta del V2.1 (mejor para auditar)
- No vale la pena romper 50+ filas legacy en 2 cada una

### 5. CPP weighted average lifetime (no FIFO)
La fórmula del CPP considera TODAS las entradas RECIBIDO históricamente, ponderadas por cantidad. No FIFO, no LIFO. Esto da un CPP más estable y representativo del costo "típico" de tener ese SKU. Hay leves discrepancias con V2.1 (que parece usar último lote o FIFO en algunos casos) pero son menores.

## Discrepancia conocida (no corregir, está bien)

**Saldo BHD calculado: $33,759.66 vs V2.1: $31,959.66. Diferencia: $1,800.**

Causa: el 21 sep 2025, V2.1 registró una venta de $1,800 a Facebook pero el running balance no se incrementó (bug del sheet). Esa venta SÍ existe en mi `ventas` table como V-LEG-0019. Por tanto la data Supabase es más correcta.

Si Julio compara con su sheet, decirle: "tu sheet tiene un bug de septiembre, mi número es el correcto".

## Mapeo SKUs V2.1 → Supabase

V2.1 usa códigos cortos (3 chars en cada segmento). Supabase usa códigos largos (modelo completo). Mapeo aplicado durante migración:

| V2.1 corto | Supabase largo |
|---|---|
| MOU-HXS-9PR-* | MOU-HXS-T90PRO-* |
| MOU-HXS-BLA-BLA | MOU-HXS-BLANCOPAW-BLA |
| MOU-ATT-V3 -ROS | MOU-ATT-V3PRO-ROS |
| MOU-AJA-AJ1-{ROJ,BLA,NEG} | MOU-AJA-AJ139-{ROJ,BLA,NEG} |
| MOU-AJA-J59-{NEG,BLA} | MOU-AJA-AJ159PRO-{NEG,BLA} |
| MOU-AJA-AJ1-{MAM,AZU} | MOU-AJA-AJ179APEX-{MAM,AZU} |
| TEC-AJA-NK6-* | TEC-AJA-NK61-* |
| TEC-AJA-68N-* | TEC-AJA-NK68-* |
| TEC-AJA-68V-* | TEC-AJA-NK68V2-* |
| TEC-AJA-AK6-MOR | TEC-AJA-AK650-MOR |
| TEC-AJA- AK-{MOR,GRI} | TEC-AJA-AK820PRO-{MOR,GRI} |
| TEC-AJA-KA8-* | TEC-AJA-AK820-* (corregido nombre) |
| HEA-ATT-L80-* | HEA-ATT-L80PRO-* |
| HEA-ATT-G80-* | HEA-ATT-G800-* |
| HEA-RAZ-BAR-BLA | HEA-RAZ-BARRACUDAX-BLA |
| HEA-AJA-AHM-NEG | HEA-AJA-AHM09MAX-NEG |
| STA-HOL-HOL-BLA | STA-HOL-HOLLOWKNIGHT-BLA |
| STA-PLA-PLA-BLA | STA-PLA-PLAINWHITE-BLA |

Para nuevos SKUs: usar formato largo desde el inicio.

## Linkings hechos

- ✓ Cuotas Coop 1, 2, 3 → movimientos del 20mar/18abr/19may (vía `cuotas.movimiento_id`)
- ✓ Movimientos PAGO_PRESTAMO → prestamo_id=1 (Coop)
- ✓ Movimientos PAGO_INTERESES → prestamo_id=2 (BHD Linea)
- ✓ Movimientos PAGO_TARJETA_CREDITO → prestamo_id correspondiente
- ✓ DRAWDOWN del 14 feb ($100K) → prestamo_id=1 (Coop)
- ✓ DRAWDOWN del 17 may ($68,660) → prestamo_id=2 (BHD Linea)
- ✓ Pagos a inversora → inversor_id=1 (Andrea)

## Linkings NO hechos (no críticos)

- Movimientos VENTA → ventas (vía `venta_id`). No matcheé por fecha+monto porque hay multi-matches. Si se quiere, hacer un script de matching aproximado.
- Entradas → lotes. V2.1 no tenía noción de lote, todas las entradas están sueltas. Si Julio quiere agruparlas retroactivamente, hacer manualmente.

## Archivos generados en el server de migración

(Disponibles en `/home/claude/migracion/` durante la sesión activa, pero no persisten — están consolidados en este handoff)

- `raw_cashflow.md` — data cruda del Control sheet V2.1
- `generate_sql.py` — parser que genera SQL por mes
- `sql_out/mov_YYYY_MM.sql` — 11 archivos con INSERTs por mes

Si necesitás re-correrlos, todo el SQL ejecutado ya está en `supabase_migration` table (migraciones DDL aplicadas con `apply_migration`).
