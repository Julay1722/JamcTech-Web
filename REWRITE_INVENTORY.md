# REWRITE_INVENTORY.md — Checklist de paridad de la reescritura

> Inventario de TODO lo que la app actual (`index.html`, 8,724 líneas) hace, para
> reproducirlo en la versión Vite + React. **Regla de oro:** reproducir la
> *intención*, NO los bugs de guardado (ver `BUGS_DATOS.md` + skill `jamc-reglas`).
> Nada se marca `[x]` hasta verificar la escritura contra la DB (skill `jamc-paridad`)
> y los KPIs con SQL independiente.
>
> Estado: ⬜ pendiente · 🔨 en progreso · ✅ reproducido + verificado en DB
>
> Última actualización: 2026-06-07 (Fase 4 — páginas construidas y verificadas).

## Estado de avance (2026-06-07)

**Capa de datos (Fase 3) ✅** — `src/lib/db/loaders.js` (lectura desde vistas vw_*)
+ `src/lib/db/writers.js` (escrituras atómicas). KPIs verificados vs SQL. Escrituras
verificadas end-to-end contra la DB: `createVenta` (triggers+caja+venta_id),
`createMovimiento` (RLS), `createLote` USD→RD (INV-1/4/5), `removeLote` (cascada).

**Páginas (Fase 4) ✅ construidas y verificadas en runtime (0 errores de consola):**
- ✅ **Resumen** — KPIs (capital líquido, revenue, ganancia neta, stock) cuadran vs SQL + charts.
- ✅ **Ventas** — lista (201) + nueva venta (multi-SKU+envío+gasto) + EditVentaModal.
- ✅ **Inventario** — SKUs/Re-Stock/Lotes/Descontinuados + Nuevo SKU/lote + EditLote.
- ✅ **Finanzas** — Resumen/Deudas/Inversores/Banco; Movimientos embebe el Libro.
- ✅ **Libro contable** — movimientos + pago financiero + gasto/ajuste/transferencia.
- ✅ **Alertas** — críticos/atención + cuotas reales (KPI-8).
- ✅ Shell, auth gate, login, period filter, toasts, modales, componentes compartidos.

**Bugs arreglados y confirmados:** VEN-1/2/3/4, INV-1/2/4/5/7, DEU-2/6, INVR-1/2/3/4,
CTA-1/2, KPI-1/5/8, regla 7/8/9. (Detalle en los commits del branch `reconstruccion`.)

**Pendiente (menor, para pulir con Julio):**
- Auditar por la UI cada form restante con datos de prueba (la lógica está verificada;
  falta el recorrido manual de Julio en su flujo real).
- Devengo de compensaciones: cálculo simplificado de por vida con TODO (regla 9 respetada);
  confirmar con Julio el corte exacto. Reinversión (REINVERSION) no persiste aún.
- Pago a inversor con varias reglas: registrar desde "Pago del mes" para atribución correcta.
- Cosméticos: KPI delta=-1 en Alertas (truco de color), exponer descuento en EditVenta.

**Fase 5 (deploy):** `netlify.toml` migrado a Vite; `npm run build` → `dist/` limpio
(sin docs/data). Falta: conectar Netlify + borrar código muerto al cierre.

---


## Leyenda de columnas de bug

Cada form/KPI marcado con `🐛 XXX-N` debe **arreglar** ese bug de `BUGS_DATOS.md`,
no copiarlo. Sin marca = no se conoce bug, reproducir fiel.

---

## 0. Navegación / Shell  (App, Root, LoginScreen, LogoutButton — index.html:8552-8720)

- ⬜ **Auth gate** (`Root`): estados `loading` / `out` (LoginScreen) / sesión → `<App/>`. La app NO monta ni carga data sin sesión válida (RLS lo respalda). Gate en arranque del cliente **y** en render raíz.
- ⬜ **LoginScreen**: form email + password → `signIn`. Error inline. Éxito re-renderiza a App.
- ⬜ **LogoutButton**: muestra email del usuario, `signOut`.
- ⬜ **Sidebar nav** (5 tabs): Resumen (◉) · Alertas (! + badge críticos) · Ventas ($ + count) · Inventario (▤ + count SKUs) · Finanzas (∮). Colapsable (persiste en localStorage). Botón "Sincronizar" (refreshAll), link "Bloomberg legacy", build info + fecha.
- ⬜ **PeriodFilter** (solo en Resumen y Ventas): sticky top. Valores: `todo` + períodos. (index.html:6064)
- ⬜ **ToastStack**: toasts éxito/error en cada escritura. (index.html:4936)
- ⬜ **ConfirmModal**: toda acción destructiva pasa por aquí. (index.html:6015)
- ⬜ **Tema "terminal/Bloomberg"**: variables CSS (--accent ámbar, --bg oscuro, fuentes). Mantener identidad, pulir detalles.

> Nota: `RegistrarPage` (index.html:6191, tabs: Nuevo lote / Movimiento financiero / Nuevo SKU / Ajuste CF) está **definida pero NO montada** en App → código muerto. Sus forms (`FormLote`, `FormMovFin`, `FormSKU`, `FormAjusteCF`) viven en otras páginas. NO recrear como página suelta salvo que Julio la pida.

---

## 1. Resumen / Mando  (OverviewPage — index.html:829)

### KPIs (verificar c/u con SQL)
- ⬜ **Capital actual** 🐛 KPI-2/KPI-3/KPI-4 — debe = Σ `vw_saldo_cuenta.saldo_actual` de cuentas DEBITO+EFECTIVO (1,2,7). NO la suma rolling de todos los movimientos (que mete DRAWDOWN/deuda como capital). Debe respetar el filtro de período igual que revenue/ganancia.
- ⬜ **Revenue** (facturado) — Σ `ventas.total_facturado` del período. (SANO hoy)
- ⬜ **Ganancia neta** — neta de gastos asociados, sin doble conteo. (SANO hoy)
- ⬜ **Stock total** 🐛 KPI-1 — Σ `vw_stock_sku.stock_actual` **excluyendo `LEGACY-SALE`**. (hoy cuenta el placeholder −88 → muestra ~18 en vez de ~106)
- ⬜ **Deuda total** 🐛 KPI-5 — debe incluir tarjetas + línea + préstamo (hoy omite tarjetas). Leer `vw_saldo_prestamo`.

### Charts
- ⬜ **LineChart** capital/curva mensual 🐛 KPI-3/KPI-6 — capital mensual desde saldo de cuentas, sin DRAWDOWN; convertir USD (no sumar USD y RD$ 1:1).
- ⬜ **BarChart** (ventas/ganancia por mes)
- ⬜ **DonutChart** (mix por categoría/canal)
- ⬜ **Sparklines / MiniBars** (KPI deltas)
- ⬜ Filtro de período afecta todos los KPIs y charts coherentemente.

---

## 2. Alertas  (AlertasPage — index.html:8121)

- ⬜ Lista de alertas de stock bajo / crítico (usa `buildSK()` → estado `critico`/`atencion`).
- ⬜ 🐛 KPI-8 — "próximas cuotas" debe leer la tabla `cuotas` real, NO proyectar por día-del-mes.
- ⬜ Badge del sidebar = count de SKUs `critico` (coherente con headline de la página).

---

## 3. Ventas  (VentasPageExt — index.html:7136; period filter)

Sub-tabs: **Lista de ventas** · **+ Nueva venta**

### Lista de ventas
- ⬜ Tabla de ventas (código, fecha, canal, facturado, ganancia neta, líneas). Filtro de período.
- ⬜ Abrir **EditVentaModal** por fila. (index.html:7395)
- ⬜ Borrar venta → ConfirmModal → `removeVenta` 🐛 VEN-3 — borrar caja por `venta_id`; ventas viejas sin `venta_id` dejan ingreso huérfano. Asegurar link.

### Nueva venta (FormVenta — index.html:6218)
- ⬜ Multi-SKU (agregar/quitar líneas), precio, **envío cobrado**, **gasto asociado** (courier/comisión), canal, cuenta de cobro, fecha.
- ⬜ `createVenta` 🐛 VEN-2/VEN-4 — el ingreso de caja debe ser `entrada = productos + envío`; registrar el envío pagado al courier como salida; **`venta_id` SIEMPRE ligado**; **exigir cuenta de cobro real** (no default BHD, CTA-1).
- ⬜ **Gasto asociado a tarjeta** 🐛 regla 7 — si se paga con tarjeta = `DRAWDOWN`, `entrada>0`, `prestamo_id`. Si débito/efectivo = `salida>0`, `prestamo_id=null`.
- ⬜ Verificar triggers: `cpp_historico`, `total_facturado`, `total_ganancia` poblados.
- ⬜ Código nuevo formato `VTA-YYMMDD-NNN`.

### EditVentaModal (index.html:7395)
- ⬜ Editar header (fecha, canal, envío, notas) → `updateVentaHeader` 🐛 VEN-1 — **re-sincronizar la caja**: si cambia facturado/envío, el movimiento de ingreso debe actualizarse (hoy revenue y capital divergen).
- ⬜ Editar/agregar/quitar líneas → `updateVentaLineas` / `addVentaLineas` / `removeVentaLineas` 🐛 VEN-1 — recalcular y re-sincronizar caja tras el refetch de triggers.
- ⬜ Gasto asociado en edición 🐛 regla 7 (mismo trato tarjeta vs débito).

---

## 4. Inventario  (InventarioPage — index.html:2103)

Sub-tabs: **SKUs** · **Re-Stock** · **Lotes** · **Descontinuados** (+ vistas Nuevo SKU, Nuevo lote)

### SKUs
- ⬜ Lista + filtros (categoría, búsqueda). Badge de stock/estado. CPP, precio, stock, vendido, en camino.
- ⬜ **ProductDetailModal** (index.html:3651) — detalle del SKU (movimientos, métricas).
- ⬜ Editar SKU → `updateSKU` (incluye renombrar id_sku con cascade; activar/descontinuar).
- ⬜ Borrar SKU → `countSKURefs` + ConfirmModal → `removeSKU`.

### Nuevo SKU (FormSKU — index.html:8412)
- ⬜ Form: categoría, marca, modelo, color, precio sugerido, notas → genera `id_sku` (skill `jamc-sku`, formato largo) → `createSKU`. Validar que no exista.

### Re-Stock (RestockTab — index.html:1403)
- ⬜ Vista de SKUs que necesitan reposición (stock bajo + sugerencia). Verificar lógica de umbral.

### Lotes (LotesTab — index.html:1709)
- ⬜ Lista de lotes/entradas agrupadas (proveedor, fecha, status, costos compartidos, SKUs).
- ⬜ 🐛 INV-7 — mapear los **5** estados de `status_lote` (hoy solo 3).
- ⬜ **EditLoteModal** (index.html:1826):
  - ⬜ Editar header (fecha, status, proveedor, envío/courier/otros/impuestos) → `updateLoteHeader` 🐛 INV-2/INV-3 — re-sincronizar la caja (COMPRA_MERCANCIA + ENVIO_LOTE), convertir USD, aplicar regla 7 si se paga con tarjeta (DRAWDOWN+prestamo_id, no salida).
  - ⬜ Editar líneas/entradas (qty, costo, sku) → `updateEntrada` 🐛 INV-2 — re-sincronizar el COMPRA_MERCANCIA de caja.
  - ⬜ Agregar entrada → `addEntradaToLote`; borrar entrada → `removeEntrada`.
- ⬜ Recibir lote (status→RECIBIDO) dispara recálculo CPP (trigger) — el front solo refresca.

### Nuevo lote (FormLote — index.html:6461)
- ⬜ Form: proveedor, fecha, status, moneda (RD/USD + tasa), líneas (SKU, qty, costo unitario), envío/courier/otros/impuestos, cuenta de pago.
- ⬜ `createLote` 🐛 INV-1 (CRÍTICO) — si moneda USD, **convertir `costo_unitario_base` a RD$** antes de guardar (hoy guarda USD crudo → CPP ~60× menor → ganancia inflada). NO forzar `moneda:'RD'`.
- ⬜ 🐛 INV-3/INV-4 — persistir `monto_usd` + `tasa_cambio` en el movimiento (no solo en notas).
- ⬜ 🐛 INV-5 — ligar la compra al lote por `lote_id` de forma fiable (no por ventana de 8s + fecha).
- ⬜ 🐛 regla 7 — si paga con tarjeta = DRAWDOWN+prestamo_id.
- ⬜ 🐛 CTA-1 — exigir cuenta real de pago.

### Descontinuados
- ⬜ Lista de SKUs `activa=false` con apartado propio; reactivar.

---

## 5. Finanzas  (FinanzasPage — index.html:4180)

Tabs: **Resumen** · **Deudas** (Análisis/Préstamos/Tarjetas) · **Inversores** · **Banco** (Cuentas/Movimientos)

### 5.1 Resumen
- ⬜ Cards de resumen financiero (deuda, líquido, inversores). Verificar contra `vw_saldo_*`.

### 5.2 Deudas → Análisis (AnalisisDeudaPanel — index.html:3296)
- ⬜ Panel de análisis de deuda con semáforo / avalancha. 🐛 DEU-1/KPI-9 — el "usado/saldo" debe leer una sola fórmula desde `vw_saldo_prestamo` (hoy 2 cálculos que no cuadran; heurística de strings).

### 5.3 Deudas → Préstamos
- ⬜ Lista de préstamos (Coop). **DetalleAmortizacion** (index.html:2748) 🐛 DEU-7 — leer `saldo_post`/`fecha_pagada`/`movimiento_id` de `cuotas` (hoy se reconstruye a mano).
- ⬜ 🐛 DEU-3 — generar el schedule completo de 48 cuotas del Coop (hoy solo 4).
- ⬜ Crear préstamo (FormPrestamo — index.html:2594) → `createPrestamo`.
- ⬜ Editar/borrar préstamo → `updatePrestamo` / `removePrestamo` 🐛 DEU-6 — soft-delete (FK NO ACTION rompe el gemelo cuenta+tarjeta).

### 5.4 Deudas → Tarjetas
- ⬜ Lista de tarjetas (revolvente/usos). **DetalleLineaRevolvente** (3-2908) + **DetalleUsosTarjeta** (index.html:2971).
- ⬜ Crear tarjeta (FormPrestamo tipoFijo=TARJETA_CREDITO).
- ⬜ 🐛 DEU-5 — "Cargo Línea"/interés debe SUMAR al usado (hoy se registra como salida → resta; dirección invertida).
- ⬜ 🐛 regla 7/8 — usos = DRAWDOWN+prestamo_id (modelo dual).

### 5.5 Inversores (index.html:4680)
- ⬜ Lista de inversores + dueño. **DetalleInversorMovs** (index.html:3049).
- ⬜ Crear inversor (FormInversor — index.html:4037) → `createInversor` 🐛 INVR-3 — escribir `es_dueno`.
- ⬜ Editar/borrar inversor → `updateInversor` 🐛 INVR-9 (no mandar contraparte_id=NULL) / `removeInversor`.
- ⬜ **ReglasCompensacionList** (index.html:5317): CRUD de compensaciones → `createCompensacion`/`updateCompensacion` 🐛 INVR-4 — escribir `subordina_a` + `frecuencia` / `removeCompensacion`.
- ⬜ **Devengo de compensaciones** 🐛 regla 9 — acumulado de por vida (no ciclos). (SANO hoy, conservar)
- ⬜ **SimuladorPaqueteModal** (index.html:4963): simulador de paquete del inversor.
- ⬜ **PagoMensualModal** (index.html:5132) → pago a inversor 🐛 INVR-1 (CRÍTICO) — **guardar `inversor_id`** (hoy no, la vista nunca baja). 🐛 INVR-2 — pre-llenar con `devengado − pagado`, NO el devengado total de por vida (riesgo de sobrepago).
- ⬜ 🐛 INVR-6 — distinguir por inversor (no sumar todos los "Pago a Inversores" juntos).

### 5.6 Banco → Cuentas (index.html:4869)
- ⬜ Lista de cuentas con saldo (desde `vw_saldo_cuenta`). Líquidas = DEBITO+EFECTIVO.
- ⬜ **DetalleCuentaLedger** (index.html:3143): ledger por cuenta.
- ⬜ Crear cuenta (FormCuenta — index.html:2496) → `createCuenta` (si CREDITO, crea gemelo préstamo — modelo dual; ver SANO en DEU).
- ⬜ Editar/borrar cuenta → `updateCuenta` / `removeCuenta`.

### 5.7 Banco → Movimientos (MovimientosPage embedded — index.html:7693)
Ver sección 6 (Libro contable).

### 5.8 Otros componentes de Finanzas
- ⬜ **FormMovFinScoped** (index.html:3808): pago financiero scoped a un producto.
- ⬜ **TasaUSDInput** (index.html:4167): input de tasa USD configurable.
- ⬜ **SimuladorModal** (index.html:5814): simulador genérico.

---

## 6. Libro contable / Movimientos  (MovimientosPage — index.html:7693; embedded en Finanzas→Banco)

Tabs: **Libro contable** · **+ Pago a préstamo/línea/inversor** · **+ Gasto / ajuste / transferencia**

- ⬜ **Lista de movimientos** (libro contable): fecha, tipo, cuenta, contraparte, entrada, salida, naturaleza, notas. Filtro de período. **EditModal** genérico (index.html:8073).
- ⬜ Borrar movimiento → ConfirmModal → `remove('cashflow')`.
- ⬜ **+ Pago a préstamo/línea/inversor** (FormMovFin — index.html:7010) → `createMovFin` 🐛 DEU-2 (pago de cuota debe tocar `cuotas`: marcar pagada/fecha_pagada/movimiento_id + regenerar saldo_post) · 🐛 DEU-5 (dirección correcta) · 🐛 INVR-1 (inversor_id).
- ⬜ **+ Gasto / ajuste / transferencia** (FormAjusteCF — index.html:6819) → `create('cashflow')` 🐛 CTA-1 (exigir cuenta) · 🐛 CTA-2 (transferencia interna = 1 movimiento con `cuenta_destino_id`, no 2 sueltos) · 🐛 CTA-3/INV-4 (persistir monto_usd/tasa) · 🐛 regla 7 (gasto a tarjeta = DRAWDOWN).

---

## 7. Primitivas / componentes compartidos

- ⬜ **KPI** (index.html:629) · **MiniBars** (658) · **Sparkline** (673) · **LineChart** (709) · **BarChart** (752) · **DonutChart** (790)
- ⬜ **PeriodFilter** (6064) · **ConfirmModal** (6015) · **EditModal** (8073) · **ToastStack** (4936)
- ⬜ Helpers de formato (fmtDate, moneda RD$/USD$, etc. — hoy en `src/helpers.jsx` + inline)

---

## 8. Capa de datos (contrato del cliente — reescribir limpio en `src/lib/`)

Loaders: ⬜ loadSKUs · ⬜ loadVentas · ⬜ loadEntradas · ⬜ loadCashflow · ⬜ loadFinanciero · ⬜ loadCuotas · ⬜ loadResumen · ⬜ loadMovFin · ⬜ refreshAll

Writers (cada uno = transacción atómica sincronizada, ver `jamc-reglas`):
- SKUs: ⬜ createSKU ⬜ updateSKU ⬜ removeSKU ⬜ countSKURefs
- Ventas: ⬜ createVenta ⬜ removeVenta ⬜ updateVentaHeader ⬜ updateVentaLineas ⬜ addVentaLineas ⬜ removeVentaLineas
- Lotes/entradas: ⬜ createLote ⬜ removeLote ⬜ updateLoteHeader ⬜ addEntradaToLote ⬜ updateEntrada ⬜ removeEntrada
- MovFin: ⬜ createMovFin ⬜ removeMovFin
- Cuentas: ⬜ createCuenta ⬜ updateCuenta ⬜ removeCuenta
- Préstamos: ⬜ createPrestamo ⬜ updatePrestamo ⬜ removePrestamo
- Inversores: ⬜ createInversor ⬜ updateInversor ⬜ removeInversor
- Compensaciones: ⬜ createCompensacion ⬜ updateCompensacion ⬜ removeCompensacion
- Genéricos: ⬜ create ⬜ update ⬜ remove
- Auth: ⬜ signIn ⬜ signOut ⬜ getSession ⬜ getUserEmail
- Constantes: ⬜ SKU_CATEGORIAS ⬜ MOVFIN_TIPOS

> **Cambio arquitectónico:** eliminar todo el aparato de `window.__AIRTABLE_DATA__`
> + eventos `airtable-loaded` + `_overrideGlobals()` (CF_ALL/MES/COOP/ANDREA/BHD)
> + auto-link por ventana de 8s. Reemplazar por hook/contexto React (`useData`) que
> consume funciones puras del cliente. Cada KPI/saldo lee UNA fuente de verdad (vistas `vw_*`).

---

## 9. Criterios de cierre (de PROMPT_REWRITE §9)

- ⬜ Cada item de arriba reproducido y verificado en DB (jamc-paridad).
- ⬜ Login/logout; sin sesión no carga data.
- ⬜ CRUD completo de las 9 entidades.
- ⬜ KPIs cuadran vs SQL.
- ⬜ Reglas §5 respetadas (gasto tarjeta=DRAWDOWN, Scotia dual, devengo de por vida).
- ⬜ `npm run build` → `dist/` sin docs ni data sensible.
- ⬜ Sin errores en consola navegando todas las páginas.
</content>
