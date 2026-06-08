---
name: jamc-paridad
description: >-
  Verifica paridad funcional Y correctitud de datos del dashboard JAMC's Tech:
  que cada página, form, KPI y métrica de la versión nueva haga lo mismo que la
  vieja PERO guardando/escribiendo/registrando los datos correctamente en
  Supabase. Úsala al reescribir o tocar cualquier página/form/KPI, al cerrar una
  fase de la reescritura, o cuando Julio diga "esto no guarda bien / sale mal /
  no cuadra". No es un diff visual: auditá la escritura real consultando la base
  de datos. Trabaja junto con la skill jamc-reglas (define qué es correcto).
---

# JAMC's Tech — Auditoría de paridad y correctitud de datos

Julio reporta que en la versión actual hay **forms, KPIs y métricas que no
guardan/escriben/registran bien**. Por eso "paridad" aquí NO significa "se ve
igual que la app vieja" — significa **misma función, datos correctos en la DB**.
Si la app vieja guarda mal, la nueva debe guardar BIEN (ver `jamc-reglas`).

## Cuándo usar

- Al reescribir una página/form/modal (verificar antes de marcarla "lista").
- Al cerrar una fase de la reescritura (repaso del `REWRITE_INVENTORY.md`).
- Cuando Julio diga que algo "no guarda", "sale mal", "no cuadra" o "se borró".

## Flujo de auditoría (por cada página)

### 1. Inventario / checklist
Lista cada elemento de la página: KPIs, charts, tablas, filtros, cada form, cada
botón de acción (crear/editar/borrar), cada modal. Esto alimenta el
`REWRITE_INVENTORY.md`. Nada se marca "listo" sin pasar los pasos 2–4.

### 2. Auditar cada ESCRITURA contra la DB (lo más importante)
Para cada form/acción que escribe:
1. Llena el form con datos de prueba reconocibles (ej. monto `1234.56`, nota
   `TEST-PARIDAD`).
2. Envía.
3. **Consulta Supabase directamente** y confirma que la fila se creó/actualizó
   con las columnas y valores correctos. Usa las herramientas MCP de Supabase
   (`execute_sql`) o el cliente. No te fíes del toast de éxito ni de la UI.
4. Verifica especialmente las trampas de `jamc-reglas`:
   - Gasto a tarjeta → ¿quedó como `DRAWDOWN`, `entrada > 0`, `prestamo_id`
     correcto? (NO como `salida` suelta.)
   - Movimiento → ¿`entrada`/`salida` en 0 y no null? ¿`naturaleza` correcta?
   - Venta → ¿se dispararon los triggers? (`cpp_historico`, `total_facturado`,
     `total_ganancia` poblados, no en 0/null.)
   - Lote/entrada → ¿se prorrateó el costo compartido? ¿se recalculó el CPP?
   - Enums en UPPERCASE y mapeo de categoría correcto.
5. **Limpia los datos de prueba** al terminar (borra las filas `TEST-PARIDAD`).

Plantilla de hallazgo:
```
[FORM]: <nombre> · acción: <crear/editar/borrar>
Esperado en DB: tabla <x>, columnas { ... }
Obtenido:       { ... }
Veredicto:      OK | BUG → <qué guarda mal y cuál es lo correcto>
Arreglo:        <archivo:línea o "pendiente">
```
Cada BUG se anota también en el "Registro de bugs" de `jamc-reglas`.

### 3. Verificar KPIs y métricas con cálculo independiente
No compares solo "número nuevo vs número viejo" (el viejo puede estar mal).
Calcula el KPI **desde la DB con SQL** y compara contra lo que muestra la UI:
- Capital, revenue, ganancia (neta), stock — usa las vistas (`vw_stock_sku`,
  `vw_saldo_cuenta`, etc.) y los queries del cheat sheet de `SCHEMA.md`.
- Si UI ≠ SQL → es bug de KPI; arréglalo y documenta.
- Si UI(nueva) = SQL pero ≠ UI(vieja) → la vieja estaba mal; está bien, anótalo.

### 4. Verificar comportamiento en el browser
Usa las herramientas de preview: navega la página, prueba crear/editar/borrar,
confirma estados de carga/vacío/error y que no haya errores en consola.

## Salida esperada

Un reporte corto por página: checklist marcado, lista de escrituras auditadas
(OK/BUG), KPIs verificados vs SQL, y bugs encontrados con su arreglo. La página
solo se declara "lista" cuando todas las escrituras guardan correcto y los KPIs
cuadran contra la DB.

## Reglas de seguridad

- Datos de prueba siempre identificables (`TEST-PARIDAD`) y **borrados al final**.
- Nunca borres ni modifiques data real del negocio durante la auditoría.
- No uses la service_role key; trabaja con el rol autenticado normal.
