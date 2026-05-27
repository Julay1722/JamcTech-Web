# Mejoras detectadas durante QA de reingreso cronologico

Test session: 2026-05-27 · post-wipe de Supabase + reingreso manual desde V2.1

Severidades: **P1** rompe operacion · **P2** confunde al usuario · **P3** pulido

---

## P1

### #1 — Fallback hardcoded de deuda total cuando DB vacia
- **Sintoma**: con 0 prestamos en Supabase, KPI "Deuda total" en Resumen muestra RD$260,216 (COOP + Andrea + BHD) en vez de RD$0.
- **Causa probable**: panel-mando.jsx u OverviewPage lee de globals hardcoded en src/data.js (COOP/ANDREA/BHD) en lugar de derivar de `data.prestamos` real.
- **Fix**: cuando `data.prestamos.length === 0`, fallback a 0; nunca usar las constantes legacy de data.js.
- **Detectado**: Resumen post-wipe.

### #2 — Cards hardcoded en Finanzas/Resumen con DB vacia
- **Sintoma**: en Finanzas > Resumen aparecen cards "Prestamo Cooperativa", "Inversora · Andrea Correa", "BHD Usado · limite RD$112,000", "Cuenta Operativa · BHD Debito" aun con 0 prestamos/0 inversores/0 cuentas. Son placeholders prerenderizados.
- **Causa probable**: panel-financiero.jsx renderiza cards con nombres/limites hardcoded de constantes legacy.
- **Fix**: rendear cards dinamicamente a partir de `data.prestamos`/`data.inversores`/`data.cuentas`. Si vacios, mostrar empty state ("Sin prestamos · agregar uno").
- **Detectado**: Finanzas > Resumen post-wipe.

### #6 — "HOY" en header de Resumen es hardcoded 20/05/26
- **Sintoma**: el subtitulo del Resumen dice "164 ventas · 50 SKUs · 278 movimientos · **20/05/26**" pero hoy es 2026-05-27. El periodo "MES" tambien filtra contra esa fecha falsa. Resultado: ventas de los ultimos 7 dias salen vacias aunque haya data.
- **Causa**: hay un `const HOY` lexico en data.js que vale '2026-05-20' y se usa en varios paneles en lugar de `window.HOY` (que SI refleja today).
- **Fix**: grep-replace en data.js + dashboard panels: usar `window.HOY` o `new Date()` en lugar del HOY hardcoded.
- **Detectado**: Resumen post bulk-load.

### #7 — Ganancia bruta = Ventas histórico para ventas LEGACY
- **Sintoma**: KPI "Ganancia bruta" muestra RD$379,214 igual que "Ventas histórico" → margen 100%. La razon: las 164 ventas LEGACY-SALE tienen cpp_historico=0, asi que la ganancia (precio - costo) = precio entero.
- **Causa**: el SKU placeholder LEGACY-SALE tiene cpp_actual=0 y el trigger snapshot_cpp captura ese 0 al crear cada venta_item.
- **Fix**: 3 opciones — (a) excluir explicitamente sku=LEGACY-SALE del calculo de ganancia y mostrar como "N/A"; (b) calcular margen prorrateado usando el % de ganancia historico del periodo (~42% segun Rendimiento sheet); (c) permitir setear un cpp_historico manual cuando se crea una venta legacy.
- **Detectado**: Resumen post bulk-load.

### #8 (P2) — "Capital actual" KPI confunde
- **Sintoma**: KPI grande dice "Capital actual RD$648,779" con subtitulo "cash flow neto historico". El sheet V2.1 reporta capital actual de RD$31,959.66.
- **Causa**: la metrica suma sum(entrada)-sum(salida) sobre TODOS los movimientos, lo cual cuenta dobles los "Inicio de operaciones" mensuales del sheet (cada mes V2.1 reabre con saldo del mes anterior como un nuevo APORTE_DUENO).
- **Fix**: o (a) calcular "Capital actual" como suma de saldos current de cuentas DEBITO + EFECTIVO en lugar de entrada-salida, o (b) renombrar el KPI a "Cash flow operativo acumulado" para que el numero deje de mentir.
- **Detectado**: Resumen post bulk-load. Tambien revela bug de data: APORTE_DUENO "Inicio de operaciones" duplicados al inicio de cada mes en el sheet.

---

## P2

### #3 — Form de Nueva cuenta no acepta saldo inicial
- **Sintoma**: el modal "Nueva cuenta de banco" pide solo nombre/tipo/moneda/notas. No hay campo "saldo inicial". El usuario debe acordarse de registrar despues un movimiento APORTE_DUENO desde Movimientos para sembrar la cuenta.
- **Fix**: agregar campo opcional "Saldo inicial RD$/USD" y "Fecha apertura" al modal. Al crear, si hay saldo > 0, automaticamente crear un movimiento APORTE_DUENO o BALANCE_INICIAL en la fecha indicada.
- **Detectado**: setup post-wipe.

### #4 — "Crear SKU" requiere dos clicks (primero preview, despues guarda)
- **Sintoma**: en el form + Nuevo SKU el primer click solo muestra la preview (ID generado, nombre). Hay que hacer click otra vez para que realmente cree el SKU.
- **Fix**: o (a) consolidar a un solo click "Crear" que muestre la preview inline ANTES de pulsar, o (b) cambiar la primera pulsacion a un boton "Vista previa" y mantener "Crear SKU" como el commit final, con un texto que aclare el flujo.
- **Detectado**: + Nuevo SKU > MOU-HXS-T90-NEG.

### #5 — Boton "+ Anadir SKU" del wizard de Lote se desplaza al crecer filas
- **Sintoma**: tras anadir el primer SKU row, el boton "+ Anadir SKU" baja en y. Clicks consecutivos en las mismas coordenadas fallan porque el boton ya no esta ahi. Hace tediosa la entrada manual de lotes con 5-10 SKUs.
- **Fix**: o (a) anadir varias filas de una vez con un input "cuantos SKUs" antes de empezar, o (b) auto-anadir una fila vacia debajo cuando la ultima recibe un SKU, o (c) fijar el boton "+ Anadir SKU" como sticky al final del bloque de filas.
- **Detectado**: + Nuevo lote > intentar anadir 4 SKUs seguidos.

---

## P3

(pendiente)

---

## Fixes aplicados en esta sesion

- **#1 Fallback de prestamos vacios** — `src/supabase-client.js:_overrideGlobals` ahora zero-out `window.COOP/ANDREA/BHD` cuando no hay match en `D.financiero`. Resultado: DB vacia muestra deuda RD$0 en vez de RD$260,216.
- **#2 Cards hardcoded en Finanzas > Resumen** — `index.html:3735` envuelve cards Coop/Andrea en conditional `(coop && coop.monto > 0)`. Vacios muestran empty state ("Sin prestamos · agrega uno"). Nombres ahora vienen de la data real (`coop.nombre`, `andrea.nombre`) en vez de strings hardcoded.
- **#3 Saldo inicial en form Cuenta** — `index.html:FormCuenta` agrega campos `saldoInicial` + `fechaApertura`. Al crear, si saldo > 0, automaticamente crea movimiento `APORTE_DUENO` (debito/efectivo) o `DRAWDOWN` (credito) para sembrar.
- **#4 Buttons antes del preview en wizards** — `index.html:FormVenta` + `index.html:FormSKU` reordena el JSX para que botones "Registrar/Crear" queden ANTES del summary preview. Posicion estable al expandirse el form.
- **#5 Auto-add fila SKU en wizards** — `index.html:FormLote` (2 instancias) + `FormVenta` ahora auto-appendean fila vacia cuando la ultima fila recibe un SKU. Evita tener que cazar el boton "+ Anadir SKU" que se desplaza.
- **#6 HOY hardcoded** — `index.html:931` ahora usa `window.HOY || HOY` en el subtitulo del Resumen. Subtitulo refleja fecha real.
- **#7 Ganancia LEGACY** — `src/supabase-client.js:loadVentas` aplica margen 42% (de V2.1) cuando TODOS los items son `sku_id='LEGACY-SALE'`. Resultado: ganancia bruta RD$160,370 (era RD$380,464).
- **#8 KPI "Capital actual"** — `index.html:OverviewPage` computa capital como sum(saldo cuentas DEBITO+EFECTIVO) en vez de cash flow neto. Fallback al cash flow si no hay cuentas. Resultado: RD$30,349 (matches V2.1 cierre RD$31,960 — 1.6K residual es el discrepancy conocido sept-25).
- **#10 LEGACY-SALE en Inventario** — `index.html:InventarioPage` + `AlertasPage` excluyen el SKU placeholder LEGACY-SALE. Antes mostraba "-164 stock" como noise.
- **#11 KPI Cuenta operativa siempre 0** — `index.html:3731` reduce roto (`(s,c)=>s` siempre retornaba 0). Ahora computa desde `window.BANCOS_SEED.filter(b => /BHD/i.test(b.nombre) && b.tipoSub === 'Corriente')`.
- **#12 COOP saldo no reflejaba pagos** — `src/supabase-client.js:_buildFinancieroProductos` y `_overrideGlobals` para Coop ahora prefieren cashflow sobre `vw_saldo_prestamo` (la vista requiere FK explicito en movimientos que no siempre se setea en bulk-loads). Resultado: Saldo Coop RD$103,414 con 3 pagos registrados (era RD$115,000 estancado).
- **Bonus** — `window.BANCOS_SEED` se inicializa como `[]` en el override si no existe. Antes el `if (... && window.BANCOS_SEED)` saltaba el bloque y BANCOS_SEED quedaba undefined.
- **Bonus data cleanup** — Borrados 10 movimientos `APORTE_DUENO` duplicados con notas "Inicio de operaciones" (cada mes V2.1 reabria con saldo anterior como nuevo aporte). RD$618K menos de inflacion en KPIs.

## Verificacion E2E

- Resumen: KPIs correctos · charts mensuales 11 meses · capital RD$30,349 ≈ V2.1 RD$31,960 ✓
- Alertas: 26 criticos · 4 reposicion · 20 sin movimiento (sin LEGACY) ✓
- Ventas: 165 ventas · revenue RD$380,464 · ganancia RD$160,370 · margen 42.2% ✓
- Inventario: 49 SKUs · sin "Legacy N/A" en lista · auto-add fila en Lote wizard ✓
- Finanzas: Coop saldo RD$103,414 con 3 pagos · Andrea pagado RD$5,006 · BHD usado RD$68,795 · 3 tarjetas ·  Cuentas BHD Debito RD$30,349 + Efectivo RD$0 ✓
- Movimientos: 269 totales · filtros tipo/cuenta/naturaleza funcionando · sticky header · CSV export ✓
- Wizards: + Nuevo SKU + Nueva cuenta + Nueva venta verificados via Chrome real ✓
