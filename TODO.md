# JAMC's Tech — Pending Work

> Última actualización: 2026-05-26 (sesión de migración Supabase autónoma).
> Trabajo en orden de prioridad. **P0** = bloquea uso productivo del dashboard. **P1** = funcionalidad importante. **P2** = nice-to-have / futuro.

---

## ✅ P0 — Conectar dashboard a Supabase · **COMPLETADO** (2026-05-26)

El dashboard ya está corriendo localmente contra Supabase. Lee/escribe todo via `src/supabase-client.js`. El cliente Airtable (`src/airtable-client.js`) quedó comentado en `index.html` como rollback fácil.

**Cómo correrlo localmente:**
```powershell
cd C:\Users\coco2\OneDrive\Escritorio\V17
npx serve .   # sirve en :3000
# o si quieres netlify dev con las functions (que ya no usamos):
# netlify dev   # sirve en :8888
```

Visitar http://localhost:3000 — el dashboard carga 49 SKUs, 190 ventas, 79 entradas, 276 movimientos directo de Supabase.

**Cómo se hizo:**
- `src/supabase-client.js` reemplaza a airtable-client manteniendo el MISMO contrato (`window.AT_CLIENT.*`, cache `window.__AIRTABLE_DATA__`, eventos `airtable-loaded`). Los paneles no se modificaron en su lógica core.
- Loaders read-only: skus, ventas (con items), entradas (con lotes), cashflow (vía tabla `movimientos` directa para incluir CASHFLOW + FINANCIERO), financiero (préstamos + inversores), resumen (computado on-the-fly), movFin.
- Writers: createSKU/updateSKU/removeSKU, createVenta/removeVenta/updateVentaHeader, createLote/removeLote/updateLoteHeader, createMovFin/removeMovFin, y genéricos create/update/remove para cashflow + entradas + financiero (no-op).
- Override de globals hardcoded: mutación in-place de `window.CF_ALL`, `window.CF_MES`, `window.MES`, `window.COOP`, `window.ANDREA`, `window.BHD` con datos reales de Supabase, después que cargan los loaders. Re-dispara `airtable-loaded` para que paneles re-rendereen.
- Compat shim: `window.AT.fields.cashflow.*` con keys literales para que los paneles que llamaban `AT_CLIENT.create('cashflow', fields)` con field-IDs estilo Airtable sigan funcionando.

---

## ✅ P0.5 — Row Level Security (RLS) · **COMPLETADO en modo DEV** (2026-05-26)

Las 13 tablas tienen RLS habilitado con policy `dev_anon_all` que permite SELECT/INSERT/UPDATE/DELETE al rol `anon`. Migration: `rls_open_anon_dev_local`.

**⚠ ANTES DE PUBLICAR EL DASHBOARD EN NETLIFY / PRODUCCIÓN:**
- Revisar estas policies — actualmente cualquiera con el `anon` key puede leer y modificar todas las tablas.
- Opciones de hardening:
  - **A)** Configurar Supabase Auth + cambiar policies a `TO authenticated` y obligar login en el dashboard.
  - **B)** Restringir CORS en Supabase a dominios específicos.
  - **C)** Mover lecturas/escrituras detrás de Netlify Functions con `service_role` key del lado servidor.

Por ahora (uso local de Julio en localhost:3000), open access es lo más simple.

---

## ✅ P1 — Linkear movimientos VENTA con ventas · **PARCIAL** (2026-05-26)

54 de 169 movimientos VENTA quedaron linkeados a su venta vía match único por fecha + monto. Los 115 restantes son **V-LEG** (ventas legacy de jul 2025 - ene 2026) que fueron migradas como agregados de período sin movimiento individual correspondiente. No hay forma automática de matchearlos.

Migrations aplicadas: `link_movimientos_venta_with_ventas`, `link_movimientos_venta_segunda_pasada`.

---

## ✅ P1 — Llenar tabla `disenos` · **COMPLETADO** (2026-05-26)

4 entries base: Hollow Knight, Plain White, Plain Black, Custom Cliente. Ya seteables como `diseno_id` desde el formulario de venta cuando el SKU es Stand.

---

## P1 — Auto-regeneración de cuotas BHD con cada drawdown

La línea de crédito BHD (`prestamo_id=2`) acumula intereses mensuales sobre el balance actual. Cada vez que Julio hace un DRAWDOWN, el balance sube y los intereses futuros cambian.

**Solución propuesta:** crear una función SQL `regenerar_cuotas_bhd()` que:
1. Calcula el balance actual: `SUM(drawdowns) - SUM(pagos_capital)`
2. Genera/actualiza un schedule de "cuotas estimadas" basado en el balance actual y la tasa BHD
3. Las cuotas BHD son flexibles (no es un préstamo amortizado fijo), así que el schedule sirve como proyección

**O alternativa simple:** no generar cuotas para BHD. Solo trackear el balance corriente con `vw_saldo_prestamo`. Cuando Julio paga, queda como `PAGO_LINEA_CREDITO` movement.

⚠ **Pregúntele a Julio cuál prefiere antes de implementar.**

---

## P2 — Stock management con lotes (retroactivo)

V2.1 no tenía concepto de "lote" (compra agrupada con costos compartidos). Supabase sí, pero la tabla `lotes` está vacía. Las 79 entradas actuales no apuntan a un `lote_id`. Si Julio quiere migrar las compras Alibaba a lotes retroactivamente:

1. Identificar grupos de entradas con misma fecha y proveedor
2. Crear un `lotes` record con los costos compartidos
3. UPDATE las entradas para apuntar a ese `lote_id`
4. Triggers recalculan el `costo_compartido_asignado` automáticamente

Esto es opcional. La data actual es funcionalmente correcta sin lotes. Los lotes NUEVOS creados desde el dashboard sí usan `lotes` cuando se llenan los shared costs.

---

## P2 — Reporte de ganancia real vs proyectada

Cuando una entrada PENDIENTE llega (cambia a RECIBIDO), su `costo_unitario_total` puede diferir de la estimación. Si hubo ventas anteriores con `cpp_historico` basado en CPP estimado, retroactivamente la ganancia cambia.

Idea: agregar columna `cpp_actualizado_post_recibo` en `ventas_items` y un trigger que la actualice. La ganancia "definitiva" sería con el costo real, la "estimada" con el snapshot. Útil para dashboards. Pero baja prioridad.

---

## P2 — Mobile UI

El dashboard actual es desktop-only. Julio opera mucho desde el celular para registrar ventas en vivo. Considerar:
- Hacer el wizard responsive
- O un PWA simple

No urgente porque Julio puede usar el desktop, pero mejoraría su workflow.

---

## P2 — Backup automático

Supabase tiene backups diarios automáticos en el plan pago. En plan free son 7 días retenidos. Configurar export semanal a Google Drive si Julio queda en plan free.

---

## P1.5 — Side-effect cleanup en remove de Lote/MovFin

**Bug detectado** durante tests UI: cuando se REGISTRA un lote o un MovFin desde el dashboard, los handlers `handleCreateLote` (panel-inventario) y `handleAddMov` (panel-fin-productos) también llaman a `AT_CLIENT.create('cashflow', ...)` para crear movimientos satélites en cashflow (representa el dinero saliendo del banco). Pero cuando se BORRA el lote/movFin con `removeLote`/`removeMovFin`, esos cashflow satélites NO se borran. Quedan huérfanos en la tabla `movimientos`.

**Reproducer**: Registrar un lote con envío 500 + courier 1200 + otros 200 + costo 6500 → se crean 4 movs adicionales (ENVIO_LOTE, COMPRA_MERCANCIA, ENVIO_LOTE, OTROS). Borrar el lote → solo se borran las entradas + lote header, los 4 CF quedan.

**Fix posible**: cuando `createLote`/`createMovFin` se ejecutan, persistir los IDs de los CF satélites en el cache. Cuando se borra el lote/movFin, también borrar esos CFs.

**Fix temporal manual**: si Julio nota duplicados en el cashflow tail, buscar `notas` con el patrón "BHD Cuenta Corriente · 9421" y la fecha exacta del lote borrado.

Mismo comportamiento que tenía airtable-client, así que NO es una regresión de la migración. Pero vale la pena arreglar.

---

## P2 — Cleanup post-migración

Una vez que Julio confirme que el dashboard nuevo (Supabase) funciona perfectamente en producción durante 1-2 semanas:

- [ ] Eliminar `src/airtable-client.js`
- [ ] Eliminar `netlify/functions/airtable.js`
- [ ] Eliminar `AIRTABLE_PAT` y `AIRTABLE_BASE_ID` de Netlify env vars (revocar PAT en Airtable también)
- [ ] Limpiar referencias a Airtable en `index.html`
- [ ] Renombrar archivos: `airtable-loaded` event → `data-loaded`, `window.__AIRTABLE_DATA__` → `window.__APP_DATA__`, `window.AT_CLIENT` → `window.DB` (los nombres actuales son histórico de la fase Airtable)

---

## Comandos rápidos para Claude Code

```bash
# Probar conexión a Supabase desde Node
node -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://oicxvnnzocwnqlsojhco.supabase.co',
  'eyJ...'  // anon key, ver supabase-client.js
);
sb.from('skus').select('*').limit(5).then(({ data, error }) => {
  console.log(error || data);
});
"

# Listar tablas + counts
# (via MCP de Supabase, Claude Code lo hace directo)
```

## Cómo continuar

1. Lee `CLAUDE.md` para contexto del negocio (ya actualizado a Supabase)
2. Lee `SCHEMA.md` para referencia de tablas y queries
3. P1 BHD cuotas y P2 cleanup son los próximos candidatos si Julio decide.
4. Pregúntele a Julio antes de tomar decisiones grandes (cambios de schema, refactors mayores).
