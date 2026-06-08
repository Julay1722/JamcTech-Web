---
name: jamc-deploy
description: >-
  Pasos exactos para publicar el dashboard JAMC's Tech en Netlify de forma
  segura, incluyendo el cambio de build estático (Babel-en-browser) a build real
  con Vite, los security headers, el SPA fallback y el chequeo crítico de que NO
  se publique data del negocio ni docs. Úsala cuando Julio quiera publicar/
  desplegar/subir cambios, configurar Netlify, ajustar netlify.toml, o cuando
  algo del deploy falle. Especialmente relevante tras la reescritura a Vite.
---

# JAMC's Tech — Deploy seguro en Netlify

Sitio: `jamcs-tech.netlify.app` · auto-deploy en push. Usuario: Julio (no-dev),
necesita instrucciones copy-paste claras.

## Contexto: el deploy CAMBIA con la reescritura

- **Antes (sin build):** `netlify.toml` solo copiaba archivos a `dist/` y Babel
  compilaba el JSX en el browser.
- **Después (Vite):** Netlify corre `npm run build`; Vite genera `dist/` con el
  JS ya compilado y cache-busting por hash. Más rápido y limpio.

## netlify.toml para la versión Vite

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"

# Security headers (mantener)
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Strict-Transport-Security = "max-age=31536000; includeSubDomains; preload"

# SPA fallback (mantener)
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

Vite mete cache-busting por hash, así que ya no hace falta el bloque de
`Cache-Control: must-revalidate` por extensión que tenía la versión Babel.

## Chequeo de seguridad CRÍTICO antes de publicar

El sitio es público. El repo tiene archivos con **data real del negocio** y
documentación interna que NO pueden terminar en `dist/`:

1. Corre `npm run build` y luego **lista el contenido de `dist/`**.
2. Confirma que `dist/` contiene SOLO el app compilado (index.html + assets de
   Vite). Que **NO** haya:
   - `*.md` (CLAUDE.md, SCHEMA.md, PROMPT_*, etc.)
   - `backup_*/` ni ningún `.json` con data del negocio
   - `tests/`, `.env`, `netlify/functions/` legacy
3. Con Vite esto se cumple solo (solo lo importado entra al bundle), pero
   **verifícalo igual** — un import accidental de un `.json` de data lo metería.
4. La llave **publishable/anon** de Supabase SÍ puede viajar en el bundle (el RLS
   protege). La **service_role key NUNCA** va al frontend ni al repo.

## Verificación local antes de subir

```powershell
cd C:\Users\coco2\OneDrive\Escritorio\V17
npm run build
npm run preview   # sirve dist/ como en producción; probar login + páginas
```

Navega el preview, loguéate, revisa que cargue data y que no haya errores en
consola. Solo entonces, publicar.

## Instrucciones copy-paste para Julio

1. Guarda los cambios: en el panel de Netlify, build command = `npm run build`,
   publish directory = `dist` (o deja que lo lea del `netlify.toml`).
2. Sube los cambios al repo (push). Netlify deploya solo.
3. Espera el "Published", abre `jamcs-tech.netlify.app`, loguéate y revisa.
4. Si algo se ve roto, revisa el "Deploy log" en Netlify (busca líneas en rojo).
