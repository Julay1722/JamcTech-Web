# JAMC's Tech — Design Brief para remodelación de UI

> **Para quién es este documento:** una IA de diseño (o diseñador) que va a
> rediseñar la interfaz del dashboard SIN romper la lógica. Aquí está TODO lo
> visual y de UX: qué es la app, qué pantallas tiene, qué muestra cada una, el
> sistema de diseño actual, los componentes, las interacciones y las reglas que
> hay que respetar. **No necesitas tocar la base de datos ni la lógica de datos**
> (ver "Qué NO se toca").

---

## 1. Qué es la app

Dashboard financiero/operativo de **JAMC's Tech**, tienda online de periféricos
gaming (mouse, teclados, headsets, mousepads, stands) en Santo Domingo, RD. Vende
por Facebook + envíos por courier. **Un solo usuario: el dueño (Julio).** No es
público; requiere login.

Julio lo usa para: ver cuánto capital líquido tiene, registrar ventas, controlar
inventario, manejar préstamos/tarjetas/línea de crédito, y cuadrar todo contra su
hoja de cálculo y su banco real. **Es una herramienta de trabajo diaria, densa en
datos y números** — no una landing page. La prioridad es claridad y velocidad de
lectura de cifras, no decoración.

**Idioma:** todo en **español dominicano**. **Moneda:** RD$ (y US$ en algunas
cuentas/compras). Tono: directo, sin relleno.

---

## 2. Stack y restricciones técnicas

- **Vite + React 18** (ESM, JSX). Sin TypeScript. Estado con hooks + Context.
- Estilos: **un solo archivo CSS** `src/styles/theme.css` con CSS variables
  (design tokens) y clases utilitarias/semánticas. NO hay Tailwind ni CSS-in-JS;
  hay algunos estilos inline en JSX. El rediseño puede reescribir `theme.css`
  entero y/o cambiar className en los componentes.
- Datos: Supabase (Postgres). La capa de datos (`src/lib/db/*`, `src/hooks/useData`)
  **no se toca** en un rediseño visual.
- Build: `npm run dev` (localhost), `npm run build` → `dist/` (Netlify).

---

## 3. Sistema de diseño ACTUAL

Identidad actual: **"Amber Terminal" reconvertida a azul moderno tipo Linear** —
dark mode, fondo casi negro neutro, acento azul, **fuente mono para todos los
números/IDs**. Estética de terminal financiera (Bloomberg/Linear), sobria.

### Tokens (de `theme.css` `:root`)

```
/* Superficies (dark, near-black neutro) */
--bg:        #0a0a0c   /* fondo app */
--surface:   #111114   /* tarjetas, sidebar */
--surface-2: #16161b   /* inputs, hover, sub-superficie */
--surface-3: #1d1d24
--border:    #232329   --border-2: #30303a

/* Texto (gris frío) */
--text: #ededf0   --text-2: #a6a6b2   --text-3: #6c6c79   --text-4: #45454f

/* Acento + semánticos */
--accent: #4f8cff   --accent-2: #6ea8ff   --accent-ink: #fff
--accent-soft: rgba(79,140,255,0.12)
--success: #2ec16b   --warning: #f5a524   --danger: #ff5a5f   --info: #38c7d6

/* Tipografía */
--font-sans: 'Inter', system-ui, sans-serif      /* UI y texto */
--font-mono: 'JetBrains Mono', ui-monospace       /* TODOS los números, IDs, montos */

/* Espaciado (escala 4pt): --s-1=4 … --s-8=64 */
/* Radio: --r-sm=7  --r-md=10  --r-lg=12 */
```

**Reglas de identidad actuales (mantener el espíritu, se pueden modernizar):**
- **Mono para números** (`.num`, `font-feature-settings: 'tnum'`): montos, KPIs,
  saldos, IDs de SKU y de venta van en JetBrains Mono. Es clave para alinear cifras.
- **Dark mode** es el default y el único tema hoy.
- **Color = significado:** verde = positivo/ganancia/pagado, rojo = deuda/negativo/
  crítico, ámbar = atención/advertencia, azul = acento/acción/seleccionado.
- Animaciones sutiles de entrada (`rise`, `slideUp`), respeta
  `prefers-reduced-motion`.

> El rediseño puede cambiar paleta, tipografía, densidad y estética siempre que
> conserve: legibilidad de cifras, jerarquía clara, semántica de color, y que
> siga siendo cómodo para uso intensivo diario. Light mode sería bienvenido como
> opción.

---

## 4. Layout / shell (`src/App.jsx` + `.app` en CSS)

```
┌──────────┬───────────────────────────────────────────┐
│ SIDEBAR  │  MAIN (scrollable)                         │
│ (224px)  │  ┌─ period filter (sticky, solo en 3 tabs)─┤
│          │  ┌─ topbar: <h1> + sub + acciones ─────────┤
│ brand    │  ┌─ KPI row (4 tarjetas) ──────────────────┤
│ ──────   │  ┌─ secciones (tarjetas con tablas/charts)─┤
│ nav x6   │                                            │
│ ──────   │                                            │
│ Sincroni.│                                            │
│ (footer) │                                            │
└──────────┴───────────────────────────────────────────┘
```

- **Sidebar** (`aside.nav`): marca arriba (cuadro con "J" + "JAMC.TECH" + "v3 ·
  Supabase"), label de sección "General", 6 items de navegación con ícono + label
  + badge numérico (conteo), label "Sistema" con "Sincronizar", y al fondo el
  build/fecha + botón "Salir". **Colapsable** (botón circular flotante en el borde):
  colapsado = solo íconos (56px). En **móvil (<768px)** la sidebar pasa a ser una
  **tira horizontal scrollable arriba**.
- **Main:** padding lateral, scroll vertical propio. Cada vista arma su `topbar`
  (título `<h1>` + subtítulo) y debajo sus secciones.
- **Period filter** (`PeriodFilter`): barra sticky arriba a la derecha, solo en
  Resumen, Ventas y Libro. Opciones: Todo / Este mes / 30d / 90d / Año / Rango
  custom (con date inputs).

### Los 6 tabs (íconos actuales entre paréntesis)
1. **Resumen** (◉) — dashboard de mando.
2. **Alertas** (!) — badge con conteo en rojo.
3. **Ventas** ($) — badge con # de ventas.
4. **Inventario** (▣) — badge con # de SKUs.
5. **Finanzas** (∮) — sin badge.
6. **Libro** (≣) — badge con # de movimientos.

---

## 5. Las pantallas en detalle

### 5.1 Resumen (`pages/Overview.jsx`) — el mando
- **KPI row (4):** `Capital líquido` (RD$, destacado/primero), `Revenue`
  (RD$ + "N ventas"), `Ganancia neta` (RD$ + % margen), `Stock total` (unidades).
  La primera KPI va resaltada (borde azul + gradiente).
- **2 charts lado a lado:** Revenue mensual (LineChart) · Ganancia mensual (BarChart).
- **Tabla "Resumen mensual":** una fila por mes (Mes, Capital, Ventas, Ganancia,
  Rendimiento %). El mes en curso resaltado. Crece sola con meses nuevos.
- **Inventario por categoría** (DonutChart) + **Top SKUs** (tabla, métrica
  conmutable) + **Deuda total** (card con desglose).

### 5.2 Alertas (`pages/Alertas.jsx`)
Dos sub-vistas (tabs internos): **Cuotas/Pagos** e **Inventario**.
- **Cuotas próximas:** tabla con badge de urgencia (HOY/mañana/en Nd/vencida),
  fecha, préstamo, montos, botón **"Pagar"**. Filtro por horizonte (30/60/90/Todas).
- **Pagos de tarjeta y línea próximos:** badge "✓ pagado" (verde) si ya se pagó el
  ciclo, sino urgencia; columnas vence/producto/corte/pagado este ciclo/saldo.
- **Pagos fijos próximos** (servicios recurrentes) con botón "Pagar".
- **Inventario:** stock crítico (≤2, rojo) y atención (≤5, ámbar), tablas.

### 5.3 Ventas (`pages/Ventas.jsx`)
- KPIs de ventas + tabla: **muestra el PRODUCTO vendido** (no el código), fecha,
  canal, cantidad, facturado, ganancia, botón eliminar. Export CSV. Botón
  **"+ Registrar venta"** abre un form (multi-línea: categoría→SKU, cantidad,
  precio; cuenta de cobro; envío; gasto asociado).

### 5.4 Inventario (`pages/Inventario.jsx`)
- Organización **jerárquica: categoría → modelo → color** (expandible). Por SKU:
  stock físico, en tránsito, vendidas, CPP (costo), precio sugerido, estado
  (crítico/atención/ok). Avisa nombres casi-duplicados al crear SKU. Export CSV.

### 5.5 Finanzas (`pages/Finanzas.jsx`) — la más rica
Header plano con **sub-tabs en un nivel** (`.subtabs`):
- **Resumen** — visión financiera.
- **Análisis** — proyecciones de deuda, cash flow.
- **Deudas** — préstamos amortizados + líneas + **tarjetas** unificados. Cada fila:
  saldo, tasa, **próximo pago** (con "✓ pagado" si ya pagó el ciclo), botones
  **⚖ (cuadrar a saldo real)**, ✎ (editar), × (borrar). Click en fila → panel de
  detalle (amortización con tabla de cuotas + botón **"+ Abono a capital"**, o usos
  de la tarjeta). Modales: pagar cuota, cuadrar deuda, abono a capital (con preview
  en vivo del ahorro), editar.
- **Banco** — cuentas (débito/crédito/efectivo, RD$/US$) + libro filtrado por cuenta.
- **Inversores** — Andrea Correa: aportes, devengo de compensación, "Registrar pago".
- **Pagos fijos** — servicios recurrentes (Netlify, internet…): crear/editar/pagar.

### 5.6 Libro (`pages/Libro.jsx`) — libro contable
- Tabla de TODOS los movimientos (fecha, tipo, cuenta, entrada, salida, naturaleza,
  notas). Filtros por período. Botón **"+ Registrar movimiento"** = form unificado
  de 5 modos (Gasto · Ingreso · Transferencia · Pago deuda · Pago inversor). Export CSV.

### 5.7 Login (`components/LoginScreen.jsx`)
- `.center-screen` + `.login-card` (340px): email/contraseña, Supabase Auth.

---

## 6. Inventario de componentes (`src/components/`)

| Componente | Qué es | Clases CSS clave |
|---|---|---|
| `Charts.jsx` | `KPI`, `LineChart`, `BarChart`, `DonutChart`, `Sparkline`, `MiniBars`, `Bar` (todo SVG inline, sin librería) | `.kpi`, `.chart-wrap`, `.bar` |
| `Table.jsx` | `DataTable` genérico (columns + rows + getRowKey, render por celda, onRowClick, fila activa, empty state) | `table.data`, `.row-active` |
| `Modal.jsx` | `Modal` (backdrop + card centrada, animación slideUp) | `.modal-backdrop`, `.modal`, `.modal-actions` |
| `Form.jsx` | `Field`, `TextInput`, `NumberInput`, `MoneyInput`, `DateInput`, `TextArea`, `Select` | `.field`, `.input`, `.select` |
| `Pickers.jsx` | `CuentaSelect`, `MedioPagoSelect`, `ContraparteSelect` (gestionable: +/−), `SkuSelect` (2 pasos categoría→SKU) | `.select`, `.chips` |
| `PeriodFilter.jsx` | barra de período + rango custom | `.period-bar` |
| `Toast.jsx` | `ToastProvider` + `useToast` (ok/err/warn), stack abajo-derecha | `.toast-stack`, `.toast` |
| `LoginScreen.jsx` | pantalla de login | `.login-card` |

### Patrones de UI reutilizables (clases en `theme.css`)
- **`.kpi` / `.kpi-row`** — tarjeta de métrica (label uppercase + valor mono grande
  + delta). Primera tarjeta destacada.
- **`.section`** — tarjeta contenedora con `.section-head` (título + desc + acción).
- **`table.data`** — tabla densa: th uppercase pequeño, filas con hover, `.num`
  (mono, derecha), `.pos`/`.neg` (verde/rojo), fila clickeable con barra azul.
- **`.badge`** — píldoras de estado: `.success`/`.warning`/`.danger`/`.neutral`.
- **`.btn`** (acento), `.btn.ghost`, `.btn.danger`; **`.icon-btn`** (⚖ ✎ ×).
- **`.chip` / `.chips`** — píldoras de filtro/modo (toggle, activa = azul).
- **`.tabs`/`.tab`** (nivel 1) y **`.subtabs`/`.subtab`** (nivel 2, pill-group).
- **`.stat-card`** — mini-tarjeta de dato (valor mono + label).
- **`.summary`** — panel de resumen dentro de forms (grid 4 col de label+valor).
- **`.bar`** — barra de progreso/utilización (ej. % de uso de tarjeta).
- **`.modal`**, **`.toast`**, **`.empty`** (estado vacío), **`.loader`** (spinner).
- **`.pill`** — chip informativo (ej. "Próxima: #5 · RD$ 3,568").

---

## 7. Convenciones de datos (respetar en el diseño)

- **Montos:** `RD$ 55,168.29` — símbolo + espacio no-separable + miles con coma +
  2 decimales, en **mono**. USD usa `US$`. En KPIs el símbolo va más chico/tenue.
- **Fechas:** formato `DD/MM/YYYY` (hora LOCAL de RD, no UTC).
- **% / rendimiento:** un decimal (ej. `40.5%`).
- **IDs:** SKU `CAT-MARCA-MODELO-COLOR` (mono); ventas `VTA-YYMMDD-NNN` (mono).
- **Negativos/deuda** en rojo, **ganancias/positivos** en verde, **neutro** gris.

---

## 8. Interacciones y estados

- **Hover:** tarjetas suben 2px + sombra; filas de tabla cambian de fondo; filas
  clickeables muestran barra azul a la izquierda.
- **Loading:** `.loader` (spinner) + "Cargando datos…".
- **Vacío:** `.empty` centrado, texto tenue.
- **Feedback de acción:** toast abajo-derecha (verde/rojo/ámbar) tras
  guardar/pagar/error.
- **Modales** para crear/editar/pagar/cuadrar/abonar; backdrop oscuro, cierra con ×
  o click afuera o Cancelar.
- **Focus visible** (accesibilidad): outline azul 2px en todo lo interactivo.
- **Active:** micro-scale (0.97) al presionar.

---

## 9. Responsive (breakpoints actuales)
- **>1024px:** layout completo, KPI row de 4, grids de 2/3 columnas.
- **≤1024px:** KPI row a 2 col, grids a 1 col, filas de form a 1 col.
- **≤768px (móvil):** sidebar → tira horizontal scrollable arriba; padding menor;
  KPI a 2 col; summary a 2 col. **La app debe seguir 100% usable en móvil.**

---

## 10. Qué se PUEDE cambiar vs qué NO

**Libre de cambiar (objetivo del rediseño):**
- Paleta, tipografía, densidad, radios, sombras, estética general.
- Layout de cada pantalla, jerarquía visual, micro-interacciones, iconografía
  (hoy son glifos de texto ◉ ! $ ▣ ∮ ≣ — se pueden reemplazar por íconos reales).
- `theme.css` completo y los `className`/markup de los componentes/páginas.
- Agregar light mode, mejorar gráficos, mejorar tablas densas, etc.

**Qué NO se toca (rompe la app):**
- La capa de datos: `src/lib/db/*`, `src/hooks/useData.jsx`, `src/lib/supabase.js`,
  `src/lib/format.js` (helpers de formato). El diseño consume datos vía `useData()`.
- La **semántica de los cálculos** (KPIs, CPP, ganancia, saldos) — vienen de la DB.
- Los **nombres de campos/props** que las páginas pasan a los componentes (si
  refactorizas un componente, mantené su API o ajustá ambos lados).
- Las **reglas de negocio** (formato de montos, fechas locales, español, RD$).

---

## 11. Qué valora el usuario (norte del rediseño)

1. **Leer cifras rápido y sin error** — alineación, mono, jerarquía. Es lo #1.
2. **Capital líquido y deudas siempre visibles** — es lo que más mira.
3. **Densidad cómoda** — muchos datos por pantalla, pero respirables (no apretado
   ni con scroll infinito innecesario).
4. **Acciones de un toque** — registrar venta, pagar cuota, abonar: pocos clics.
5. **Confianza** — que se vea que los números "cuadran" (estados ✓ pagado, badges,
   verde/rojo claros). La app es la fuente de verdad de su negocio.
6. **Móvil usable** — a veces registra ventas desde el teléfono.

---

## 12. Archivos relevantes para el diseño

```
src/styles/theme.css        ← TODO el sistema visual (tokens + clases)
src/App.jsx                 ← shell: sidebar, tabs, topbar, period filter
src/pages/Overview.jsx      ← dashboard de mando (KPIs + charts + tabla mensual)
src/pages/Alertas.jsx       ← alertas (cuotas, pagos, inventario)
src/pages/Ventas.jsx        ← ventas + form de registro
src/pages/Inventario.jsx    ← inventario jerárquico
src/pages/Finanzas.jsx      ← deudas/banco/inversores/pagos fijos/análisis (la más densa)
src/pages/Libro.jsx         ← libro contable + form unificado
src/components/*.jsx        ← Charts, Table, Modal, Form, Pickers, PeriodFilter, Toast, LoginScreen
```

> **Para empezar:** lee `theme.css` (sistema visual) y `App.jsx` (estructura),
> luego una página simple (Ventas) y la más densa (Finanzas) para entender los dos
> extremos. El rediseño se materializa reescribiendo `theme.css` y, si hace falta,
> ajustando `className`/markup — sin tocar la lógica ni los datos.
