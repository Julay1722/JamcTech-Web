# Prueba de usuario — últimos 6 meses (1722 ProV2.1)

Fecha: 2026-05-30 · Modo: **muestreo representativo + limpieza** (no se tocó la data real).
Fuente: `backup_2026-05-27/sheet_movimientos.json` (dic-25 → may-26, 173 movimientos).

Metodología: actué como usuario (Julio) entrando un caso REAL de cada tipo por la UI
del dashboard, verificando que los números cuadraran, y borrando todo al final.

---

## ✅ Flujos probados (todos con data real, verificados)

| # | Flujo | Dato real | Resultado verificado |
|---|---|---|---|
| 1 | Gasto operativo (Pago ADS) | 750 · Facebook · ene-26 | BHD Débito −750 ✓ |
| 2 | Cuota préstamo COOP | 4,006 · may-26 | saldo COOP −4,006 · BHD −4,006 ✓ (monto auto = capital+interés+seguro) |
| 3 | Tarjeta Qik — cargo + pago | cargo 500 · pago 160.24 · mar-26 | cargo a cuenta espejo (NO toca BHD) · pago BHD −160 ✓ |
| 4 | Disposición línea BHD | 5,000 · may-26 | usado línea +5,000 · BHD +5,000 (cash recibido) ✓ |
| 5 | Transferencia interna | BHD → Efectivo 2,000 | BHD −2,000 · Efectivo +2,000 ✓ |
| 6 | Pago a inversor (Andrea) | devengado 2,684 · may-26 | modal pre-llenó 625+1,029+1,029 · pagado +2,684 · BHD −2,684 ✓ |
| 7 | Lote + Venta (ciclo completo) | lote 10 ud · venta 1 ud @2,200 + envío 200 | stock +10 luego −1 · venta registrada · BHD +2,400 ✓ |

---

## 🐞 Bug encontrado y ARREGLADO

### B1 (P1) — Transferencia interna inflaba el "usado" de la línea BHD
- **Síntoma**: tras una transferencia BHD → Efectivo, el "usado" de la línea BHD subió
  +2,000 (de 68,795 a 70,795) sin que se dispusiera nada de la línea.
- **Causa**: el cálculo de usado de línea/tarjeta matchea por nombre cualquier movimiento
  cuya contraparte contenga "BHD"/"Scotia"/"Qik". La pata de ENTRADA de la transferencia
  (contraparte = "BHD Débito") se contaba como una disposición de la línea.
- **Fix**: `src/supabase-client.js` — `matchByName` ahora excluye el concepto
  `'Transferencia'`. Una transferencia entre cuentas propias nunca cuenta para la deuda.
- **Verificado**: usado volvió a 68,795 tras el fix.

---

## 🔎 Hallazgos (data / UX, no bugs de código)

- **H1 (data) — No hay stock ni lotes.** Los 49 SKUs tienen stock ≤ 0 (las 165 ventas
  LEGACY descontaron sin lotes correspondientes; hay 0 lotes). No se puede registrar una
  venta sin crear primero un lote. → *Recomendación:* cargar los lotes históricos o hacer
  un ajuste de stock inicial por SKU.
- **H2 (UX) — SKUs sin precio de venta (pv = 0).** El form de venta no auto-sugiere precio;
  hay que teclearlo a mano. → *Recomendación:* setear `precio_venta_sugerido` por SKU.
- **H3 (UX) — Form de lote confuso con los costos.** Tiene "Mercancía (costo base)" a nivel
  de lote Y el costo va por fila de SKU; al llenar solo el de nivel-lote el CPP salió 0.
  → *Recomendación:* aclarar/unificar dónde va el costo de la mercancía.
- **H4 (conocido) — COOP baja por el pago completo, no solo el capital** (ya comentado).
- **H5 (UX menor) — El form de venta auto-agrega una fila SKU vacía** al elegir un SKU
  (intencional para multi-SKU, pero corre la posición de los campos).

---

## 🧹 Limpieza

- Borrados: 13 movimientos + 1 venta (+ 1 ítem) + 1 lote (+ 1 entrada) de prueba.
- Bonus: se removieron 3 pagos de prueba viejos a Andrea que habían quedado de una sesión
  anterior → "pagado" volvió a su valor real **5,006**.
- **Estado final (baseline real):** movimientos 269 · ventas 165 · capital líquido 30,349 ·
  COOP saldo 103,414 · BHD línea usado 68,795 · Andrea pagado 5,006 · QA6M restante 0.
