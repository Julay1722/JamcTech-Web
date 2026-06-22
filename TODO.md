# JAMC's Tech — Pendiente + notas de desarrollo

> Doc vivo de lo que falta. Contexto del negocio → `CLAUDE.md` · Schema DB → `SCHEMA.md` ·
> Agentes (futuro) → `JARVIS.md` · Login de los tests → `tests/README-AUTH.md`.
> Última actualización: **2026-06-07**.

---

## 🚧 Reescritura Vite + React (branch `reconstruccion`) — COMPLETA

El dashboard fue reescrito desde cero (Vite + React modular) en el branch
`reconstruccion`, arreglando los bugs de guardado de `BUGS_DATOS.md`. Estado:
- ✅ 6 páginas (Resumen, Ventas, Inventario, Finanzas, Libro, Alertas) + auth + shell.
- ✅ Capa de datos limpia (`src/lib/db/`), KPIs cuadran vs SQL, writers verificados
  end-to-end contra la DB (ventas, lote USD→RD, pago de cuota, transferencia, CRUD).
- ✅ Build/preview de producción OK, `netlify.toml` a Vite, código muerto borrado.
- **Falta (acciones de Julio):** conectar el repo a Netlify desde el branch nuevo,
  hacer un walkthrough manual de cada form, y mergear `reconstruccion` → `master`
  cuando esté conforme. Pendientes menores en `REWRITE_INVENTORY.md`.

Correrlo: `npm install && npm run dev` → http://localhost:5173 (ver `CLAUDE.md`).

---

---

## ✅ Hitos grandes (hechos)
- Migración Google Sheets V2.1 → Supabase + dashboard Airtable → Supabase.
- Dashboard v3 (estilo "Amber Terminal"): Resumen · Alertas · Ventas · Inventario · Finanzas.
- Finanzas: USD nativo (tasa configurable), análisis de deuda con semáforo, compensaciones dueño/inversor.
- Inventario: SKUs/lotes/CPP, prorrateo por valor base, estado **Descontinuado** con apartado propio.
- Ventas legacy: 8 descifradas del sheet "1722", el resto quedan legacy (sin producto en la fuente).
- **Seguridad para web (2026-06-05):** login real (Supabase Auth) + RLS cerrado a solo `authenticated`
  (`anon` = 0 policies) + Netlify publica solo `dist/` (allowlist, sin docs/tests).

---

## 🔜 Próximo — para publicar en Netlify
- [ ] Crear **usuario de test** en Supabase Auth + poner `TEST_USER_*` en `.env` → correr suite Playwright completa. (Ver `tests/README-AUTH.md`.)
- [ ] Conectar el repo a Netlify (branch `master`). El `netlify.toml` ya hace el build allowlist solo.
- [ ] No publicar `index-legacy.html` (el allowlist ya lo excluye; además el RLS lo protege).

---

## 💰 Negocio (no es código)
- **Plan de salida de deuda** en `PLAN_DEUDA.md` (local). Meta realista: ~RD$14k/mes → libre de deuda bancaria en ~17 meses (avalancha: Scotia USD → BHD Línea → Coop).
- **Agentes** (`JARVIS.md`): retomar SOLO cuando la caja esté sana (deuda cara muerta + cash libre positivo y estable 2+ meses).

---

## 📋 P2 / futuro (nice-to-have)
- **Mobile UI / PWA** para registrar ventas desde el celular (hoy es desktop-only).
- **Backup automático** semanal a Drive si queda en plan free de Supabase (retención 7 días).
- **Lotes retroactivos**: agrupar compras Alibaba históricas en `lotes` (opcional; la data ya es correcta sin esto).
- **Ganancia real vs proyectada**: columna `cpp_actualizado_post_recibo` en `ventas_items` + trigger.
- **Cleanup de nombres legacy** (cosmético): `window.__AIRTABLE_DATA__` → `__APP_DATA__`, `window.AT_CLIENT` → `DB`, evento `airtable-loaded` → `data-loaded`.
- **Mousepads** con nombres genéricos (`Mouse Pad 80 30 1`) — normalizar si Julio quiere.

---

## Cómo correrlo
```powershell
cd C:\Users\coco2\OneDrive\Escritorio\V17
npx serve .            # http://localhost:3000 (ahora pide login)
npx playwright test    # requiere TEST_USER_EMAIL/PASSWORD en .env
```

## Notas para quien continúe (Claude o dev)
1. Lee `CLAUDE.md` (negocio + convenciones) y `SCHEMA.md` (tablas/triggers/vistas).
2. Triggers de la DB hacen CPP, prorrateo, snapshot de ganancia y totales — **no dupliques esa lógica en el frontend**.
3. Pregúntale a Julio antes de cambios grandes (schema, refactors, o algo que toque su data real).
