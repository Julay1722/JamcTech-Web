# JAMC's Tech — Pending Work

Trabajo en orden de prioridad. **P0** = bloquea uso productivo del dashboard. **P1** = funcionalidad importante. **P2** = nice-to-have / futuro.

---

## P0 — Conectar dashboard a Supabase

El dashboard actual (en `Julay1722/Jamc-s`, deployed en Netlify) usa `airtable-client.js` para leer/escribir. Hay que migrar a Supabase.

### Sub-tareas

#### 1. Setup del SDK de Supabase
```bash
# En el repo local
npm install @supabase/supabase-js
# o si es vanilla HTML/JS: usar el CDN
# <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

#### 2. Variables de entorno
Crear `.env` local (NO commit):
```
VITE_SUPABASE_URL=https://oicxvnnzocwnqlsojhco.supabase.co
VITE_SUPABASE_ANON_KEY=<copiar del dashboard de Supabase>
```

En Netlify, agregar las mismas variables en Site settings → Environment variables.

**Para sacar el anon key:** Supabase dashboard → Settings → API → Project API keys → `anon` `public`.

#### 3. Crear `supabase-client.js`
Replicar la interfaz de `airtable-client.js` pero apuntando a Supabase. El dashboard tiene métodos como:
- `getVentas(filters)`
- `getEntradas(filters)`
- `getStock()`
- `getMovimientos(filters)`
- `createVenta(...)`
- `createEntrada(...)`

Para cada uno, hacer el query equivalente en Supabase:

```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// Ejemplo: getVentas
async function getVentas(filters = {}) {
  let query = supabase
    .from('ventas')
    .select(`
      *,
      ventas_items(*, skus(nombre, marca, modelo))
    `)
    .order('fecha', { ascending: false })
  
  if (filters.startDate) query = query.gte('fecha', filters.startDate)
  if (filters.endDate) query = query.lte('fecha', filters.endDate)
  
  const { data, error } = await query
  if (error) throw error
  return data
}

// Ejemplo: getCashflow
async function getCashflow(filters = {}) {
  let query = supabase
    .from('vw_cashflow')   // ← usa la vista pre-armada
    .select('*')
    .order('fecha', { ascending: false })
  
  if (filters.month) {
    query = query
      .gte('fecha', `${filters.month}-01`)
      .lt('fecha', `${filters.month}-32`)
  }
  
  const { data, error } = await query
  if (error) throw error
  return data
}
```

#### 4. Adaptar `wizard.js`
El wizard crea nuevas ventas y entradas. Para una nueva venta:

```javascript
// Paso 1: crear el encabezado de venta
const { data: venta, error: e1 } = await supabase
  .from('ventas')
  .insert({
    codigo: `V-${Date.now()}`,  // o un counter incremental
    fecha: fechaVenta,
    canal_id: 9, // Facebook
    envio_cobrado: envio,
    descuento: 0,
    // total_facturado y total_ganancia se calculan por trigger
    total_facturado: 0,  // placeholder
    total_ganancia: 0
  })
  .select()
  .single()

// Paso 2: insertar línea(s) de venta
const { error: e2 } = await supabase
  .from('ventas_items')
  .insert({
    venta_id: venta.id,
    sku_id: 'MOU-HXS-T90-NEG',  // del selector
    cantidad: 1,
    precio_unitario: 1500
    // cpp_historico se snapshotea automáticamente
  })

// Paso 3: registrar el movimiento de cash inflow
const { error: e3 } = await supabase
  .from('movimientos')
  .insert({
    fecha: fechaVenta,
    tipo: 'VENTA',
    cuenta_id: 1,  // BHD por defecto
    contraparte_id: 9,  // Facebook
    entrada: precioTotal,
    salida: envio || 0,  // si hubo envío descontado
    venta_id: venta.id,
    notas: `Venta ${venta.codigo}`
  })
```

#### 5. Borrar referencias a Airtable
- Eliminar `airtable-client.js`
- Eliminar imports/scripts de Airtable en `index.html`
- Limpiar tokens de Airtable de Netlify env vars (privacidad)

#### 6. Probar localmente
- `npm run dev` o abrir el HTML directamente
- Verificar que el dashboard carga las 190 ventas, 79 entradas, 276 movimientos
- Probar el wizard creando una venta de prueba (luego borrarla con `DELETE FROM ventas WHERE codigo LIKE 'V-TEST-%'`)

#### 7. Deploy a Netlify
- Commit y push
- Verificar build logs
- Probar en producción

---

## P0.5 — Row Level Security (RLS)

**MUY IMPORTANTE:** actualmente las tablas no tienen políticas RLS. Con el anon key cualquiera podría leer/escribir.

### Opción A (simple, recomendada): RLS off + anon key sin permisos
Estrategia: NO usar anon key en el frontend. Crear un usuario de Supabase Auth y autenticarse antes de hacer queries. Solo usuarios autenticados pueden leer/escribir.

```javascript
// En el dashboard, al abrir:
await supabase.auth.signInWithPassword({
  email: 'julio@jamcs.com',
  password: '...'
})
// Después de esto, las queries con anon key funcionan porque el JWT del user tiene permisos
```

Activar RLS en cada tabla y crear política básica:
```sql
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated users full access" ON ventas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- Repetir para cada tabla
```

### Opción B (más simple, menos segura): RLS abierto pero key restringida
Mantener anon key con permisos, pero restringir el dominio en Supabase settings (solo permitir requests desde jamcs.netlify.app y localhost). Bueno si solo Julio usa el dashboard. NO publicar el anon key en GitHub.

---

## P1 — Auto-regeneración de cuotas BHD con cada drawdown

La línea de crédito BHD (`prestamo_id=2`) acumula intereses mensuales sobre el balance actual. Cada vez que Julio hace un DRAWDOWN, el balance sube y los intereses futuros cambian.

**Solución propuesta:** crear una función SQL `regenerar_cuotas_bhd()` que:
1. Calcula el balance actual: `SUM(drawdowns) - SUM(pagos_capital)`
2. Genera/actualiza un schedule de "cuotas estimadas" basado en el balance actual y la tasa BHD
3. Las cuotas BHD son flexibles (no es un préstamo amortizado fijo), así que el schedule sirve como proyección

**O alternativa simple:** no generar cuotas para BHD. Solo trackear el balance corriente con `vw_saldo_prestamo`. Cuando Julio paga, queda como `PAGO_LINEA_CREDITO` movement.

Pregúntele a Julio cuál prefiere.

---

## P1 — Linkear movimientos VENTA con ventas

Actualmente los 188 movimientos de tipo VENTA tienen `venta_id = NULL`. Para correlacionar venta (qué se vendió) con cash inflow (cuándo entró el dinero), hacer matching aproximado por fecha + monto.

```sql
UPDATE movimientos m
SET venta_id = v.id
FROM ventas v
WHERE m.tipo = 'VENTA'
  AND m.venta_id IS NULL
  AND m.fecha = v.fecha
  AND m.entrada = v.total_facturado + COALESCE(v.envio_cobrado, 0);
```

Atención: si hay multi-matches (varias ventas en mismo día con mismo monto), el UPDATE puede ser ambiguo. Revisar antes.

---

## P1 — Llenar tabla `disenos`

Cuando Julio venda Stands con diseños impresos (Hollow Knight, otros), los `diseno_id` en `entradas` y `ventas_items` deben apuntar a una entry de la tabla `disenos`. Por ahora todos NULL.

Setup mínimo:
```sql
INSERT INTO disenos (nombre, notas) VALUES
  ('Hollow Knight', 'Diseño base'),
  ('Plain White', 'Sin diseño');
```

---

## P2 — Stock management con lotes

V2.1 no tenía concepto de "lote" (compra agrupada con costos compartidos). Supabase sí. Si Julio quiere migrar las compras Alibaba a lotes (para ver prorrateo de envíos/impuestos por entrada), retroactivamente:

1. Identificar grupos de entradas con misma fecha y proveedor
2. Crear un `lotes` record con los costos compartidos
3. UPDATE las entradas para apuntar a ese `lote_id`
4. Triggers recalculan el `costo_compartido_asignado` automáticamente

Esto es opcional. La data actual es funcionalmente correcta sin lotes.

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

## Comandos rápidos para Claude Code

```bash
# Inicializar Supabase en el repo local
npm install @supabase/supabase-js

# Probar conexión
node -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://oicxvnnzocwnqlsojhco.supabase.co',
  process.env.SUPABASE_ANON_KEY
);
sb.from('skus').select('*').limit(5).then(({ data, error }) => {
  console.log(error || data);
});
"

# Ver estado actual del proyecto desde MCP de Supabase
# (Claude Code puede usar el MCP server de Supabase si está configurado)
```

## Cómo continuar

1. Lee `CLAUDE.md` para contexto del negocio
2. Lee `SCHEMA.md` para referencia de tablas y queries
3. Lee este TODO en orden, atacá P0 primero
4. Cuando termines P0, andá a por P0.5 (RLS) antes de cualquier deploy productivo
5. Pregúntale a Julio antes de tomar decisiones grandes (cambios de schema, refactors mayores)
