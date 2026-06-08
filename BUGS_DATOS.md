# Auditoría de integridad de datos — JAMC's Tech (2026-06-07)

Investigación de los "datos que se guardan mal" reportados por Julio. Hecha
consultando la base de datos real (Supabase, proyecto `oicxvnnzocwnqlsojhco`) +
revisión del código de escritura (`src/supabase-client.js`). Esta lista alimenta
la skill `jamc-reglas` (registro de bugs) y el `PROMPT_REWRITE.md`.

## Resumen ejecutivo

La causa raíz de que "los KPIs no cuadren" es que **una venta se guarda en dos
lugares que no se mantienen sincronizados**: la tabla `ventas`/`ventas_items`
(de donde sale el *revenue* y la *ganancia*) y un movimiento de caja en
`movimientos` (de donde sale el *capital*). Al crear/editar ventas, la caja no
se actualiza bien → las dos fuentes divergen → se tapan con ajustes manuales.

La tabla `ventas` en sí está **sana** (triggers de total/ganancia/CPP correctos,
sin nulos ni huérfanos). El problema es el **enlace y la sincronización con la
caja**, más herencia de la migración.

---

## CRÍTICOS — bugs del código actual (la reescritura DEBE arreglarlos)

### BUG-1 · Editar una venta no re-sincroniza la caja
`updateVentaHeader` (client ~L1190) y `updateVentaLineas` (~L1213) actualizan la
tabla `ventas` y dejan que los triggers recalculen `total_facturado` /
`total_ganancia`, **pero no tocan el movimiento de caja** (`movimientos` tipo
VENTA ligado por `venta_id`). Resultado: si cambias cantidad, precio o envío de
una venta, el revenue cambia pero el capital/caja se queda con el monto viejo.
- **Correcto:** al editar una venta, actualizar también su movimiento de caja
  (entrada = total cobrado real, incl. envío) o recalcularlo desde la venta.

### BUG-2 · El ingreso de caja ignora el envío cobrado y no registra el envío pagado
`createVenta` (client ~L1145) inserta el movimiento de caja con
`entrada = solo productos` (no suma `envio_cobrado`) y `salida = 0` (no registra
lo que se le pagó al courier). Las ventas **migradas** sí traían el envío en caja
(ej. mov 595: entrada 3250 / salida 168, "Venta + envio cobrado"), así que el
path nuevo es un **retroceso**.
- **Correcto:** entrada = productos + envío cobrado; y registrar el envío pagado
  al courier como salida (o como gasto asociado). El neto de caja debe reflejar
  el dinero que realmente entró y salió.

### BUG-3 · `removeVenta` no limpia la caja de ventas viejas
`removeVenta` (client ~L1169) borra el movimiento por `venta_id`. Como casi
ninguna venta histórica tiene `venta_id` en su caja (ver BUG-4), borrar una venta
vieja **deja su ingreso de caja huérfano**, inflando el capital.
- **Correcto:** garantizar el enlace `venta_id` siempre, y al borrar limpiar la
  caja asociada de forma confiable.

---

## ESTRUCTURALES / HERENCIA (afectan KPIs y reconciliación)

### BUG-4 · Caja y ventas desligadas (`venta_id` casi siempre null)
Solo **2 de 175** movimientos tipo VENTA tienen `venta_id`. Los 173 restantes
(todo lo histórico/migrado) no enlazan a su venta → imposible reconciliar o
rastrear, y rompe `removeVenta` (BUG-3). El path nuevo sí enlaza; el problema es
la data vieja y que el modelo no lo exige.

### BUG-5 · Casi todo el dinero se registra en BHD Débito
**285 de 288** movimientos están en `cuenta_id = 1` (BHD Débito). Efectivo,
Scotia RD/USD débito quedan en cero → los saldos por cuenta del panel "Cuentas"
no significan nada salvo BHD. Es mayormente herencia de la migración (el sheet no
trackeaba cuenta), pero el form debería **exigir elegir la cuenta real** y no
defaultear a BHD.

### BUG-6 · `envio_cobrado` histórico vacío
La tabla `ventas` tiene solo **$50** de envío cobrado en 201 ventas, cuando en
caja se movieron ~$21,463 de envío. La migración no pobló `envio_cobrado` →
cualquier KPI/desglose de envío basado en la tabla `ventas` está incompleto.

### BUG-7 · 19 ajustes manuales tapando descuadres (−$20,111 neto)
Hay 19 movimientos tipo `AJUSTE` por un neto de **−$20,111.09**. Son plugs
manuales para forzar el cuadre — síntoma (no causa) de BUG-1 a BUG-4. Al
arreglar la sincronización, estos ajustes deberían dejar de ser necesarios.

---

## Revisado y DESCARTADO (no son bugs)

- **Stock negativo / SKUs sin CPP:** solo el placeholder `LEGACY-SALE`
  (−88 ud, 88 ventas legacy sin SKU específico — intencional/conocido) y SKUs
  nuevos sin stock recibido aún. No es corrupción.
- **Tabla `ventas` / `ventas_items`:** sana. 201/201 con totales y
  `cpp_historico` poblados, sin huérfanos, subtotales cuadran. Triggers OK.
- **DRAWDOWN / cuentas / préstamos:** íntegros. Todo DRAWDOWN tiene `prestamo_id`
  y `entrada > 0`; ningún `cuenta_id` null; ningún `prestamo_id` huérfano.
- **88 ventas bajo `LEGACY-SALE`:** distorsionan métricas por-producto, pero es
  data legacy conocida, no un bug de guardado.

---

## Implicación para la reescritura

El modelo "venta en `ventas` + caja en `movimientos`" es correcto, pero la capa
de escritura debe tratarlos como **una transacción atómica y sincronizada**:
crear, editar y borrar una venta debe crear/editar/borrar su movimiento de caja
en el mismo paso, con el monto correcto (productos + envío) y `venta_id` siempre
ligado. Verificar cada operación contra la DB con la skill `jamc-paridad`.
