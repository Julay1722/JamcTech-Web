# Auditoría de integridad de datos — JAMC's Tech (2026-06-07)

Investigación de los "datos que se guardan mal" reportados por Julio. Hecha por 6
auditorías (Ventas + 5 subagentes en paralelo: Inventario, Deuda, Inversores,
Cuentas, KPIs), **verificando contra la base de datos real** (Supabase, proyecto
`oicxvnnzocwnqlsojhco`) + revisión del código de escritura (`src/supabase-client.js`,
`index.html`). Alimenta la skill `jamc-reglas` y `PROMPT_REWRITE.md`.

## Causa raíz (se repite en TODAS las áreas)

Cada entidad del negocio se guarda en **dos o más lugares que el código no
mantiene sincronizados**, y la capa de escritura JS descarta datos o usa la
cuenta/fuente equivocada:

- **Venta** → tabla `ventas` (revenue) vs caja `movimientos` (capital).
- **Compra/lote** → `entradas`/`lotes` (CPP) vs caja `movimientos`.
- **Deuda** → `prestamos.saldo_corte` (snapshot manual) vs `cuotas` (schedule) vs `movimientos` (cash real).
- **Inversor** → columnas de `inversores` vs `movimientos`.

Los **triggers de la DB están sanos** (CPP, prorrateo, totales de venta, stock,
naturaleza). Los bugs están en la **capa de escritura JS** y en **KPIs que leen
fuentes desincronizadas o equivocadas**. Por eso los números no cuadran y se
tapan con ajustes manuales (19 AJUSTE, −$20,111).

> **El fix de fondo de la reescritura:** tratar cada operación como **transacción
> atómica y sincronizada** (crear/editar/borrar una venta/compra/pago toca TODAS
> sus tablas a la vez, con monto y moneda correctos y FKs siempre ligadas), y que
> cada KPI lea **una sola fuente de verdad** (las vistas `vw_*`).

---

## ⚠️ Antes de empezar: documentación con IDs DESACTUALIZADOS

Los subagentes verificaron que `SCHEMA.md` y `CLAUDE.md` tienen IDs/nombres
viejos. **Reales hoy:**

- **`cuentas`:** 1 BHD Débito · 2 Efectivo · 3 Scotia CC RD · 4 Scotia CC USD ·
  5 Qik · 6 BHD Línea · 7 Scotia Débito USD
- **`prestamos`:** 1 Scotia CC RD · 2 Scotia CC USD · 3 Qik · 4 Coop · 5 BHD Línea
- **Enums:** se llaman `status_entrada` / `status_lote` (no `entrada_status`/
  `lote_status`). `status_lote` = {PENDIENTE, EN_TRANSITO, EN_COURIER_USA,
  RECIBIDO, CANCELADO} (5 valores).
- **`vw_stock_sku`** usa columnas `uds_recibidas` / `uds_vendidas` / `stock_actual`
  (no `stock_fisico`).
- **Conteos reales:** lotes=20, entradas=84, disenos=4 (no 0).

Actualizar `SCHEMA.md`/`CLAUDE.md` con esto antes de codificar nada.

---

## VENTAS

- **VEN-1 (CRÍTICO):** editar venta no re-sincroniza la caja. `updateVentaHeader`
  (~L1190) y `updateVentaLineas` (~L1213) cambian `ventas` pero no el movimiento
  de caja → revenue y capital divergen.
- **VEN-2 (CRÍTICO):** `createVenta` (~L1145) mete `entrada = solo productos`,
  ignora `envio_cobrado` y no registra el envío pagado al courier. Las ventas
  migradas sí lo traían → es un retroceso.
- **VEN-3 (ESTRUCTURAL):** `removeVenta` borra caja por `venta_id`, null en
  ventas viejas → ingresos huérfanos inflan capital.
- **VEN-4 (ESTRUCTURAL):** 173/175 movimientos VENTA sin `venta_id`.
- **VEN-5 (ESTRUCTURAL):** `ventas.envio_cobrado` histórico casi vacío ($50 de ~$21k).
- **Fix:** crear/editar/borrar venta = tocar venta + caja atómicamente
  (entrada = productos + envío; salida = envío pagado; `venta_id` siempre ligado).

## INVENTARIO (SKUs, lotes, entradas, CPP)

- **INV-1 (CRÍTICO):** costo de mercancía comprada en USD se guarda en RD$ crudo
  en `entradas`. `createLote` fuerza `moneda:'RD'` (client ~L1296) y guarda
  `costo_unitario_base = costoUd` sin convertir (~L1303). La conversión solo se
  aplica al movimiento de caja, no al costo de la entrada → **el trigger de CPP
  calcula un CPP ~60× menor → ganancia inflada en todas las ventas de ese SKU.**
- **INV-2 (CRÍTICO):** editar costo/cantidad de mercancía de un lote no
  re-sincroniza la caja (`updateEntrada`/`addEntradaToLote` solo tocan `entradas`,
  nunca el `COMPRA_MERCANCIA`). EditLoteModal ~L1901.
- **INV-3 (CRÍTICO):** `updateLoteHeader` (~L1459) ignora USD y tarjeta al
  crear/ajustar salidas: no convierte moneda, no aplica regla 7 (siempre `salida`,
  nunca DRAWDOWN+`prestamo_id`), no escribe `monto_usd`/`tasa_cambio`.
- **INV-4 (ESTRUCTURAL):** `monto_usd`/`tasa_cambio` nunca se persisten — solo se
  concatenan a `notas` (client ~L1838). 0 de 276 movimientos los tienen.
- **INV-5 (ESTRUCTURAL):** compras desligadas del lote (0/37 COMPRA_MERCANCIA con
  `lote_id`). El auto-link depende de ventana de 8s + fecha exacta (~L1888) → frágil.
  Rompe el cascade de `removeLote`.
- **INV-6 (ESTRUCTURAL, evidencia):** caja de compras ≠ inventario. Costo base
  entradas 421,740 vs COMPRA_MERCANCIA 442,554 (gap 20,814); envío declarado en
  lotes 29,976 vs ENVIO_LOTE 58,686 (~2×).
- **INV-7 (MENOR):** el código solo mapea 3 de los 5 estados de `status_lote`.
- **SANO:** triggers de CPP y prorrateo (0 discrepancias en 49 SKUs / 84 entradas),
  integridad referencial, formato de SKU, stock (único negativo = LEGACY-SALE).

## DEUDA (préstamos, líneas, tarjetas, cuotas)

- **DEU-1 (CRÍTICO):** el "usado/saldo" se calcula de DOS formas que no cuadran:
  `vw_saldo_prestamo` usa `saldo_corte + Σ(movs futuros)` mientras el frontend
  (`_buildFinancieroProductos` ~L835) suma TODOS los movimientos por FK. Como todos
  los `fecha_corte` están en hoy, la vista ignora el histórico. Ej. BHD Línea:
  86,315 (vista) vs 85,802 (panel); Scotia CC RD: 0 vs 459.50.
- **DEU-2 (CRÍTICO):** pagar una cuota no toca la tabla `cuotas`. `createMovFin`
  (~L1526) solo inserta en `movimientos`; descarta capital/interés/seguro y no
  marca `pagada`/`fecha_pagada`/`movimiento_id`. Como `vw_saldo_prestamo` calcula
  el capital pagado SOLO desde `cuotas.pagada`, **registrar un pago NO baja el saldo.**
- **DEU-3 (CRÍTICO):** no existe el schedule del Coop. Solo 4 filas en `cuotas`
  (no 48), todas sin `saldo_post`, y no cuadran con el efectivo (cuotas capital
  20,286 vs cash 10,705; DRAWDOWN real 100k vs `monto_inicial` 115k).
- **DEU-4 (ESTRUCTURAL):** `saldo_corte`/`fecha_corte` son snapshots manuales que
  ningún writer mantiene → la vista se congela. Bomba de tiempo de descuadre.
- **DEU-5 (ESTRUCTURAL):** "Cargo Línea"/interés se registra como `salida`
  (`MOVFIN_REV` ~L988) → **resta** del usado en vez de sumar. Dirección invertida.
- **DEU-6 (ESTRUCTURAL):** `removePrestamo` hace hard delete con FK NO ACTION →
  falla con error opaco o desliga el gemelo cuenta+tarjeta. Falta soft-delete.
- **DEU-7/8/9 (MENOR):** 2 pagos de tarjeta sin `prestamo_id`; `loadCuotas` no
  carga `saldo_post`/`fecha_pagada`/`movimiento_id` (la amortización se reconstruye
  a mano); 9 intereses BHD sin `prestamo_id`.
- **SANO:** DRAWDOWN íntegros (regla 7/8), gemelo cuenta+tarjeta de `FormCuenta`,
  naturaleza FINANCIERO, sin `prestamo_id` huérfano.
- **Fix:** "pago de cuota" = transacción atómica (movimientos + cuotas +
  regenerar `saldo_post`); unificar el cálculo de `usado` a una sola fórmula por
  `prestamo_id`; generar el schedule completo de 48 cuotas.

## INVERSORES (capital, devengo, pagos)

- **INVR-1 (CRÍTICO, latente):** pago a inversor no guarda `inversor_id`.
  `PagoMensualModal` (~L5216) llama `create('cashflow')` sin `inversor_id`, y el
  auto-link solo corre para `APORTE_DUENO` (~L1868) → `vw_saldo_inversor` nunca
  baja. Se materializa en el próximo pago desde el modal.
- **INVR-2 (ESTRUCTURAL):** el modal pre-llena con el **devengado total de por
  vida**, no con `devengado − pagado` (~L5158) → riesgo de sobrepago (en mes 3
  pre-llenaría 3× lo mensual).
- **INVR-3 (ESTRUCTURAL):** `createInversor` (~L1689) no escribe `es_dueno` → un
  dueño nuevo se guarda como NO-dueño y recibe el paquete equivocado.
- **INVR-4 (ESTRUCTURAL):** `create/updateCompensacion` no escriben `subordina_a`
  ni `frecuencia`.
- **INVR-5 (ESTRUCTURAL):** capital del inversor sin contrapartida en
  `movimientos` (Σ APORTE_INVERSOR = 0; el aporte real de 50k está como
  APORTE_DUENO sin `inversor_id`).
- **INVR-6 (ESTRUCTURAL):** el override `window.ANDREA` suma todos los
  "Pago a Inversores" sin distinguir inversor (rompe con un 2º inversor).
- **INVR-7/8/9 (MENOR):** `pagado` suma salida+entrada; `EXCEDENTE_REAL` resta los
  propios pagos de su base de devengo (confirmar con Julio); `updateInversor` puede
  intentar `contraparte_id = NULL` (NOT NULL) y fallar.
- **SANO:** devengo "de por vida" (regla 9) bien calculado; base = `gananciaBruta`
  (evita circularidad); sin huérfanos; `pagado` de Andrea cuadra con la vista.

## CUENTAS Y MOVIMIENTOS

- **CTA-1 (ESTRUCTURAL):** todo defaultea a BHD Débito. `DEFAULT_CUENTA_ID = 1`
  es fallback silencioso en `createMovFin`/`create`/`update`/venta. 285/288
  movimientos en cuenta 1; Efectivo y Scotia USD en 0. El form debe **exigir**
  cuenta real, no asumir BHD.
- **CTA-2 (ESTRUCTURAL):** transferencias internas no usan `cuenta_destino_id`.
  `FormAjusteCF` (~L6862) crea 2 movimientos sueltos → si se borra una pata, queda
  huérfana descuadrando ambas cuentas. 0 filas con `cuenta_destino_id` (path sin probar).
- **CTA-3 (MENOR):** `monto_usd`/`tasa_cambio` nunca escritos (= INV-4).
- **CTA-4 (MENOR, latente):** `_findCuentaId` (~L942) hace match por substring →
  "Scotia"/"BHD" resuelve a la primera que coincida → misrouteo de saldo.
- **CTA-5 (ESTRUCTURAL):** 19 AJUSTE manuales (−$20,111) tapando descuadres; 8 son
  "Fee Pago CC" mal tipificados (deberían ser `FEE_BANCARIO`); 1 plug de
  $19,028.50 marcado "SIN CONCEPTO — REVISAR".
- **SANO:** sin huérfanos/nulos; naturaleza vs tipo 100% consistente; modelo dual
  cuenta/préstamo sin doble conteo (cuentas CREDITO excluidas del panel de
  líquidas); saldo BHD recomputable e idéntico a `vw_saldo_cuenta`.

## KPIs Y MÉTRICAS

- **KPI-1 (CRÍTICO):** el "Stock total" del Overview cuenta el placeholder
  LEGACY-SALE (−88) → muestra ~18 ud cuando Inventario muestra 106. Filtrar
  LEGACY-SALE en `stockTotal` (~L1000).
- **KPI-2 (ESTRUCTURAL):** "Capital actual" ignora el filtro de período (revenue y
  ganancia sí filtran) y difiere de su propio gráfico (~82,060 vs curva 99,993).
- **KPI-3 (ESTRUCTURAL):** el "capital" de los charts mensuales suma el cashflow
  crudo, incluyendo DRAWDOWN (+85,882 de deuda) como si fuera capital propio.
- **KPI-4 (ESTRUCTURAL):** "Saldo Coop" depende de un `Math.max`/condición frágil;
  el fallback de cashflow (104,278) está 9,564 por encima del real (94,713).
- **KPI-5 (ESTRUCTURAL):** "Deuda total" del Overview omite las tarjetas (la página
  de deuda sí las suma) → KPI de portada incompleto.
- **KPI-6 (ESTRUCTURAL):** el cashflow no convierte USD → la curva de capital suma
  USD y RD$ 1:1.
- **KPI-7/8/9 (MENOR):** "cuotas restantes" usa el conteo de pagadas; AlertasPage
  proyecta cuotas por día-del-mes en vez de leer la tabla `cuotas`; "BHD usado" por
  heurística de strings (debería leer `vw_saldo_prestamo`).
- **SANO:** revenue, ganancia neta (resta gastos asociados sin doble conteo),
  capital líquido, valor de inventario, pendiente Andrea — todos cuadran con SQL.
- **Fix de mayor impacto/menor riesgo:** (1) filtrar LEGACY-SALE en stockTotal;
  (2) que capital (KPI y charts) use saldo de cuentas DEBITO+EFECTIVO de las vistas,
  no la suma rolling de todos los movimientos; (3) todo KPI de deuda lee `vw_saldo_*`.

---

## Prioridad de arreglo sugerida (para la reescritura)

1. **INV-1** (corrompe CPP/ganancia en silencio) y **VEN-1/VEN-2** (caja de ventas).
2. **DEU-2/DEU-3** (pagos de deuda no bajan saldo; falta schedule).
3. **INVR-1/INVR-2** (saldo de inversor no baja; sobrepago).
4. **KPI-1/KPI-3** (stock y capital de portada engañosos).
5. Unificar fuentes de verdad (todo KPI/saldo desde las vistas `vw_*`) y exigir
   FKs/cuenta en todos los forms (VEN-4, INV-5, CTA-1, DEU-1).
6. Resto de estructurales y menores.

Todo verificable: cada hallazgo trae evidencia SQL o `archivo:línea` en los
reportes de los subagentes. Auditar cada arreglo con la skill `jamc-paridad`.

---

## Auditoría FX / moneda — 2026-07-09 (branch JAMCClaudeV3.2)

Origen: auditoría del lote AK820 (L-20260515-17) que destapó que el modelo **no
registraba moneda en cuentas/tarjetas USD**. `monto_usd` estaba vacío en el 100%
de `movimientos` y las tarjetas USD llevaban su saldo en USD implícito sin dejar
rastro de la tasa (resuelve el pendiente **CTA-3 / INV-4**).

### RESUELTOS en esta sesión (fix de escritura, no copiar el bug)

- **FX-1 — Transferencias RD↔USD no guardaban `monto_usd`** (solo `tasa_cambio`).
  Las patas quedaban sin el valor USD → conversión no auditable. **Fix:**
  `createMovimiento` (transfer branch, `src/lib/db/writers.js` ~L387) ahora
  persiste `monto_usd` en AMBAS patas; `MovForm.jsx` calcula el valor USD del
  cruce (`montoUsdTransfer`) y lo pasa. La tasa ya se calculaba bien
  (`montoNum/llegaNum`); el `6.2799` de la transfer 727/728 fue dato viejo/manual.
  Verificado con build. Fila 727/728 corregida a mano: tasa 60.2799, monto_usd 250.
- **FX-2 — Gasto/pago con cuenta o tarjeta USD no capturaba USD+tasa.** El form
  pedía solo "Monto (RD$)" aunque la cuenta/tarjeta fuera USD → se perdía el
  equivalente RD y la diferencia cambiaria al pagar después (el caso que reportó
  Julio). **Fix:** `MovForm.jsx` detecta contexto USD (medio o préstamo con
  `moneda==='USD'`), pide el monto en **USD** + "Tasa del día (RD/USD)" y guarda
  `monto_usd`+`tasa_cambio`; `createPagoFinanciero` (`writers.js` ~L484) ahora
  persiste ambos. Regla adoptada: **una deuda USD se paga desde una cuenta USD**
  (si es RD, el form lo bloquea y pide transferir primero — ahí queda la tasa).
  De paso se corrigió que el gasto a **tarjeta** pasara `monto` (no `salida`) para
  que el DRAWDOWN quede con `entrada>0` (regla 7) por esta ruta.
- **Modelo de inventario (no es bug):** en el lote 19 se separaron los AK820 PRO
  por switch (Gift $33.35 / Fly Fish $30.97) en SKUs distintos y se renombraron
  los códigos basura `-BAG`/`-GIB` a color legible.
- **PRORRATEO — cambio de método (regla 2).** `fn_prorratear_costos_lote` pasó de
  repartir el costo compartido **proporcional al valor base** a repartirlo **por
  cantidad** (cada unidad carga `total_compartido / total_unidades`). Motivo: Julio
  no quería que los productos caros (Pro) absorbieran courier de más y le comieran
  el margen. Es el nuevo método por defecto (aplica a lotes NUEVOS automáticamente).
  El total del lote NO cambia (solo la distribución interna); las ventas pasadas
  conservan su `cpp_historico`. Se recalculó **solo el lote 19** (los lotes viejos
  conservan su reparto por valor hasta que se re-editen — decisión explícita de
  Julio). Reversible: volver la fórmula a valor base y re-correr `fn_prorratear_costos_lote`.
  Docs actualizadas: `CLAUDE.md` regla 2, `TODO.md`. **Frontend sin cambios** (solo lee).

### PENDIENTE (decisión de Julio — se optó por "dejar por ahora")

- **FX-3 — Diferencia cambiaria no se contabiliza como línea propia.** Con FX-1/2
  la info queda registrada (USD+tasa), pero pagar un cargo USD a una tasa distinta
  a la del cargo no genera un movimiento de ganancia/pérdida FX. Falta definir el
  método de emparejamiento (promedio vs FIFO) antes de automatizarlo.
- **LINK-1 — Dinero registrado pero sin ligar (~RD$ 942K).** El reload del sheet
  cargó `movimientos` sin `lote_id`/`venta_id`: 18 de 20 lotes y casi todas las
  ventas migradas sin caja ligada. Backfill por match fecha+monto (staging +
  revisión con Julio antes de aplicar).
- **LINK-2 — 6 pagos de tarjeta Scotia sin `prestamo_id` (RD$ 48,731).** No se
  ligan solos: la tarjeta Scotia CC RD está en saldo 0 y solo tiene 700.50 en
  cargos; ligar los pagos sin registrar los cargos la dejaría en −48K. Requiere
  reconstruir el lado de consumos (estado de cuenta) o registrar un cargo agregado.
- **LINK-3 — Coop: schedule vs pagos reales (RD$ 14,137)** y **Qik saldo negativo
  (RD$ 1,830)** y **BHD Línea `saldo_corte` vs FK (RD$ 7,742)** — reconciliación
  cuota↔caja pendiente.
