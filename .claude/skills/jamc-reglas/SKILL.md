---
name: jamc-reglas
description: >-
  Reglas de negocio, contrato de datos y convenciones del dashboard JAMC's Tech
  (tienda de periféricos gaming en RD, backend Supabase). Úsala SIEMPRE que el
  trabajo toque dinero, ventas, CPP/costos, inventario, lotes, movimientos,
  préstamos, tarjetas de crédito, inversores, KPIs o cualquier escritura a la
  base de datos — y de forma OBLIGATORIA durante la reescritura del dashboard.
  Esta skill define qué comportamiento es CORRECTO (no necesariamente lo que el
  código viejo hace, que tiene bugs de guardado conocidos). Consúltala antes de
  escribir lógica que calcule, guarde o registre datos, aunque el usuario no la
  mencione explícitamente.
---

# JAMC's Tech — Reglas de negocio y contrato de datos

Esta skill es la **fuente de verdad de QUÉ es correcto** en el dashboard de
Julio. El código viejo (`index.html`, `src/supabase-client.js`) funciona pero
arrastra bugs de guardado por modificaciones encima de modificaciones. **Cuando
el código viejo y esta skill se contradigan, gana esta skill: hay que ARREGLAR
el comportamiento, no copiarlo.**

Documentos largos relacionados (léelos si necesitas detalle): `CLAUDE.md`
(modelo de negocio completo) y `SCHEMA.md` (schema Supabase tabla por tabla).

## Principio rector de la reescritura

> Reproducir la *intención* de cada función, no sus bugs. Si un form/KPI/métrica
> guarda, escribe o registra datos mal, la versión nueva debe guardarlos BIEN.
> Cada escritura debe verificarse contra la DB (ver skill `jamc-paridad`).

## Las 12 reglas que NO se rompen

La lógica de cálculo vive en **triggers de la DB**, no en el frontend. No la
dupliques ni la "ayudes" desde JS.

1. **CPP automático** (costo promedio ponderado, weighted-average *lifetime*, no
   FIFO): la DB recalcula `skus.cpp_actual` al recibir entradas. El front solo
   muestra.
2. **Prorrateo de costos del lote** (envío/courier/impuestos/otros) lo reparte
   la DB entre las entradas del lote.
3. **Snapshot de CPP en venta**: al insertar `ventas_items`, la DB captura
   `cpp_historico` desde `skus.cpp_actual`. Así la ganancia es históricamente
   correcta aunque el CPP cambie después.
4. **Totales de venta** (`total_facturado`, `total_ganancia`) los recalcula la
   DB con cada cambio de líneas, envío o descuento.
5. **Una sola tabla `movimientos`** con columna generada `naturaleza`
   (CASHFLOW / FINANCIERO). Las vistas `vw_cashflow` y `vw_financiero` separan.
   NO crear dos tablas.
6. **`entrada` y `salida` pueden ser ambas > 0** en la misma fila (ej. "venta +
   envío cobrado al mismo cliente"). No existe constraint que lo prohíba.
7. **Gasto asociado a tarjeta de crédito = `DRAWDOWN` con `entrada > 0` ligado a
   `prestamo_id`** — NO un gasto normal con `salida`. Así suma al `usado` de la
   tarjeta (que se computa por FK `prestamo_id`). Aplica en: editar venta, venta
   nueva, entrada/compra de lote, crear cuenta. Si el gasto se paga con
   débito/efectivo, sí va como `salida > 0` y `prestamo_id = null`.
8. **"Scotia CC RD" (y demás tarjetas) son cuenta Y préstamo a la vez**: un
   cargo a la tarjeta es DRAWDOWN/entrada ligado a su `prestamo_id`, no una
   salida de cuenta normal.
9. **Devengo de compensaciones a inversores = acumulado de por vida**, no ciclos
   que reinician. Confirmado por Julio.
10. **Ganancia mostrada = ganancia NETA** (resta gastos asociados como courier /
    comisión), no margen bruto.
11. **Préstamos unificados** en una tabla con `tipo`
    (PRESTAMO / LINEA_CREDITO / TARJETA_CREDITO).
12. **FKs a `skus.id_sku` con ON UPDATE CASCADE** (rename de SKU se propaga).

## Contrato de datos (cliente Supabase)

La capa de datos debe exponer estas operaciones (nombres del cliente actual;
en la reescritura pueden ser funciones/hook, pero la semántica se conserva):

**Loaders:** `loadSKUs, loadVentas, loadEntradas, loadCashflow, loadFinanciero,
loadCuotas, loadResumen, loadMovFin, refreshAll`.

**Writers:**
- SKUs: `createSKU, updateSKU, removeSKU, countSKURefs`
- Ventas: `createVenta, removeVenta, updateVentaHeader, updateVentaLineas,
  addVentaLineas, removeVentaLineas`
- Lotes/entradas: `createLote, removeLote, updateLoteHeader, addEntradaToLote,
  updateEntrada, removeEntrada`
- Movimientos: `createMovFin, removeMovFin`
- Cuentas: `createCuenta, updateCuenta, removeCuenta`
- Préstamos: `createPrestamo, updatePrestamo, removePrestamo`
- Inversores: `createInversor, updateInversor, removeInversor`
- Compensaciones: `createCompensacion, updateCompensacion, removeCompensacion`
- Genéricos: `create, update, remove`

**Auth:** `signIn, signOut, getSession, getUserEmail`. La app **no carga ni
muestra data sin sesión válida** (RLS lo respalda). Gate en arranque y en render.

## Tablas y columnas clave (ver SCHEMA.md para todo)

- `skus` (PK `id_sku` texto), `entradas`, `lotes`, `ventas` (PK `id`, UNIQUE
  `codigo`), `ventas_items`, `movimientos`, `cuentas`, `prestamos`, `cuotas`,
  `contrapartes`, `inversores`, `disenos`, `tasas_cambio`.
- `movimientos`: `entrada`/`salida` son NOT NULL (usar 0, nunca null);
  `prestamo_id` liga a tarjeta/línea; `naturaleza` es GENERATED (no escribir).
- Cuentas (id): 1 BHD Débito · 2 Scotia RD · 3 Scotia USD · 4 Qik · 5 Efectivo.
- Préstamos (id): 1 Coop (PRESTAMO) · 2 BHD (LINEA_CREDITO) · 3 Scotia CC RD ·
  4 Scotia CC USD · 5 Qik CC (las 3 últimas TARJETA_CREDITO).

## Enums (UPPERCASE en DB)

```
movimiento_tipo: APORTE_DUENO, APORTE_INVERSOR, VENTA, ENVIO_COBRADO,
  COMPRA_MERCANCIA, COMPRA_OPERATIVA, ENVIO_LOTE, PAGO_PRESTAMO,
  PAGO_LINEA_CREDITO, PAGO_TARJETA_CREDITO, PAGO_INTERESES, PAGO_ADS,
  PAGO_COMISION, PAGO_INVERSOR, PAGO_TRANSPORTE, DRAWDOWN, FEE_BANCARIO,
  TRANSFERENCIA_INTERNA, REFUND_PROVEEDOR, REFUND_CLIENTE, AJUSTE, OTROS
prestamo_tipo:  PRESTAMO, LINEA_CREDITO, TARJETA_CREDITO
entrada_status: PENDIENTE, RECIBIDO, PERDIDO
lote_status:    PENDIENTE, RECIBIDO
moneda:         RD, USD
categoria_sku:  MOUSE, TECLADO, HEADSET, STAND, MOUSEPAD, OTRO
                (el dashboard mapea a 'Mouse'/'Teclado'/... — ver CAT_MAP)
cuenta_tipo:    DEBITO, CREDITO, EFECTIVO
```

## Convenciones de IDs

- **SKU**: formato largo `{CAT}-{MARCA}-{MODELO}-{COLOR}`, ej.
  `MOU-HXS-T90-NEG`. Ver skill `jamc-sku` para generar/validar.
- **Ventas nuevas**: `V-{YYYYMMDD}-{NNN}`. (`V-MIG-*` y `V-LEG-*` son históricas.)
- Moneda: todo RD$ salvo compras USD (llevan `monto_usd` + `tasa_cambio`).

## Registro de bugs de integridad de datos (FIX, no copiar)

Mantén esta lista viva. Cuando descubras o arregles un guardado incorrecto,
documéntalo aquí para que ninguna sesión futura lo repita.

- **Gasto asociado a tarjeta** (RESUELTO en versión actual): antes se guardaba
  como `salida` suelta y no aparecía en "Usos de la tarjeta". Correcto =
  DRAWDOWN con `entrada > 0` + `prestamo_id` (regla 7).
- **Ganancia en métricas** (RESUELTO): debe ser neta (regla 10), antes mostraba
  bruta en algunos lugares.

Auditoría 2026-06-07 — **informe completo en `BUGS_DATOS.md`** (6 áreas,
verificado contra la DB; cada hallazgo con evidencia SQL o archivo:línea). Causa
raíz transversal: cada entidad vive en DOS+ lugares que el código no sincroniza
(venta: `ventas` vs caja; compra: `entradas`/`lotes` vs caja; deuda:
`saldo_corte` vs `cuotas` vs caja; inversor: columnas vs caja). Los triggers de
la DB están sanos; los bugs están en la capa de escritura JS y en KPIs que leen
fuentes desincronizadas. Por eso nada cuadra y se tapa con 19 ajustes manuales.

Críticos (ver IDs completos en `BUGS_DATOS.md`):
- **VEN-1/VEN-2:** editar venta no re-sincroniza la caja; el ingreso de caja
  ignora el envío.
- **INV-1:** costo USD se guarda como RD$ crudo en `entradas` → CPP corrupto →
  ganancia inflada.
- **INV-2/INV-3:** editar lote no re-sincroniza la caja; `updateLoteHeader`
  ignora USD y tarjeta (regla 7).
- **DEU-1/DEU-2/DEU-3:** "usado" se calcula de 2 formas que no cuadran; pagar una
  cuota no baja el saldo (no toca `cuotas`); no existe el schedule de 48 cuotas.
- **INVR-1/INVR-2:** pago a inversor no guarda `inversor_id` (la vista nunca baja);
  el modal pre-llena con el devengado total de por vida (sobrepago).
- **CTA-1:** todo defaultea a BHD Débito (fallback silencioso `DEFAULT_CUENTA_ID=1`).
- **KPI-1/KPI-3:** "Stock total" del Overview cuenta LEGACY-SALE (18 vs 106);
  el "capital" de los charts mete el DRAWDOWN (deuda) como capital propio.

NO son bugs: triggers (CPP, prorrateo, totales, naturaleza), integridad
referencial, formato SKU, modelo dual cuenta/préstamo. Stock negativo / SKU sin
CPP = solo placeholder `LEGACY-SALE` + SKUs nuevos.

⚠️ **Docs con IDs viejos:** `SCHEMA.md`/`CLAUDE.md` tienen IDs de cuentas/préstamos
y nombres de enum desactualizados — usar los reales listados en `BUGS_DATOS.md`.

Principio del fix: cada crear/editar/borrar es una **transacción atómica
sincronizada** (toca todas las tablas de la entidad, monto y moneda correctos,
FKs siempre ligadas) y cada KPI/saldo lee **una sola fuente de verdad** (vistas
`vw_*`). Auditar cada arreglo con [[jamc-paridad]].
- **CTA-2 transferencia interna = DOS patas** (RESUELTO 2026-06-08): `vw_saldo_cuenta`
  solo suma por `cuenta_id` (NO lee `cuenta_destino_id`). Por eso una transferencia
  de UNA sola fila (salida del origen + `cuenta_destino_id`) debita el origen pero
  **nunca acredita el destino** en el saldo. Correcto = 2 movimientos
  `TRANSFERENCIA_INTERNA` (salida del origen + entrada al destino) con un token
  `#TRF-...` compartido en `notas`; al borrar una pata se borran ambas (sin pata
  huérfana). Arreglado en `createMovimiento`/`removeMovimiento` (src/lib/db/writers.js),
  verificado contra `vw_saldo_cuenta`.
- *(Añadir aquí cada nuevo hallazgo: form/KPI afectado, qué guardaba mal, cuál
  es el guardado correcto y dónde se arregló.)*

Reportado por Julio: "las métricas, KPIs, forms, etc. no guardan/escriben/
registran datos de manera correcta" — trátalo como expectativa por defecto:
**auditar cada escritura, no confiar en que el código viejo lo hace bien.**
