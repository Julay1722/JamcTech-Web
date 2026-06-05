'use strict';
/* ============================================================
   ⚠  ARCHIVO VERIFICADO · NO MODIFICAR  ⚠

   data.js — JAMC's Tech Dashboard · Datos sincronizados Airtable
   Sync: 20-May-2026 · Santo Domingo, RD

   Contiene 361 movimientos de cash flow, 42 SKUs, MES (11 meses),
   COOP/ANDREA/BHD y el sistema de filtros. Todo verificado contra
   la base Airtable de producción (ver AIRTABLE_BASE_ID en Netlify).

   NO regenerar. NO cambiar la estructura. Solo consumirlo desde
   panels.js. Si crees que necesitas modificarlo, pregunta al
   usuario antes de tocar nada.

   Estructura completa documentada en SPEC.md §3.
   Cargar ANTES de panels.js y wizard.js.
   ============================================================ */

/* ════════════════════════ §4.1 CONSTANTES ════════════════════════ */
const HOY           = '2026-05-20';
const PRIMERA_VENTA = new Date('2025-07-28');
const LEAD_TIME     = 52;   // lead time real Alibaba→DR (días) · spec §1
const MESES_LIST    = [
  {v:'2025-07',l:'Jul 2025'},{v:'2025-08',l:'Ago 2025'},{v:'2025-09',l:'Sep 2025'},
  {v:'2025-10',l:'Oct 2025'},{v:'2025-11',l:'Nov 2025'},{v:'2025-12',l:'Dic 2025'},
  {v:'2026-01',l:'Ene 2026'},{v:'2026-02',l:'Feb 2026'},{v:'2026-03',l:'Mar 2026'},
  {v:'2026-04',l:'Abr 2026'},{v:'2026-05',l:'May 2026'},
];

/* ════════════════════════ §4.2 MES (Resumen mensual) ════════════════════════
   Sincronizado con planilla de contabilidad del usuario.
   v=ventas RD$ · g=ganancia · p=margen% · c=capital cierre · f=ISO primer día */
const MES=[
  {m:'Jul-25',v:1200,  g:600,   p:50.00,c:11862, f:'2025-07-01'},
  {m:'Ago-25',v:23201, g:9929,  p:42.80,c:32044, f:'2025-08-01'},
  {m:'Sep-25',v:11300, g:4280,  p:37.88,c:54082, f:'2025-09-01'},
  {m:'Oct-25',v:29750, g:10639, p:35.76,c:27589, f:'2025-10-01'},
  {m:'Nov-25',v:39315, g:16898, p:42.98,c:59570, f:'2025-11-01'},
  {m:'Dic-25',v:58650, g:25565, p:43.59,c:33449, f:'2025-12-01'},
  {m:'Ene-26',v:26819, g:10912, p:40.69,c:84206, f:'2026-01-01'},
  {m:'Feb-26',v:46862, g:15129, p:32.28,c:78345, f:'2026-02-01'},
  {m:'Mar-26',v:28630, g:10972, p:38.32,c:162641,f:'2026-03-01'},
  {m:'Abr-26',v:53544, g:19937, p:37.23,c:46227, f:'2026-04-01'},
  {m:'May-26',v:63200, g:28694, p:45.40,c:40078, f:'2026-05-01'},
];

/* ════════════════════════ §4.3 INVENTARIO ════════════════════════ */
/* VENTAS_SKU: histórico de uds vendidas por SKU (en vivo: rollup Uds Vendidas) */
const VENTAS_SKU={
  'HEA-ATT-L90-NEG':45,'MOU-HXS-T90-NEG':24,'HEA-ATT-L90-BLA':18,
  'MOU-HXS-T90-BLA':10,'MOU-ATT-X11-NEG':9,'TEC-AJA-NK68-COB':9,
  'STA-HOL-HOLLOWKNIGHT-BLA':8,'HEA-ATT-L80PRO-BLA':7,'TEC-AJA-NK68V2-COB':6,
  'MOU-PAD-90X40-NEG':5,'MOU-ATT-X11-BLA':5,'MOU-ATT-X11-ROJ':4,
  'HEA-ATT-L80PRO-NEG':4,'TEC-AJA-NK61-NEG':4,'TEC-AJA-NK68V2-CON':3,
  'TEC-AJA-NK68-BLA':2,'HEA-RAZ-BARRACUDAX-BLA':2,'MOU-AJA-AJ139-BLA':2,
  'TEC-AJA-NK68-CON':2,'MOU-AJA-AJ179APEX-AZU':2,'TEC-AJA-NK61-GRI':2,
  'MOU-PAD-80X30-NEG':2,'MOU-AJA-AJ139-ROJ':2,'HEA-AJA-AHM09MAX-NEG':1,
  'MOU-HXS-T90PRO-NEG':1,'TEC-AJA-NK61-BLA':1,'TEC-AJA-NK61-AZU':1,
  'MOU-HXS-T90PRO-BLA':1,'MOU-AJA-AJ139-NEG':1,'HEA-ATT-G800-BLA':1,
  'MOU-AJA-AJ179APEX-MAM':1,'HEA-ATT-G800-NEG':1,
};
/* EN_CAMINO: uds en camino por SKU (Entradas Status='En Camino') */
const EN_CAMINO={
  'MOU-HXS-T90-NEG':25,'MOU-HXS-T90-BLA':25,
  'HEA-ATT-G800-NEG':10,'HEA-ATT-G800-BLA':10,
};
/* PRIMERA_VENTA_SKU: fecha primera venta por SKU (en vivo: MIN de Ventas.Fecha)
   Hardcodeado aprox por mes de aparición. Si no hay registro, usa PRIMERA_VENTA. */
const PRIMERA_VENTA_SKU={};

const SK_RAW=[
  {id:'MOU-HXS-T90-NEG',         nm:'T90 Negro',         cat:'Mouse',  mk:'HXSJ',      s:5, pv:1600,cpp:704},
  {id:'MOU-HXS-T90-BLA',         nm:'T90 Blanco',        cat:'Mouse',  mk:'HXSJ',      s:10,pv:1500,cpp:721},
  {id:'MOU-HXS-T90PRO-NEG',      nm:'T90 Pro Negro',      cat:'Mouse',  mk:'HXSJ',      s:8, pv:2000,cpp:847},
  {id:'MOU-HXS-T90PRO-BLA',      nm:'T90 Pro Blanco',     cat:'Mouse',  mk:'HXSJ',      s:9, pv:1800,cpp:847},
  {id:'MOU-HXS-BLANCOPAW-BLA',   nm:'Blanco Paw',        cat:'Mouse',  mk:'HXSJ',      s:1, pv:963, cpp:500},
  {id:'MOU-ATT-X11-BLA',         nm:'X11 Blanco',        cat:'Mouse',  mk:'Att.Shark', s:3, pv:2000,cpp:1388},
  {id:'MOU-ATT-X11-NEG',         nm:'X11 Negro',         cat:'Mouse',  mk:'Att.Shark', s:8, pv:2100,cpp:1308},
  {id:'MOU-ATT-X11-ROJ',         nm:'X11 Rojo',          cat:'Mouse',  mk:'Att.Shark', s:5, pv:2200,cpp:1320},
  {id:'MOU-ATT-V3PRO-ROS',       nm:'V3 Pro Rosa',       cat:'Mouse',  mk:'Att.Shark', s:1, pv:1208,cpp:1208},
  {id:'MOU-AJA-AJ139-ROJ',       nm:'AJ139 Rojo',        cat:'Mouse',  mk:'Ajazz',     s:4, pv:2200,cpp:1303},
  {id:'MOU-AJA-AJ139-BLA',       nm:'AJ139 Blanco',      cat:'Mouse',  mk:'Ajazz',     s:4, pv:2200,cpp:1319},
  {id:'MOU-AJA-AJ139-NEG',       nm:'AJ139 Negro',       cat:'Mouse',  mk:'Ajazz',     s:5, pv:2000,cpp:1613},
  {id:'MOU-AJA-AJ159PRO-NEG',    nm:'AJ159Pro Negro',    cat:'Mouse',  mk:'Ajazz',     s:8, pv:0,   cpp:1603},
  {id:'MOU-AJA-AJ159PRO-BLA',    nm:'AJ159Pro Blanco',   cat:'Mouse',  mk:'Ajazz',     s:7, pv:0,   cpp:1620},
  {id:'MOU-AJA-AJ179APEX-MAM',   nm:'AJ179 Mamei',       cat:'Mouse',  mk:'Ajazz',     s:0, pv:4000,cpp:3350},
  {id:'MOU-AJA-AJ179APEX-AZU',   nm:'AJ179 Azul',        cat:'Mouse',  mk:'Ajazz',     s:0, pv:3300,cpp:3242},
  {id:'MOU-PAD-90X40-NEG',       nm:'Pad 90x40',         cat:'Otro',   mk:'Generic',   s:0, pv:700, cpp:576},
  {id:'MOU-PAD-80X30-NEG',       nm:'Pad 80x30',         cat:'Otro',   mk:'Generic',   s:0, pv:500, cpp:386},
  {id:'TEC-AJA-NK61-NEG',        nm:'NK61 Negro',        cat:'Teclado',mk:'Ajazz',     s:0, pv:2160,cpp:1219},
  {id:'TEC-AJA-NK61-BLA',        nm:'NK61 Blanco',       cat:'Teclado',mk:'Ajazz',     s:0, pv:1684,cpp:1157},
  {id:'TEC-AJA-NK61-AZU',        nm:'NK61 Azul',         cat:'Teclado',mk:'Ajazz',     s:0, pv:1837,cpp:1156},
  {id:'TEC-AJA-NK61-GRI',        nm:'NK61 Gris',         cat:'Teclado',mk:'Ajazz',     s:0, pv:2000,cpp:1217},
  {id:'TEC-AJA-NK68-BLA',        nm:'NK68 Blanco',       cat:'Teclado',mk:'Ajazz',     s:4, pv:2600,cpp:1102},
  {id:'TEC-AJA-NK68-CON',        nm:'NK68 CoN',          cat:'Teclado',mk:'Ajazz',     s:5, pv:1500,cpp:1102},
  {id:'TEC-AJA-NK68-COB',        nm:'NK68 CoB',          cat:'Teclado',mk:'Ajazz',     s:3, pv:2499,cpp:1041},
  {id:'TEC-AJA-NK68V2-COB',      nm:'NK68V2 CoB',        cat:'Teclado',mk:'Ajazz',     s:3, pv:2450,cpp:996},
  {id:'TEC-AJA-NK68V2-CON',      nm:'NK68V2 CoN',        cat:'Teclado',mk:'Ajazz',     s:3, pv:2450,cpp:996},
  {id:'TEC-AJA-NK68V2-GRI',      nm:'NK68V2 Gris',       cat:'Teclado',mk:'Ajazz',     s:4, pv:0,   cpp:996},
  {id:'TEC-AJA-NK68V2-MOR',      nm:'NK68V2 Morado',     cat:'Teclado',mk:'Ajazz',     s:4, pv:0,   cpp:996},
  {id:'TEC-AJA-AK820PRO-GRI',    nm:'AK820Pro Gris',     cat:'Teclado',mk:'Ajazz',     s:0, pv:0,   cpp:0},
  {id:'TEC-AJA-AK650-MOR',       nm:'AK650 Morado',      cat:'Teclado',mk:'Ajazz',     s:0, pv:0,   cpp:0},
  {id:'HEA-ATT-L90-NEG',         nm:'L90 Negro',         cat:'Headset',mk:'Att.Shark', s:7, pv:3000,cpp:1909},
  {id:'HEA-ATT-L90-BLA',         nm:'L90 Blanco',        cat:'Headset',mk:'Att.Shark', s:10,pv:3000,cpp:1909},
  {id:'HEA-ATT-L80PRO-NEG',      nm:'L80Pro Negro',      cat:'Headset',mk:'Att.Shark', s:0, pv:2700,cpp:1576},
  {id:'HEA-ATT-L80PRO-BLA',      nm:'L80Pro Blanco',     cat:'Headset',mk:'Att.Shark', s:0, pv:2750,cpp:1626},
  {id:'HEA-ATT-L60-BLA',         nm:'L60 Blanco',        cat:'Headset',mk:'Att.Shark', s:1, pv:0,   cpp:984},
  {id:'HEA-ATT-G800-NEG',        nm:'G800 Negro',        cat:'Headset',mk:'Att.Shark', s:0, pv:3500,cpp:2063},
  {id:'HEA-ATT-G800-BLA',        nm:'G800 Blanco',       cat:'Headset',mk:'Att.Shark', s:0, pv:3000,cpp:2058},
  {id:'HEA-RAZ-BARRACUDAX-BLA',  nm:'Barracuda X',       cat:'Headset',mk:'Razer',     s:0, pv:4800,cpp:3496},
  {id:'HEA-AJA-AHM09MAX-NEG',    nm:'AHM09 Max',         cat:'Headset',mk:'Ajazz',     s:0, pv:3100,cpp:2182},
  {id:'STA-HOL-HOLLOWKNIGHT-BLA',nm:'Stand Hollowknight',cat:'Otro',   mk:'HK',        s:1, pv:400, cpp:231},
  {id:'STA-PLA-PLAINWHITE-BLA',  nm:'Stand Plain White', cat:'Otro',   mk:'PW',        s:1, pv:0,   cpp:127},
];

/* ════════════════════════ buildSK — Lógica spec §6.1 ════════════════════════
   5 ESTADOS (NO 4 ni 6 — exactamente 5):
     ok           : diasStock > 90
     atencion     : 60 ≤ diasStock ≤ 90
     critico      : diasStock < 60 SIN entrada En Camino
     en_reposicion: diasStock < 60 CON entrada En Camino
     sin_movimiento: 0 ventas históricas
   Solo 'critico' cuenta como crítico (spec §6.1, tabla). */
function buildSK(){
  const hoyDate = new Date(HOY);
  // velocidad usa días desde primera venta GLOBAL si no hay primera venta del SKU
  const diasActivoGlobal = Math.max(1, Math.round((hoyDate - PRIMERA_VENTA)/86400000));

  // Permite que airtable-client.js inyecte SKUs reales sin romper los seeds.
  // Si window.__AIRTABLE_DATA__.skus existe, usar esos; si no, los mocks.
  const base = (typeof window !== 'undefined' && window.__AIRTABLE_DATA__ && window.__AIRTABLE_DATA__.skus)
    ? window.__AIRTABLE_DATA__.skus
    : SK_RAW;

  return base.map(r=>{
    const s = {...r};
    // En modo Supabase, el objeto real (window.__AIRTABLE_DATA__.skus) ya trae
    // enCamino/vendido calculados desde las vistas (vw_stock_sku). Esos valores
    // mandan. Los seeds hardcodeados EN_CAMINO/VENTAS_SKU solo aplican en modo
    // mock (SK_RAW), donde r.enCamino/r.vendido vienen undefined.
    // BUG previo: este const EN_CAMINO (jul-2025) pisaba la data real → SKUs
    // como AK820 (no presentes en el seed) mostraban 0 en camino.
    s.enCamino = (r.enCamino != null) ? r.enCamino : (EN_CAMINO[s.id] || 0);
    s.vendido  = (r.vendido  != null) ? r.vendido  : (VENTAS_SKU[s.id] || 0);
    s.margen   = s.pv>0 ? Math.round((s.pv - s.cpp)/s.pv * 100) : 0;
    s.valorStock = s.s * s.cpp;
    s.valorEnCamino = s.enCamino * s.cpp;

    // Velocidad (uds/día)
    const primeraSKU = PRIMERA_VENTA_SKU[s.id] ? new Date(PRIMERA_VENTA_SKU[s.id]) : PRIMERA_VENTA;
    const diasActivo = Math.max(1, Math.round((hoyDate - primeraSKU)/86400000));
    s.velocidad = s.vendido > 0 ? s.vendido / diasActivo : 0;
    s.vtasMes   = s.velocidad > 0 ? +(s.velocidad * 30).toFixed(1) : 0;

    // Días de stock restante
    s.diasStock = s.velocidad > 0 && s.s > 0 ? Math.round(s.s / s.velocidad) : null;

    // Fecha estimada de agotamiento
    if(s.diasStock !== null){
      const d = new Date(hoyDate);
      d.setDate(d.getDate() + s.diasStock);
      s.agota = d.toLocaleDateString('es-DO',{day:'2-digit',month:'short'});
    } else {
      s.agota = null;
    }

    // ESTADO — basado en días de stock vs LEAD_TIME del proveedor.
    // El ratio es lo que importa: si el stock dura menos que lo que tarda
    // en llegar un nuevo lote, vas a quedarte sin mercancía.
    const ratio = s.diasStock !== null ? s.diasStock / LEAD_TIME : null;
    s.leadTimeDias = LEAD_TIME;
    s.ratioCobertura = ratio;  // 1 = justo cubre · >1 sobra · <1 quiebre

    if(s.activa === false){
      // Producto descontinuado: se mantiene el historial pero NO entra en alertas
      // (crítico/atención/reposición). Se ve en Inventario con badge gris.
      s.estado = 'descontinuado';
      s.notaEstado = 'Descontinuado — fuera de alertas';
    } else if(s.vendido === 0){
      s.estado = 'sin_movimiento';
      s.notaEstado = 'Nunca vendido — no se puede calcular cobertura';
    } else if(s.diasStock === null){
      s.estado = s.enCamino > 0 ? 'en_reposicion' : 'critico';
      s.notaEstado = s.s === 0 ? 'Sin stock · pide YA' : 'Sin datos';
    } else if(s.enCamino > 0 && ratio < 1){
      s.estado = 'en_reposicion';
      s.notaEstado = `En camino · ${s.diasStock}d de stock vs ${LEAD_TIME}d lead — posible quiebre antes de llegar`;
    } else if(s.enCamino > 0){
      s.estado = 'en_reposicion';
      s.notaEstado = `En camino · ${s.diasStock}d de stock · llega a tiempo (${LEAD_TIME}d lead)`;
    } else if(ratio < 1){
      // Stock se acaba antes de que llegue un nuevo lote
      s.estado = 'critico';
      s.notaEstado = `PEDIR YA · ${s.diasStock}d de stock < ${LEAD_TIME}d lead (quiebre garantizado)`;
    } else if(ratio < 1.5){
      // Stock apenas cubre el lead time, sin margen
      s.estado = 'atencion';
      s.notaEstado = `Pedir esta semana · ${s.diasStock}d stock vs ${LEAD_TIME}d lead (${(ratio*100).toFixed(0)}% cobertura)`;
    } else if(ratio < 2.5){
      // Cómodo pero no excesivo
      s.estado = 'ok';
      s.notaEstado = `Stock saludable · ${s.diasStock}d (cobertura ${ratio.toFixed(1)}x lead time)`;
    } else {
      // Mucho stock — posible exceso
      s.estado = 'ok';
      s.notaEstado = `Stock alto · ${s.diasStock}d (cobertura ${ratio.toFixed(1)}x · posible exceso)`;
    }

    return s;
  });
}

/* ════════════════════════ §4.4 CASH FLOW ════════════════════════
   CF_ALL: 361 movimientos (orden desc por fecha). Inyectado abajo.
   CF_MES:  totales mensuales computados desde CF_ALL. */
/* === CF_ALL: 361 movements (orden desc por fecha) === */
const CF_ALL=[
  {f:'2026-05-31',c:'Intereses',a:'BHD',e:19.37,s:1.94},
  {f:'2026-05-20',c:'Pago Envio',a:'Facebook',e:0,s:218.32},
  {f:'2026-05-20',c:'Venta de mercancia',a:'Facebook',e:3650,s:0},
  {f:'2026-05-19',c:'Pago Prestamo',a:'Cooperativa',e:0,s:4006},
  {f:'2026-05-19',c:'Pago Envio',a:'Facebook',e:0,s:420.63},
  {f:'2026-05-19',c:'Venta de mercancia',a:'Facebook',e:2800,s:0},
  {f:'2026-05-19',c:'Pago Envio',a:'Facebook',e:0,s:200},
  {f:'2026-05-19',c:'Venta de mercancia',a:'Facebook',e:1500,s:0},
  {f:'2026-05-17',c:'Compra de mercancia',a:'Alibaba',e:0,s:101259.13},
  {f:'2026-05-17',c:'Otro',a:'Linea de Credito BHD',e:68660.2,s:0},
  {f:'2026-05-16',c:'Venta de mercancia',a:'Facebook',e:600,s:0},
  {f:'2026-05-13',c:'Venta de mercancia',a:'Facebook',e:4600,s:0},
  {f:'2026-05-12',c:'Venta de mercancia',a:'Facebook',e:1600,s:0},
  {f:'2026-05-11',c:'Pago Envio',a:'Facebook',e:0,s:250},
  {f:'2026-05-11',c:'Venta de mercancia',a:'Facebook',e:1800,s:0},
  {f:'2026-05-10',c:'Pago Envio',a:'Facebook',e:0,s:50.07},
  {f:'2026-05-10',c:'Venta de mercancia',a:'Facebook',e:2300,s:0},
  {f:'2026-05-09',c:'Pago Envio',a:'Facebook',e:0,s:250},
  {f:'2026-05-09',c:'Venta de mercancia',a:'Facebook',e:2650,s:0},
  {f:'2026-05-09',c:'Venta de mercancia',a:'Facebook',e:700,s:0},
  {f:'2026-05-08',c:'Pago Envio',a:'Facebook',e:0,s:200},
  {f:'2026-05-08',c:'Venta de mercancia',a:'Facebook',e:3200,s:0},
  {f:'2026-05-08',c:'Pago Envio',a:'Facebook',e:0,s:400},
  {f:'2026-05-08',c:'Venta de mercancia',a:'Facebook',e:1700,s:0},
  {f:'2026-05-07',c:'Venta de mercancia',a:'Facebook',e:1800,s:0},
  {f:'2026-05-07',c:'Pago Envio',a:'Alibaba',e:0,s:2659.2},
  {f:'2026-05-07',c:'Pago Envio',a:'Alibaba',e:0,s:4843.53},
  {f:'2026-05-07',c:'Compra de mercancia',a:'Alibaba',e:0,s:24396.61},
  {f:'2026-05-06',c:'Pago Envio',a:'Facebook',e:0,s:500},
  {f:'2026-05-06',c:'Venta de mercancia',a:'Facebook',e:3500,s:0},
  {f:'2026-05-06',c:'Venta de mercancia',a:'Facebook',e:4000,s:0},
  {f:'2026-05-05',c:'Venta de mercancia',a:'Facebook',e:2500,s:0},
  {f:'2026-05-05',c:'Pago Envio',a:'Facebook',e:0,s:140},
  {f:'2026-05-05',c:'Venta de mercancia',a:'Facebook',e:2850,s:0},
  {f:'2026-05-05',c:'Pago Envio',a:'Facebook',e:0,s:600.9},
  {f:'2026-05-05',c:'Venta de mercancia',a:'Facebook',e:3100,s:0},
  {f:'2026-05-04',c:'Pago deuda',a:'Teo',e:0,s:100},
  {f:'2026-05-04',c:'Venta de mercancia',a:'Facebook',e:2700,s:0},
  {f:'2026-05-04',c:'Venta de mercancia',a:'Facebook',e:3000,s:0},
  {f:'2026-05-03',c:'Venta de mercancia',a:'Facebook',e:2100,s:0},
  {f:'2026-05-02',c:'Venta de mercancia',a:'Facebook',e:2500,s:0},
  {f:'2026-05-02',c:'Pago Envio',a:'Facebook',e:0,s:250},
  {f:'2026-05-02',c:'Venta de mercancia',a:'Facebook',e:2700,s:0},
  {f:'2026-05-01',c:'Venta de mercancia',a:'Facebook',e:1600,s:0},
  {f:'2026-05-01',c:'Venta de mercancia',a:'Facebook',e:1900,s:0},
  {f:'2026-05-01',c:'Pago a Inversores',a:'Andrea Correa',e:0,s:1001.5},
  {f:'2026-05-01',c:'Pago Envio',a:'Facebook',e:0,s:250},
  {f:'2026-05-01',c:'Venta de mercancia',a:'Facebook',e:1850,s:0},
  {f:'2026-05-01',c:'Aportes para negocio',a:'Inicio de operaciones',e:40077.92,s:0},
  {f:'2026-04-30',c:'Pago Envio',a:'Facebook',e:0,s:306.01},
  {f:'2026-04-30',c:'Venta de mercancia',a:'Facebook',e:2700,s:0},
  {f:'2026-04-30',c:'Venta de mercancia',a:'Facebook',e:2100,s:0},
  {f:'2026-04-30',c:'Intereses',a:'BHD',e:62.19,s:6.22},
  {f:'2026-04-29',c:'Compra de mercancia',a:'Alibaba',e:0,s:26219.09},
  {f:'2026-04-29',c:'Venta de mercancia',a:'Facebook',e:2000,s:0},
  {f:'2026-04-29',c:'Pago Envio',a:'Facebook',e:0,s:300},
  {f:'2026-04-29',c:'Venta de mercancia',a:'Facebook',e:1900,s:0},
  {f:'2026-04-27',c:'Pago Envio',a:'Facebook',e:0,s:350},
  {f:'2026-04-27',c:'Venta de mercancia',a:'Facebook',e:3850,s:0},
  {f:'2026-04-25',c:'Pago Envio',a:'Facebook',e:0,s:5.08},
  {f:'2026-04-25',c:'Venta de mercancia',a:'Facebook',e:2450,s:0},
  {f:'2026-04-23',c:'Pago Comision',a:'Teo',e:0,s:448.67},
  {f:'2026-04-23',c:'Envio Mercancia',a:'Courrier',e:0,s:4500},
  {f:'2026-04-23',c:'Pago Envio',a:'Sin cuenta - revisar',e:0,s:250},
  {f:'2026-04-23',c:'Pago Envio',a:'Facebook',e:0,s:152.22},
  {f:'2026-04-23',c:'Venta de mercancia',a:'Facebook',e:2500,s:0},
  {f:'2026-04-19',c:'Venta de mercancia',a:'Facebook',e:2000,s:0},
  {f:'2026-04-19',c:'Venta de mercancia',a:'Facebook',e:1800,s:0},
  {f:'2026-04-18',c:'Pago Prestamo',a:'Cooperativa',e:0,s:4006},
  {f:'2026-04-18',c:'Pago Comision',a:'Teo',e:0,s:400.6},
  {f:'2026-04-15',c:'Pago Envio',a:'Facebook',e:0,s:200},
  {f:'2026-04-15',c:'Venta de mercancia',a:'Facebook',e:2900,s:0},
  {f:'2026-04-15',c:'Pago Envio',a:'Facebook',e:0,s:250},
  {f:'2026-04-15',c:'Venta de mercancia',a:'Facebook',e:3000,s:0},
  {f:'2026-04-14',c:'Venta de mercancia',a:'Facebook',e:2650,s:0},
  {f:'2026-04-13',c:'Venta de mercancia',a:'Facebook',e:6000,s:0},
  {f:'2026-04-13',c:'Pago Envio',a:'Facebook',e:0,s:450},
  {f:'2026-04-13',c:'Venta de mercancia',a:'Facebook',e:2350,s:0},
  {f:'2026-04-12',c:'Venta de mercancia',a:'',e:1050.66,s:0},
  {f:'2026-04-12',c:'Pago Envio',a:'Facebook',e:0,s:520.93},
  {f:'2026-04-12',c:'Venta de mercancia',a:'Facebook',e:1650,s:0},
  {f:'2026-04-11',c:'Envio Mercancia',a:'Courrier',e:0,s:22746.06},
  {f:'2026-04-06',c:'Venta de mercancia',a:'Facebook',e:1400,s:0},
  {f:'2026-04-06',c:'Venta de mercancia',a:'Facebook',e:2600,s:0},
  {f:'2026-04-06',c:'Venta de mercancia',a:'Facebook',e:400,s:0},
  {f:'2026-04-03',c:'Venta de mercancia',a:'Facebook',e:3300,s:0},
  {f:'2026-04-03',c:'Pago Envio',a:'Facebook',e:0,s:117.17},
  {f:'2026-04-03',c:'Venta de mercancia',a:'Facebook',e:2117.17,s:0},
  {f:'2026-04-02',c:'Pago Envio',a:'Facebook',e:0,s:300},
  {f:'2026-04-02',c:'Venta de mercancia',a:'Facebook',e:2500,s:0},
  {f:'2026-04-02',c:'Pago a Inversores',a:'Andrea Correa',e:0,s:1001.5},
  {f:'2026-04-01',c:'Pago Envio',a:'Facebook',e:0,s:250},
  {f:'2026-04-01',c:'Venta de mercancia',a:'Facebook',e:3350,s:0},
  {f:'2026-04-01',c:'Aportes para negocio',a:'Inicio de operaciones',e:46227.45,s:0},
  {f:'2026-03-31',c:'Venta de mercancia',a:'Ramon',e:3700,s:0},
  {f:'2026-03-31',c:'Otro',a:'Sin cuenta - revisar',e:0,s:243.15},
  {f:'2026-03-31',c:'Venta de mercancia',a:'Alexander',e:700,s:0},
  {f:'2026-03-31',c:'Otro',a:'Sin categoria - revisar',e:0,s:19028.5},
  {f:'2026-03-30',c:'Pago Envio',a:'Facebook',e:0,s:200},
  {f:'2026-03-30',c:'Venta de mercancia',a:'Facebook',e:2000,s:0},
  {f:'2026-03-30',c:'Pago Envio',a:'Facebook',e:0,s:221.24},
  {f:'2026-03-30',c:'Venta de mercancia',a:'Facebook',e:2450,s:0},
  {f:'2026-03-29',c:'Venta de mercancia',a:'Facebook',e:1500,s:0},
  {f:'2026-03-28',c:'Pago Envio',a:'Facebook',e:0,s:330.49},
  {f:'2026-03-28',c:'Venta de mercancia',a:'Facebook',e:2400,s:0},
  {f:'2026-03-24',c:'Pago Envio',a:'Alibaba',e:0,s:4700},
  {f:'2026-03-23',c:'Compra de mercancia',a:'Alibaba',e:0,s:35222},
  {f:'2026-03-23',c:'Pago Envio',a:'Facebook',e:0,s:190},
  {f:'2026-03-23',c:'Venta de mercancia',a:'Facebook',e:1800,s:0},
  {f:'2026-03-20',c:'Pago Prestamo',a:'Cooperativa',e:16.69,s:3573.99},
  {f:'2026-03-17',c:'Pago Envio',a:'Facebook',e:0,s:300},
  {f:'2026-03-17',c:'Venta de mercancia',a:'Facebook',e:2450,s:0},
  {f:'2026-03-17',c:'Pago Envio',a:'Facebook',e:0,s:264},
  {f:'2026-03-17',c:'Venta de mercancia',a:'Facebook',e:2500,s:0},
  {f:'2026-03-16',c:'Pago Envio',a:'Facebook',e:0,s:162.24},
  {f:'2026-03-16',c:'Venta de mercancia',a:'Facebook',e:2380,s:0},
  {f:'2026-03-12',c:'Cuentas por pagar',a:'Qik',e:0,s:160.24},
  {f:'2026-03-12',c:'Cuentas por pagar',a:'Scotiabanck',e:0,s:371.55},
  {f:'2026-03-12',c:'Venta de mercancia',a:'Facebook',e:3000,s:0},
  {f:'2026-03-10',c:'Pago Envio',a:'Alibaba',e:0,s:11124.66},
  {f:'2026-03-09',c:'Compra de mercancia',a:'Alibaba',e:0,s:20094.52},
  {f:'2026-03-09',c:'Compra de mercancia',a:'Alibaba',e:0,s:26067.91},
  {f:'2026-03-06',c:'Compra de mercancia',a:'Alibaba',e:0,s:22713.79},
  {f:'2026-03-05',c:'Venta de mercancia',a:'Facebook',e:1900,s:0},
  {f:'2026-03-04',c:'Venta de mercancia',a:'Facebook',e:2400,s:0},
  {f:'2026-03-01',c:'Intereses',a:'BHD',e:68.31,s:6.83},
  {f:'2026-03-01',c:'Pago a Inversores',a:'Andrea Correa',e:0,s:2003},
  {f:'2026-03-01',c:'Venta de mercancia',a:'Facebook',e:1300,s:0},
  {f:'2026-03-01',c:'Aportes para negocio',a:'Inicio de operaciones',e:162640.56,s:0},
  {f:'2026-02-28',c:'Otro',a:'Descuadre',e:2.43,s:0},
  {f:'2026-02-28',c:'Otro',a:'Descuadre',e:40,s:0.16},
  {f:'2026-02-28',c:'Intereses',a:'BHD',e:33.93,s:3.39},
  {f:'2026-02-26',c:'Venta de mercancia',a:'Facebook',e:4900,s:0},
  {f:'2026-02-25',c:'Venta de mercancia',a:'',e:11200,s:0},
  {f:'2026-02-23',c:'Venta de mercancia',a:'',e:4200,s:0},
  {f:'2026-02-19',c:'Pago Envio',a:'Facebook',e:0,s:130.26},
  {f:'2026-02-19',c:'Venta de mercancia',a:'Facebook',e:800,s:0},
  {f:'2026-02-19',c:'Pago Envio',a:'Facebook',e:0,s:289.49},
  {f:'2026-02-19',c:'Venta de mercancia',a:'Facebook',e:1800,s:0},
  {f:'2026-02-18',c:'Otro',a:'Refund Temu 2K CC Scotia',e:0,s:0},
  {f:'2026-02-17',c:'Compra de mercancia',a:'Alibaba',e:0,s:30865.61},
  {f:'2026-02-15',c:'Cuentas por pagar',a:'Scotiabanck',e:0,s:589.88},
  {f:'2026-02-15',c:'Cuentas por pagar',a:'Qik',e:0,s:1206.8},
  {f:'2026-02-15',c:'Venta de mercancia',a:'Facebook',e:2500,s:0},
  {f:'2026-02-15',c:'Venta de mercancia',a:'Facebook',e:1700,s:0},
  {f:'2026-02-14',c:'Aportes para negocio',a:'Cooperativa',e:100000,s:0},
  {f:'2026-02-09',c:'Venta de mercancia',a:'Facebook',e:7100,s:0},
  {f:'2026-02-09',c:'Venta de mercancia',a:'Facebook',e:2500,s:0},
  {f:'2026-02-07',c:'Pago Envio',a:'Facebook',e:0,s:200},
  {f:'2026-02-07',c:'Venta de mercancia',a:'Facebook',e:1600,s:0},
  {f:'2026-02-06',c:'Venta de mercancia',a:'Facebook',e:2200,s:0},
  {f:'2026-02-05',c:'Pago a Inversores',a:'Andrea Correa',e:0,s:1000},
  {f:'2026-02-05',c:'Courier',a:'Courier',e:0,s:1892.83},
  {f:'2026-02-05',c:'Otro',a:'Estado de cuenta',e:0,s:100},
  {f:'2026-02-04',c:'Venta de mercancia',a:'Facebook',e:2500,s:0},
  {f:'2026-02-03',c:'Cuentas por pagar',a:'Scotiabanck',e:0,s:27040.5},
  {f:'2026-02-03',c:'Cuentas por pagar',a:'Qik',e:0,s:561.84},
  {f:'2026-02-03',c:'Venta de mercancia',a:'Facebook',e:5100,s:0},
  {f:'2026-02-01',c:'Aportes para negocio',a:'Inicio de operaciones',e:78344.96,s:0},
  {f:'2026-01-31',c:'Venta de mercancia',a:'Facebook',e:2500,s:0},
  {f:'2026-01-31',c:'Intereses',a:'BHD',e:20.55,s:2.06},
  {f:'2026-01-21',c:'Venta de mercancia',a:'Facebook',e:5500,s:0},
  {f:'2026-01-20',c:'Venta de mercancia',a:'Facebook',e:2850,s:0},
  {f:'2026-01-17',c:'Compra de mercancia',a:'Alibaba',e:0,s:11100},
  {f:'2026-01-16',c:'Cuentas por pagar',a:'BHD',e:0,s:80},
  {f:'2026-01-16',c:'Cuentas por pagar',a:'Qik',e:0,s:220},
  {f:'2026-01-16',c:'Cuentas por pagar',a:'Scotiabanck',e:0,s:1030},
  {f:'2026-01-16',c:'Pago ADS',a:'Facebook',e:0,s:750},
  {f:'2026-01-15',c:'Venta de mercancia',a:'Facebook',e:700,s:0},
  {f:'2026-01-14',c:'Venta de mercancia',a:'Facebook',e:850,s:0},
  {f:'2026-01-14',c:'Venta de mercancia',a:'Facebook',e:1300,s:0},
  {f:'2026-01-12',c:'Venta de mercancia',a:'Facebook',e:3050,s:0},
  {f:'2026-01-12',c:'Venta de mercancia',a:'Facebook',e:1050,s:0},
  {f:'2026-01-11',c:'Cuentas por pagar',a:'',e:0,s:29.5},
  {f:'2026-01-11',c:'Cuentas por pagar',a:'',e:0,s:19669.81},
  {f:'2026-01-11',c:'Venta de mercancia',a:'Facebook',e:2000,s:0},
  {f:'2026-01-11',c:'Venta de mercancia',a:'Facebook',e:2500,s:0},
  {f:'2026-01-05',c:'Venta de mercancia',a:'Facebook',e:3500,s:0},
  {f:'2026-01-03',c:'Venta de mercancia',a:'Facebook',e:1200,s:0},
  {f:'2026-01-01',c:'Aportes para negocio',a:'Inicio de operaciones',e:84205.78,s:0},
  {f:'2025-12-30',c:'Pago Envio',a:'Facebook',e:0,s:200.3},
  {f:'2025-12-30',c:'Venta de mercancia',a:'Facebook',e:4700,s:0},
  {f:'2025-12-27',c:'Venta de mercancia',a:'Facebook',e:1500,s:0},
  {f:'2025-12-25',c:'Otro',a:'Fee CC',e:0,s:12.46},
  {f:'2025-12-25',c:'Pago Envio',a:'Facebook',e:0,s:299.55},
  {f:'2025-12-25',c:'Venta de mercancia',a:'Facebook',e:1300,s:0},
  {f:'2025-12-25',c:'Venta de mercancia',a:'Facebook',e:2800,s:0},
  {f:'2025-12-25',c:'Venta de mercancia',a:'Facebook',e:1000,s:0},
  {f:'2025-12-23',c:'Pago Envio',a:'Facebook',e:0,s:400},
  {f:'2025-12-23',c:'Venta de mercancia',a:'Facebook',e:2500,s:0},
  {f:'2025-12-22',c:'Otro',a:'Devuelta',e:100,s:0},
  {f:'2025-12-22',c:'Pago Envio',a:'Facebook',e:0,s:300},
  {f:'2025-12-22',c:'Venta de mercancia',a:'Facebook',e:3400,s:0},
  {f:'2025-12-21',c:'Compra de mercancia',a:'Temu',e:0,s:463},
  {f:'2025-12-21',c:'Compra de mercancia',a:'Temu',e:0,s:2898},
  {f:'2025-12-21',c:'Compra de mercancia',a:'Temu',e:0,s:1039},
  {f:'2025-12-21',c:'Compra de mercancia',a:'Temu',e:0,s:3244},
  {f:'2025-12-20',c:'Pago Envio',a:'Facebook',e:0,s:369.42},
  {f:'2025-12-20',c:'Venta de mercancia',a:'Facebook',e:1700,s:0},
  {f:'2025-12-18',c:'Venta de mercancia',a:'Facebook',e:2300,s:0},
  {f:'2025-12-18',c:'Venta de mercancia',a:'Facebook',e:2600,s:0},
  {f:'2025-12-18',c:'Pago Envio',a:'Facebook',e:0,s:250},
  {f:'2025-12-18',c:'Venta de mercancia',a:'Facebook',e:2750,s:0},
  {f:'2025-12-18',c:'Pago Envio',a:'Facebook',e:0,s:250},
  {f:'2025-12-18',c:'Venta de mercancia',a:'Facebook',e:1800,s:0},
  {f:'2025-12-18',c:'Pago Envio',a:'Facebook',e:0,s:250},
  {f:'2025-12-18',c:'Venta de mercancia',a:'Facebook',e:2600,s:0},
  {f:'2025-12-18',c:'Pago Envio',a:'Facebook',e:0,s:400},
  {f:'2025-12-18',c:'Venta de mercancia',a:'Facebook',e:3000,s:0},
  {f:'2025-12-18',c:'Pago Envio',a:'Facebook',e:0,s:400},
  {f:'2025-12-18',c:'Venta de mercancia',a:'Facebook',e:2800,s:0},
  {f:'2025-12-16',c:'Otro',a:'Descuadre',e:0,s:600},
  {f:'2025-12-16',c:'Otro',a:'Pago CC Fee CC',e:0,s:2.17},
  {f:'2025-12-16',c:'Pago Envio',a:'Facebook',e:0,s:435.96},
  {f:'2025-12-16',c:'Venta de mercancia',a:'Facebook',e:1800,s:0},
  {f:'2025-12-15',c:'Pago Envio',a:'Facebook',e:0,s:59.02},
  {f:'2025-12-15',c:'Venta de mercancia',a:'Facebook',e:1900,s:0},
  {f:'2025-12-15',c:'Pago Envio',a:'Facebook',e:0,s:733.63},
  {f:'2025-12-15',c:'Venta de mercancia',a:'Facebook',e:3050,s:0},
  {f:'2025-12-14',c:'Pago Envio',a:'Facebook',e:0,s:250},
  {f:'2025-12-14',c:'Venta de mercancia',a:'Facebook',e:1500,s:0},
  {f:'2025-12-13',c:'Pago Envio',a:'Facebook',e:0,s:219.12},
  {f:'2025-12-13',c:'Venta de mercancia',a:'Facebook',e:1750,s:0},
  {f:'2025-12-12',c:'Pago Envio',a:'Facebook',e:0,s:200},
  {f:'2025-12-12',c:'Venta de mercancia',a:'Facebook',e:2500,s:0},
  {f:'2025-12-12',c:'Pago Envio',a:'Facebook',e:0,s:150},
  {f:'2025-12-12',c:'Venta de mercancia',a:'Facebook',e:1750,s:0},
  {f:'2025-12-12',c:'Pago Envio',a:'Facebook',e:0,s:200},
  {f:'2025-12-12',c:'Venta de mercancia',a:'Facebook',e:1500,s:0},
  {f:'2025-12-11',c:'Venta de mercancia',a:'Facebook',e:2000,s:0},
  {f:'2025-12-10',c:'Pago Envio',a:'Facebook',e:0,s:117.39},
  {f:'2025-12-10',c:'Venta de mercancia',a:'Facebook',e:2800,s:0},
  {f:'2025-12-08',c:'Venta de mercancia',a:'Facebook',e:3100,s:0},
  {f:'2025-12-08',c:'Venta de mercancia',a:'Facebook',e:3000,s:0},
  {f:'2025-12-01',c:'Aportes para negocio',a:'Inicio de mes',e:33448.8,s:0},
  {f:'2025-11-30',c:'Intereses',a:'BHD',e:1.26,s:0},
  {f:'2025-11-30',c:'Intereses',a:'BHD',e:12.63,s:0},
  {f:'2025-11-30',c:'Otro',a:'Fee Pago CC',e:0,s:0.46},
  {f:'2025-11-30',c:'Pago Envio',a:'Facebook',e:0,s:183.57},
  {f:'2025-11-30',c:'Venta de mercancia',a:'Facebook',e:2250,s:0},
  {f:'2025-11-28',c:'Pago Envio',a:'Facebook',e:0,s:125.46},
  {f:'2025-11-28',c:'Venta de mercancia',a:'Facebook',e:1350,s:0},
  {f:'2025-11-25',c:'Venta de mercancia',a:'Facebook',e:2500,s:0},
  {f:'2025-11-23',c:'Venta de mercancia',a:'Venta',e:2515,s:0},
  {f:'2025-11-23',c:'Pago Envio',a:'Facebook',e:0,s:284.67},
  {f:'2025-11-23',c:'Pago Envio',a:'Facebook',e:0,s:125.41},
  {f:'2025-11-23',c:'Venta de mercancia',a:'Facebook',e:1800,s:0},
  {f:'2025-11-23',c:'Otro',a:'Correcion Temu',e:364.15,s:0},
  {f:'2025-11-20',c:'Venta de mercancia',a:'Venta',e:1800,s:0},
  {f:'2025-11-18',c:'Pago Envio',a:'Facebook',e:0,s:309.26},
  {f:'2025-11-18',c:'Venta de mercancia',a:'Facebook',e:2800,s:0},
  {f:'2025-11-17',c:'Otro',a:'Fee Pago CC',e:0,s:0.27},
  {f:'2025-11-17',c:'Pago Envio',a:'Envio Venta',e:0,s:209.69},
  {f:'2025-11-17',c:'Venta de mercancia',a:'Venta',e:2600,s:0},
  {f:'2025-11-16',c:'Otro',a:'Fee Pago CC',e:0,s:23.59},
  {f:'2025-11-16',c:'Venta de mercancia',a:'Venta',e:4600,s:0},
  {f:'2025-11-15',c:'Compra de mercancia',a:'Compra',e:0,s:3673},
  {f:'2025-11-15',c:'Compra de mercancia',a:'Compra',e:0,s:4345},
  {f:'2025-11-15',c:'Compra de mercancia',a:'Compra',e:0,s:7715},
  {f:'2025-11-14',c:'Otro',a:'Fee Pago CC',e:0,s:18.46},
  {f:'2025-11-14',c:'Venta de mercancia',a:'Facebook',e:2200,s:0},
  {f:'2025-11-12',c:'Compra de mercancia',a:'Temu',e:0,s:6690},
  {f:'2025-11-12',c:'Compra de mercancia',a:'Temu',e:0,s:5618},
  {f:'2025-11-10',c:'Compra de mercancia',a:'Temu',e:0,s:15557.3},
  {f:'2025-11-09',c:'Otro',a:'Fee Pago CC',e:0,s:25.41},
  {f:'2025-11-09',c:'Compra de mercancia',a:'Temu',e:0,s:9364},
  {f:'2025-11-08',c:'Compra de mercancia',a:'Temu',e:0,s:3547},
  {f:'2025-11-08',c:'Compra de mercancia',a:'Temu',e:0,s:4131},
  {f:'2025-11-08',c:'Compra de mercancia',a:'Temu',e:0,s:2737.09},
  {f:'2025-11-07',c:'Venta de mercancia',a:'Facebook',e:2500,s:0},
  {f:'2025-11-06',c:'Pago Envio',a:'Facebook',e:0,s:219.22},
  {f:'2025-11-06',c:'Venta de mercancia',a:'Facebook',e:2500,s:0},
  {f:'2025-11-05',c:'Otro',a:'Fee Pago CC',e:0,s:0.42},
  {f:'2025-11-05',c:'Venta de mercancia',a:'Facebook',e:2700,s:0},
  {f:'2025-11-05',c:'Pago Envio',a:'Facebook',e:0,s:177.33},
  {f:'2025-11-05',c:'Venta de mercancia',a:'Facebook',e:2700,s:0},
  {f:'2025-11-05',c:'Pago Envio',a:'Facebook',e:0,s:107.02},
  {f:'2025-11-05',c:'Venta de mercancia',a:'Facebook',e:2400,s:0},
  {f:'2025-11-04',c:'Venta de mercancia',a:'Venta',e:4000,s:0},
  {f:'2025-11-01',c:'Compra de mercancia',a:'Temu',e:0,s:1811.71},
  {f:'2025-11-01',c:'Intereses',a:'BHD',e:1.77,s:0},
  {f:'2025-11-01',c:'Intereses',a:'BHD',e:17.7,s:0},
  {f:'2025-11-01',c:'Aportes para negocio',a:'Inicio de mes',e:59569.99,s:0},
  {f:'2025-10-22',c:'Pago Envio',a:'Facebook',e:0,s:374.32},
  {f:'2025-10-22',c:'Venta de mercancia',a:'Facebook',e:2500,s:0},
  {f:'2025-10-20',c:'Venta de mercancia',a:'Facebook',e:2150,s:0},
  {f:'2025-10-17',c:'Venta de mercancia',a:'Facebook',e:2300,s:0},
  {f:'2025-10-16',c:'Venta de mercancia',a:'Facebook',e:1000,s:0},
  {f:'2025-10-14',c:'Pago Envio',a:'Facebook',e:0,s:150},
  {f:'2025-10-14',c:'Venta de mercancia',a:'Facebook',e:850,s:0},
  {f:'2025-10-11',c:'Venta de mercancia',a:'Facebook',e:2200,s:0},
  {f:'2025-10-11',c:'Venta de mercancia',a:'Facebook',e:900,s:0},
  {f:'2025-10-10',c:'Pago Envio',a:'Facebook',e:0,s:550.59},
  {f:'2025-10-10',c:'Venta de mercancia',a:'Facebook',e:4700,s:0},
  {f:'2025-10-08',c:'Venta de mercancia',a:'Facebook',e:900,s:0},
  {f:'2025-10-07',c:'Venta de mercancia',a:'Facebook',e:4000,s:0},
  {f:'2025-10-07',c:'Pago Envio',a:'Facebook',e:0,s:150},
  {f:'2025-10-07',c:'Venta de mercancia',a:'Facebook',e:1100,s:0},
  {f:'2025-10-07',c:'Pago Envio',a:'Facebook',e:0,s:350},
  {f:'2025-10-07',c:'Venta de mercancia',a:'Facebook',e:3850,s:0},
  {f:'2025-10-06',c:'Otro',a:'Balance',e:1805.8,s:0},
  {f:'2025-10-02',c:'Venta de mercancia',a:'Facebook',e:1100,s:0},
  {f:'2025-10-01',c:'Pago Envio',a:'Facebook',e:0,s:800},
  {f:'2025-10-01',c:'Venta de mercancia',a:'Facebook',e:5000,s:0},
  {f:'2025-10-01',c:'Aportes para negocio',a:'Inicio de mes',e:27589.1,s:0},
  {f:'2025-09-30',c:'Venta de mercancia',a:'Facebook',e:2750,s:0},
  {f:'2025-09-30',c:'Pago Envio',a:'Envio Venta',e:0,s:205.92},
  {f:'2025-09-30',c:'Venta de mercancia',a:'Venta',e:1800,s:0},
  {f:'2025-09-28',c:'Compra de mercancia',a:'Temu',e:0,s:5608.25},
  {f:'2025-09-28',c:'Compra de mercancia',a:'Temu',e:0,s:10115},
  {f:'2025-09-27',c:'Pago Envio',a:'Facebook',e:0,s:288.64},
  {f:'2025-09-27',c:'Venta de mercancia',a:'Facebook',e:1600,s:0},
  {f:'2025-09-21',c:'Venta de mercancia',a:'Facebook',e:1800,s:0},
  {f:'2025-09-11',c:'Compra de mercancia',a:'Temu',e:0,s:2965},
  {f:'2025-09-10',c:'Venta de mercancia',a:'Facebook',e:3000,s:0},
  {f:'2025-09-06',c:'Venta de mercancia',a:'Venta',e:1300,s:0},
  {f:'2025-09-06',c:'Compra de mercancia',a:'Temu',e:0,s:5807},
  {f:'2025-09-01',c:'Compra de mercancia',a:'Temu',e:0,s:11953},
  {f:'2025-09-01',c:'Aportes para negocio',a:'Inicio de mes',e:54081.91,s:0},
  {f:'2025-08-30',c:'Venta de mercancia',a:'Venta',e:1250,s:0},
  {f:'2025-08-29',c:'Venta de mercancia',a:'Venta',e:1500,s:0},
  {f:'2025-08-26',c:'Pago Envio',a:'Facebook',e:0,s:374.39},
  {f:'2025-08-26',c:'Venta de mercancia',a:'Facebook',e:2850,s:0},
  {f:'2025-08-24',c:'Venta de mercancia',a:'Facebook',e:800,s:0},
  {f:'2025-08-22',c:'Venta de mercancia',a:'Facebook',e:4000,s:0},
  {f:'2025-08-20',c:'Pago Envio',a:'Facebook',e:0,s:250},
  {f:'2025-08-20',c:'Venta de mercancia',a:'Facebook',e:2550,s:0},
  {f:'2025-08-20',c:'Venta de mercancia',a:'Facebook',e:3000,s:0},
  {f:'2025-08-15',c:'Venta de mercancia',a:'Venta',e:1001,s:0},
  {f:'2025-08-15',c:'Venta de mercancia',a:'Facebook',e:750,s:0},
  {f:'2025-08-15',c:'Venta de mercancia',a:'Venta',e:1200,s:0},
  {f:'2025-08-15',c:'Pago Envio',a:'Facebook',e:0,s:240.75},
  {f:'2025-08-15',c:'Venta de mercancia',a:'Facebook',e:1100,s:0},
  {f:'2025-08-14',c:'Otro',a:'Pago por credito',e:0,s:401.49},
  {f:'2025-08-10',c:'Otro',a:'Pago por credito',e:800,s:0},
  {f:'2025-08-10',c:'Pago Envio',a:'Envio Venta',e:0,s:151.14},
  {f:'2025-08-10',c:'Venta de mercancia',a:'Facebook',e:700,s:0},
  {f:'2025-08-09',c:'Otro',a:'De donde salio esto?',e:0,s:189.31},
  {f:'2025-08-08',c:'Venta de mercancia',a:'Venta',e:2250,s:0},
  {f:'2025-08-08',c:'Pago ADS',a:'Facebook',e:0,s:189.39},
  {f:'2025-08-07',c:'Pago ADS',a:'Facebook',e:0,s:190.16},
  {f:'2025-08-07',c:'Aportes para negocio',a:'Aporte',e:1000,s:0},
  {f:'2025-08-06',c:'Pago ADS',a:'Facebook',e:0,s:126.04},
  {f:'2025-08-05',c:'Venta de mercancia',a:'Facebook',e:1000,s:0},
  {f:'2025-08-01',c:'Aportes para negocio',a:'Inicio de mes',e:32043.58,s:0},
  {f:'2025-07-31',c:'Intereses',a:'BHD',e:3.29,s:0},
  {f:'2025-07-31',c:'Compra de mercancia',a:'Temu',e:0,s:6200},
  {f:'2025-07-31',c:'Compra de mercancia',a:'Temu',e:0,s:2397},
  {f:'2025-07-31',c:'Otro',a:'De donde salio esto?',e:213.02,s:0},
  {f:'2025-07-30',c:'Compra de mercancia',a:'Temu',e:0,s:4739},
  {f:'2025-07-30',c:'Compra de mercancia',a:'Temu',e:0,s:1225},
  {f:'2025-07-28',c:'Venta de mercancia',a:'Facebook',e:1200,s:0},
  {f:'2025-07-28',c:'Otro',a:'Acarreo',e:0,s:475.28},
  {f:'2025-07-27',c:'Pago ADS',a:'Facebook',e:0,s:125.46},
  {f:'2025-07-23',c:'Compra de mercancia',a:'Temu',e:0,s:8127},
  {f:'2025-07-21',c:'Compra de mercancia',a:'Temu',e:0,s:3604},
  {f:'2025-07-20',c:'Aportes para negocio',a:'Aporte',e:50000,s:0},
  {f:'2025-07-18',c:'Aportes para negocio',a:'Aporte',e:4700.03,s:0},
  {f:'2025-07-15',c:'Compra de mercancia',a:'Amazon',e:0,s:1297.01},
  {f:'2025-07-12',c:'Compra de mercancia',a:'Temu',e:0,s:7745},
  {f:'2025-07-12',c:'Aportes para negocio',a:'Inicio de operaciones',e:11861.99,s:0},
];

/* === CF_MES: totales por mes (orden cronológico) === */
const CF_MES=[
  {m:'Jul-25',e:67978.33,s:35934.75},
  {m:'Ago-25',e:57794.58,s:2112.67},
  {m:'Sep-25',e:66331.91,s:36942.81},
  {m:'Oct-25',e:61944.9,s:2374.91},
  {m:'Nov-25',e:101182.5,s:66999.34},
  {m:'Dic-25',e:96948.8,s:13743.02},
  {m:'Ene-26',e:111226.33,s:32881.37},
  {m:'Feb-26',e:226521.32,s:63880.76},
  {m:'Mar-26',e:193205.56,s:146978.11},
  {m:'Abr-26',e:102857.47,s:62779.55},
  {m:'May-26',e:171957.49,s:141997.83},
];

/* ════════════════════════ §4.5 FINANCIERO ════════════════════════
   Sincronizado tabla Financiero Airtable FIN-001/002/003 al 17-May-2026. */
const COOP = {
  nombre: 'Préstamo Cooperativa', inicio: '2026-02-14',
  monto:  115000,
  saldo:  96560.21,
  pagado: 18439.79,
  tasa:   1.67,           // mensual
  seguro: 66.70,          // mensual
  cuota:  3568.64,        // cuota normal
  abonoMin5pct: 4828.01,  // 5% del saldo (umbral mínimo para aplicar abono)
  abonoAcum:    0,        // excedente acumulado actual
  pagos: [
    {mes:'Mar 2026', total:3573.99, capital:1586.79, interes:1920.50, seguro:66.70, abono:0,
     nota:'Cuota 1'},
    {mes:'Abr 2026', total:4006.00, capital:2295.80, interes:1643.50, seguro:66.70, abono:0,
     nota:'Cuota 2'},
    {mes:'May 2026', total:4006.00, capital:2378.00, interes:1561.30, seguro:66.70, abono:0,
     nota:'Cuota 3'},
  ],
};

const ANDREA = {
  nombre: 'Andrea Correa', inicio: '2026-02-14',
  aporte:    50000,
  retorno:   100000,  // a retornar (2× aporte)
  pagado:    5004.50,
  pendiente: 94995.50,
  pagos: [
    {mes:'Feb 2026', monto:1000},
    {mes:'Mar 2026', monto:2003},
    {mes:'Abr 2026', monto:1001.50},
    {mes:'May 2026', monto:1001.50},
  ],
};

const BHD = {
  id:'FIN-003', nombre:'Línea de Crédito BHD',
  limite:      112000,
  usado:       68660.20,    // disposición 17-may-2026 (compra Alibaba)
  tasaAnual:   26,
  tasaMensual: 26/12,       // ~2.17% mensual
  pagado:      0,
  pagos:       [],
  nota:'Línea BHD · 26% anual (~2.17% mensual). Disposición de RD$68,660.20 el 17-may-2026 para compra Alibaba.',
};

/* ════════════════════════ §4.6 FILTROS ════════════════════════
   F = estado global del filtro de período.
   applyF(arr) filtra cualquier dataset por el campo 'f' (fecha ISO). */
const F = { modo:'todo', desde:'', hasta:'', label:'Todo el período' };

function applyF(arr){
  if(F.modo === 'todo') return arr.slice();
  let d, h;
  if(F.modo === 'rango' || F.modo.startsWith('mes:')){
    d = F.desde; h = F.hasta;
  } else if(F.modo.startsWith('dias:')){
    const dias = parseInt(F.modo.slice(5));
    const base = new Date(HOY);
    const desde = new Date(base);
    desde.setDate(desde.getDate() - dias);
    d = desde.toISOString().slice(0,10);
    h = HOY;
  } else {
    return arr.slice();
  }
  return arr.filter(r => r.f >= d && r.f <= h);
}

/* Indicador de "rango muy corto" (spec §5.2): si una serie quedó vacía
   pero hay datos, devuelve la última fila marcada como parcial.    */
function applyFOrLatest(arr){
  const fl = applyF(arr);
  if(fl.length === 0 && arr.length > 0){
    return { datos:[arr[arr.length-1]], parcial:true };
  }
  return { datos: fl, parcial: false };
}
