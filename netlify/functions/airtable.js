// ════════════════════════════════════════════════════════════════
// netlify/functions/airtable.js
//
// Proxy seguro entre el cliente JAMC's Tech y la API de Airtable.
// El PAT y el Base ID viven SOLO en variables de entorno de Netlify;
// nunca llegan al navegador.
//
// Uso desde el cliente:
//   fetch('/.netlify/functions/airtable?path=tbldPTh7FVIh3F3sz', { method: 'GET' })
//   fetch('/.netlify/functions/airtable?path=tblmR928T0ILBQSnV/recXXX',
//         { method: 'PATCH', body: JSON.stringify({ fields: {...} }) })
//
// Para endpoints de schema/meta, agrega meta=1:
//   fetch('/.netlify/functions/airtable?meta=1&path=tables', { method: 'GET' })
//
// El proxy reenvía a:
//   - data:  https://api.airtable.com/v0/{BASE_ID}/{path}
//   - meta:  https://api.airtable.com/v0/meta/bases/{BASE_ID}/{path}
// con Authorization: Bearer ${PAT}.
//
// Refs: PROMPT_RECONSTRUCCION.md §3.3 paso 1.
// ════════════════════════════════════════════════════════════════

const ALLOWED_ORIGINS = [
  'https://jamcs-tech.netlify.app',
  'http://localhost:8888',   // netlify dev default
  'http://localhost:3000',
  'http://127.0.0.1:8888',
  'http://127.0.0.1:3000',
];

const RATE_LIMIT_MAX = 60;          // 60 requests por ventana
const RATE_LIMIT_WINDOW_MS = 60_000; // ventana de 1 minuto

// Rate-limit en memoria (best-effort: cada cold-start lo resetea, pero
// Netlify mantiene la misma instancia caliente entre invocaciones cercanas).
const _rateStore = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const bucket = _rateStore.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    _rateStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  bucket.count++;
  return bucket.count <= RATE_LIMIT_MAX;
}

function pickOrigin(origin) {
  if (origin && ALLOWED_ORIGINS.includes(origin)) return origin;
  return ALLOWED_ORIGINS[0];
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': pickOrigin(origin),
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function jsonResponse(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  const headers = event.headers || {};
  const origin = headers.origin || headers.Origin || '';
  const cors = corsHeaders(origin);

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  // Bloquear orígenes no autorizados. Cuando el navegador hace fetch
  // mismo-origen contra el sitio Netlify, NO envía header Origin —
  // así que solo bloqueamos cuando Origin viene y NO está en la lista.
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return jsonResponse(403, { error: 'origen no permitido' }, cors);
  }

  // Rate limit por IP del cliente
  const ip = (
    headers['x-nf-client-connection-ip'] ||
    headers['client-ip'] ||
    (headers['x-forwarded-for'] || '').split(',')[0] ||
    'unknown'
  ).trim();
  if (!checkRateLimit(ip)) {
    return jsonResponse(
      429,
      { error: 'rate limit excedido', detail: 'máx 60 requests/min/IP' },
      { ...cors, 'Retry-After': '60' }
    );
  }

  // Validar configuración de servidor
  const PAT = process.env.AIRTABLE_PAT;
  const BASE_ID = process.env.AIRTABLE_BASE_ID;
  if (!PAT || !BASE_ID) {
    return jsonResponse(
      500,
      {
        error: 'configuración faltante en el servidor',
        detail: 'AIRTABLE_PAT y AIRTABLE_BASE_ID deben estar definidos en Netlify env vars',
        missing: [
          ...(PAT ? [] : ['AIRTABLE_PAT']),
          ...(BASE_ID ? [] : ['AIRTABLE_BASE_ID']),
        ],
      },
      cors
    );
  }

  // Extraer path desde el querystring
  const qs = event.queryStringParameters || {};
  let path = (qs.path || '').replace(/^\/+/, '').trim();
  if (!path) {
    return jsonResponse(400, { error: 'falta query param "path"' }, cors);
  }
  // Sanity-check: no permitir reescribir a otra base/host
  if (path.includes('://') || path.toLowerCase().startsWith('http')) {
    return jsonResponse(400, { error: 'path inválido' }, cors);
  }

  // Detectar si es endpoint de schema/meta
  const isMeta = qs.meta === '1' || qs.meta === 'true';

  // Reconstruir el querystring para Airtable (todo excepto control params)
  const passthrough = new URLSearchParams();
  for (const [k, v] of Object.entries(qs)) {
    if (k === 'path' || k === 'meta') continue;
    if (v == null) continue;
    passthrough.append(k, String(v));
  }
  const qsSuffix = passthrough.toString();
  const baseUrl = isMeta
    ? `https://api.airtable.com/v0/meta/bases/${BASE_ID}/${path}`
    : `https://api.airtable.com/v0/${BASE_ID}/${path}`;
  const url = baseUrl + (qsSuffix ? `?${qsSuffix}` : '');

  // Log mínimo: método + path + IP truncada. Sin body, sin PAT, sin query.
  const ipMask = ip === 'unknown' ? 'unknown' : ip.slice(0, 7) + '…';
  const kind = isMeta ? 'meta' : 'data';
  console.log(`[airtable-proxy] ${event.httpMethod} ${kind}:/${path} ip=${ipMask}`);

  // Reenviar a Airtable
  try {
    const upstream = await fetch(url, {
      method: event.httpMethod,
      headers: {
        Authorization: `Bearer ${PAT}`,
        'Content-Type': 'application/json',
      },
      body: ['GET', 'HEAD'].includes(event.httpMethod) ? undefined : event.body,
    });
    const text = await upstream.text();
    return {
      statusCode: upstream.status,
      headers: {
        ...cors,
        'Content-Type':
          upstream.headers.get('content-type') || 'application/json',
      },
      body: text,
    };
  } catch (err) {
    console.error(`[airtable-proxy] upstream falló: ${err.message}`);
    return jsonResponse(
      502,
      { error: 'upstream falló', detail: err.message },
      cors
    );
  }
};
