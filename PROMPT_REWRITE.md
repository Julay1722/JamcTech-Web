# Prompt — Reescritura desde cero · Dashboard JAMC's Tech

> **Cómo usar este prompt:** abre una sesión nueva de Claude Code en este repo
> (`C:\Users\coco2\OneDrive\Escritorio\V17`) y pégale TODO este archivo como
> primer mensaje. Está escrito para que Claude lo ejecute de forma autónoma,
> verificando cada paso contra la app actual.

---

## 0. TL;DR de la misión

La app **ya funciona al 100%**. El problema es que, de tanta modificación
encima de modificación, el código quedó con **detalles sueltos, inconsistencias
y un `index.html` monolítico de ~8,700 líneas**. La misión es:

> **Reescribir el dashboard desde cero, limpio y modular, conservando el 100% de
> la funcionalidad actual, con libertad para mejorar el diseño, sin tocar el
> schema de la base de datos Supabase.**

Decisiones ya tomadas por Julio (el dueño):

1. **Arquitectura:** modernizar a **Vite + React con componentes separados**
   (build real, no más Babel en el browser).
2. **Diseño:** **rediseño libre** — mantener la identidad/propósito, pero con
   libertad para mejorar layout, espaciados, consistencia y pulir todo lo que
   las modificaciones dejaron a medias.
3. **Backend:** **no tocar el schema** de Supabase. Pero **sí reescribir limpio
   el cliente** (`src/supabase-client.js`) — mismo contrato de datos, código
   ordenado.
4. **Arreglar datos, no copiar bugs:** Julio reporta que varios forms, KPIs y
   métricas **no guardan / escriben / registran los datos correctamente** (ej.
   los que se arreglaron hace poco en Ventas). La reescritura reproduce la
   *intención* de cada función, **pero corrige el guardado donde esté mal**. NO
   se copian los bugs.
5. **Trabajar en un branch:** toda la reconstrucción se hace en un branch
   dedicado (ej. `reconstruccion`), **nunca directo en `master`**. `master`
   queda como respaldo funcional hasta que la nueva versión esté verificada.

## Skills del proyecto (úsalas)

Este repo trae skills en `.claude/skills/` que encierran el conocimiento del
negocio. Apóyate en ellas en vez de re-deducir todo:

- **`jamc-reglas`** — reglas de negocio, contrato de datos, enums, IDs y el
  registro de bugs de guardado conocidos. Consúltala siempre que toques dinero,
  ventas, CPP, movimientos, préstamos, KPIs o cualquier escritura.
- **`jamc-paridad`** — cómo verificar que cada página/form/KPI funciona Y guarda
  los datos correctos en Supabase (auditando la DB, no solo la UI).
- **`jamc-deploy`** — pasos de deploy en Netlify para la versión Vite + chequeo
  de que no se publique data del negocio.
- **`jamc-sku`** — generar/validar códigos de SKU en formato largo.

---

## 1. Contexto del negocio y del usuario

- **JAMC's Tech** = tienda online de periféricos gaming (mouse, teclados,
  headsets, mousepads, stands) en Santo Domingo, RD. Vende por Facebook + envíos
  por courier local. Dueño: **Julio**.
- **Usuario único = Julio**, NO es desarrollador. Va a alimentar la página
  manualmente con cada movimiento del negocio. La UI debe asumir que Julio
  puede olvidar cómo funciona un campo. Lenguaje en **español dominicano**,
  claro, sin jerga.
- Moneda: **RD$** (salvo compras USD a proveedores, que llevan `monto_usd` +
  `tasa_cambio`).
- Volumen actual: ~196 ventas, ~49 SKUs, ~79 entradas, 19 lotes, 5 préstamos.

> **Lee `CLAUDE.md` completo antes de empezar.** Contiene el modelo de negocio,
> convenciones de IDs, enums, triggers de la DB y decisiones de diseño que NO se
> pueden cambiar. `SCHEMA.md` tiene el schema de Supabase. Ambos son fuente de
> verdad.

---

## 2. Fuente de verdad de la funcionalidad

**No inventes funcionalidad ni la quites** — pero **sí corrige el guardado de
datos donde esté mal** (ver decisión 4 y la skill `jamc-reglas`). La
especificación de QUÉ debe hacer la app es el código actual, salvo donde guarda
datos incorrectos: ahí la fuente de verdad es `jamc-reglas`, no el código viejo.
Antes de escribir una sola línea nueva:

1. Lee `index.html` completo (es donde vive TODA la UI viva; los
   `src/dashboard/*.jsx` son **código muerto**, NO los uses como referencia —
   están desactualizados).
2. Lee `src/supabase-client.js` completo (contrato de datos + escrituras).
3. Haz un inventario escrito (en un archivo `REWRITE_INVENTORY.md`) de cada
   página, sub-tab, formulario, modal, KPI, gráfico y acción. Ese inventario es
   tu checklist de paridad. **No marques la reescritura como terminada hasta que
   cada item del inventario esté reproducido.**

### 2.1 Mapa de páginas a reproducir (todas existen hoy)

| Página | Sub-tabs / contenido |
|---|---|
| **Mando / Overview** | KPIs (capital, revenue, ganancia, stock), charts (línea, barras, donut, sparklines), filtro de período |
| **Inventario** | SKUs (lista + filtros), Re-Stock, Lotes (+ editar lote), Nuevo SKU, Nuevo lote, Descontinuados |
| **Ventas** | Lista de ventas, Nueva venta (multi-SKU + envío + gasto asociado), Editar venta (modal) |
| **Finanzas** | Resumen, Análisis de deuda, Préstamos (+ amortización), Tarjetas (+ usos/revolvente), Inversores (+ devengo/compensaciones/simulador/pago mensual), Cuentas (+ ledger), Movimientos |
| **Registrar** | Nuevo lote, Movimiento financiero, Nuevo SKU, Ajuste CF |
| **Libro contable** | Lista de movimientos, + Pago a préstamo/línea/inversor, + Gasto/ajuste/transferencia |
| **Alertas** | Página de alertas (stock bajo, etc.) |
| **Login** | Pantalla de acceso (Supabase Auth) + botón logout |

Modales/piezas que NO se pueden perder: editar lote, editar venta, detalle de
producto, detalle de amortización, detalle de línea revolvente, detalle de usos
de tarjeta, detalle de movimientos de inversor, ledger de cuenta, panel de
análisis de deuda, simulador de paquete (inversor), modal de pago mensual,
lista de reglas de compensación, simulador genérico, modal de confirmación,
filtro de período, toasts.

---

## 3. Arquitectura objetivo (Vite + React)

Estructura sugerida (ajústala con criterio, pero respeta la separación):

```
V17/
├── index.html               # solo el <div id="root"> + <script type=module src=/src/main.jsx>
├── package.json             # vite, react, react-dom, @supabase/supabase-js
├── vite.config.js
├── netlify.toml             # build = "npm run build", publish = "dist"
├── src/
│   ├── main.jsx             # bootstrap React + auth gate
│   ├── App.jsx              # router/tabs + shell (header, footer, ticker)
│   ├── styles/              # CSS (variables, tema; mantener look "terminal")
│   ├── lib/
│   │   └── supabase.js      # cliente Supabase limpio (ver §4)
│   ├── hooks/
│   │   └── useData.js       # suscripción a tablas (reemplaza useAirtableTable)
│   ├── components/          # primitivas: KPI, charts, Modal, PeriodFilter, Toast...
│   └── pages/               # una carpeta/archivo por página del §2.1
│       ├── Overview/
│       ├── Inventario/
│       ├── Ventas/
│       ├── Finanzas/
│       ├── Registrar/
│       ├── Movimientos/
│       └── Alertas/
└── (docs existentes: CLAUDE.md, SCHEMA.md, TODO.md — no borrar)
```

Reglas:
- **React de verdad por import**, no por CDN. No más `babel-standalone`.
- Componentes chicos y con una sola responsabilidad. Nada de archivos de 1,000+
  líneas.
- Estado de datos centralizado en un hook/contexto, no en globals de `window`.
  (Internamente el cliente puede seguir cacheando, pero los componentes deben
  consumir vía hook, no leyendo `window.__AIRTABLE_DATA__`.)

---

## 4. El cliente Supabase (reescribir limpio, mismo contrato)

`src/supabase-client.js` actual expone `window.AT_CLIENT.*`. En la reescritura,
conviértelo en un módulo limpio (`src/lib/supabase.js` + funciones exportadas /
un hook), pero **reproduce exactamente las mismas operaciones**:

**Loaders:** `loadSKUs, loadVentas, loadEntradas, loadCashflow, loadFinanciero,
loadCuotas, loadResumen, loadMovFin, refreshAll`.

**Writers específicos:**
- SKUs: `createSKU, updateSKU, removeSKU, countSKURefs`
- Ventas: `createVenta, removeVenta, updateVentaHeader, updateVentaLineas,
  addVentaLineas, removeVentaLineas`
- Lotes/entradas: `createLote, removeLote, updateLoteHeader, addEntradaToLote,
  updateEntrada, removeEntrada`
- Mov. financieros: `createMovFin, removeMovFin`
- Cuentas: `createCuenta, updateCuenta, removeCuenta`
- Préstamos: `createPrestamo, updatePrestamo, removePrestamo`
- Inversores: `createInversor, updateInversor, removeInversor`
- Compensaciones: `createCompensacion, updateCompensacion, removeCompensacion`
- Genéricos: `create, update, remove`

**Auth:** `signIn, signOut, getSession, getUserEmail`.

**Constantes que los formularios leen para validar enums:** `SKU_CATEGORIAS`,
`MOVFIN_TIPOS` (y cualquier otra que uses hoy).

Credenciales y boot gateado por login: ver `CLAUDE.md` → secciones "Credenciales
Supabase" y "RLS/Auth". **La app no carga datos sin sesión válida.** El gate de
auth debe estar tanto en el arranque del cliente como en el render raíz.

---

## 5. Reglas de negocio que NO se pueden romper

Estas viven en la DB (triggers) o son decisiones de diseño. **No las dupliques
en el frontend ni las cambies.** (Detalle completo en `CLAUDE.md`.)

1. **CPP automático** (costo promedio ponderado) se recalcula en la DB al recibir
   entradas. El front solo muestra.
2. **Prorrateo de costos del lote** (envío/courier/impuestos) lo hace la DB.
3. **Snapshot de CPP en venta** (`cpp_historico`) lo hace la DB.
4. **Recálculo de totales de venta** (`total_facturado`, `total_ganancia`) lo
   hace la DB.
5. **Una sola tabla `movimientos`** con columna calculada `naturaleza`
   (CASHFLOW / FINANCIERO). Vistas `vw_cashflow` y `vw_financiero` las separan.
   NO crear dos tablas.
6. **`entrada` y `salida` pueden ser ambas > 0** en la misma fila (ej. "venta +
   envío cobrado").
7. **Gasto asociado a tarjeta de crédito = `DRAWDOWN` ligado a `prestamo_id`**
   (NO un gasto normal). Aplica en: editar venta, venta nueva, entrada de lote,
   crear cuenta. (Bug ya resuelto en la versión actual — reprodúcelo bien.)
8. **"Scotia CC RD" es cuenta Y préstamo a la vez**: cargos a esa tarjeta son
   DRAWDOWN/entrada ligados al `prestamo_id`. No lo trates como cuenta normal.
9. **Devengo de compensaciones a inversores = acumulado de por vida** (no ciclos
   que reinician). Confirmado por Julio.
10. **CPP es weighted-average lifetime**, no FIFO.
11. **Préstamos unificados** en una tabla con `tipo`
    (PRESTAMO / LINEA_CREDITO / TARJETA_CREDITO).
12. **FKs a `skus.id_sku` con ON UPDATE CASCADE** (rename de SKU se propaga).

Convenciones de IDs (SKU, códigos de venta), enums completos y cálculo de cuotas:
ver `CLAUDE.md`.

---

## 6. Diseño (rediseño libre, con criterio)

- Mantén la **identidad "terminal / Bloomberg"** que tiene hoy si te gusta, pero
  tienes libertad para modernizar: mejor jerarquía visual, espaciados
  consistentes, estados de carga/vacío/error claros, responsive decente.
- **Arregla los detalles sueltos**: alineaciones rotas, botones inconsistentes,
  textos a medias, modales con padding raro, etc. Esa es buena parte del punto
  de esta reescritura.
- Toda acción destructiva (borrar) pasa por modal de confirmación.
- Toda escritura da feedback (toast de éxito/error).
- Accesible y usable en pantalla de laptop (uso principal de Julio).

> Si vas a hacer un cambio visual grande en una página, toma screenshot del
> "antes" (de la app actual) para comparar, y muéstrame el "después".

---

## 7. Deploy en Netlify (esto SÍ cambia)

Hoy el `netlify.toml` solo **copia** archivos (Babel compila en el browser). Con
Vite hay build real. Cambios:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"
```

- Vite genera `dist/` con el JS ya compilado y con cache-busting por hash.
- **Mantén los security headers y el SPA fallback** que ya tiene el
  `netlify.toml` actual (X-Frame-Options, CSP-ish, redirect `/* → /index.html`).
- **Cuida la allowlist de seguridad:** hoy el build publica SOLO los archivos de
  la app, nunca `*.md`, `backup_*/*.json`, `tests/`, etc. Con Vite esto se
  resuelve solo (solo `dist/` se publica), pero **verifica que ningún `.json`
  con data del negocio ni ningún doc termine dentro de `dist/`**.
- La llave pública de Supabase puede viajar en el bundle (el RLS protege), tal
  como hoy. No metas la service_role key jamás.

Para Julio (instrucciones copy-paste): Netlify auto-detecta Vite; en la práctica
solo necesita confirmar build command = `npm run build` y publish = `dist` en el
panel de Netlify, o aceptar el `netlify.toml`.

---

## 8. Cómo correrlo en local

Hoy: `npx serve .`. Con Vite pasa a:

```powershell
cd C:\Users\coco2\OneDrive\Escritorio\V17
npm install
npm run dev      # arranca Vite (típicamente http://localhost:5173)
```

Documenta esto en `package.json` (scripts `dev`, `build`, `preview`) y actualiza
`CLAUDE.md` → sección "Cómo correrlo".

---

## 9. Criterios de aceptación (paridad funcional)

La reescritura está lista cuando:

1. **Cada item del `REWRITE_INVENTORY.md` está reproducido** y funciona.
2. **Login/logout** funcionan; sin sesión no se carga ni se muestra data.
3. Se puede **crear, editar y borrar**: SKU, venta (multi-SKU + envío + gasto
   asociado), lote + entradas, movimiento financiero, cuenta, préstamo, tarjeta,
   inversor, compensación, ajuste CF.
4. **Cada escritura se verifica contra la DB** (skill `jamc-paridad`): al crear/
   editar/borrar, la fila en Supabase queda con las columnas y valores correctos
   — no basta con que el toast diga "éxito" ni con que la UI se vea bien.
5. Los **KPIs y métricas cuadran contra la DB** (calculados con SQL, no contra la
   app vieja que puede estar mal): capital, revenue, ganancia neta, stock.
6. Las reglas de negocio del §5 se respetan (verifica especialmente: gasto
   asociado a tarjeta = DRAWDOWN; Scotia dual; devengo de por vida).
7. `npm run build` produce un `dist/` que despliega bien y **no incluye docs ni
   data sensible**.
8. No hay errores en consola al navegar todas las páginas.

**Verificación:** usa las herramientas de preview para arrancar la app, navegar
cada página, probar los formularios principales y comparar contra el
comportamiento actual. No declares nada "listo" sin verificarlo en el browser.

---

## 10. Plan de ejecución sugerido (por fases)

Trabaja de forma autónoma, sin pedir permiso en cada paso (Julio lo prefiere
así). Commits chicos por fase. **Todo en un branch dedicado, NO en `master`:**

```powershell
git checkout -b reconstruccion
```

Sugerencia de orden:

0. **Branch:** crear `reconstruccion` antes de tocar nada.
1. **Inventario:** leer todo, escribir `REWRITE_INVENTORY.md` (checklist).
2. **Andamiaje:** Vite + React + estructura de carpetas + `index.html` mínimo +
   estilos base + shell (header/footer/tabs) + auth gate. App vacía que loguea.
3. **Capa de datos:** `src/lib/supabase.js` limpio con todos los loaders/writers
   del §4 + hook de suscripción. Verificar que carga data real tras login.
4. **Páginas, una por una** (recomiendo este orden: Mando → Inventario → Ventas
   → Finanzas → Registrar → Libro contable → Alertas). Cada página: reproducir,
   verificar en browser, marcar el inventario, commit.
5. **Deploy:** actualizar `netlify.toml`, probar `npm run build` + `npm run
   preview`, confirmar allowlist de seguridad.
6. **Cierre:** repasar el inventario completo, actualizar `CLAUDE.md` (cómo
   correr, arquitectura nueva), borrar código muerto viejo
   (`src/dashboard/*.jsx`, `airtable-client.js`, `netlify/functions/`, tests
   obsoletos) **solo al final y solo si ya nada los usa**.

---

## 11. Reglas de seguridad del proceso

- **No toques el schema de la DB** ni borres data. Solo lectura/escritura por las
  operaciones existentes.
- **No publiques data del negocio** (los `backup_*/*.json`, `.md`) en `dist/`.
- **Nunca** uses la service_role key en el frontend.
- Conserva los archivos viejos hasta el final (rollback fácil); bórralos solo en
  la fase de cierre cuando la nueva versión esté verificada.
- Si encuentras una regla de negocio ambigua en el código actual, **pregúntame a
  mí (Julio)** antes de asumir — sobre todo en cálculos de plata.
